import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { Plus, Clock, ShoppingCart, Lock, ZoomIn, ZoomOut } from 'lucide-react';
import { isLocalMode } from '../lib/sqlDb';
import { queryCache } from '../lib/queryCache';

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
  };
}

interface TableGridProps {
  onSelectTable: (table: Table) => void;
  onRefresh?: (fn: () => void) => void;
  onNavigate?: (page: string) => void;
}

const naturalSort = (a: TableWithOrder, b: TableWithOrder) =>
  String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true, sensitivity: 'base' });

export function TableGrid({ onSelectTable, onRefresh, onNavigate }: TableGridProps) {
  const { tenant, user, activeBranch } = useAuth();
  const [tables, setTables] = useState<TableWithOrder[]>([]);
  const [tableGroups, setTableGroups] = useState<TableGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [mobileTableCols, setMobileTableCols] = useState<number>(() => {
    const saved = localStorage.getItem('mobileTableCols');
    return saved ? parseInt(saved) : 3;
  });
  const [mobileZoomOpen, setMobileZoomOpen] = useState(false);
  const [desktopTableCols, setDesktopTableCols] = useState<number>(() => {
    const saved = localStorage.getItem('desktopTableCols');
    return saved ? parseInt(saved) : 6;
  });
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const pendingUpdatesRef = useRef<Set<string>>(new Set());
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async (resetGroup = false) => {
    if (!tenant || !activeBranch) return;
    setLoading(true);
    if (resetGroup) setSelectedGroup(null);

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
      } catch (e) {
        console.error('TableGrid local load error:', e);
        setTables([]);
      }
      setLoading(false);
      return;
    }

    let tableQ = supabase
      .from('restaurant_tables')
      .select(`
        id, table_number, status, current_order_id, session_start,
        group_id, tenant_id, branch_id, created_at, capacity, size, payment_locked,
        orders!restaurant_tables_current_order_id_fkey(
          id, total_amount, order_number, payment_status
        )
      `)
      .eq('tenant_id', tenant.id)
      .eq('branch_id', activeBranch.id)
      .order('table_number');

    const [cachedGroups, tablesRes] = await Promise.all([
      queryCache.getTableGroups(tenant.id, activeBranch.id),
      tableQ,
    ]);

    if (cachedGroups) {
      setTableGroups(cachedGroups as TableGroup[]);
      if (cachedGroups.length > 0) {
        setSelectedGroup(prev => {
          if (prev && cachedGroups.find(g => g.id === prev)) return prev;
          return cachedGroups[0].id;
        });
      }
    }

    if (tablesRes.data) {
      const mapped: TableWithOrder[] = tablesRes.data.map((t: any) => ({
        ...t,
        order: t.orders ? t.orders : undefined,
      }));
      mapped.sort(naturalSort);
      setTables(mapped);
    } else {
      setTables([]);
    }

    setLoading(false);
  }, [tenant, activeBranch]);

  const flushPendingUpdates = useCallback(async () => {
    if (pendingUpdatesRef.current.size === 0) return;
    const ids = Array.from(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();

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
      const updatedMap = new Map(data.map((t: any) => [t.id, { ...t, order: t.orders || undefined }]));
      setTables(prev => prev.map(t => updatedMap.has(t.id) ? (updatedMap.get(t.id) as TableWithOrder) : t));
    }
  }, []);

  const scheduleUpdate = useCallback((tableId: string) => {
    pendingUpdatesRef.current.add(tableId);
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(flushPendingUpdates, 120);
  }, [flushPendingUpdates]);

  useEffect(() => {
    if (!tenant || !activeBranch) return;

    loadAll(true);

    const timer = setInterval(() => {
      setCurrentTime(new Date());
      if (isLocalMode()) loadAll();
    }, 30000);

    if (isLocalMode()) {
      return () => {
        clearInterval(timer);
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      };
    }

    const tablesChannel = supabase
      .channel(`tables-rt-${tenant.id}-${activeBranch.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'restaurant_tables',
        filter: `branch_id=eq.${activeBranch.id}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setTables(prev => prev.filter(t => t.id !== (payload.old as any).id));
          return;
        }
        const id = (payload.new as any)?.id;
        if (id) scheduleUpdate(id);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `branch_id=eq.${activeBranch.id}`,
      }, (payload) => {
        const tableId = (payload.new as any)?.table_id || (payload.old as any)?.table_id;
        if (tableId) scheduleUpdate(tableId);
      })
      .subscribe();

    channelsRef.current.forEach(ch => supabase.removeChannel(ch));
    channelsRef.current = [tablesChannel];

    return () => {
      clearInterval(timer);
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [tenant?.id, activeBranch?.id]);

  useEffect(() => {
    if (onRefresh) onRefresh(loadAll);
  }, [onRefresh, loadAll]);

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

    const { error } = await supabase.from('restaurant_tables').insert(tablesToCreate);
    if (error) {
      alert('Hata: ' + error.message);
      return;
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

  const formatDuration = useCallback((startTime: string) => {
    const diff = currentTime.getTime() - new Date(startTime).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`;
  }, [currentTime]);

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!activeBranch) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-lg">Şube yükleniyor...</p>
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
      {tableGroups.length > 0 && (
        <div className="bg-white rounded-lg md:rounded-2xl shadow-md p-2 md:p-4 mb-3 md:mb-6">
          <div className="flex items-center gap-1.5 md:gap-3">
            <div
              className="flex gap-2 md:gap-3 pb-0.5 md:pb-1 flex-1 min-w-0"
              style={{ overflowX: 'scroll', WebkitOverflowScrolling: 'touch' as any, scrollbarWidth: 'none' }}
            >
              <button
                onClick={() => setSelectedGroup(null)}
                className={`px-4 py-2.5 md:px-6 md:py-3.5 rounded-lg md:rounded-xl font-black whitespace-nowrap transition-all text-sm md:text-base active:scale-95 border-2 shrink-0 ${
                  selectedGroup === null
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg border-orange-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                }`}
              >
                AÇIK MASALAR
                <span className="ml-1.5 md:ml-2 text-xs md:text-sm opacity-90">
                  ({groupStats.get(null)?.occupied ?? 0})
                </span>
              </button>
              <button
                onClick={() => onNavigate ? onNavigate('takeaway') : createTakeawayOrder()}
                className="px-4 py-2.5 md:px-6 md:py-3.5 rounded-lg md:rounded-xl font-black whitespace-nowrap transition-all text-sm md:text-base active:scale-95 border-2 bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg border-green-700 hover:from-green-600 hover:to-green-700 flex items-center gap-1.5 md:gap-2 shrink-0"
              >
                <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
                PAKET SERVİS
              </button>
              {tableGroups.map((group) => {
                const stats = groupStats.get(group.id) || { available: 0, occupied: 0, total: 0 };
                return (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroup(group.id)}
                    className={`px-4 py-2.5 md:px-6 md:py-3.5 rounded-lg md:rounded-xl font-bold whitespace-nowrap transition-all text-sm md:text-base active:scale-95 shrink-0 ${
                      selectedGroup === group.id
                        ? 'text-white shadow-lg'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                    style={{ backgroundColor: selectedGroup === group.id ? group.color : undefined }}
                  >
                    {group.name}
                    <span className="ml-1.5 md:ml-2 text-xs md:text-sm opacity-90">
                      ({stats.available} / {stats.total})
                    </span>
                  </button>
                );
              })}
            </div>


            <div className="hidden md:flex items-center gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
              <button
                onClick={() => setDesktopTableCols(prev => { const n = Math.min(12, prev + 1); localStorage.setItem('desktopTableCols', String(n)); return n; })}
                disabled={desktopTableCols >= 12}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white shadow text-gray-600 hover:bg-gray-50 active:scale-90 disabled:opacity-30"
                title="Küçült"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-gray-600 w-4 text-center">{desktopTableCols}</span>
              <button
                onClick={() => setDesktopTableCols(prev => { const n = Math.max(3, prev - 1); localStorage.setItem('desktopTableCols', String(n)); return n; })}
                disabled={desktopTableCols <= 3}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-white shadow text-gray-600 hover:bg-gray-50 active:scale-90 disabled:opacity-30"
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
              onClick={() => setMobileTableCols(prev => { const n = Math.max(2, prev - 1); localStorage.setItem('mobileTableCols', String(n)); return n; })}
              disabled={mobileTableCols <= 2}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-orange-50 border-2 border-orange-200 text-orange-600 active:scale-90 disabled:opacity-30 shadow"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <span className="text-base font-black text-gray-700 w-6 text-center">{mobileTableCols}</span>
            <button
              onClick={() => setMobileTableCols(prev => { const n = Math.min(6, prev + 1); localStorage.setItem('mobileTableCols', String(n)); return n; })}
              disabled={mobileTableCols >= 6}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-gray-50 border-2 border-gray-200 text-gray-600 active:scale-90 disabled:opacity-30 shadow"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="md:hidden flex-1 overflow-y-auto bg-white p-3">
        <div className="pb-6" style={{ display: 'grid', gridTemplateColumns: `repeat(${mobileTableCols}, minmax(0, 1fr))`, gap: 10 }}>
          {filteredTables.map((table) => {
            const isLocked = !!(table as any).payment_locked;
            const isPartial = !isLocked && table.order?.payment_status === 'partial';
            const bgColor = isLocked ? 'bg-red-600' : isPartial ? 'bg-amber-500' : table.status === 'occupied' ? 'bg-green-600' : 'bg-orange-500';
            const tableNum = String(table.table_number);
            const isMany = mobileTableCols >= 5;
            const isMedium = mobileTableCols === 4;
            const cardH = isMany ? 72 : isMedium ? 96 : 120;
            const numFontSize = isMany
              ? (tableNum.length <= 2 ? 22 : 15)
              : isMedium
                ? (tableNum.length <= 2 ? 30 : 20)
                : (tableNum.length <= 2 ? 40 : tableNum.length <= 4 ? 28 : 20);
            const subFontSize = isMany ? 11 : isMedium ? 13 : 16;
            const dkFontSize = isMany ? 10 : isMedium ? 11 : 13;
            return (
              <button
                key={table.id}
                onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.93)'; }}
                onPointerUp={(e) => { e.currentTarget.style.transform = ''; if (!isLocked) onSelectTable(table); }}
                onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
                className={`${bgColor} rounded-xl flex flex-col items-center justify-center text-white shadow-lg relative select-none overflow-hidden`}
                style={{ height: cardH, transition: 'transform 0.08s ease', opacity: isLocked ? 0.85 : 1 }}
              >
                {isLocked && (
                  <div className="absolute top-1 right-1">
                    <Lock style={{ width: isMany ? 12 : 16, height: isMany ? 12 : 16 }} className="text-white" />
                  </div>
                )}
                <div className="font-black leading-none" style={{ fontSize: numFontSize }}>{tableNum}</div>
                {isLocked ? (
                  <div className="font-black opacity-95 tracking-wide" style={{ fontSize: subFontSize, marginTop: 3 }}>ÖDEME</div>
                ) : isPartial ? (
                  <>
                    <div className="font-black opacity-95" style={{ fontSize: subFontSize, marginTop: 3 }}>
                      {table.order!.total_amount.toFixed(0)}₺
                    </div>
                    <div className="font-black opacity-95 tracking-wide" style={{ fontSize: dkFontSize, marginTop: 1 }}>KISMİ ÖD.</div>
                  </>
                ) : table.status === 'occupied' && table.order ? (
                  <div className="font-black opacity-95" style={{ fontSize: subFontSize, marginTop: 3 }}>
                    {table.order.total_amount.toFixed(0)}₺
                  </div>
                ) : (
                  <div className="font-bold opacity-90" style={{ fontSize: subFontSize, marginTop: 3 }}>BOŞ</div>
                )}
                {table.session_start && table.status === 'occupied' && !isLocked && !isPartial && (
                  <div className="font-semibold opacity-90 flex items-center gap-0.5" style={{ fontSize: dkFontSize, marginTop: 2 }}>
                    <Clock style={{ width: dkFontSize - 1, height: dkFontSize - 1 }} className="shrink-0" />
                    {formatDuration(table.session_start)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="hidden md:grid gap-3"
        style={{ gridTemplateColumns: `repeat(${desktopTableCols}, minmax(0, 1fr))`, gridAutoRows: '1fr' }}
      >
        {filteredTables.map((table) => {
          const isLocked = !!(table as any).payment_locked;
          const isPartial = !isLocked && table.order?.payment_status === 'partial';
          const statusColor = isLocked
            ? 'bg-red-600'
            : isPartial
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
            ? (tableNum.length <= 2 ? 26 : 18)
            : isMedium
              ? (tableNum.length <= 2 ? 32 : 22)
              : (tableNum.length <= 2 ? 42 : tableNum.length <= 4 ? 30 : 22);
          const subFontSize = isSmall ? 13 : isMedium ? 15 : 17;
          const dkFontSize = isSmall ? 11 : isMedium ? 12 : 13;
          return (
            <button
              key={table.id}
              onPointerDown={(e) => { if (!isLocked) e.currentTarget.style.transform = 'scale(0.93)'; }}
              onPointerUp={(e) => { e.currentTarget.style.transform = ''; if (!isLocked) onSelectTable(table); }}
              onPointerLeave={(e) => { e.currentTarget.style.transform = ''; }}
              className={`${statusColor} rounded-2xl flex flex-col items-center justify-center text-white aspect-square shadow-lg hover:shadow-xl relative select-none overflow-hidden`}
              style={{ transition: 'transform 0.08s ease', opacity: isLocked ? 0.85 : 1, padding: isSmall ? 6 : 14 }}
            >
              {isLocked && (
                <div className="absolute top-1.5 right-1.5">
                  <Lock style={{ width: isSmall ? 14 : 18, height: isSmall ? 14 : 18 }} className="text-white" />
                </div>
              )}
              <div className="font-black leading-none" style={{ fontSize: numFontSize, marginBottom: 4 }}>{table.table_number}</div>

              {isLocked ? (
                <div className="font-black tracking-wide" style={{ fontSize: subFontSize }}>ÖDEME</div>
              ) : isPartial ? (
                <>
                  <div className="font-black leading-tight" style={{ fontSize: subFontSize }}>{table.order!.total_amount.toFixed(0)} ₺</div>
                  <div className="font-black tracking-wide mt-1" style={{ fontSize: dkFontSize }}>KISMİ ÖDEME</div>
                </>
              ) : table.status === 'occupied' && table.order ? (
                <>
                  <div className="font-black leading-tight" style={{ fontSize: subFontSize }}>{table.order.total_amount.toFixed(0)} ₺</div>
                  {table.session_start && (
                    <div className="font-semibold opacity-90 flex items-center gap-0.5 mt-1.5" style={{ fontSize: dkFontSize }}>
                      <Clock style={{ width: dkFontSize, height: dkFontSize }} className="shrink-0" />
                      {formatDuration(table.session_start)}
                    </div>
                  )}
                </>
              ) : (
                <div className="font-bold opacity-85" style={{ fontSize: subFontSize }}>Boş</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
