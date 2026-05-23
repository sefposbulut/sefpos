import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isModuleEnabled } from '../lib/modules';
import { Database } from '../lib/supabase';
import { Plus, Clock, Lock, ZoomIn, ZoomOut, ScanBarcode, Truck, Eye, EyeOff, Receipt, Maximize2 } from 'lucide-react';
import { useUiPrefs, setHeaderHidden } from '../lib/uiPrefs';
import { ReprintReceiptModal } from './ReprintReceiptModal';
import { isLocalMode, isOfflineMode, isSqlServerMode } from '../lib/sqlDb';
import { warmOrderPanelBundle, bulkWarmOrderItemsForOrders } from '../lib/orderPanelWarm';
import { LiveDuration } from './LiveDuration';
import { getTrialInfo, formatTrialRemaining, type TenantTrialFields } from '../lib/tenantTrial';
import { APP_DISPLAY_VERSION } from '../lib/appVersion';
import {
  tableGridRuntimeCache,
  readPersistedTableGridSnapshot,
  isHardPageReload,
  prepareTableGridCacheForPageLoad,
  TABLE_GRID_TABLE_COLS,
  enrichTableGridOrders,
  fetchRestaurantTablesForBranch,
  type TableGridCachedRow,
  type TableGroupCached,
  type TableGridOrderEmbed,
} from '../lib/tableGridData';
import { unlockStalePaymentLocksRpc } from '../lib/paymentLock';
import {
  isStaleTableSnapshotAfterClear,
} from '../lib/tableOptimisticClear';
import { insertRestaurantTablesSkipDuplicates } from '../lib/restaurantTableBulk';
import { subscribeLiveTick } from '../lib/liveTick';

/** Her masa yenilemesinde RPC cagirmayalim — POS akisini yavaslatiyordu. */
let lastStaleUnlockAt = 0;
const STALE_UNLOCK_MIN_MS = 5 * 60 * 1000;

async function maybeUnlockStalePaymentLocks(): Promise<void> {
  const now = Date.now();
  if (now - lastStaleUnlockAt < STALE_UNLOCK_MIN_MS) return;
  lastStaleUnlockAt = now;
  await unlockStalePaymentLocksRpc();
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Deneme',
  free: 'Ücretsiz',
  basic: 'Temel',
  starter: 'Başlangıç',
  standard: 'Standart',
  pro: 'Profesyonel',
  business: 'İş',
  enterprise: 'Kurumsal',
  premium: 'Premium',
};

function prettyPlan(plan: string | null | undefined): string {
  if (!plan) return 'Tanımsız';
  const k = plan.toLowerCase().trim();
  return PLAN_LABELS[k] || (plan.charAt(0).toUpperCase() + plan.slice(1));
}

function formatLicenseStatus(tenant: TenantTrialFields | null | undefined): string {
  if (!tenant) return '—';
  const trial = getTrialInfo(tenant);
  if (trial.isTrial) {
    return trial.expired ? 'Deneme (süresi doldu)' : `Deneme · ${formatTrialRemaining(trial)}`;
  }
  const s = (tenant.subscription_status || '').toLowerCase();
  const map: Record<string, string> = {
    active: 'Aktif',
    suspended: 'Askıya alındı',
    cancelled: 'İptal',
    trial: 'Deneme',
  };
  return map[s] || tenant.subscription_status || '—';
}

function FooterInfoItem({
  label,
  value,
  valueMaxClass = 'max-w-[7rem] sm:max-w-[10rem] md:max-w-[14rem]',
}: {
  label: string;
  value: string;
  valueMaxClass?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <span className="opacity-90">{label}:</span>
      <span className={`font-bold truncate inline-block ${valueMaxClass}`}>{value}</span>
    </span>
  );
}

function FooterSep() {
  return <span className="opacity-45 shrink-0 select-none">|</span>;
}

const FOOTER_AMOUNT_VISIBLE_KEY = 'sefpos.tableGrid.footerAmountVisible';
const isElectronRuntime = !!(typeof window !== 'undefined' && (window as any).electronAPI);

type Table = Database['public']['Tables']['restaurant_tables']['Row'] & {
  branch_id?: string | null;
  size?: string | null;
  payment_locked?: boolean | null;
};
type TableGroup = Database['public']['Tables']['table_groups']['Row'];

interface TableWithOrder extends Table {
  order?: {
    id: string;
    total_amount: number;
    order_number: string;
    payment_status?: string | null;
    remaining_amount?: number | null;
  };
}

type TableStateChangedDetail = Partial<TableWithOrder> & {
  id: string;
  order?: TableWithOrder['order'] | null;
};

interface TableGridProps {
  onSelectTable: (table: Table) => void;
  onRefresh?: (fn: () => void) => void;
  onNavigate?: (page: string) => void;
  showTakeawayButton?: boolean;
}

const naturalSort = (a: TableWithOrder, b: TableWithOrder) =>
  String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' });

/** Cache satirini TableGrid icin tipli hale getirir (sadece referans cast) */
function cachedRowToTableWithOrder(row: TableGridCachedRow): TableWithOrder {
  return row as unknown as TableWithOrder;
}

/** Cache snapshot'tan istemci icin gosterilebilir state cikartir */
function readSnapshotForKey(
  cacheKey: string | null,
  opts?: { allowOnReload?: boolean },
):
  | { tables: TableWithOrder[]; groups: TableGroup[] }
  | null {
  if (!cacheKey) return null;
  if (!opts?.allowOnReload && isHardPageReload()) return null;
  const ram = tableGridRuntimeCache.get(cacheKey);
  if (ram) {
    return {
      tables: ram.tables.map(cachedRowToTableWithOrder),
      groups: ram.groups as unknown as TableGroup[],
    };
  }
  const persisted = readPersistedTableGridSnapshot(cacheKey);
  if (persisted) {
    // Persisted'i RAM'a da koy ki sonraki render'lar anlik olsun
    tableGridRuntimeCache.set(cacheKey, persisted);
    return {
      tables: persisted.tables.map(cachedRowToTableWithOrder),
      groups: persisted.groups as unknown as TableGroup[],
    };
  }
  return null;
}

// Masa zoom tercihleri cihaz başına tek bir global anahtarda tutulur:
// kullanıcı +/- ile değiştirdiğinde tenant/branch/kullanıcı değişse de aynı
// boyut hep korunur. (Eski scoped anahtarlar varsa migrate edilir.)
const MOBILE_COLS_KEY = 'sefpos.tableGrid.mobileCols';
const DESKTOP_COLS_KEY = 'sefpos.tableGrid.desktopCols';

function readPersistedCols(globalKey: string, legacyPrefix: string): number | null {
  try {
    const direct = localStorage.getItem(globalKey);
    const directParsed = parseInt(direct || '', 10);
    if (Number.isFinite(directParsed)) return directParsed;
    // Geriye dönük uyumluluk: eski tenant/branch/user-scoped anahtarlar
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === legacyPrefix || k.startsWith(`${legacyPrefix}:`)) {
        const v = parseInt(localStorage.getItem(k) || '', 10);
        if (Number.isFinite(v)) {
          localStorage.setItem(globalKey, String(v));
          return v;
        }
      }
    }
  } catch {}
  return null;
}

export function TableGrid({ onSelectTable, onRefresh, onNavigate, showTakeawayButton = true }: TableGridProps) {
  const { tenant, user, profile, activeBranch, permissions } = useAuth();
  const { headerHidden } = useUiPrefs();
  const mobileColsStorageKey = MOBILE_COLS_KEY;
  const desktopColsStorageKey = DESKTOP_COLS_KEY;

  // Ilk render: SPA icinde snapshot ile hizli cizim; F5'te bayat yesil masalar gosterilmez.
  prepareTableGridCacheForPageLoad();
  const initialKey = tenant?.id && activeBranch?.id ? `${tenant.id}:${activeBranch.id}` : null;
  const initialSnapshot = readSnapshotForKey(initialKey);
  const [tables, setTables] = useState<TableWithOrder[]>(() => initialSnapshot?.tables ?? []);
  const [tableGroups, setTableGroups] = useState<TableGroup[]>(() => initialSnapshot?.groups ?? []);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(() => {
    const groups = initialSnapshot?.groups ?? [];
    return groups.length > 0 ? groups[0].id : null;
  });
  // Snapshot varsa loading'i baslangictan false yap; aksi halde skeleton gosterelim.
  const [loading, setLoading] = useState<boolean>(() => !initialSnapshot);

  // Footer kuşağı state'i: kullanıcı sağ tıklayınca açık masa toplam tutarını
  // gizleyebilsin (kişisel tercih, cihaza yazılır). Saat/tarih için 30 sn'lik
  // tikleyici aşağıda useEffect ile besleniyor.
  const [footerAmountVisible, setFooterAmountVisible] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(FOOTER_AMOUNT_VISIBLE_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => subscribeLiveTick(() => setNow(new Date())), []);
  useEffect(() => {
    try {
      localStorage.setItem(FOOTER_AMOUNT_VISIBLE_KEY, footerAmountVisible ? '1' : '0');
    } catch {}
  }, [footerAmountVisible]);

  const [mobileTableCols, setMobileTableCols] = useState<number>(3);
  const [mobileZoomOpen, setMobileZoomOpen] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'v' && e.key !== 'V') return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setShowReprintModal(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const [desktopTableCols, setDesktopTableCols] = useState<number>(6);
  const [mobileColsTouched, setMobileColsTouched] = useState(false);
  const [desktopColsTouched, setDesktopColsTouched] = useState(false);
  const [colsPrefsReady, setColsPrefsReady] = useState(false);
  const corporateFontFamily = '"Inter", "Segoe UI", "Arial", sans-serif';
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tablesRef = useRef<TableWithOrder[]>([]);
  /** Mobil masa listesinde kaydırma ile yanlışlıkla masa açılmasını önler */
  const mobilePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const mobileScrollMovedRef = useRef(false);
  const groupsReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheKey = useMemo(
    () => (tenant?.id && activeBranch?.id ? `${tenant.id}:${activeBranch.id}` : null),
    [tenant?.id, activeBranch?.id]
  );

  const getAutoMobileCols = useCallback((_count: number) => {
    // Default mobile layout should be consistently 3 columns.
    return 3;
  }, []);

  const getAutoDesktopCols = useCallback((count: number) => {
    if (count >= 60) return 10;
    if (count >= 40) return 9;
    if (count >= 25) return 8;
    if (count >= 13) return 7;
    return 6;
  }, []);

  const loadAll = useCallback(async (resetGroup = false) => {
    if (!tenant || !activeBranch) return;
    const cacheKey = `${tenant.id}:${activeBranch.id}`;
    // RAM yoksa sessionStorage'dan dene (ilk login + sekme yenilemesi icin kritik).
    // SQL modunda eski (bos) cloud onbellegini kullanma — Ayarlar’da 32 masa varken grid bos kalmasin.
    const snap = isSqlServerMode() || isHardPageReload() ? null : readSnapshotForKey(cacheKey);
    if (snap) {
      setTableGroups(snap.groups);
      setTables(snap.tables);
      setLoading(false);
      if (resetGroup) {
        // Branch degisti: yeni subenin ilk grubunu sec.
        setSelectedGroup(snap.groups.length > 0 ? snap.groups[0].id : null);
      }
    } else {
      // Snapshot yok; spinner yerine skeleton gosterilsin.
      setLoading(true);
      if (resetGroup) setSelectedGroup(null);
    }

    if (isLocalMode()) {
      const api = (window as any).electronAPI;
      try {
        const [groupsResult, tablesResult, ordersResult] = await Promise.all([
          api.localDbRead({ table: 'table_groups', tenantId: tenant.id }),
          api.localDbRead({ table: 'restaurant_tables', tenantId: tenant.id }),
          api.localDbRead({ table: 'orders', tenantId: tenant.id }),
        ]);

        const groups = (groupsResult.data || []).filter((g: any) =>
          g.tenant_id === tenant.id && (!g.branch_id || g.branch_id === activeBranch.id)
        );
        setTableGroups(groups);
        if (groups.length > 0) {
          setSelectedGroup(prev => {
            if (prev && groups.find((g: any) => g.id === prev)) return prev;
            return groups[0].id;
          });
        }

        const activeOrders = (ordersResult.data || []).filter((o: any) =>
          o.status === 'active' && o.tenant_id === tenant.id
        );
        const orderMap = new Map(activeOrders.map((o: any) => [o.id, o]));

        const rawTables = (tablesResult.data || []).filter((t: any) =>
          t.tenant_id === tenant.id && t.branch_id === activeBranch.id
        );
        const mapped: TableWithOrder[] = rawTables.map((t: any) => ({
          ...t,
          order: t.current_order_id && orderMap.has(t.current_order_id)
            ? orderMap.get(t.current_order_id)
            : undefined,
        }));
        mapped.sort(naturalSort);
        setTables(mapped);
        tableGridRuntimeCache.set(cacheKey, {
          tables: mapped as unknown as TableGridCachedRow[],
          groups: groups as unknown as TableGroupCached[],
        });
        bulkWarmOrderItemsForOrders(mapped.map((t) => t.current_order_id));
      } catch (e) {
        console.error('TableGrid local load error:', e);
        setTables([]);
      }
      setLoading(false);
      return;
    }

    await maybeUnlockStalePaymentLocks();

    const groupQ = supabase
      .from('table_groups')
      .select('id, name, color, branch_id, prefix')
      .eq('tenant_id', tenant.id)
      .or(`branch_id.eq.${activeBranch.id},branch_id.is.null`)
      .order('name');

    const [groupsRes, tableRows] = await Promise.all([
      groupQ,
      fetchRestaurantTablesForBranch(tenant.id, activeBranch.id),
    ]);

    if (groupsRes.data) {
      setTableGroups(groupsRes.data as TableGroup[]);
      if (groupsRes.data.length > 0) {
        setSelectedGroup(prev => {
          if (prev && groupsRes.data!.find(g => g.id === prev)) return prev;
          return groupsRes.data![0].id;
        });
      }
    }

    if (tableRows.length > 0) {
      const mapped: TableWithOrder[] = tableRows.map((t: any) => ({
        ...t,
        order: t.order ? t.order : undefined,
      }));
      // Sadece kısmi ödemeli siparişler için payment_transactions çek;
      // tam ödenmiş veya boş masalar gereksiz round-trip yapmasın.
      const partialOrderIds = mapped
        .map((t) => (t.order?.payment_status === 'partial' ? t.order.id : null))
        .filter((id): id is string => !!id);
      if (partialOrderIds.length > 0) {
        const { data: payments } = await supabase
          .from('payment_transactions')
          .select('order_id, amount')
          .in('order_id', partialOrderIds);
        if (payments) {
          const paidByOrder = new Map<string, number>();
          for (const p of payments as any[]) {
            const oid = String(p.order_id || '');
            if (!oid) continue;
            paidByOrder.set(oid, (paidByOrder.get(oid) || 0) + Number(p.amount || 0));
          }
          for (const tableRow of mapped) {
            const ord = tableRow.order;
            if (!ord || ord.payment_status !== 'partial') continue;
            const paid = paidByOrder.get(ord.id) || 0;
            ord.remaining_amount = Math.max(0, Number(ord.total_amount || 0) - paid);
          }
        }
      }
      mapped.sort(naturalSort);
      setTables(mapped);
      tableGridRuntimeCache.set(cacheKey, {
        tables: mapped as unknown as TableGridCachedRow[],
        groups: (groupsRes.data || []) as unknown as TableGroupCached[],
      });
      // Aktif siparişleri TEK sorguda warm cache'e al; masaya tıklandığında sepet anında boyanır.
      bulkWarmOrderItemsForOrders(mapped.map((t) => t.current_order_id));
    } else if (!groupsRes.error) {
      setTables([]);
    }

    setLoading(false);
  }, [tenant, activeBranch]);

  const tablesReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onTablesChanged = () => {
      if (tablesReloadTimerRef.current) clearTimeout(tablesReloadTimerRef.current);
      tablesReloadTimerRef.current = setTimeout(() => {
        tablesReloadTimerRef.current = null;
        void loadAll(false);
      }, 800);
    };
    window.addEventListener('sefpos:tables-changed', onTablesChanged);
    return () => {
      window.removeEventListener('sefpos:tables-changed', onTablesChanged);
      if (tablesReloadTimerRef.current) clearTimeout(tablesReloadTimerRef.current);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!tenant?.id || !activeBranch?.id || isLocalMode() || isSqlServerMode()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        await maybeUnlockStalePaymentLocks();
        void loadAll(false);
      }, 600);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearTimeout(timer);
    };
  }, [tenant?.id, activeBranch?.id, loadAll]);

  const flushPendingUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.size === 0) return;
    const ids = Array.from(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();

    if (isSqlServerMode()) {
      const { data: tableRows } = await supabase
        .from('restaurant_tables')
        .select(TABLE_GRID_TABLE_COLS)
        .in('id', ids);
      if (!tableRows?.length) return;

      const orderIds = [
        ...new Set(
          (tableRows as any[])
            .map((t) => String(t.current_order_id || ''))
            .filter((id) => id.length > 8),
        ),
      ];
      const orderMap = new Map<string, TableGridOrderEmbed>();
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, total_amount, order_number, payment_status')
          .in('id', orderIds);
        for (const o of orders || []) {
          const row = o as Record<string, unknown>;
          orderMap.set(String(row.id), {
            id: String(row.id),
            total_amount: Number(row.total_amount ?? 0),
            order_number: String(row.order_number ?? ''),
            payment_status: (row.payment_status as string | null) ?? null,
          });
        }
        await enrichTableGridOrders(orderMap);
      }

      const updatedRows: TableWithOrder[] = (tableRows as any[]).map((t) => {
        const oid = t.current_order_id ? String(t.current_order_id) : '';
        const status = oid && t.status !== 'occupied' ? 'occupied' : t.status;
        return {
          ...t,
          status,
          order: oid ? orderMap.get(oid) : undefined,
        };
      });
      const updatedMap = new Map(updatedRows.map((t) => [t.id, t]));
      setTables((prev) =>
        prev.map((t) => {
          if (!updatedMap.has(t.id)) return t;
          const fresh = updatedMap.get(t.id) as TableWithOrder;
          if (isStaleTableSnapshotAfterClear(t.id, t, fresh)) return t;
          return fresh;
        }),
      );
      return;
    }

    const { data } = await supabase
      .from('restaurant_tables')
      .select(`
        id, table_number, status, current_order_id, session_start,
        group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked,
        orders!restaurant_tables_current_order_id_fkey(
          id, total_amount, order_number, payment_status
        )
      `)
      .in('id', ids);

    if (data) {
      const updatedRows = data.map((t: any) => ({ ...t, order: t.orders || undefined })) as TableWithOrder[];
      const partialIds = updatedRows
        .map((t) => (t.order?.payment_status === 'partial' ? t.order.id : null))
        .filter((id): id is string => !!id);
      if (partialIds.length > 0) {
        const { data: payments } = await supabase
          .from('payment_transactions')
          .select('order_id, amount')
          .in('order_id', partialIds);
        if (payments) {
          const paidByOrder = new Map<string, number>();
          for (const p of payments as any[]) {
            const oid = String(p.order_id || '');
            if (!oid) continue;
            paidByOrder.set(oid, (paidByOrder.get(oid) || 0) + Number(p.amount || 0));
          }
          for (const row of updatedRows) {
            const ord = row.order;
            if (!ord || ord.payment_status !== 'partial') continue;
            const paid = paidByOrder.get(ord.id) || 0;
            ord.remaining_amount = Math.max(0, Number(ord.total_amount || 0) - paid);
          }
        }
      }
      const updatedMap = new Map(updatedRows.map((t) => [t.id, t]));
      setTables((prev) =>
        prev.map((t) => {
          if (!updatedMap.has(t.id)) return t;
          const fresh = updatedMap.get(t.id) as TableWithOrder;
          if (isStaleTableSnapshotAfterClear(t.id, t, fresh)) return t;
          return fresh;
        }),
      );
    }
  }, []);

  const scheduleUpdate = useCallback((tableId: string) => {
    pendingUpdatesRef.current.add(tableId);
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(flushPendingUpdates, 80);
  }, [flushPendingUpdates]);

  const findTableIdByOrderId = useCallback((orderId: string | null | undefined) => {
    if (!orderId) return null;
    const t = tablesRef.current.find(x => x.current_order_id === orderId);
    return t?.id || null;
  }, []);

  const scheduleGroupsReload = useCallback(() => {
    if (groupsReloadTimerRef.current) clearTimeout(groupsReloadTimerRef.current);
    groupsReloadTimerRef.current = setTimeout(() => { void loadAll(); }, 200);
  }, [loadAll]);

  const handleSelectTableInstant = useCallback((table: TableWithOrder) => {
    if (table.current_order_id) {
      warmOrderPanelBundle(table.current_order_id);
    }
    onSelectTable(table);
  }, [onSelectTable]);

  useEffect(() => {
    setColsPrefsReady(false);
    const parsedMobile = readPersistedCols(MOBILE_COLS_KEY, 'mobileTableCols');
    const parsedDesktop = readPersistedCols(DESKTOP_COLS_KEY, 'desktopTableCols');

    if (parsedMobile != null) {
      setMobileTableCols(Math.min(6, Math.max(2, parsedMobile)));
      setMobileColsTouched(true);
    } else {
      setMobileColsTouched(false);
    }

    if (parsedDesktop != null) {
      setDesktopTableCols(Math.min(12, Math.max(3, parsedDesktop)));
      setDesktopColsTouched(true);
    } else {
      setDesktopColsTouched(false);
    }
    setColsPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!mobileColsTouched) return;
    localStorage.setItem(mobileColsStorageKey, String(mobileTableCols));
  }, [mobileColsStorageKey, mobileTableCols, mobileColsTouched]);

  useEffect(() => {
    if (!desktopColsTouched) return;
    localStorage.setItem(desktopColsStorageKey, String(desktopTableCols));
  }, [desktopColsStorageKey, desktopTableCols, desktopColsTouched]);

  useEffect(() => {
    if (!colsPrefsReady) return;
    if (!mobileColsTouched) {
      setMobileTableCols(getAutoMobileCols(tables.length));
    }
    if (!desktopColsTouched) {
      setDesktopTableCols(getAutoDesktopCols(tables.length));
    }
  }, [tables.length, mobileColsTouched, desktopColsTouched, colsPrefsReady, getAutoMobileCols, getAutoDesktopCols]);

  useEffect(() => {
    if (!tenant || !activeBranch) return;

    loadAll(true);

    // local mod dışında 30 sn'lik genel poll'a gerek yok; süre etiketleri
    // <LiveDuration> ile kendi başına yenilenir, masa state'i realtime gelir.
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isLocalMode()) {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void loadAll();
      }, 60_000);
      return () => {
        if (timer) clearInterval(timer);
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      };
    }
    if (isSqlServerMode()) {
      return () => {
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      };
    }

    const tablesChannel = supabase
      .channel(`tables-rt-${tenant.id}-${activeBranch.id}`)
      // 1) Masanın kendisi (status, current_order_id, payment_locked, group_id…)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `branch_id=eq.${activeBranch.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          // Yeni eklenen masa için tüm listeyi yenile (basit ve doğru).
          void loadAll();
          return;
        }
        if (payload.eventType === 'DELETE') {
          setTables(prev => prev.filter(t => t.id !== (payload.old as any).id));
          return;
        }
        const id = (payload.new as any)?.id;
        if (id) scheduleUpdate(id);
      })
      // 2) Sipariş (yeni açılış / güncelleme / iptal/kapanış)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `branch_id=eq.${activeBranch.id}`,
      }, (payload) => {
        const newRow: any = payload.new;
        const oldRow: any = payload.old;
        if (payload.eventType === 'INSERT') {
          const tableId = newRow?.table_id;
          if (tableId) scheduleUpdate(tableId);
          return;
        }
        if (payload.eventType === 'DELETE') {
          const tableId = oldRow?.table_id;
          if (tableId) scheduleUpdate(tableId);
          return;
        }
        // UPDATE
        const tableId = newRow?.table_id || oldRow?.table_id;
        if (tableId) scheduleUpdate(tableId);
      })
      // 3) Sipariş satırları → bağlı masanın total/remaining'i güncellensin
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
        const tableId = findTableIdByOrderId(orderId);
        if (tableId) scheduleUpdate(tableId);
      })
      // 4) Parça/full ödemeler → kalan tutar/payment_status anında değişsin
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payment_transactions',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        const orderId = (payload.new as any)?.order_id || (payload.old as any)?.order_id;
        const tableId = findTableIdByOrderId(orderId);
        if (tableId) scheduleUpdate(tableId);
      })
      // 5) Masa grupları (ad/renk/sıra değiştiğinde tek seferde tazele)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'table_groups',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => {
        scheduleGroupsReload();
      })
      .subscribe();

    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [tablesChannel];

    return () => {
      if (timer) clearInterval(timer);
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      if (groupsReloadTimerRef.current) clearTimeout(groupsReloadTimerRef.current);
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [tenant?.id, activeBranch?.id, loadAll, scheduleUpdate, findTableIdByOrderId, scheduleGroupsReload]);

  useEffect(() => {
    if (onRefresh) onRefresh(loadAll);
  }, [onRefresh, loadAll]);

  useEffect(() => {
    if (!cacheKey) return;
    tableGridRuntimeCache.set(cacheKey, {
      tables: tables as unknown as TableGridCachedRow[],
      groups: tableGroups as unknown as TableGroupCached[],
    });
  }, [cacheKey, tables, tableGroups]);

  // tablesRef her render'da güncel olsun (subscription callback'leri için).
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    const applyExternalTableState = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<TableStateChangedDetail>;
      const detail = event.detail;
      if (!detail?.id) return;
      setTables((prev) =>
        prev.map((tableRow) => {
          if (tableRow.id !== detail.id) return tableRow;
          if (isStaleTableSnapshotAfterClear(detail.id, tableRow, detail)) return tableRow;
          const next = { ...tableRow, ...detail } as TableWithOrder;
          if (detail.order === null) {
            delete (next as any).order;
          }
          return next;
        }),
      );
    };

    window.addEventListener('sefpos:table-state-changed', applyExternalTableState as EventListener);
    return () => {
      window.removeEventListener('sefpos:table-state-changed', applyExternalTableState as EventListener);
    };
  }, []);

  const createDefaultTables = async () => {
    if (!tenant || !activeBranch) return;

    if (isLocalMode()) {
      const api = (window as any).electronAPI;
      const tablesResult = await api.localDbRead({ table: 'restaurant_tables', tenantId: tenant.id });
      const existing = (tablesResult.data || []).filter((t: any) => t.branch_id === activeBranch.id);
      const usedNumbers = new Set(existing.map((t: any) => String(t.table_number)));

      const crypto2 = { randomUUID: () => Math.random().toString(36).slice(2) + Date.now().toString(36) };
      let num = 1;
      let created = 0;
      while (created < 12) {
        if (!usedNumbers.has(String(num))) {
          await api.localDbWrite({
            table: 'restaurant_tables',
            row: {
              id: crypto2.randomUUID(),
              tenant_id: tenant.id,
              branch_id: activeBranch.id,
              table_number: `${num}`,
              capacity: 4,
              status: 'available',
              size: 'medium',
              group_id: null,
              current_order_id: null,
              session_start: null,
              payment_locked: false,
            },
          });
          created++;
        }
        num++;
      }
      loadAll();
      return;
    }

    const { data: existing } = await supabase
      .from('restaurant_tables')
      .select('table_number')
      .eq('tenant_id', tenant.id)
      .eq('branch_id', activeBranch.id);

    const usedNumbers = new Set((existing || []).map(t => String(t.table_number)));

    const tablesToCreate = [];
    let num = 1;
    while (tablesToCreate.length < 12) {
      if (!usedNumbers.has(String(num))) {
        tablesToCreate.push({
          tenant_id: tenant.id,
          branch_id: activeBranch.id,
          table_number: `${num}`,
          capacity: 4,
          status: 'available' as const,
          size: 'medium',
        });
      }
      num++;
    }

    const { inserted, skipped, error } = await insertRestaurantTablesSkipDuplicates(tablesToCreate);
    if (error) {
      alert('Hata: ' + error);
      return;
    }
    if (inserted === 0 && skipped > 0) {
      alert('Masalar zaten mevcut.');
    }
    loadAll();
  };

  const createTakeawayOrder = async () => {
    if (!tenant || !user) return;

    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert({
        tenant_id: tenant.id,
        branch_id: activeBranch?.id || null,
        waiter_id: user.id,
        order_type: 'takeaway',
        status: 'active',
      })
      .select()
      .single();

    if (error) { alert('Hata: ' + error.message); return; }

    if (newOrder) {
      onSelectTable({
        id: newOrder.id,
        table_number: 0,
        status: 'occupied',
        current_order_id: newOrder.id,
        tenant_id: tenant.id,
        created_at: newOrder.created_at,
        updated_at: newOrder.updated_at,
        seats: 1,
        table_group_id: null,
      } as any);
    }
  };

  const groupStats = useMemo(() => {
    const stats = new Map<string | null, { available: number; occupied: number; total: number }>();
    const all = { available: 0, occupied: 0, total: tables.length };
    for (const t of tables) {
      if (t.status === 'available') all.available++;
      else if (t.status === 'occupied') all.occupied++;
      if (t.group_id) {
        const g = stats.get(t.group_id) || { available: 0, occupied: 0, total: 0 };
        g.total++;
        if (t.status === 'available') g.available++;
        else if (t.status === 'occupied') g.occupied++;
        stats.set(t.group_id, g);
      }
    }
    stats.set(null, all);
    return stats;
  }, [tables]);

  const filteredTables = useMemo(() =>
    selectedGroup
      ? tables.filter(t => t.group_id === selectedGroup)
      : tables.filter(t => t.status === 'occupied'),
    [tables, selectedGroup]
  );

  if (loading) {
    // Spinner yerine skeleton: kullanici bos ekran/spinner yerine ileride
    // gelecek kutularin iskeletini gorur, algilanan yuklenme cok daha hizli olur.
    const skeletonCount = 12;
    return (
      <div className="h-full flex flex-col">
        <div className="bg-white rounded-lg md:rounded-2xl shadow-md p-2 md:p-4 mb-3 md:mb-6">
          <div className="flex items-center gap-2 md:gap-3 overflow-hidden">
            <div className="h-7 md:h-9 w-24 md:w-32 rounded-md bg-slate-200/80 animate-pulse" />
            <div className="h-7 md:h-9 w-20 md:w-28 rounded-md bg-slate-200/60 animate-pulse" />
            <div className="h-7 md:h-9 w-20 md:w-28 rounded-md bg-slate-200/60 animate-pulse" />
            <div className="h-7 md:h-9 w-20 md:w-28 rounded-md bg-slate-200/60 animate-pulse" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="grid gap-2 md:gap-3 grid-cols-3 md:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg md:rounded-xl bg-slate-200/70 animate-pulse"
                style={{ animationDelay: `${(i % 6) * 60}ms` }}
              />
            ))}
          </div>
          <p className="text-center text-slate-400 text-xs md:text-sm mt-4">
            Masalar yukleniyor...
          </p>
        </div>
      </div>
    );
  }

  if (!activeBranch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
        <p className="text-gray-500 text-sm">Sube hazirlaniyor...</p>
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 text-lg mb-4">Henüz masa bulunmamaktadır.</p>
        <button
          onClick={createDefaultTables}
          className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg transition inline-flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>12 Masa Oluştur</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {isElectronRuntime && headerHidden && (
        <div className="flex-shrink-0 flex justify-center px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={() => setHeaderHidden(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-bold shadow-lg hover:from-orange-600 hover:to-orange-700 active:scale-95 border border-orange-700/40"
            title="Üst menüyü tekrar göster"
          >
            <Maximize2 className="w-4 h-4" />
            Üst menüyü göster
          </button>
        </div>
      )}
      {tableGroups.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-xl md:rounded-2xl border border-slate-200/80 shadow-sm p-2 md:p-3 mb-3 md:mb-5">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              {permissions.can_take_orders && permissions.can_process_payments && onNavigate && isModuleEnabled('quick-sale', tenant as any) && (
                <button
                  onClick={() => onNavigate('quick-sale')}
                  title="Hızlı Satış / Barkod Oku"
                  aria-label="Hızlı Satış"
                  className="p-2.5 md:p-2.5 rounded-xl flex items-center justify-center transition-all active:scale-95 bg-orange-600 hover:bg-orange-700 text-white shadow-sm shrink-0"
                >
                  <ScanBarcode className="w-5 h-5 md:w-5 md:h-5" strokeWidth={2.25} />
                </button>
              )}
              {showTakeawayButton && isModuleEnabled('takeaway', tenant as any) && (
                <button
                  onClick={() => onNavigate ? onNavigate('takeaway') : createTakeawayOrder()}
                  className="p-2.5 md:p-2.5 rounded-xl flex items-center justify-center transition-all active:scale-95 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-2 border-green-700 shadow-sm shrink-0"
                  aria-label="Paket Servis"
                  title="Paket Servis"
                >
                  <Truck className="w-5 h-5 md:w-5 md:h-5" strokeWidth={2.2} />
                </button>
              )}
            </div>

            <div
              className="flex gap-1 md:gap-1.5 p-1 md:p-1.5 flex-1 min-w-0 rounded-xl bg-slate-100/90 border border-slate-200/70"
              style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, scrollbarWidth: 'none' }}
            >
              <button
                type="button"
                onClick={() => setSelectedGroup(null)}
                className={`px-3 py-2 md:px-4 md:py-2.5 rounded-lg font-bold whitespace-nowrap transition-all text-xs md:text-sm active:scale-[0.98] shrink-0 border-2 ${
                  selectedGroup === null
                    ? 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-700 shadow-md ring-1 ring-green-400/50'
                    : 'bg-gradient-to-r from-green-500 to-green-600 text-white border-green-700 opacity-90 hover:opacity-100'
                }`}
              >
                AÇIK MASALAR
                <span className="ml-1.5 tabular-nums text-[11px] md:text-xs font-extrabold opacity-95">
                  ({groupStats.get(null)?.occupied ?? 0})
                </span>
              </button>
              {tableGroups.map((group) => {
                const stats = groupStats.get(group.id) || { available: 0, occupied: 0, total: 0 };
                const active = selectedGroup === group.id;
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroup(group.id)}
                    className={`px-3 py-2 md:px-4 md:py-2.5 rounded-lg font-bold whitespace-nowrap transition-all text-xs md:text-sm active:scale-[0.98] shrink-0 ${
                      active
                        ? 'text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                    style={
                      active
                        ? { backgroundColor: group.color, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
                        : undefined
                    }
                  >
                    {group.name}
                    <span className={`ml-1.5 tabular-nums text-[11px] md:text-xs font-semibold ${active ? 'text-white/90' : 'text-slate-400'}`}>
                      {stats.available}/{stats.total}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowReprintModal(true)}
              className="hidden md:flex items-center gap-1.5 px-2 md:px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-orange-300 hover:text-orange-700 hover:bg-orange-50/80 shrink-0 active:scale-95 transition-colors"
              title="Geçmiş adisyonlar (V)"
            >
              <Receipt className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="flex flex-col items-center leading-none text-center min-w-[3.25rem]">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                  Geçmiş
                </span>
                <span className="text-[11px] md:text-xs font-extrabold text-slate-800 mt-0.5">
                  adisyonlar
                </span>
              </span>
            </button>

            <div className="hidden md:flex items-center gap-0.5 bg-slate-100 rounded-xl p-1 border border-slate-200/80 shrink-0">
              <button
                onClick={() => { setDesktopColsTouched(true); setDesktopTableCols(prev => Math.min(12, prev + 1)); }}
                disabled={desktopTableCols >= 12}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-600 hover:bg-white shadow-sm active:scale-90 disabled:opacity-30"
                title="Küçült"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-slate-600 w-5 text-center tabular-nums">{desktopTableCols}</span>
              <button
                onClick={() => { setDesktopColsTouched(true); setDesktopTableCols(prev => Math.max(3, prev - 1)); }}
                disabled={desktopTableCols <= 3}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-600 hover:bg-white shadow-sm active:scale-90 disabled:opacity-30"
                title="Büyüt"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile floating zoom panel */}
      <div className="md:hidden fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center">
        <div
          className="flex items-center transition-transform duration-300 ease-in-out"
          style={{ transform: mobileZoomOpen ? 'translateX(0)' : 'translateX(calc(100% - 36px))' }}
        >
          <button
            onClick={() => setMobileZoomOpen(p => !p)}
            className="w-9 h-20 bg-orange-500 text-white rounded-l-2xl flex items-center justify-center shadow-xl shrink-0 active:scale-95"
            style={{ touchAction: 'manipulation' }}
          >
            {mobileZoomOpen
              ? <ZoomOut className="w-4 h-4" />
              : <ZoomIn className="w-4 h-4" />}
          </button>
          <div className="bg-white shadow-2xl rounded-l-2xl flex flex-col items-center py-4 px-3 gap-3 border border-gray-200">
            <button
              onClick={() => { setMobileColsTouched(true); setMobileTableCols(prev => Math.max(2, prev - 1)); }}
              disabled={mobileTableCols <= 2}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-orange-50 border-2 border-orange-200 text-orange-600 active:scale-90 disabled:opacity-30 shadow"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <span className="text-base font-black text-gray-700 w-6 text-center">{mobileTableCols}</span>
            <button
              onClick={() => { setMobileColsTouched(true); setMobileTableCols(prev => Math.min(6, prev + 1)); }}
              disabled={mobileTableCols >= 6}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-50 border-2 border-gray-200 text-gray-600 active:scale-90 disabled:opacity-30 shadow"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="md:hidden flex-1 min-h-0 overflow-y-auto bg-white p-3 touch-pan-y"
        style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
        onPointerDownCapture={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          mobileScrollMovedRef.current = false;
          mobilePointerStartRef.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMoveCapture={(e) => {
          const start = mobilePointerStartRef.current;
          if (!start || mobileScrollMovedRef.current) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
            mobileScrollMovedRef.current = true;
          }
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${mobileTableCols}, minmax(0, 1fr))`,
            gap: 10,
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {filteredTables.map((table) => {
            const isLocked = !!(table as any).payment_locked;
            const isPartial = !isLocked && table.order?.payment_status === 'partial';
            const bgColor = isPartial
              ? 'bg-amber-500'
              : table.status === 'occupied'
                ? 'bg-green-600'
                : 'bg-orange-500';
            const tableNum = String(table.table_number);
            const isMany = mobileTableCols >= 5;
            const isMedium = mobileTableCols === 4;
            const cardH = isMany ? 72 : isMedium ? 96 : 120;
            const numFontSize = isMany
              ? (tableNum.length <= 2 ? 24 : 16)
              : isMedium
                ? (tableNum.length <= 2 ? 32 : 21)
                : (tableNum.length <= 2 ? 42 : tableNum.length <= 4 ? 30 : 22);
            const subFontSize = isMany ? 12 : isMedium ? 14 : 17;
            const dkFontSize = isMany ? 11 : isMedium ? 12 : 14;
            return (
              <button
                key={table.id}
                onPointerDown={(e) => {
                  e.currentTarget.style.transform = 'scale(0.93)';
                }}
                onPointerUp={(e) => {
                  e.currentTarget.style.transform = '';
                  if (!isLocked && !mobileScrollMovedRef.current) handleSelectTableInstant(table);
                }}
                onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
                className={`${bgColor} rounded-xl flex flex-col items-center justify-center text-white shadow-lg relative select-none overflow-hidden touch-manipulation`}
                style={{ height: cardH, transition: 'transform 0.08s ease' }}
              >
                {isLocked && (
                  <div className="absolute top-1 right-1 rounded-full bg-black/25 p-0.5">
                    <Lock style={{ width: isMany ? 12 : 16, height: isMany ? 12 : 16 }} className="text-white" />
                  </div>
                )}
                <div className="font-black leading-none tracking-tight" style={{ fontSize: numFontSize, fontFamily: corporateFontFamily }}>{tableNum}</div>
                {isLocked ? (
                  <div className="font-bold opacity-90 tracking-tight" style={{ fontSize: dkFontSize, marginTop: 2, fontFamily: corporateFontFamily }}>ödeme</div>
                ) : isPartial ? (
                  <>
                    <div className="font-black opacity-95 tracking-tight" style={{ fontSize: subFontSize, marginTop: 3, fontFamily: corporateFontFamily }}>
                      {(table.order!.remaining_amount ?? table.order!.total_amount).toFixed(0)}₺
                    </div>
                    <div className="font-black opacity-95 tracking-wide" style={{ fontSize: dkFontSize, marginTop: 1, fontFamily: corporateFontFamily }}>KISMİ ÖD.</div>
                  </>
                ) : table.status === 'occupied' && table.order ? (
                  <div className="font-black opacity-95 tracking-tight" style={{ fontSize: subFontSize, marginTop: 3, fontFamily: corporateFontFamily }}>
                    {table.order.total_amount.toFixed(0)}₺
                  </div>
                ) : (
                  <div className="font-bold opacity-90 tracking-tight" style={{ fontSize: subFontSize, marginTop: 3, fontFamily: corporateFontFamily }}>BOŞ</div>
                )}
                {table.session_start && table.status === 'occupied' && !isLocked && !isPartial && (
                  <div className="font-bold opacity-90 flex items-center gap-0.5 tracking-tight" style={{ fontSize: dkFontSize, marginTop: 2, fontFamily: corporateFontFamily }}>
                    <Clock style={{ width: dkFontSize - 1, height: dkFontSize - 1 }} className="shrink-0" />
                    <LiveDuration startTime={table.session_start} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="hidden md:grid gap-3 flex-1 min-h-0 overflow-y-auto pb-16"
        style={{ gridTemplateColumns: `repeat(${desktopTableCols}, minmax(0, 1fr))`, gridAutoRows: '1fr', alignContent: 'start' }}
      >
        {filteredTables.map((table) => {
          const isLocked = !!(table as any).payment_locked;
          const isPartial = !isLocked && table.order?.payment_status === 'partial';
          const statusColor = isPartial
            ? 'bg-amber-500'
            : table.status === 'occupied'
              ? 'bg-green-600'
              : table.status === 'reserved'
                ? 'bg-yellow-500'
                : 'bg-orange-500';
          const tableNum = String(table.table_number);
          const isSmall = desktopTableCols >= 9;
          const isMedium = desktopTableCols >= 7;
          const numFontSize = isSmall
            ? (tableNum.length <= 2 ? 28 : 19)
            : isMedium
              ? (tableNum.length <= 2 ? 34 : 23)
              : (tableNum.length <= 2 ? 44 : tableNum.length <= 4 ? 32 : 24);
          const subFontSize = isSmall ? 14 : isMedium ? 16 : 18;
          const dkFontSize = isSmall ? 12 : isMedium ? 13 : 14;
          return (
            <button
              key={table.id}
              onPointerDown={(e) => { if (!isLocked) e.currentTarget.style.transform = 'scale(0.93)'; }}
              onPointerUp={(e) => { e.currentTarget.style.transform = ''; if (!isLocked) handleSelectTableInstant(table); }}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
              className={`${statusColor} rounded-2xl flex flex-col items-center justify-center text-white aspect-square shadow-lg hover:shadow-xl relative select-none overflow-hidden`}
              style={{ transition: 'transform 0.08s ease', padding: isSmall ? 6 : 14 }}
            >
              {isLocked && (
                <div className="absolute top-1.5 right-1.5 rounded-full bg-black/25 p-0.5">
                  <Lock style={{ width: isSmall ? 14 : 18, height: isSmall ? 14 : 18 }} className="text-white" />
                </div>
              )}
              <div className="font-black leading-none tracking-tight" style={{ fontSize: numFontSize, marginBottom: 4, fontFamily: corporateFontFamily }}>{table.table_number}</div>

              {isLocked ? (
                <div className="font-bold opacity-90 tracking-tight" style={{ fontSize: dkFontSize, fontFamily: corporateFontFamily }}>ödeme</div>
              ) : isPartial ? (
                <>
                  <div className="font-black leading-tight tracking-tight" style={{ fontSize: subFontSize, fontFamily: corporateFontFamily }}>
                    {(table.order!.remaining_amount ?? table.order!.total_amount).toFixed(0)} ₺
                  </div>
                  <div className="font-black tracking-wide mt-1" style={{ fontSize: dkFontSize, fontFamily: corporateFontFamily }}>KISMİ ÖDEME</div>
                </>
              ) : table.status === 'occupied' && table.order ? (
                <>
                  <div className="font-black leading-tight tracking-tight" style={{ fontSize: subFontSize, fontFamily: corporateFontFamily }}>{table.order.total_amount.toFixed(0)} ₺</div>
                  {table.session_start && (
                    <div className="font-bold opacity-90 flex items-center gap-0.5 mt-1.5 tracking-tight" style={{ fontSize: dkFontSize, fontFamily: corporateFontFamily }}>
                      <Clock style={{ width: dkFontSize, height: dkFontSize }} className="shrink-0" />
                      <LiveDuration startTime={table.session_start} />
                    </div>
                  )}
                </>
              ) : (
                <div className="font-bold opacity-85 tracking-tight" style={{ fontSize: subFontSize, fontFamily: corporateFontFamily }}>Boş</div>
              )}
            </button>
          );
        })}
      </div>

      {(() => {
        // Açık masa istatistikleri (sadece occupied & order'ı olan masalar)
        const occupiedTables = tables.filter((t) => t.status === 'occupied');
        const occupiedCount = occupiedTables.length;
        const occupiedTotal = occupiedTables.reduce((sum, t) => {
          const remaining = t.order?.remaining_amount;
          const total = t.order?.total_amount ?? 0;
          return sum + (typeof remaining === 'number' ? remaining : total);
        }, 0);
        const tl = occupiedTotal.toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const dateStr = now.toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const timeStr = now.toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const trial = getTrialInfo(tenant as any);
        const firmName = (tenant as any)?.name?.trim() || '—';
        const licenseInfo = formatLicenseStatus(tenant as any);
        const packageName = trial.isTrial ? 'Deneme' : prettyPlan((tenant as any)?.subscription_plan);
        const branchName = (activeBranch as any)?.name?.trim() || '—';

        return (
          <div
            className="hidden md:block fixed bottom-0 left-0 right-0 z-40 text-white shadow-[0_-2px_6px_rgba(0,0,0,0.15)] border-t border-orange-700/50"
            style={{
              fontFamily: corporateFontFamily,
              background: '#f97316',
            }}
          >
            <div className="flex items-center justify-between gap-3 md:gap-5 px-3 md:px-5 py-1.5 md:py-2 text-[10px] md:text-[11px] leading-none whitespace-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <FooterInfoItem label="Firma Bilgisi" value={firmName} />
                <FooterSep />
                <FooterInfoItem label="Lisans" value={licenseInfo} valueMaxClass="max-w-[6rem] md:max-w-[9rem]" />
                <FooterSep />
                <FooterInfoItem label="Paket Adı" value={packageName} valueMaxClass="max-w-[5rem] md:max-w-[8rem]" />
                <FooterSep />
                <FooterInfoItem label="Şube" value={branchName} valueMaxClass="max-w-[5rem] md:max-w-[10rem]" />
                <FooterSep />
                <FooterInfoItem label="Sürüm" value={APP_DISPLAY_VERSION} valueMaxClass="max-w-[4.5rem]" />
              </div>

              <div className="flex items-center gap-2 md:gap-3 shrink-0 pl-2 md:pl-3 border-l border-white/25">
                <span className="font-semibold">
                  Açık Masa: <b className="font-black tabular-nums">{occupiedCount}</b>
                </span>
                <FooterSep />
                <button
                  type="button"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setFooterAmountVisible((v) => !v);
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-amount-toggle]')) {
                      setFooterAmountVisible((v) => !v);
                    }
                  }}
                  title="Sağ tık: açık masa toplam tutarını gizle/göster"
                  className="font-semibold inline-flex items-center gap-1 rounded hover:bg-white/10 transition cursor-context-menu select-none"
                >
                  Toplam:
                  <b className="font-black tabular-nums">
                    {footerAmountVisible ? `${tl} ₺` : '••••• ₺'}
                  </b>
                  <span data-amount-toggle className="opacity-70 hover:opacity-100">
                    {footerAmountVisible ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                  </span>
                </button>
                <FooterSep />
                <span className="font-semibold tabular-nums">{dateStr} · {timeStr}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {showReprintModal && (
        <ReprintReceiptModal onClose={() => setShowReprintModal(false)} />
      )}
    </div>
  );
}
