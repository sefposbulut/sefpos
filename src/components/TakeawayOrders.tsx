import { useState, useEffect, useRef, useCallback, useMemo, memo, useDeferredValue } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, Package, Clock, CheckCircle2, Trash2, Bike, Phone, MapPin, User,
  X, AlertCircle, Truck, Home, ShoppingBag, Settings, ChevronRight,
  CreditCard, Banknote, Smartphone, RefreshCw, Filter, Navigation, Search,
  PhoneIncoming, Wifi, WifiOff, FlaskConical,
} from 'lucide-react';
import { DeliveryOrderForm } from './DeliveryOrderForm';
import { sendCourierAssignmentNotification } from '../lib/courierNotification';
import { recordTakeawayPaymentIfNeeded } from '../lib/takeawayPayment';
import { CourierLiveMapModal, type CourierLiveMapOrder } from './CourierLiveMapModal';
import { CourierManagement } from './CourierManagement';
import {
  isCallerIdAvailable,
  startCallerId,
  stopCallerId,
  callerIdStatus,
  onCallerIdRing,
  onCallerIdSignal,
  onCallerIdError,
  simulateRing,
  callerIdLocalSettings,
  type CallerIdRing,
  type CallerIdStatus,
} from '../lib/callerId';
import { notifyHemenYolda } from '../lib/hemenyoldaApi';
import { subscribeLiveTick } from '../lib/liveTick';
import { startAdaptivePoller } from '../lib/pollSchedule';
import {
  fetchTakeawayOrderById,
  fetchTakeawayActiveOrders,
  fetchTakeawayCompletedOrders,
  takeawayItemCount,
  type TakeawayOrderListRow,
} from '../lib/takeawayOrdersApi';

export interface Courier {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  phone: string;
  status: 'available' | 'busy' | 'offline';
  is_active: boolean;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_updated_at: string | null;
}

export interface DeliveryCustomer {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  phone: string;
  address: string;
  notes: string;
  last_order_at: string | null;
  order_count: number;
  created_at: string;
}

export type TakeawayOrder = TakeawayOrderListRow;

type StatusFilter = 'all' | 'pending' | 'preparing' | 'ready' | 'on_the_way' | 'delivered';
type TypeFilter = 'all' | 'takeaway' | 'delivery' | 'gel_al';

/** Ekranda aynı anda çizilen kart üst sınırı — çok pakette donmayı önler */
const MAX_VISIBLE_ORDER_CARDS = 80;
const TAKEAWAY_FETCH_ACTIVE_LIMIT = 150;
const REALTIME_UPDATE_BATCH_MS = 800;
const REALTIME_INSERT_BATCH_MS = 500;

export const DELIVERY_STATUSES: { key: string; label: string; color: string; bg: string; dotColor: string }[] = [
  { key: 'pending',    label: 'Bekliyor',       color: 'text-amber-700',  bg: 'bg-amber-100',  dotColor: 'bg-amber-500' },
  { key: 'preparing',  label: 'Hazırlanıyor',   color: 'text-blue-700',   bg: 'bg-blue-100',   dotColor: 'bg-blue-500' },
  { key: 'ready',      label: 'Hazır',           color: 'text-teal-700',   bg: 'bg-teal-100',   dotColor: 'bg-teal-500' },
  { key: 'on_the_way', label: 'Paket Kuryede',    color: 'text-orange-700', bg: 'bg-orange-100', dotColor: 'bg-orange-500' },
  { key: 'delivered',  label: 'Teslim Edildi',  color: 'text-green-700',  bg: 'bg-green-100',  dotColor: 'bg-green-500' },
  { key: 'cancelled',  label: 'İptal',           color: 'text-red-700',    bg: 'bg-red-100',    dotColor: 'bg-red-500' },
];

const STATUS_NEXT_DELIVERY: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'on_the_way',
  on_the_way: 'delivered',
};

const STATUS_NEXT_TAKEAWAY: Record<string, string> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};

const PAYMENT_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  cash:   { label: 'Nakit',  icon: Banknote,    color: 'text-green-600' },
  card:   { label: 'Kart',   icon: CreditCard,  color: 'text-blue-600' },
  online: { label: 'Online', icon: Smartphone,  color: 'text-orange-600' },
};

interface TakeawayOrdersProps {
  /** Masalar vb. başka sayfadayken realtime ve ağ yükünü keser. */
  isActive?: boolean;
}

export function TakeawayOrders({ isActive = true }: TakeawayOrdersProps) {
  const { tenant, activeBranch, user } = useAuth();
  const [orders, setOrders] = useState<TakeawayOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);
  const [showCourierMgmt, setShowCourierMgmt] = useState(false);
  const [liveMapOrder, setLiveMapOrder] = useState<CourierLiveMapOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<TakeawayOrder | null>(null);
  const [assigningCourierId, setAssigningCourierId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInsertIdsRef = useRef<Set<string>>(new Set());
  const pendingUpdatesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const [elapsedTick, setElapsedTick] = useState(0);
  const showCompletedRef = useRef(showCompleted);
  const ordersRef = useRef(orders);
  const formOpenRef = useRef(false);
  const activeBranchRef = useRef(activeBranch?.id ?? null);
  const lastCourierLoadRef = useRef(0);
  const couriersForFormRef = useRef<Courier[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const deferredCustomerQuery = useDeferredValue(customerQuery);

  const formOpen = showNewOrderForm || !!editingOrder;
  useEffect(() => {
    showCompletedRef.current = showCompleted;
  }, [showCompleted]);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);
  useEffect(() => {
    activeBranchRef.current = activeBranch?.id ?? null;
  }, [activeBranch?.id]);
  useEffect(() => {
    formOpenRef.current = formOpen;
    if (formOpen) {
      couriersForFormRef.current = couriers;
    }
  }, [formOpen, couriers]);

  // ===== Caller ID =====
  const cidAvailable = isCallerIdAvailable();
  const [cidStatusInfo, setCidStatusInfo] = useState<CallerIdStatus>({ available: cidAvailable, running: false });
  const [cidSettings, setCidSettings] = useState(callerIdLocalSettings.load());
  const [cidPanelOpen, setCidPanelOpen] = useState(false);
  const [incomingCalls, setIncomingCalls] = useState<Array<{ id: string; ring: CallerIdRing; matched: DeliveryCustomer | null; }>>([]);
  const [cidPrefill, setCidPrefill] = useState<{ phone: string; matched: DeliveryCustomer | null } | null>(null);
  const [cidError, setCidError] = useState<string | null>(null);
  /** X ile kapatılan numaralar tekrar çalma gelene kadar listede gösterilmez (ms). */
  const dismissedPhonesUntilRef = useRef<Map<string, number>>(new Map());

  const refreshCidStatus = useCallback(async () => {
    try {
      const s = await callerIdStatus();
      setCidStatusInfo(s);
    } catch (e: any) {
      setCidError(e?.message || 'Caller ID durumu alınamadı');
    }
  }, []);

  // Otomatik başlat (electron + ayar açık) — yalnızca paket ekranı aktifken
  useEffect(() => {
    if (!cidAvailable || !isActive) return;
    let cancelled = false;
    (async () => {
      const s = await callerIdStatus();
      if (cancelled) return;
      setCidStatusInfo(s);
      if (cidSettings.autoStart && !s.running) {
        try {
          const next = await startCallerId({ softTest: cidSettings.softTest });
          if (!cancelled) setCidStatusInfo(next);
        } catch (e: any) {
          if (!cancelled) setCidError(e?.message || 'Caller ID başlatılamadı');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cidAvailable, cidSettings.autoStart, cidSettings.softTest, isActive]);

  // Olay dinleyiciler: çağrı, sinyal, hata — paket ekranı dışında dinleme
  useEffect(() => {
    if (!cidAvailable || !isActive) return;
    const offRing = onCallerIdRing(async (ring) => {
      if (!tenant || !ring.phone) return;
      const snoozeUntil = dismissedPhonesUntilRef.current.get(ring.phone) ?? 0;
      if (snoozeUntil > Date.now()) return;

      let matched: DeliveryCustomer | null = null;
      try {
        const { data } = await supabase
          .from('delivery_customers')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('phone', ring.phone)
          .maybeSingle();
        matched = (data as DeliveryCustomer | null) || null;
        if (!matched) {
          // Tam eşleşme yoksa son haneleri dene (formatlama farkı için)
          const last7 = ring.phone.slice(-7);
          const { data: fuzzy } = await supabase
            .from('delivery_customers')
            .select('*')
            .eq('tenant_id', tenant.id)
            .ilike('phone', `%${last7}`)
            .order('last_order_at', { ascending: false })
            .limit(1);
          matched = (fuzzy?.[0] as DeliveryCustomer) || null;
        }
      } catch (e) {
        console.error('[CallerID] müşteri arama hatası:', e);
      }
      setIncomingCalls((prev) => {
        const withoutDup = prev.filter((p) => p.ring.phone !== ring.phone);
        return [
          { id: `${ring.ts}-${ring.phone}`, ring, matched },
          ...withoutDup,
        ].slice(0, 3);
      });
    });
    const offSignal = onCallerIdSignal((sig) => {
      setCidStatusInfo((prev) => ({
        ...prev,
        connected: sig.connected,
        deviceModel: sig.deviceModel,
        deviceSerial: sig.deviceSerial,
        running: true,
      }));
    });
    const offError = onCallerIdError(({ message }) => setCidError(message));
    return () => {
      offRing();
      offSignal();
      offError();
    };
  }, [cidAvailable, tenant, isActive]);

  const handleAcceptCall = (item: { ring: CallerIdRing; matched: DeliveryCustomer | null }) => {
    setCidPrefill({ phone: item.ring.phone, matched: item.matched });
    setShowNewOrderForm(true);
    setIncomingCalls((prev) => prev.filter((p) => p.ring.ts !== item.ring.ts));
  };

  const handleDismissCall = (id: string) => {
    setIncomingCalls((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit?.ring.phone) {
        dismissedPhonesUntilRef.current.set(hit.ring.phone, Date.now() + 15 * 60 * 1000);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const updateCidSetting = async (patch: Partial<{ autoStart: boolean; softTest: boolean }>) => {
    const next = { ...cidSettings, ...patch };
    setCidSettings(next);
    callerIdLocalSettings.save(next);
    if (cidStatusInfo.running) {
      await stopCallerId();
    }
    if (next.autoStart) {
      try {
        const s = await startCallerId({ softTest: next.softTest });
        setCidStatusInfo(s);
        setCidError(null);
      } catch (e: any) {
        setCidError(e?.message || 'Caller ID başlatılamadı');
      }
    } else {
      await refreshCidStatus();
    }
  };

  const triggerSimulatedRing = () => {
    const phone = window.prompt('Test çağrısı için telefon (örn 05551112233):', '05551112233');
    if (!phone) return;
    simulateRing(phone);
  };

  // Masa ekranındaki "Pakette ara" kutusundan gelen sorguyu yakala
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string') setCustomerQuery(detail);
    };
    window.addEventListener('sefpos:takeaway-search', handler as EventListener);
    return () => window.removeEventListener('sefpos:takeaway-search', handler as EventListener);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!tenant) return;
    const data = showCompletedRef.current
      ? await fetchTakeawayCompletedOrders(tenant.id, activeBranch?.id, 200)
      : await fetchTakeawayActiveOrders(tenant.id, activeBranch?.id, TAKEAWAY_FETCH_ACTIVE_LIMIT);
    setOrders(data);
    setLoading(false);
  }, [tenant, activeBranch]);

  const loadCouriers = useCallback(async () => {
    if (!tenant) return;
    let q = supabase.from('couriers').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('full_name');
    if (activeBranch) q = q.or(`branch_id.eq.${activeBranch.id},branch_id.is.null`);
    const { data } = await q;
    if (data) setCouriers(data as Courier[]);
  }, [tenant, activeBranch]);

  const flushPendingInserts = useCallback(() => {
    const ids = [...pendingInsertIdsRef.current];
    pendingInsertIdsRef.current.clear();
    if (!ids.length || !tenant) return;
    void (async () => {
      const rows = await Promise.all(ids.map((id) => fetchTakeawayOrderById(id)));
      const valid = rows.filter(Boolean) as TakeawayOrder[];
      if (!valid.length) return;
      const viewingCompleted = showCompletedRef.current;
      setOrders((prev) => {
        let next = [...prev];
        for (const row of valid) {
          const isDone = row.status === 'completed' || row.status === 'cancelled';
          if (viewingCompleted !== isDone) continue;
          if (next.some((o) => o.id === row.id)) continue;
          next = [row, ...next];
        }
        return next.slice(0, viewingCompleted ? 200 : 250);
      });
    })();
  }, [tenant]);

  const isPaketOrderRow = useCallback((row: { order_type?: string; table_id?: string | null; branch_id?: string | null } | null) => {
    if (!row) return false;
    if (row.table_id) return false;
    if (!['takeaway', 'delivery'].includes(String(row.order_type || ''))) return false;
    const branchId = activeBranchRef.current;
    if (branchId && row.branch_id && row.branch_id !== branchId) return false;
    return true;
  }, []);

  const loadCouriersThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastCourierLoadRef.current < 90_000) return;
    lastCourierLoadRef.current = now;
    void loadCouriers();
  }, [loadCouriers]);

  const flushPendingUpdates = useCallback(() => {
    const batch = new Map(pendingUpdatesRef.current);
    pendingUpdatesRef.current.clear();
    if (batch.size === 0) return;

    const viewingCompleted = showCompletedRef.current;
    setOrders((prev) => {
      let next = prev;
      let changed = false;
      for (const [id, record] of batch) {
        const isDone = record.status === 'completed' || record.status === 'cancelled';
        const idx = next.findIndex((o) => o.id === id);
        if (idx < 0) {
          if (viewingCompleted === isDone) continue;
          continue;
        }
        if (viewingCompleted !== isDone) {
          next = next.filter((o) => o.id !== id);
          changed = true;
          continue;
        }
        const cur = next[idx];
        const merged = { ...cur, ...record } as TakeawayOrder;
        if (
          cur.delivery_status === merged.delivery_status &&
          cur.status === merged.status &&
          cur.courier_id === merged.courier_id &&
          cur.total_amount === merged.total_amount &&
          cur.payment_collected === merged.payment_collected
        ) {
          continue;
        }
        if (!changed) next = next.slice();
        next[idx] = merged;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const schedulePendingUpdatesFlush = useCallback(() => {
    if (updateFlushRef.current) clearTimeout(updateFlushRef.current);
    updateFlushRef.current = setTimeout(() => {
      updateFlushRef.current = null;
      flushPendingUpdates();
    }, REALTIME_UPDATE_BATCH_MS);
  }, [flushPendingUpdates]);

  const handleOrderChange = useCallback(
    (payload: any) => {
      if (formOpenRef.current) return;
      const { eventType, new: newRecord, old: oldRecord } = payload;
      if (!newRecord && !oldRecord) return;
      const record = newRecord || oldRecord;
      if (!record) return;
      if (eventType === 'DELETE') {
        if (!oldRecord?.id) return;
      } else if (!isPaketOrderRow(record)) {
        return;
      }

      const isDone = record.status === 'completed' || record.status === 'cancelled';
      const viewingCompleted = showCompletedRef.current;

      if (eventType === 'INSERT') {
        if (viewingCompleted !== isDone) return;
        pendingInsertIdsRef.current.add(record.id);
        if (realtimeFlushRef.current) clearTimeout(realtimeFlushRef.current);
        realtimeFlushRef.current = setTimeout(() => {
          realtimeFlushRef.current = null;
          flushPendingInserts();
        }, REALTIME_INSERT_BATCH_MS);
      } else if (eventType === 'UPDATE') {
        const prevPatch = pendingUpdatesRef.current.get(record.id) || {};
        pendingUpdatesRef.current.set(record.id, { ...prevPatch, ...record });
        schedulePendingUpdatesFlush();
      } else if (eventType === 'DELETE') {
        setOrders((prev) => {
          if (!prev.some((o) => o.id === oldRecord?.id)) return prev;
          return prev.filter((o) => o.id !== oldRecord?.id);
        });
      }
    },
    [flushPendingInserts, isPaketOrderRow],
  );

  const debouncedCourierRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadCouriersThrottled();
    }, 800);
  }, [loadCouriersThrottled]);

  useEffect(() => {
    if (!tenant || !isActive) return;
    setLoading(true);
    void loadOrders();
    void loadCouriers();
    lastCourierLoadRef.current = Date.now();
  }, [tenant, activeBranch, isActive, showCompleted, loadOrders, loadCouriers]);

  useEffect(() => {
    if (!tenant || !isActive || formOpen) return;
    const ch = supabase
      .channel(`takeaway-${tenant.id}-${activeBranch?.id || 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: 'order_type=eq.takeaway' },
        handleOrderChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: 'order_type=eq.delivery' },
        handleOrderChange,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'couriers', filter: `tenant_id=eq.${tenant.id}` }, debouncedCourierRefresh)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (realtimeFlushRef.current) clearTimeout(realtimeFlushRef.current);
      if (updateFlushRef.current) clearTimeout(updateFlushRef.current);
      pendingUpdatesRef.current.clear();
    };
  }, [tenant, activeBranch, isActive, formOpen, handleOrderChange, debouncedCourierRefresh]);

  /** Realtime kaçarsa yedek; seyrek imza kontrolü (masa siparişleri dinlenmez). */
  useEffect(() => {
    if (!tenant || !isActive || formOpen) return;
    let lastSig = '';
    const stopPoll = startAdaptivePoller({
      diagLabel: 'takeaway-backup-poll',
      baseMs: 120_000,
      idleMs: 180_000,
      hiddenMs: 0,
      run: async () => {
        if (formOpenRef.current) return;
        try {
          let q = supabase
            .from('orders')
            .select('id, status, delivery_status, updated_at')
            .eq('tenant_id', tenant.id)
            .in('order_type', ['takeaway', 'delivery'])
            .is('table_id', null)
            .not('status', 'in', '(completed,cancelled)')
            .order('updated_at', { ascending: false })
            .limit(40);
          if (activeBranchRef.current) q = q.eq('branch_id', activeBranchRef.current);
          const { data } = await q;
          const sig = (data || [])
            .map((r: { id: string; status?: string; delivery_status?: string; updated_at?: string }) =>
              `${r.id}:${r.status}:${r.delivery_status}:${r.updated_at || ''}`,
            )
            .join('|');
          if (sig && sig !== lastSig) {
            lastSig = sig;
            await loadOrders();
          }
        } catch (e) {
          console.warn('[TakeawayOrders] yedek poll:', e);
        }
      },
      immediate: false,
    });
    return () => stopPoll();
  }, [tenant, isActive, formOpen, loadOrders]);

  useEffect(() => {
    if (!isActive) return;
    return subscribeLiveTick(() => setElapsedTick((n) => n + 1));
  }, [isActive]);

  const updateStatus = useCallback(async (orderId: string, newStatus: string, courierId?: string, courierName?: string) => {
    const updates: Record<string, any> = { delivery_status: newStatus };
    if (courierId) {
      updates.courier_id = courierId;
      updates.courier_name = courierName || '';
      updates.assigned_at = new Date().toISOString();
      if (newStatus === 'on_the_way') {
        updates.picked_up_at = new Date().toISOString();
      }
      await supabase.from('couriers').update({ status: 'busy' }).eq('id', courierId);
      const order = ordersRef.current.find(o => o.id === orderId);
      if (order?.courier_id && order.courier_id !== courierId) {
        await supabase.from('couriers').update({ status: 'available' }).eq('id', order.courier_id);
      }
      if (order && tenant) {
        await sendCourierAssignmentNotification(
          tenant.id,
          courierId,
          orderId,
          order.order_number,
          order.delivery_address,
        );
      }
    }
    if (newStatus === 'delivered') {
      updates.delivered_at = new Date().toISOString();
      updates.status = 'completed';
      updates.payment_status = 'paid';
      updates.payment_collected = true;
      const order = ordersRef.current.find(o => o.id === orderId);
      if (order?.courier_id) await supabase.from('couriers').update({ status: 'available' }).eq('id', order.courier_id);
      if (order && tenant && user) {
        await recordTakeawayPaymentIfNeeded({
          tenantId: tenant.id,
          branchId: order.branch_id ?? activeBranch?.id ?? null,
          orderId: order.id,
          orderNumber: order.order_number || order.id.slice(0, 8).toUpperCase(),
          orderType: order.order_type,
          orderSubtype: order.order_subtype,
          paymentMethod: order.payment_method,
          amount: order.total_amount || 0,
          createdBy: user.id,
          shouldRecord: true,
        });
      }
    }
    if (newStatus === 'cancelled') {
      updates.status = 'cancelled';
      const order = ordersRef.current.find(o => o.id === orderId);
      if (order?.courier_id) await supabase.from('couriers').update({ status: 'available' }).eq('id', order.courier_id);
    }
    await supabase.from('orders').update(updates).eq('id', orderId);
    const order = ordersRef.current.find((o) => o.id === orderId);
    if (order?.order_subtype !== 'gel_al') {
      if (newStatus === 'cancelled') {
        notifyHemenYolda(orderId, 'cancel');
      } else if (courierId || newStatus === 'on_the_way' || newStatus === 'delivered') {
        notifyHemenYolda(orderId, 'update');
      }
    }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
    setAssigningCourierId(null);
  }, [tenant, user, activeBranch?.id]);

  const deleteOrder = useCallback(async (orderId: string) => {
    if (!confirm('Siparişi silmek istediğinizden emin misiniz?')) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('order_items').delete().eq('order_id', orderId);
    const order = ordersRef.current.find((o) => o.id === orderId);
    if (order && order.order_subtype !== 'gel_al') {
      notifyHemenYolda(orderId, 'cancel');
    }
    await supabase.from('orders').delete().eq('id', orderId);
  }, []);

  const couriersById = useMemo(() => new Map(couriers.map((c) => [c.id, c])), [couriers]);

  const getElapsed = useCallback(
    (createdAt: string) => Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
    [elapsedTick],
  );

  const activeOrders = useMemo(
    () => (showCompleted ? [] : orders),
    [orders, showCompleted],
  );

  const completedOrders = useMemo(
    () => (showCompleted ? orders : []),
    [orders, showCompleted],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of activeOrders) {
      counts[o.delivery_status] = (counts[o.delivery_status] || 0) + 1;
    }
    return counts;
  }, [activeOrders]);

  const displayOrders = useMemo(() => {
    const base = showCompleted ? completedOrders : activeOrders;
    const q = deferredCustomerQuery.trim().toLowerCase();
    return base.filter((o) => {
      if (typeFilter === 'takeaway') return o.order_type === 'takeaway' && o.order_subtype !== 'gel_al';
      if (typeFilter === 'delivery') return o.order_type === 'delivery';
      if (typeFilter === 'gel_al') return o.order_subtype === 'gel_al';
      return true;
    }).filter((o) => {
      if (statusFilter === 'all') return true;
      return o.delivery_status === statusFilter;
    }).filter((o) => {
      if (!q) return true;
      const name = (o.customer_name || '').toLowerCase();
      const phone = (o.customer_phone || '').toLowerCase();
      const addr = (o.delivery_address || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || addr.includes(q);
    });
  }, [showCompleted, completedOrders, activeOrders, typeFilter, statusFilter, deferredCustomerQuery]);

  const visibleOrders = useMemo(
    () => displayOrders.slice(0, MAX_VISIBLE_ORDER_CARDS),
    [displayOrders],
  );
  const hiddenOrderCount = Math.max(0, displayOrders.length - visibleOrders.length);

  const availableCouriers = useMemo(() => couriers.filter((c) => c.status === 'available'), [couriers]);

  const handleFormClose = useCallback(
    (result?: { orderId?: string; reload?: boolean }) => {
      setShowNewOrderForm(false);
      setEditingOrder(null);
      setCidPrefill(null);
      if (result?.orderId && tenant) {
        void fetchTakeawayOrderById(result.orderId).then((row) => {
          if (!row) return;
          setOrders((prev) => [row, ...prev.filter((o) => o.id !== row.id)].slice(0, 250));
        });
      } else if (result?.reload !== false) {
        void loadOrders();
        void loadCouriers();
      }
    },
    [tenant, loadOrders, loadCouriers],
  );

  const handleEditOrder = useCallback(async (order: TakeawayOrder) => {
    const { data: items } = await supabase
      .from('order_items')
      .select('id, quantity, unit_price, product_id, notes, products(name)')
      .eq('order_id', order.id);
    setEditingOrder({
      ...order,
      order_items: items || [],
    } as TakeawayOrder & { order_items: unknown[] });
  }, []);

  const onEditById = useCallback(
    (orderId: string) => {
      const order = ordersRef.current.find((o) => o.id === orderId);
      if (order) void handleEditOrder(order);
    },
    [handleEditOrder],
  );

  if (formOpen) {
    return (
      <div className="fixed inset-0 top-14 md:top-20 z-30 flex flex-col min-h-0 bg-slate-50">
        <DeliveryOrderForm
          couriers={couriersForFormRef.current.length > 0 ? couriersForFormRef.current : couriers}
          editOrder={editingOrder}
          prefillCustomer={cidPrefill}
          onClose={handleFormClose}
        />
      </div>
    );
  }

  if (showCourierMgmt) {
    return <CourierManagement onClose={() => { setShowCourierMgmt(false); loadCouriers(); }} />;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-4 py-3 md:px-6 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-800">PAKET SERVİS</h1>
              <p className="text-xs text-slate-500">
                {activeOrders.length} aktif · {availableCouriers.length} kurye müsait
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cidAvailable && (
              <button
                onClick={() => setCidPanelOpen((p) => !p)}
                title={
                  cidStatusInfo.running
                    ? cidStatusInfo.connected
                      ? `Caller ID • Cihaz: ${cidStatusInfo.deviceModel || 'bağlı'}`
                      : 'Caller ID dinleniyor (cihaz yok)'
                    : 'Caller ID kapalı'
                }
                className={`relative p-2 rounded-xl transition active:scale-95 ${
                  cidStatusInfo.running
                    ? cidStatusInfo.connected
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {cidStatusInfo.running ? (
                  cidStatusInfo.connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />
                ) : (
                  <PhoneIncoming className="w-4 h-4" />
                )}
                {cidStatusInfo.softTest && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-500 rounded-full" title="Soft test" />
                )}
              </button>
            )}
            <button
              onClick={() => setShowCourierMgmt(true)}
              title="Kurye Yönetimi"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition active:scale-95"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => loadOrders()}
              title="Yenile"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowNewOrderForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm shadow hover:shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Sipariş</span>
            </button>
          </div>
        </div>

        {cidPanelOpen && cidAvailable && (
          <div className="mt-3 mb-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <PhoneIncoming className="w-4 h-4" />
                Caller ID — Arayan Tanımlama
              </div>
              <button onClick={() => setCidPanelOpen(false)} className="p-1 hover:bg-slate-200 rounded-lg" aria-label="Kapat">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-white rounded-lg border border-slate-200 p-2">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Durum</div>
                <div className={`font-bold ${cidStatusInfo.running ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {cidStatusInfo.running ? (cidStatusInfo.connected ? `Cihaz bağlı: ${cidStatusInfo.deviceModel || 'Bilinmiyor'}` : 'Dinleniyor (cihaz yok)') : 'Kapalı'}
                </div>
                {cidStatusInfo.deviceSerial && <div className="text-slate-500 mt-0.5">Seri: {cidStatusInfo.deviceSerial}</div>}
              </div>
              <label className="bg-white rounded-lg border border-slate-200 p-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cidSettings.autoStart}
                  onChange={(e) => void updateCidSetting({ autoStart: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <div className="font-bold text-slate-700">Açılışta başlat</div>
                  <div className="text-slate-500 text-[11px]">ŞefPOS açıldığında dinleyici otomatik başlasın</div>
                </span>
              </label>
              <label className="bg-white rounded-lg border border-slate-200 p-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cidSettings.softTest}
                  onChange={(e) => void updateCidSetting({ softTest: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <div className="font-bold text-slate-700 flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" /> Soft test (cihazsız)
                  </div>
                  <div className="text-slate-500 text-[11px]">DLL otomatik sahte çağrılar üretir; geliştirme için</div>
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={async () => {
                  if (cidStatusInfo.running) {
                    await stopCallerId();
                    await refreshCidStatus();
                  } else {
                    try {
                      const s = await startCallerId({ softTest: cidSettings.softTest });
                      setCidStatusInfo(s);
                      setCidError(null);
                    } catch (e: any) {
                      setCidError(e?.message || 'Başlatılamadı');
                    }
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  cidStatusInfo.running ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                }`}
              >
                {cidStatusInfo.running ? 'Dinlemeyi durdur' : 'Dinlemeyi başlat'}
              </button>
              <button
                onClick={triggerSimulatedRing}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 inline-flex items-center gap-1"
              >
                <FlaskConical className="w-3 h-3" /> Test çağrısı
              </button>
              {cidError && <span className="text-xs text-rose-600">{cidError}</span>}
            </div>
          </div>
        )}

        {cidStatusInfo.softTest && (
          <div className="mt-3 mb-2 p-3 rounded-xl border border-purple-200 bg-purple-50 text-sm text-purple-900">
            <strong>Soft test açık:</strong> Aynı numaradan sürekli sahte çağrı gelebilir. Kapatmak için üstteki telefon
            simgesine tıklayın → <strong>Soft test</strong> işaretini kaldırın veya <strong>Dinlemeyi durdur</strong>.
            HemenYolda testi için sipariş açmanız gerekmez.
          </div>
        )}

        {incomingCalls.length > 0 && (
          <div className="mt-3 mb-2 space-y-2">
            {incomingCalls.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-red-50 shadow flex items-center gap-3"
              >
                <div className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0 animate-pulse">
                  <PhoneIncoming className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-orange-600 uppercase tracking-wider">Gelen çağrı</div>
                  <div className="font-black text-slate-800 truncate text-base">
                    {item.matched ? item.matched.full_name : 'Bilinmeyen müşteri'}
                  </div>
                  <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{item.ring.phone}</span>
                    {item.matched?.address && (
                      <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3" />{item.matched.address}</span>
                    )}
                    {item.matched && (
                      <span className="text-orange-600 font-bold">{item.matched.order_count} sipariş geçmişi</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleAcceptCall(item)}
                    className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Pakete aç
                  </button>
                  <button
                    onClick={() => handleDismissCall(item.id)}
                    className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-lg"
                    title="Kapat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Müşteri ara (ad, telefon, adres)…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none"
            />
          </div>
          <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5">
            {([['all', 'Tümü'], ['takeaway', 'Paket'], ['gel_al', 'Gel-Al'], ['delivery', 'Kurye']] as [TypeFilter, string][]).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setTypeFilter(v)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${typeFilter === v ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 rounded-xl p-0.5 gap-0.5 ml-auto">
            <button
              onClick={() => setShowCompleted(false)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${!showCompleted ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
            >
              Aktif {activeOrders.length > 0 && <span className="ml-1 bg-orange-500 text-white rounded-full px-1.5 py-0.5">{activeOrders.length}</span>}
            </button>
            <button
              onClick={() => setShowCompleted(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${showCompleted ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-500'}`}
            >
              Geçmiş
            </button>
          </div>
        </div>

        {!showCompleted && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5 scrollbar-hide">
            <button
              onClick={() => setStatusFilter('all')}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold transition ${statusFilter === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              Tümü ({activeOrders.length})
            </button>
            {DELIVERY_STATUSES.filter(s => s.key !== 'cancelled').map(s => {
              const count = statusCounts[s.key] || 0;
              return (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(s.key as StatusFilter)}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition ${statusFilter === s.key ? `${s.bg} ${s.color}` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${s.dotColor}`} />
                  {s.label} {count > 0 && <span className="font-black">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Package className="w-14 h-14 mb-3 opacity-20" />
            <p className="font-bold text-slate-500">{showCompleted ? 'Tamamlanan sipariş yok' : 'Aktif sipariş yok'}</p>
            {!showCompleted && (
              <button onClick={() => setShowNewOrderForm(true)} className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-xl font-bold text-sm">
                Yeni Sipariş Oluştur
              </button>
            )}
          </div>
        ) : (
          <>
          {hiddenOrderCount > 0 && (
            <div className="mb-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-wrap items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>{hiddenOrderCount}</strong> sipariş daha var — liste performansı için ilk{' '}
                {MAX_VISIBLE_ORDER_CARDS} gösteriliyor. Arama veya durum filtresi kullanın.
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                courier={order.courier_id ? couriersById.get(order.courier_id) : undefined}
                availableCouriers={availableCouriers}
                isAssigning={assigningCourierId === order.id}
                setAssigningCourierId={setAssigningCourierId}
                onEdit={onEditById}
                onDelete={deleteOrder}
                onUpdateStatus={updateStatus}
                elapsedMinutes={getElapsed(order.created_at)}
                isCompleted={showCompleted}
                onOpenLiveMap={setLiveMapOrder}
              />
            ))}
          </div>
          </>
        )}
      </div>

      {liveMapOrder && (
        <CourierLiveMapModal
          open
          onClose={() => setLiveMapOrder(null)}
          order={liveMapOrder}
          courierLat={couriers.find((c) => c.id === liveMapOrder.courier_id)?.latitude ?? null}
          courierLng={couriers.find((c) => c.id === liveMapOrder.courier_id)?.longitude ?? null}
        />
      )}
    </div>
  );
}

function CourierLocationBadge({
  order,
  courier,
  onOpenLiveMap,
}: {
  order: TakeawayOrder;
  courier?: Courier;
  onOpenLiveMap: (order: CourierLiveMapOrder) => void;
}) {
  const courierId = order.courier_id;
  const hasLocation = courier?.latitude != null && courier?.longitude != null;
  const locationAge = courier?.location_updated_at
    ? Math.floor((Date.now() - new Date(courier.location_updated_at).getTime()) / 60000)
    : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-base leading-none" title="Kurye">🛵</span>
        <span className="font-semibold">{order.courier_name}</span>
        {hasLocation && (
          <span className={`flex items-center gap-0.5 ml-auto ${locationAge !== null && locationAge < 3 ? 'text-green-500' : 'text-slate-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${locationAge !== null && locationAge < 3 ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
            <span className="text-[10px]">{locationAge !== null ? `${locationAge}dk` : 'canlı'}</span>
          </span>
        )}
      </div>
      {courierId && (
        <button
          type="button"
          onClick={() =>
            onOpenLiveMap({
              id: order.id,
              order_number: order.order_number,
              customer_name: order.customer_name,
              delivery_address: order.delivery_address,
              courier_id: courierId,
              courier_name: order.courier_name,
            })
          }
          className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[11px] font-black transition active:scale-[0.98]"
        >
          <span className="text-sm">🛵</span>
          Canlı harita & müşteri adresi
        </button>
      )}
    </div>
  );
}

interface OrderCardProps {
  order: TakeawayOrder;
  courier?: Courier;
  availableCouriers: Courier[];
  isAssigning: boolean;
  setAssigningCourierId: (id: string | null) => void;
  onEdit: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onUpdateStatus: (id: string, status: string, courierId?: string, courierName?: string) => void;
  elapsedMinutes: number;
  isCompleted: boolean;
  onOpenLiveMap: (order: CourierLiveMapOrder) => void;
}

function orderCardPropsAreEqual(prev: OrderCardProps, next: OrderCardProps): boolean {
  if (prev.isAssigning !== next.isAssigning) return false;
  if (prev.isCompleted !== next.isCompleted) return false;
  if (prev.elapsedMinutes !== next.elapsedMinutes) return false;
  if (prev.courier !== next.courier) return false;
  if (prev.availableCouriers !== next.availableCouriers) return false;
  const po = prev.order;
  const no = next.order;
  if (po === no) return true;
  if (po.id !== no.id) return false;
  return (
    po.delivery_status === no.delivery_status &&
    po.courier_id === no.courier_id &&
    po.courier_name === no.courier_name &&
    po.payment_collected === no.payment_collected &&
    po.total_amount === no.total_amount &&
    po.customer_name === no.customer_name &&
    po.customer_phone === no.customer_phone &&
    po.delivery_address === no.delivery_address &&
    po.delivery_note === no.delivery_note &&
    po.payment_method === no.payment_method &&
    po.order_number === no.order_number &&
    po.latitude === no.latitude &&
    po.longitude === no.longitude
  );
}

const OrderCard = memo(function OrderCard({
  order,
  courier,
  availableCouriers,
  isAssigning,
  setAssigningCourierId,
  onEdit,
  onDelete,
  onUpdateStatus,
  elapsedMinutes,
  isCompleted,
  onOpenLiveMap,
}: OrderCardProps) {
  const isDelivery = order.order_type === 'delivery';
  const isGelAl = order.order_subtype === 'gel_al';
  const statusInfo = DELIVERY_STATUSES.find(s => s.key === order.delivery_status) || DELIVERY_STATUSES[0];
  const total = order.total_amount || 0;
  const elapsed = elapsedMinutes;
  const itemCount = takeawayItemCount(order);
  const statusMap =
    isDelivery
      ? STATUS_NEXT_DELIVERY
      : order.courier_id
        ? { pending: 'preparing', preparing: 'ready', ready: 'on_the_way', on_the_way: 'delivered' }
        : STATUS_NEXT_TAKEAWAY;
  const nextStatus = statusMap[order.delivery_status];
  const nextStatusInfo = nextStatus ? DELIVERY_STATUSES.find(s => s.key === nextStatus) : null;
  const payInfo = PAYMENT_LABELS[order.payment_method || 'cash'] || PAYMENT_LABELS.cash;
  const PayIcon = payInfo.icon;

  const headerGradient = isDelivery
    ? 'from-blue-600 to-blue-700'
    : isGelAl
    ? 'from-teal-600 to-teal-700'
    : 'from-orange-500 to-red-600';

  const typeIcon = isDelivery ? <Bike className="w-3.5 h-3.5" /> : isGelAl ? <Home className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />;
  const typeLabel = isDelivery ? 'Kurye' : isGelAl ? 'Gel-Al' : 'Paket';

  return (
    <div
      className={`bg-white rounded-xl shadow hover:shadow-lg transition-all overflow-hidden border-l-4 [content-visibility:auto] [contain-intrinsic-size:0_280px] ${isDelivery ? 'border-blue-500' : isGelAl ? 'border-teal-500' : 'border-orange-500'} ${isCompleted ? 'opacity-80' : ''}`}
    >
      <div className={`bg-gradient-to-r ${headerGradient} p-3 text-white`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {typeIcon}
              <span className="text-xs font-bold opacity-80">{typeLabel}</span>
              <span className="text-xs opacity-60">·</span>
              <span className="font-black text-sm">{order.order_number || `#${order.id.slice(0, 6).toUpperCase()}`}</span>
            </div>
            {order.customer_name && (
              <div className="flex items-center gap-1 text-xs opacity-90">
                <User className="w-3 h-3 shrink-0" />
                <span className="truncate font-semibold">{order.customer_name}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg shrink-0">
            <Clock className="w-3 h-3" />
            <span className="text-xs font-bold">{elapsed}dk</span>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold ${statusInfo.bg} ${statusInfo.color}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dotColor}`} />
          {statusInfo.label}
        </div>

        {order.customer_phone && (
          <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{order.customer_phone}</span>
          </a>
        )}

        {order.delivery_address && (
          <div className="flex items-start gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg p-2">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400 mt-0.5" />
            <span className="line-clamp-2">{order.delivery_address}</span>
          </div>
        )}

        {order.courier_id && order.courier_name && order.delivery_status !== 'delivered' && order.delivery_status !== 'cancelled' && (
          <CourierLocationBadge
            order={order}
            courier={courier}
            onOpenLiveMap={onOpenLiveMap}
          />
        )}

        {order.delivery_note && (
          <div className="text-xs text-slate-500 italic bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
            "{order.delivery_note}"
          </div>
        )}

        {itemCount > 0 && (
          <p className="text-xs text-slate-500 font-semibold">{itemCount} ürün · detay için düzenle</p>
        )}

        <div className="pt-1 border-t border-slate-100 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className={`flex items-center gap-1 text-xs font-semibold ${payInfo.color}`}>
              <PayIcon className="w-3.5 h-3.5" />
              <span>{payInfo.label}</span>
            </div>
            <span className="font-black text-base text-slate-800">{total.toFixed(2)}₺</span>
          </div>
          {order.payment_collected ? (
            <div className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ödendi
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5" />
              {order.payment_method === 'cash' ? 'Kapıda Nakit' : order.payment_method === 'card' ? 'Kapıda Kart' : 'Kapıda Ödenecek'}
            </div>
          )}
        </div>

        {!isCompleted && (
          <div className="space-y-1.5 pt-1">
            {isAssigning ? (
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-600">Kurye Seç:</p>
                {availableCouriers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onUpdateStatus(order.id, isDelivery ? 'on_the_way' : order.delivery_status, c.id, c.full_name)}
                    className="w-full text-left px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    {c.full_name} {c.phone && <span className="text-slate-400">· {c.phone}</span>}
                  </button>
                ))}
                {availableCouriers.length === 0 && <p className="text-xs text-red-500">Müsait kurye yok</p>}
                <button onClick={() => setAssigningCourierId(null)} className="w-full text-xs text-slate-400 py-1">İptal</button>
              </div>
            ) : (
              <>
                {!order.courier_id && order.delivery_status !== 'delivered' && order.delivery_status !== 'cancelled' && (
                  <button
                    onClick={() => setAssigningCourierId(order.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition active:scale-95"
                  >
                    <Bike className="w-3.5 h-3.5" /> Kurye Ata
                  </button>
                )}

                {order.courier_id && order.delivery_status !== 'delivered' && order.delivery_status !== 'cancelled' && (
                  <button
                    onClick={() => setAssigningCourierId(order.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-lg text-xs font-semibold transition active:scale-95"
                  >
                    <Bike className="w-3.5 h-3.5" /> Kurye Değiştir
                  </button>
                )}

                {nextStatusInfo && (
                  <button
                    onClick={() => onUpdateStatus(order.id, nextStatus!)}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 ${nextStatusInfo.bg} ${nextStatusInfo.color} rounded-lg text-xs font-bold transition active:scale-95 hover:opacity-90 border border-current/20`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    {nextStatusInfo.label}
                  </button>
                )}
              </>
            )}

            {order.delivery_status === 'delivered' && (
              <div className={`flex items-center justify-center gap-1.5 py-2 ${DELIVERY_STATUSES[4].bg} ${DELIVERY_STATUSES[4].color} rounded-lg text-xs font-bold`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Teslim Edildi
              </div>
            )}

            <div className="flex gap-1.5">
              <button
                onClick={() => onEdit(order.id)}
                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition active:scale-95"
              >
                Düzenle
              </button>
              <button
                onClick={() => onUpdateStatus(order.id, 'cancelled')}
                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition active:scale-95"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(order.id)}
                className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg text-xs transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}, orderCardPropsAreEqual);
