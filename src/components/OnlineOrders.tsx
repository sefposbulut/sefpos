import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingBag, Clock, Phone, MapPin, Check, X, ChevronDown, ChevronUp, Bike, Package, RefreshCw, Volume2, VolumeX, AlertTriangle, Hash, Tag, BellRing, Printer, Store } from 'lucide-react';
import {
  startContinuousAlert,
  stopContinuousAlert,
  stopAllAlerts,
  getActiveAlertOrderIds,
  unlockAudio,
  playOnlineOrderAlert,
  getAudioState,
} from '../lib/notification';
import {
  callGetir,
  eligibleCancelReasons,
  getGetirNextStepHint,
  getGetirUiPhase,
  getirStatusLabel,
  syncGetirRestaurantOpen,
  syncGetirStoreStatusFromApi,
} from '../lib/getirApi';
import { GETIR_STORE_STATUS_EVENT } from './GlobalGetirSync';
import { internalStatusLabelTr } from '../../supabase/functions/_shared/getirOrderStatus';
import { PlatformLogo } from './PlatformLogo';
import {
  isElectron,
  loadPrintSettings,
  printOnlineOrderKitchenTicket,
  printOnlineOrderReceiptFromEdge,
} from '../lib/printService';

/**
 * `Database` tipinde online sipariş tabloları tanımlı olmadığı için bu ekranda yerel model.
 * Supabase `select('*')` ile gelen alanlar.
 */
interface OnlineOrderRow {
  id: string;
  tenant_id: string;
  platform_id: string;
  platform_order_id: string;
  platform_order_number?: string | null;
  status: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_address?: string | null;
  customer_notes?: string | null;
  subtotal?: number;
  delivery_fee?: number;
  discount_amount?: number;
  total_amount: number;
  payment_status?: string | null;
  created_at: string;
  updated_at?: string | null;
  accepted_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  getir_verification_code?: string | null;
  getir_status_code?: number | null;
  getir_delivery_type?: number | null;
  getir_is_scheduled?: boolean | null;
  getir_total_discount?: number | null;
  getir_courier_name?: string | null;
  getir_courier_phone?: string | null;
  getir_courier_pickup_at?: string | null;
  getir_platform_order_status?: string | null;
}

interface OnlineOrderItemRow {
  id: string;
  tenant_id: string;
  online_order_id: string;
  platform_product_name: string;
  platform_product_code?: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes?: string | null;
  toppings?: unknown;
}

interface OnlineOrderPlatformRow {
  id: string;
  tenant_id: string;
  platform_name: string;
  platform_code: string;
  is_active?: boolean | null;
}

interface OrderWithDetails extends OnlineOrderRow {
  online_order_platforms: OnlineOrderPlatformRow;
  items: OnlineOrderItemRow[];
}

/** Supabase client `Database` tipi bu tabloları içermediği için liste satırı. */
type OnlinePlatformListRow = { id: string; platform_code: string; is_active?: boolean | null };

const REJECT_REASONS: { value: string; label: string }[] = [
  { value: 'TOO_BUSY', label: 'Çok yoğunuz' },
  { value: 'ITEM_UNAVAILABLE', label: 'Ürün mevcut değil' },
  { value: 'CLOSED', label: 'Restoran kapalı' },
  { value: 'TECHNICAL_PROBLEM', label: 'Teknik sorun' },
  { value: 'BAD_WEATHER', label: 'Kötü hava koşulları' },
  { value: 'NO_COURIER', label: 'Kurye yok' },
  { value: 'OUTSIDE_DELIVERY_AREA', label: 'Teslimat bölgesi dışı' },
  { value: 'FRAUD_PRANK', label: 'Sahte sipariş' },
  { value: 'MOV_NOT_REACHED', label: 'Minimum sipariş tutarı karşılanmadı' },
  { value: 'ADDRESS_INCOMPLETE_MISSTATED', label: 'Adres eksik/hatalı' },
];

const FILTER_GROUPS: Record<'all' | 'new' | 'active' | 'on_the_way' | 'done', string[] | null> = {
  new: ['new', 'scheduled_new', 'verified', 'accepted', 'getir_unmapped'],
  active: ['preparing', 'ready', 'scheduled_accepted'],
  on_the_way: ['handed_over', 'on_the_way', 'arrived'],
  done: ['delivered', 'cancelled', 'rejected'],
  all: null,
};

/**
 * Mutfak fişi sadece kullanıcı "Onayla" dedikten sonra basılır
 * (status: verified / accepted / preparing / scheduled_accepted).
 * localStorage ile cihaz/oturumlar arası mükerrer engellenir.
 */
function kitchenPrintedKey(tenantId: string): string {
  return `sefpos_kitchen_online_printed:${tenantId}`;
}

function wasKitchenPrinted(tenantId: string, orderId: string): boolean {
  try {
    const raw = localStorage.getItem(kitchenPrintedKey(tenantId));
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return arr.includes(orderId);
  } catch {
    return false;
  }
}

function markKitchenPrinted(tenantId: string, orderId: string): void {
  try {
    const key = kitchenPrintedKey(tenantId);
    const raw = localStorage.getItem(key);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(orderId)) {
      arr.push(orderId);
      while (arr.length > 500) arr.shift();
      localStorage.setItem(key, JSON.stringify(arr));
    }
  } catch {
    /* ignore */
  }
}

const KITCHEN_READY_STATUSES = new Set([
  'verified',
  'accepted',
  'preparing',
  'scheduled_accepted',
]);
const PENDING_APPROVAL_STATUSES = new Set(['new', 'scheduled_new']);

export function OnlineOrders() {
  const { tenant, user } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [selectedRejectReason, setSelectedRejectReason] = useState('TOO_BUSY');
  // Getir icin: secilen iptal sebebinin ObjectId'si + serbest not
  const [getirCancelReasonId, setGetirCancelReasonId] = useState<string>('');
  const [getirCancelNote, setGetirCancelNote] = useState<string>('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const busyOrderIdRef = useRef<string | null>(null);
  busyOrderIdRef.current = busyOrderId;
  const [filter, setFilter] = useState<'all' | 'new' | 'active' | 'on_the_way' | 'done'>('new');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_sound_enabled');
    return saved === null ? true : saved === 'true';
  });
  const previousOrderCount = useRef<number>(0);
  // Daha onceden goruldumu listesi — yeni gelenleri platforma gore uyarmak icin
  const seenOrderIds = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef<boolean>(false);

  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const kitchenPrintInFlight = useRef<Set<string>>(new Set());
  // Her siparişin son bilinen statüsü — onaylama anında geçişi yakalamak için.
  const lastStatusByOrderId = useRef<Map<string, string>>(new Map());

  const scheduleKitchenPrint = useCallback(
    async (o: OrderWithDetails) => {
      if (!tenant?.id) return;
      if (kitchenPrintInFlight.current.has(o.id)) return;
      if (wasKitchenPrinted(tenant.id, o.id)) return;
      kitchenPrintInFlight.current.add(o.id);
      try {
        const platformCode = (o.online_order_platforms?.platform_code || '').toLowerCase();
        let printed = false;
        if (platformCode === 'getir') {
          const result = await printOnlineOrderReceiptFromEdge(o.id, { silent: true });
          printed = result.success;
          if (!printed) {
            console.warn('[OnlineOrders] Getir fişi yazdırılamadı:', result.error);
          }
        } else {
          const settings = loadPrintSettings();
          await printOnlineOrderKitchenTicket({
            settings,
            restaurantName: (settings.restaurantName || tenant?.name || 'ŞefPOS').trim(),
            platformLabel:
              o.online_order_platforms?.platform_name ||
              o.online_order_platforms?.platform_code ||
              'Online',
            orderNumber: String(o.platform_order_number || (o.platform_order_id || '').slice(0, 12)),
            customerName: o.customer_name || undefined,
            customerAddress: o.customer_address || undefined,
            verificationCode: o.getir_verification_code || null,
            items: (o.items || []).map((it) => ({
              platform_product_name: it.platform_product_name || '',
              quantity: it.quantity,
              notes: it.notes || null,
            })),
          });
          printed = true;
        }
        if (printed) markKitchenPrinted(tenant.id, o.id);
      } catch (e) {
        console.warn('[OnlineOrders] Mutfak fişi yazdırılamadı:', e);
      } finally {
        kitchenPrintInFlight.current.delete(o.id);
      }
    },
    [tenant?.id, tenant?.name],
  );

  const loadOrders = useCallback(async (showLoading = false) => {
    if (!tenant) return;

    if (showLoading) setLoading(true);
    try {
      let query = supabase
        .from('online_orders')
        .select(`*, online_order_platforms(*), items:online_order_items(*)`)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(100);

      // Sekme filtresi SQL'de UYGULANMAZ — aksi halde "Mutfakta" sekmesindeyken
      // yeni sipariş realtime/poll ile listede hiç görünmez ve alarm/fiş tetiklenmez.
      const { data, error } = await query;
      if (error) throw error;

      const newOrders = (data as any[]) || [];

      // ────────────────────────────────────────────────────────────────
      // ALARM + MUTFAK FİŞİ politikası
      //
      // Sipariş sisteme DÜŞTÜĞÜNDE   → alarm + toast (FİŞ ÇIKMAZ)
      // Kullanıcı ONAYLA bastığında  → status: verified/accepted + accepted_at (Getir) → MUTFAK FİŞİ
      //   • Getir: `accepted_at` dolmadan mutfak fişi basılmaz (Getir kodu 400+ olsa bile).
      //   • Yemeksepeti / dahili: 'accepted' (accepted_at opsiyonel)
      // Onaylanmış (verified/accepted/preparing) ama henüz fişi basılmamış
      // bir sipariş ilk açılışta da yakalanır (kasa kapalıyken onaylanmış olabilir).
      // ────────────────────────────────────────────────────────────────
      const currentPendingApprovalIds = new Set(
        newOrders.filter((o) => PENDING_APPROVAL_STATUSES.has(o.status)).map((o) => o.id),
      );

      for (const o of newOrders) {
        const prevStatus = lastStatusByOrderId.current.get(o.id);
        const isFirstSighting = !seenOrderIds.current.has(o.id);
        if (isFirstSighting) seenOrderIds.current.add(o.id);

        // 1) Bekleyen onay → alarm. Ses açıksa sürekli, kapalıysa da DB'ye
        //    not düş (idempotent: aynı id iki kez başlatılmaz).
        if (PENDING_APPROVAL_STATUSES.has(o.status) && soundEnabledRef.current) {
          const label = o.online_order_platforms?.platform_name || 'Online';
          startContinuousAlert(o.id, label);
        }

        // 2) Onaylanmış statü → fiş. Geçiş veya ilk görüşte (eski kayıt)
        //    olduğu farketmez; localStorage mükerrer engelliyor.
        if (KITCHEN_READY_STATUSES.has(o.status)) {
          const isGetir = o.online_order_platforms?.platform_code === 'getir';
          const justApproved =
            prevStatus !== undefined && PENDING_APPROVAL_STATUSES.has(prevStatus);
          const hasLocalAck = !!o.accepted_at;
          // Getir için: kasa onayı (accepted_at) zorunlu — getir paneli auto-verify
          // etse bile fiş YALNIZCA kullanıcı ŞefPOS’ta «Onayla» dedikten sonra basılır.
          // Diğer platformlar (Yemeksepeti vb.) için eski davranış: durum geçişi veya
          // ilk görüş yeterli.
          const triggerPrint = isGetir
            ? hasLocalAck && (justApproved || isFirstSighting)
            : justApproved || isFirstSighting;
          if (triggerPrint) {
            void scheduleKitchenPrint(o as OrderWithDetails);
          }
        }

        lastStatusByOrderId.current.set(o.id, o.status);
      }

      if (!firstLoadDone.current) firstLoadDone.current = true;

      // Onaylanmış / iptal edilmiş ya da artık listede olmayan siparişlerin
      // alarmlarını durdur.
      for (const id of getActiveAlertOrderIds()) {
        if (!currentPendingApprovalIds.has(id)) stopContinuousAlert(id);
      }

      previousOrderCount.current = newOrders.length;
      setOrders(newOrders);
    } catch (error: any) {
      console.error('Error loading online orders:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [tenant, scheduleKitchenPrint]);

  useEffect(() => {
    firstLoadDone.current = false;
    seenOrderIds.current = new Set();
    lastStatusByOrderId.current = new Map();
    previousOrderCount.current = 0;
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant) return;

    loadOrders(true);

    const channel = supabase
      .channel(`online-orders-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'online_orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => loadOrders())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'online_orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, () => loadOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant, loadOrders]);

  // Sayfa kapatildiginda / kullanici baska ekrana gectiğinde tum alarmlari durdur
  useEffect(() => {
    return () => {
      stopAllAlerts();
    };
  }, []);

  // Uygulama açılır açılmaz Getir platformu credential ve POS durumunu kontrol et;
  // eksik/pasif ise banner'da net mesaj göster (polling beklemeden).
  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from('online_order_platforms')
          .select(
            'id, platform_code, is_active, getir_app_secret_key, getir_restaurant_secret_key, getir_restaurant_id, getir_pos_status, getir_environment, getir_restaurant_open',
          )
          .eq('tenant_id', tenant.id)
          .eq('platform_code', 'getir')
          .limit(1);
        if (cancelled) return;
        const platform = (rows || [])[0] as
          | {
              id: string;
              getir_app_secret_key?: string | null;
              getir_restaurant_secret_key?: string | null;
              getir_restaurant_id?: string | null;
              getir_pos_status?: number | null;
              getir_environment?: string | null;
              getir_restaurant_open?: boolean | null;
            }
          | undefined;
        if (!platform) {
          setGetirPlatformMeta(null);
          return;
        }
        let restaurantOpen = platform.getir_restaurant_open ?? null;
        let posStatus = platform.getir_pos_status ?? null;

        const missing: string[] = [];
        if (!platform.getir_app_secret_key) missing.push('appSecretKey');
        if (!platform.getir_restaurant_secret_key) missing.push('restaurantSecretKey');
        if (!platform.getir_restaurant_id) missing.push('restaurantId');
        if (missing.length) {
          setGetirPlatformMeta({ id: platform.id, getir_restaurant_open: restaurantOpen, getir_pos_status: posStatus });
          setGetirPollIssue(`Getir credential eksik: ${missing.join(', ')}`);
          return;
        }

        // Sayfa yenilemede DB'de null kaldıysa Getir'den gerçek durumu çek (panelde açık görünüp uyarı çıkmasın).
        const sync = await syncGetirStoreStatusFromApi(platform.id);
        if (cancelled) return;
        if (sync.ok) {
          if (sync.posStatus != null) posStatus = sync.posStatus;
          if (sync.restaurantOpen != null) restaurantOpen = sync.restaurantOpen;
          else if (sync.posStatus === 100 && restaurantOpen == null) restaurantOpen = true;
        }

        setGetirPlatformMeta({
          id: platform.id,
          getir_restaurant_open: restaurantOpen,
          getir_pos_status: posStatus,
        });

        if (restaurantOpen === false) {
          setGetirPollIssue('Getir uygulamasında restoran KAPALI — müşteriler sipariş veremez.');
        } else if (posStatus === 200) {
          setGetirPollIssue('Getir POS pasif — «Getir Restoranı Aç» butonu POS’u da açar.');
        } else {
          setGetirPollIssue(null);
        }
      } catch (e) {
        console.warn('[OnlineOrders] Getir platform precheck:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  // GlobalGetirSync (~20 sn) Getir panelinden kapatınca anında banner günceller.
  useEffect(() => {
    const onStoreStatus = (ev: Event) => {
      const d = (ev as CustomEvent<{
        platformId: string;
        restaurantOpen: boolean | null;
        posStatus: number | null;
      }>).detail;
      if (!d?.platformId) return;
      setGetirPlatformMeta((prev) => {
        if (!prev || prev.id !== d.platformId) return prev;
        return {
          ...prev,
          getir_restaurant_open: d.restaurantOpen,
          getir_pos_status: d.posStatus ?? prev.getir_pos_status,
        };
      });
      if (d.restaurantOpen === false) {
        setGetirPollIssue('Getir uygulamasında restoran KAPALI — müşteriler sipariş veremez.');
      } else if (d.posStatus === 200) {
        setGetirPollIssue('Getir POS pasif — «Getir Restoranı Aç» butonu POS’u da açar.');
      } else if (d.restaurantOpen === true) {
        setGetirPollIssue(null);
      }
    };
    window.addEventListener(GETIR_STORE_STATUS_EVENT, onStoreStatus);
    return () => window.removeEventListener(GETIR_STORE_STATUS_EVENT, onStoreStatus);
  }, []);

  // Getir API auto-poll — her tick'te HEM onay bekleyen (`poll-unapproved`) HEM
  // aktif (`poll-active`) siparişleri çek. Webhook gecikse veya kaybolsa bile
  // yeni siparişler 30 sn içinde mutlaka düşer. (Eski sürüm 45 sn aralıkla
  // alternatif çağrı yapıyordu → yeni siparişler 90 sn beklerdi.)
  useEffect(() => {
    if (!tenant) return;
    let stopped = false;

    const callOne = async (
      platformId: string,
      action: 'poll-unapproved' | 'poll-active' | 'poll-cancelled',
    ): Promise<{ fetched: number; saved: number } | null> => {
      const res = await callGetir({ platformId, action });
      if (!res.ok) {
        const dataObj = (res.data && typeof res.data === 'object') ? (res.data as Record<string, unknown>) : {};
        const detail =
          (dataObj.error as string | undefined) ||
          (dataObj.message as string | undefined) ||
          ((dataObj.data as any)?.message as string | undefined) ||
          res.error ||
          `HTTP ${res.status ?? '???'}`;
        setGetirPollIssue(`${action}: ${detail}`);
        setGetirPollInfo(null);
        return null;
      }
      return { fetched: Number(res.fetched ?? 0), saved: Number(res.saved ?? 0) };
    };

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (busyOrderIdRef.current) return;
      try {
        const { data: platforms } = await supabase
          .from('online_order_platforms')
          .select('id, platform_code, is_active')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .eq('platform_code', 'getir');
        for (const p of (platforms || []) as OnlinePlatformListRow[]) {
          if (stopped || busyOrderIdRef.current) break;
          // 1) Önce onay bekleyenler: yeni sipariş geciktirilmemeli
          const unapproved = await callOne(p.id, 'poll-unapproved');
          if (stopped || busyOrderIdRef.current) break;
          // 2) Sonra aktifler: onaylı/hazırlık aşamasındakileri senkronla
          const active = await callOne(p.id, 'poll-active');
          if (unapproved && active) {
            setGetirPollIssue(null);
            const ts = new Date().toLocaleTimeString('tr-TR');
            const totalFetched = unapproved.fetched + active.fetched;
            const totalSaved = unapproved.saved + active.saved;
            console.info(
              `[OnlineOrders] auto-poll ok: unapproved=${unapproved.fetched}/${unapproved.saved} active=${active.fetched}/${active.saved} (${ts})`,
            );
            setGetirPollInfo({ fetched: totalFetched, saved: totalSaved, ts });
          }
        }
      } catch (e) {
        console.warn('[OnlineOrders] auto-poll uyari:', e);
      }
    };

    const firstId = window.setTimeout(tick, 500);
    const intervalId = window.setInterval(tick, 15_000);
    return () => {
      stopped = true;
      window.clearTimeout(firstId);
      window.clearInterval(intervalId);
    };
  }, [tenant]);

  // Realtime fallback: 20 sn'de bir hafif bir DB poll — id+status+updated_at
  // disinde alan cekmedigimiz icin neredeyse bedava. Realtime kacirirsa yine
  // sipariş düşer. Yeni id veya status degisikligi tespit edilirse loadOrders.
  useEffect(() => {
    if (!tenant) return;
    let stopped = false;
    let lastSignature = '';

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (busyOrderIdRef.current) return;
      try {
        const { data } = await supabase
          .from('online_orders')
          .select('id, status, updated_at')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(50);
        const sig = (data || [])
          .map((r: any) => `${r.id}:${r.status}:${r.updated_at || ''}`)
          .join('|');
        if (sig && sig !== lastSignature) {
          lastSignature = sig;
          await loadOrders();
        }
      } catch (e) {
        console.warn('[OnlineOrders] DB poll uyari:', e);
      }
    };

    const firstId = window.setTimeout(tick, 2000);
    const intervalId = window.setInterval(tick, 10_000);
    return () => {
      stopped = true;
      window.clearTimeout(firstId);
      window.clearInterval(intervalId);
    };
  }, [tenant, loadOrders]);

  // filter UI tarafında uygulanıyor; ek loadOrders gereksiz.

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('notification_sound_enabled', newValue.toString());
    if (!newValue) {
      // Ses kapatildi → tum aktif alarmlari durdur
      stopAllAlerts();
    }
  };

  // Manuel "sustur" — yeni siparis sesi devam ediyorsa kullanici tek tuşla sussun.
  // Sound enable/disable'ı değiştirmez, sadece o anki çalan alarmları susturur.
  const silenceNow = () => {
    stopAllAlerts();
  };

  /**
   * Yemeksepeti/Trendyol/Migros gibi DH-tabanli platformlar icin sipariş statu
   * gecisi. Eger `dhAction` verilirse `yemeksepeti-callback` Edge Function'i
   * cagirir (middleware'e duruma gore preparation-completed / order_picked_up /
   * order_accepted / order_rejected gonderir). Aksi halde sadece local DB'ye
   * yazar (preparing gibi internal status'ler icin).
   *
   * Hata olursa local state geri alinir ve kullaniciya bilgi verilir.
   */
  const updateOrderStatus = async (
    orderId: string,
    status: string,
    dhAction?: 'accept' | 'reject' | 'prepared' | 'picked_up',
    rejectReason?: string,
  ) => {
    if (!tenant) return;

    const order = orders.find((o) => o.id === orderId);
    const prevStatus = order?.status;

    const baseURL = (import.meta.env.VITE_SUPABASE_URL || 'https://xdfnozfuuzctubijbnds.supabase.co').replace(/\/$/, '');
    const now = new Date().toISOString();
    const updateData: Record<string, any> = { status };
    if (status === 'accepted') updateData.accepted_at = now;
    else if (status === 'ready') updateData.ready_at = now;
    else if (status === 'cancelled') updateData.cancelled_at = now;
    else if (status === 'delivered') updateData.delivered_at = now;

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updateData } : o)));
    setBusyOrderId(orderId);

    try {
      if (dhAction) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Oturum bulunamadı, lütfen yeniden giriş yapın.');

        const resp = await fetch(`${baseURL}/functions/v1/yemeksepeti-callback`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '',
          },
          body: JSON.stringify({ orderId, action: dhAction, rejectReason }),
        });

        const raw = await resp.text();
        let data: any = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }

        if (!resp.ok || data?.error) {
          throw new Error(data?.error || data?.details || raw || `HTTP ${resp.status}`);
        }
        // Edge function DB'yi de update ediyor; local state zaten dogru.
        await loadOrders();
      } else {
        const { error } = await (supabase as any)
          .from('online_orders')
          .update(updateData)
          .eq('id', orderId);
        if (error) throw error;
      }
    } catch (err: any) {
      // Rollback local state
      if (prevStatus) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, status: prevStatus } : o)),
        );
      }
      console.error('[OnlineOrders] updateOrderStatus error:', err);
      alert(
        `Sipariş ${status === 'cancelled' ? 'reddedilemedi' : 'güncellenemedi'}: ` +
          (err?.message || 'Bilinmeyen hata') +
          '\n\nPlatform middleware bilgileri (kullanıcı adı/şifre/URL) doğru mu kontrol edin.',
      );
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  };

  /**
   * Getir'e ozel aksiyon gonder (verify/prepare/handover/deliver/cancel).
   * Local state hemen guncellenir, hata olursa rollback yapar.
   */
  // Eski siparişlerde "[object Object]" olarak DB'ye yazılmış adlari da
  // tolere et — Getir multi-language object dondurursa onu da string'e cevir.
  const safeName = (v: any, fallback = 'Ürün'): string => {
    if (v == null) return fallback;
    if (typeof v === 'string') {
      if (v === '[object Object]' || v.trim() === '') return fallback;
      return v;
    }
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') {
      const cand = v.tr ?? v.TR ?? v.text ?? v.value ?? v.default ??
        Object.values(v).find((x) => typeof x === 'string');
      return cand ? String(cand) : fallback;
    }
    return String(v);
  };

  // Getir'in resmi hata mesajlarini kullanici dostu Turkce metne cevirir
  const friendlyGetirError = (action: string, raw: string): string => {
    const t = (raw || '').toLowerCase();
    if (t.includes('prepared time limit') || t.includes('time limit')) {
      return 'Getir bu siparişin önceki adımı üzerinden yeterli süre geçmesini bekliyor. Birkaç saniye sonra tekrar denenecek…';
    }
    if (t.includes('status is invalid for given action') || t.includes('invalid status')) {
      return 'Bu sipariş için bu aksiyon şu anda uygun değil (Getir akışı sırasını kontrol edin: Onayla → Hazırla → Kuryeye Ver → Teslim).';
    }
    if (t.includes('not found')) {
      return 'Getir sipariş bulunamadı (silinmiş veya başka bir restoranın siparişi olabilir).';
    }
    if (t.includes('unauthorized') || t.includes('authentication')) {
      return 'Getir oturumu reddedildi. Lütfen Ayarlar > Online Platformlar > Getir → bilgileri kontrol edin.';
    }
    if (t.includes('429') || t.includes('too many')) {
      return 'İstek limiti aşıldı. Bir dakika bekleyip tekrar deneyin.';
    }
    return `Getir hata mesajı (${action}): ${raw}`;
  };

  /**
   * Getir'e bir aksiyon (verify/prepare/handover/deliver/cancel) gonderir.
   * Pre-action inquiry KALDIRILDI — her tiklamada 2x istek 429 (Too Many Requests)
   * uretiyordu. Senkron ihtiyaci: yalnizca "invalid status" hatasinda inquiry.
   */
  /**
   * "HAZIRLANMAYA BAŞLA" lokal işaretlemesi — Getir'e istek gönderilmez.
   * Sadece mutfak takibi: DB'de status='preparing', getir_status_code=410 (Getir paneliyle
   * uyum için; Getir tarafı genelde verify sonrası zaten hazırlanıyor olur).
   * Getir'de «Hazır» (500) ve kurye teslimi için kullanıcı «YEMEK HAZIR» ile resmi `prepare` API'sini çağırır.
   */
  const markGetirOrderPreparingLocal = async (order: OrderWithDetails): Promise<void> => {
    setBusyOrderId(order.id);
    try {
      const { error } = await supabase
        .from('online_orders')
        .update({
          status: 'preparing',
          getir_status_code: 410,
        } as any)
        .eq('id', order.id)
        .lt('getir_status_code', 411);
      if (error) throw error;
      await loadOrders();
      console.info(
        `[Getir] Sipariş #${order.platform_order_number || order.platform_order_id} lokal olarak "Hazırlanıyor" işaretlendi (Getir API'sine prepare gönderilmedi).`,
      );
    } catch (err: any) {
      alert(`Hazırlanmaya başla işaretlemesi başarısız: ${err?.message || err}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  /**
   * «YEMEK HAZIR» — Getir Food API'de `POST /food-orders/{id}/prepare` resmi adı:
   * «Restaurant prepared the food order» (yemek hazır, kurye teslimi bekleniyor; tipik kod 500).
   * ŞefPOS'ta mutfak tamamlandığında bu çağrılır; başarılı olunca Getir tarafı «Hazır» olur
   * ve «KURYE YOLA ÇIKTI» (handover) geçerli hale gelir.
   * Zaman sınırı (verify sonrası çok erken) hatalarında `doGetirAction` içi retry devam eder.
   */
  const markGetirOrderReadyLocal = async (order: OrderWithDetails): Promise<void> => {
    await doGetirAction(order, 'prepare');
  };

  /**
   * Tek bir Getir siparişi için inquiry çağırarak DB'yi Getir'in gerçek
   * durumuyla senkronize eder. Webhook'ta durum boş gelmişse veya bizim
   * sistemle Getir paneli arasında uyumsuzluk varsa kullanıcı bunu tek
   * tıkla düzeltebilir.
   */
  /**
   * Online sipariş fişini tekrar bas — Yemeksepeti/Trendyol/Migros/Getir hepsi için.
   *
   * Edge function (`online-order-reprint`) DB'deki `dh_raw_payload` veya item snapshot'ından
   * yeniden HTML üretir ve `print_jobs` kuyruğuna atar. Electron Print Agent kuyruğu okuyup
   * ilgili yazıcıya gönderir. İlk basımdaki ile birebir aynı çıktı.
   */
  const reprintOnlineOrder = async (order: OrderWithDetails): Promise<void> => {
    setBusyOrderId(order.id);
    try {
      const settings = loadPrintSettings();
      const printer = settings.defaultKitchenPrinter || '';
      const result = await printOnlineOrderReceiptFromEdge(order.id, {
        printerName: printer,
        title: 'Fiş yazdırılıyor',
      });
      if (!result.success) {
        const detail = result.error ? ` (${result.error})` : '';
        alert(
          isElectron()
            ? `Getir fişi yazdırılamadı.${detail}\n\nAyarlar → Yazıcılar → «Varsayılan mutfak yazıcısı»nı bu bilgisayardaki termal yazıcı adıyla seçin (Windows’taki adla aynı olmalı).`
            : `Fiş açılamadı.${detail} Pop-up engelliyse tarayıcıda www.sefpos.com.tr için açılır pencereye izin verin. Termal yazıcı bu PC'deyse yazdırma penceresinden varsayılan yazıcıyı seçin.`,
        );
      }
    } catch (err: any) {
      alert(`Reprint hatası: ${err?.message || err}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const refreshGetirOrder = async (order: OrderWithDetails): Promise<void> => {
    setBusyOrderId(order.id);
    try {
      const res = await callGetir({
        platformId: order.platform_id,
        action: 'inquiry',
        orderId: order.platform_order_id,
      });
      if (!res.ok) {
        alert(`Getir senkronizasyonu başarısız: ${(res as any)?.data?.message || res.error || 'bilinmeyen'}`);
      } else {
        await loadOrders();
      }
    } catch (err: any) {
      alert(`Senkron hatası: ${err?.message || err}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  const doGetirAction = async (
    order: OrderWithDetails,
    action: 'verify' | 'verify-scheduled' | 'prepare' | 'handover' | 'deliver' | 'cancel',
    extra?: { cancelReasonId?: string; cancelNote?: string },
    retryCount: number = 0,
  ): Promise<void> => {
    setBusyOrderId(order.id);
    try {
      const res = await callGetir({
        platformId: order.platform_id,
        action,
        orderId: order.platform_order_id,
        cancelReasonId: extra?.cancelReasonId,
        cancelNote: extra?.cancelNote,
      });

      if (!res.ok) {
        const raw = (res as any)?.data?.message || res.error || 'bilinmeyen hata';
        const lower = String(raw).toLowerCase();
        const is429 = res.status === 429 || lower.includes('429') || lower.includes('too many');
        const isTimeLimit = lower.includes('time limit') || lower.includes('prepared time');
        const isInvalidStatus =
          lower.includes('status is invalid') || lower.includes('invalid status');

        if (is429) {
          alert(
            'Çok sık istek gönderildi (geçici limit). Bir dakika bekleyip "Siparişleri Yenile" veya aynı butona tekrar deneyin.',
          );
          await loadOrders();
          return;
        }

        // Time-limit hatalari (prepare/deliver/handover) — Getir bu aksiyonlar arasında
        // dakika düzeyinde bir bekleme istiyor. Otomatik retry yapmıyoruz (429 baskısı
        // yaratıyor); kullanıcıya açıklayıcı bir mesaj göster.
        if (isTimeLimit) {
          const actionTr =
            action === 'prepare'
              ? '«Yemek hazır»'
              : action === 'handover'
                ? '«Kurye yola çıktı»'
                : action === 'deliver'
                  ? '«Teslim edildi»'
                  : `«${action}»`;
          alert(
            `${actionTr} aksiyonu için Getir bir bekleme süresi uyguluyor.\n\n` +
              `Önceki adımdan sonra ~1–2 dakika geçmeden bu aksiyon kabul edilmiyor.\n\n` +
              `Lütfen 1–2 dakika sonra aynı butona tekrar basın.`,
          );
          await loadOrders();
          return;
        }

        // "Invalid status" hatasi → Getir'in iç state'i DB ile uyumsuz.
        // Kullanıcıya "yerel olarak kapatmak ister misiniz?" diye sor; onaylarsa
        // siparişi delivered yap (Getir'e ek istek atılmaz, 429 baskısı yok).
        if (isInvalidStatus && retryCount === 0) {
          console.log(`[Getir] ${action} invalid status → kullanıcıya yerel kapatma seçeneği sun`);
          const currentCode =
            typeof order.getir_status_code === 'number' ? order.getir_status_code : null;
          const label = currentCode != null ? getirStatusLabel(currentCode) : 'bilinmiyor';
          const confirmClose = confirm(
            `Getir bu işlemi kabul etmedi (sıra dışı bir adım).\n\n` +
              `ŞefPOS'taki durum: ${currentCode ?? '?'} - ${label}\n` +
              `Aksiyon: ${action}\n\n` +
              `Bu sipariş büyük olasılıkla Getir tarafında zaten teslim edilmiş/iptal olmuş.\n\n` +
              `Yerel olarak "Tamamlandı" yapmak ister misiniz?\n` +
              `(Sadece ŞefPOS'taki kaydı kapatır, Getir tarafına bir şey gönderilmez.)`,
          );
          if (confirmClose) {
            try {
              await supabase
                .from('online_orders')
                .update({
                  status: 'delivered',
                  delivered_at: new Date().toISOString(),
                } as any)
                .eq('id', order.id);
              await loadOrders();
            } catch (e: any) {
              alert(`Yerel kapatma başarısız: ${e?.message || e}`);
            }
          } else {
            await loadOrders();
          }
          return;
        }

        alert(friendlyGetirError(action, raw));
        await loadOrders();
        return;
      }

      // Edge Function aksiyon cevabını zaten upsert ediyor; eski post-action
      // inquiry çağrısı kaldırıldı (gereksiz Getir API trafiği + 429 baskısı).
      await loadOrders();

      // Server-side auto-recovery bilgilendirmesi (alert yerine bilgi mesajı):
      // - cancelled: Getir'de iptal edilmiş, otomatik kapatıldı
      // - alreadyDone: hedef adım Getir'de zaten yapılmıştı, DB senkronlandı
      // - chained: önceki aksiyon (prepare/handover) otomatik yapıldı
      const meta = (res as any).meta as
        | {
            cancelled?: boolean;
            alreadyDone?: boolean;
            chained?: string;
            realCode?: number;
            realCodeBefore?: number;
            skippedGetirCourier?: boolean;
          }
        | undefined;
      if (meta?.skippedGetirCourier) {
        alert(
          'Bu sipariş Getir kuryesi tarafından taşınıyor.\n\n' +
            'Restoran «Kurye yola çıktı» / «Teslim edildi» basmaz; Getir teslim alınca ve teslim ettiğinde durum otomatik ilerler.',
        );
      } else if (meta?.cancelled) {
        alert(
          `Bu sipariş Getir tarafında iptal edilmiş — ŞefPOS'ta da otomatik olarak kapatıldı.`,
        );
      } else if (meta?.alreadyDone) {
        const codeLabel =
          typeof meta.realCode === 'number'
            ? `${meta.realCode} - ${getirStatusLabel(meta.realCode)}`
            : 'son durum';
        console.info(
          `[Getir] ${action} adımı Getir'de zaten tamamlanmıştı (durum: ${codeLabel}). DB senkronlandı.`,
        );
      } else if (meta?.chained) {
        console.info(
          `[Getir] ${action} öncesi eksik adım "${meta.chained}" otomatik tamamlandı, sonra ${action} başarılı.`,
        );
      }

      if (action === 'verify' || action === 'verify-scheduled') {
        console.info(
          `[Getir] Sipariş #${order.platform_order_number || order.platform_order_id} onaylandı (verify) → Getir paneline iletildi.`,
        );
      }
    } catch (err: any) {
      alert(`Getir aksiyonu sırasında hata: ${err?.message || err}`);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  };

  /**
   * Eski siparişleri toplu kapat. Getir paneliyle eşleşmeyen, "aktif" durumda
   * kalmış ve 30+ dakikadan eski siparişleri "delivered" yapar (Mutfakta sekmesi
   * temizlenir). Test ortamında biriken eski test siparişleri için.
   */
  const closeStaleOrders = async () => {
    if (!tenant) return;
    if (!confirm(
      '30 dakikadan eski "aktif" siparişleri kapatmak istediğinize emin misiniz?\n\n' +
      'Bunlar genelde Getir tarafında zaten teslim/iptal olmuş ama burada açık kalmış kayıtlardır. ' +
      'Aktif olarak çalışan gerçek bir sipariş varsa onu sonra Getir’den "Siparişleri Çek" ile geri çekebilirsiniz.'
    )) return;
    setSyncing(true);
    try {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: stale, error } = await supabase
        .from('online_orders')
        .select('id')
        .eq('tenant_id', tenant.id)
        .in('status', [
          'verified', 'accepted', 'preparing', 'ready', 'handed_over',
          'on_the_way', 'arrived', 'scheduled_accepted',
        ])
        .lt('updated_at', cutoff);
      if (error) throw error;
      const ids = (stale || []).map((r: any) => r.id);
      if (ids.length === 0) {
        alert('Temizlenecek eski sipariş bulunmadı.');
        return;
      }
      const { error: upErr } = await supabase
        .from('online_orders')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
        } as any)
        .in('id', ids);
      if (upErr) throw upErr;
      alert(`${ids.length} eski sipariş kapatıldı.`);
      await loadOrders();
    } catch (e: any) {
      alert(`Temizlik hatası: ${e?.message || e}`);
    } finally {
      setSyncing(false);
    }
  };

  const syncOrders = async () => {
    if (!user || !tenant) return;

    setSyncing(true);
    try {
      // Tenant'in aktif platformlarini al; Getir platformu varsa callGetir
      // ile dogrudan poll-active calistir. Diger platformlar (Yemeksepeti vb.)
      // icin eski sync-online-orders edge function'ina dus.
      const { data: platforms } = await supabase
        .from('online_order_platforms')
        .select('id, platform_code, is_active')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      let totalSaved = 0;
      let messages: string[] = [];

      const getirPlatforms = (platforms || []).filter(
        (p: OnlinePlatformListRow) => p.platform_code === 'getir',
      ) as OnlinePlatformListRow[];
      for (const gp of getirPlatforms) {
        const res = await callGetir({ platformId: gp.id, action: 'poll-active' });
        if (res.ok) {
          totalSaved += res.saved || 0;
          messages.push(`Getir: ${res.saved ?? 0}/${res.fetched ?? 0}`);
        } else {
          const dataObj = (res.data && typeof res.data === 'object') ? (res.data as Record<string, unknown>) : {};
          const detail =
            (dataObj.error as string | undefined) ||
            (dataObj.message as string | undefined) ||
            ((dataObj.data as any)?.message as string | undefined) ||
            res.error ||
            `HTTP ${res.status ?? '???'}`;
          messages.push(`Getir hata: ${detail}`);
        }
      }

      // Eski sync-online-orders (Yemeksepeti vb.) — sadece Getir DISI platform varsa
      const nonGetir = (platforms || []).filter(
        (p: OnlinePlatformListRow) => p.platform_code !== 'getir',
      );
      if (nonGetir.length > 0) {
        const baseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://xdfnozfuuzctubijbnds.supabase.co').replace(/\/$/, '');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          try {
            const response = await fetch(`${baseUrl}/functions/v1/sync-online-orders`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && typeof result?.newOrders === 'number') {
              totalSaved += result.newOrders;
              messages.push(`Diğer: ${result.newOrders}`);
            }
          } catch {
            // Yemeksepeti/sync-online-orders deploy edilmemis olabilir, sessizce yut
          }
        }
      }

      alert(messages.length ? messages.join(' · ') : 'Aktif platform bulunamadı.');
      await loadOrders();
    } catch (error: any) {
      console.error('Sync error:', error);
      alert('Senkronizasyon hatası: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const getPlatformColor = (platformCode: string) => {
    const colors: Record<string, string> = {
      yemeksepeti: '#D01012',
      getir: '#5D3EBC',
      getiryemek: '#5D3EBC',
      trendyol: '#F27A1A',
      trendyolyemek: '#F27A1A',
      migros: '#F8B500',
      migrosyemek: '#F8B500',
      fuudy: '#23B0B0',
    };
    return colors[platformCode.toLowerCase()] || '#475569';
  };

  const getStatusBadge = (status: string) => {
    // Slate-toned, kurumsal palet: app temasıyla uyumlu, dikkat çekici sadece "yeni"
    const badges: Record<string, { label: string; color: string }> = {
      new: { label: 'YENİ', color: 'bg-red-100 text-red-700 ring-1 ring-red-200 animate-pulse' },
      scheduled_new: { label: 'İLERİ TARİH', color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
      accepted: { label: 'ONAYLANDI', color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' },
      verified: { label: 'ONAYLANDI', color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' },
      scheduled_accepted: { label: 'İLERİ • ONAYLI', color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
      preparing: { label: 'HAZIRLANIYOR', color: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' },
      ready: { label: 'HAZIR', color: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
      handed_over: { label: 'KURYEDE', color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
      on_the_way: { label: 'YOLDA', color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
      arrived: { label: 'ULAŞTI', color: 'bg-teal-100 text-teal-700 ring-1 ring-teal-200' },
      delivered: { label: 'TESLİM EDİLDİ', color: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' },
      cancelled: { label: 'İPTAL', color: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200' },
      rejected: { label: 'REDDEDİLDİ', color: 'bg-slate-200 text-slate-700 ring-1 ring-slate-300' },
      getir_unmapped: { label: 'GETİR · EŞLEŞMEMİŞ', color: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300' },
    };

    const badge = badges[status] ?? {
      label: internalStatusLabelTr(status).toUpperCase().slice(0, 28),
      color: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    };
    return (
      <span
        className={`${badge.color} text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide inline-flex items-center`}
      >
        {badge.label}
      </span>
    );
  };

  const filteredOrders = useMemo(() => {
    const allowed = FILTER_GROUPS[filter];
    if (!allowed) return orders;
    return orders.filter((o) => allowed.includes(o.status));
  }, [orders, filter]);

  const activeAlertCount = orders.filter(
    (o) =>
      o.status === 'new' ||
      o.status === 'scheduled_new' ||
      o.status === 'verified' ||
      o.status === 'accepted',
  ).length;

  const [audioBlocked, setAudioBlocked] = useState(false);
  /**
   * Getir poll'u 4xx döndürüyorsa kullanıcının görmesi için kalıcı banner.
   * Tipik nedenler: credential eksik, POS pasif (200), restoran kapalı, restaurantId boş.
   */
  const [getirPollIssue, setGetirPollIssue] = useState<string | null>(null);
  /** Başarılı son senkron özeti — "0 sipariş bulundu" durumunu da kullanıcıya göstermek için. */
  const [getirPollInfo, setGetirPollInfo] = useState<{ fetched: number; saved: number; ts: string } | null>(null);
  const [getirPlatformMeta, setGetirPlatformMeta] = useState<{
    id: string;
    getir_restaurant_open: boolean | null;
    getir_pos_status: number | null;
  } | null>(null);
  const [getirStoreBusy, setGetirStoreBusy] = useState(false);
  // Sayfa acildiginda audio context'i unlock dene; engellendiyse banner goster.
  useEffect(() => {
    unlockAudio();
    const check = () => {
      const s = getAudioState();
      setAudioBlocked(s.state === 'suspended' || (!s.unlocked && s.state !== 'running'));
    };
    check();
    const id = window.setInterval(check, 2000);
    return () => window.clearInterval(id);
  }, []);

  const testSound = async () => {
    unlockAudio();
    await playOnlineOrderAlert('Test', 1);
    setAudioBlocked(false);
  };

  const setGetirRestaurantOpen = async (wantOpen: boolean) => {
    if (!getirPlatformMeta) return;
    if (!wantOpen && !confirm('Getir uygulamasında restoranı kapatmak istiyor musunuz?')) return;
    setGetirStoreBusy(true);
    try {
      const res = await syncGetirRestaurantOpen(getirPlatformMeta.id, wantOpen, { openPosToo: true });
      if (!res.ok) {
        const dataObj =
          res.data && typeof res.data === 'object' ? (res.data as Record<string, unknown>) : {};
        const detail =
          (dataObj.message as string | undefined) ||
          (dataObj.error as string | undefined) ||
          res.error ||
          'Getir API hatası';
        alert(`Getir mağaza durumu değiştirilemedi:\n\n${detail}`);
        return;
      }
      if (res.error) alert(res.error);
      if (wantOpen) {
        const verify = await syncGetirStoreStatusFromApi(getirPlatformMeta.id);
        const openNow = verify.restaurantOpen === true;
        const posNow = verify.posStatus ?? (openNow ? 100 : null);
        setGetirPlatformMeta((prev) =>
          prev
            ? {
                ...prev,
                getir_restaurant_open: openNow,
                getir_pos_status: posNow,
              }
            : null,
        );
        if (openNow) {
          setGetirPollIssue(null);
        } else {
          setGetirPollIssue(
            'Getir API aç komutu gönderildi ama Getir hâlâ kapalı görünüyor. Ayarlar → Online Platformlar → ortam TEST/CANLI ve credential eşleşmesini kontrol edin.',
          );
        }
      } else {
        setGetirPlatformMeta((prev) =>
          prev ? { ...prev, getir_restaurant_open: false } : null,
        );
        setGetirPollIssue('Getir uygulamasında restoran KAPALI.');
      }
    } finally {
      setGetirStoreBusy(false);
    }
  };

  /** Yalnızca Getir'de gerçekten KAPALI ise «Aç» göster; null/ bilinmiyor = uyarı yok. */
  const getirNeedsOpen =
    !!getirPlatformMeta && getirPlatformMeta.getir_restaurant_open === false;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* ─────────── HEADER (kurumsal, TakeawayOrders dili) ─────────── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl shrink-0">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-black text-slate-800 truncate">
                ONLİNE SİPARİŞLER
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {orders.length} sipariş · {activeAlertCount} yeni · Yemeksepeti, Getir, Trendyol, Migros
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {getirPlatformMeta && (
              getirNeedsOpen ? (
                <button
                  type="button"
                  onClick={() => setGetirRestaurantOpen(true)}
                  disabled={getirStoreBusy}
                  title="Getir Yemek uygulamasında restoranı aç (ayarlara gerek yok)"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs text-white bg-gradient-to-r from-purple-600 to-violet-700 shadow-md ring-2 ring-purple-300 hover:from-purple-700 hover:to-violet-800 transition active:scale-95 disabled:opacity-50 animate-pulse"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>{getirStoreBusy ? 'Açılıyor…' : 'Getir Restoranı Aç'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setGetirRestaurantOpen(false)}
                  disabled={getirStoreBusy}
                  title="Getir Yemek uygulamasında restoranı kapat"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs ring-1 transition active:scale-95 disabled:opacity-50 bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
                >
                  <Store className="w-4 h-4 shrink-0" />
                  <span>{getirStoreBusy ? '…' : 'Getir: Açık'}</span>
                </button>
              )
            )}
            {activeAlertCount > 0 && (
              <button
                onClick={silenceNow}
                title="Çalan zili sustur"
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-bold text-xs ring-1 ring-red-200 transition active:scale-95 animate-pulse"
              >
                <BellRing className="w-4 h-4" />
                <span className="hidden sm:inline">Sustur</span>
              </button>
            )}
            <button
              onClick={testSound}
              title="Bildirim sesini test et"
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs ring-1 ring-blue-200 transition active:scale-95"
            >
              <BellRing className="w-4 h-4" />
              <span className="hidden sm:inline">Sesi Test Et</span>
            </button>
            <button
              onClick={toggleSound}
              title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
              className={`p-2 rounded-xl transition active:scale-95 ${
                soundEnabled
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            {filter === 'active' && (
              <button
                onClick={closeStaleOrders}
                disabled={syncing}
                title="30 dakikadan eski, açık kalmış siparişleri kapat (Getir'le eşleşmeyen test/stale kayıtlar)"
                className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs ring-1 ring-slate-200 transition active:scale-95 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>Eski Siparişleri Kapat</span>
              </button>
            )}
            <button
              onClick={syncOrders}
              disabled={syncing}
              title="Siparişleri Çek"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={syncOrders}
              disabled={syncing}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold text-sm shadow hover:shadow-md transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'Senkronize ediliyor…' : 'Siparişleri Çek'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────── GETIR RESTORAN KAPALI — tek tık aç ─────────── */}
      {getirNeedsOpen && (
        <div className="bg-gradient-to-r from-purple-700 to-violet-800 border-b border-purple-900 shrink-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 text-white min-w-0">
              <p className="font-black text-sm md:text-base">Getir Yemek’te restoran kapalı görünüyor</p>
              <p className="text-xs md:text-sm text-purple-100 mt-0.5">
                Müşteriler sipariş veremez. Ayarlara gitmeden buradan açın; POS entegrasyonu da açılır.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGetirRestaurantOpen(true)}
              disabled={getirStoreBusy}
              className="shrink-0 px-5 py-3 bg-white text-purple-900 rounded-xl font-black text-sm shadow-lg hover:bg-purple-50 transition active:scale-95 disabled:opacity-60"
            >
              {getirStoreBusy ? 'Getir’e bağlanılıyor…' : 'Getir Restoranı Aç'}
            </button>
          </div>
        </div>
      )}

      {/* ─────────── AUDIO KILITLI UYARI ─────────── */}
      {audioBlocked && soundEnabled && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5 shrink-0">
          <div className="flex items-center gap-3 text-amber-900">
            <BellRing className="w-5 h-5 shrink-0 animate-pulse" />
            <div className="flex-1 text-xs md:text-sm font-bold">
              Tarayıcı bildirim seslerini engelliyor. Yeni sipariş zilini etkinleştirmek için aşağıdaki butona basın:
            </div>
            <button
              onClick={testSound}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shrink-0 transition active:scale-95"
            >
              ZİLİ ETKİNLEŞTİR
            </button>
          </div>
        </div>
      )}

      {/* ─────────── GETIR POLL DURUM ROZETI (başarılı + bilgi) ─────────── */}
      {!getirPollIssue && getirPollInfo && (
        <div className="bg-slate-100 border-b border-slate-200 shrink-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-1.5 text-[11px] text-slate-600 flex items-center gap-3">
            <span className="font-bold text-slate-700">Getir son senkron:</span>
            <span>
              {getirPollInfo.ts} — {getirPollInfo.fetched} sipariş bulundu, {getirPollInfo.saved} kayıt güncellendi
            </span>
            {getirPollInfo.fetched === 0 && (
              <span className="text-amber-700 font-semibold">
                · Test siparişi düşmediyse: Getir paneline webhook URL'sini eklediğinizden emin olun.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ─────────── GETIR POLL HATA BANNER ─────────── */}
      {getirPollIssue && (
        <div className="bg-rose-50 border-b-2 border-rose-200 shrink-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-2 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-700 mt-0.5" />
            <div className="flex-1 text-xs md:text-sm text-rose-800">
              <div className="font-bold">GetirYemek bağlantı hatası — siparişler düşmüyor</div>
              <div className="mt-0.5 font-mono break-words">{getirPollIssue}</div>
              <div className="mt-1 text-rose-700/80">
                {(/secret|credential|tanimli/i.test(getirPollIssue))
                  ? 'Çözüm: Ayarlar → Online Sipariş Ayarları → Getir → appSecretKey / restaurantSecretKey / restaurantId değerlerini girip Bağlantı Testi yapın.'
                  : /pos|pasif|inactive/i.test(getirPollIssue)
                    ? 'Çözüm: Ayarlar → Online Sipariş Ayarları → Getir → POS durumunu AÇIK (100) yapın.'
                    : /restaurant.*clos|kapal/i.test(getirPollIssue)
                      ? 'Çözüm: Yukarıdaki mor şeritte veya sağ üstte «Getir Restoranı Aç» butonuna basın.'
                      : 'Detaylı sebep için F12 → Console; `[getir-api]` satırına bakın.'}
              </div>
            </div>
            <button
              onClick={() => setGetirPollIssue(null)}
              className="text-rose-700 hover:text-rose-900 font-bold text-xs"
              title="Banner'ı geçici olarak kapat"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ─────────── FİLTRE BAR ─────────── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {[
            { id: 'new', label: 'Yeni', sub: 'Onay / hazırlık öncesi', icon: ShoppingBag },
            { id: 'active', label: 'Mutfakta', sub: 'Hazırlanıyor veya hazır', icon: Package },
            { id: 'on_the_way', label: 'Yolda', sub: 'Kuryede', icon: Bike },
            { id: 'done', label: 'Tamamlanan', sub: 'Teslim / iptal', icon: Check },
            { id: 'all', label: 'Tümü', sub: 'Hepsi', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`flex flex-col items-start gap-0 px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition text-xs min-w-[4.5rem] ${
                  active
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  {tab.label}
                </span>
                <span
                  className={`pl-5 text-[9px] font-semibold leading-tight ${
                    active ? 'text-orange-100' : 'text-slate-400'
                  }`}
                >
                  {tab.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────── İÇERİK ─────────── */}
      <div className="flex-1 overflow-auto px-4 md:px-6 py-4">
        {loading && orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
            <p className="text-slate-500 mt-4 text-sm">Siparişler yükleniyor…</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <ShoppingBag className="w-16 h-16 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-500 mb-1">Sipariş Yok</h3>
            <p className="text-slate-400 text-sm">
              {filter === 'new' ? 'Yeni sipariş bekleniyor…' : 'Bu kategoride sipariş bulunmuyor.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden w-full">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: 104 }} />{/* Platform */}
                  <col style={{ width: '14%' }} />{/* Müşteri */}
                  <col style={{ width: 'auto' }} />{/* Adres */}
                  <col style={{ width: 104 }} />{/* Sipariş No */}
                  <col style={{ width: 70 }} />{/* Ürün */}
                  <col style={{ width: 96 }} />{/* Tutar */}
                  <col style={{ width: 100 }} />{/* Ödeme */}
                  <col style={{ width: 96 }} />{/* Tarih */}
                  <col style={{ width: 128 }} />{/* Durum */}
                  <col style={{ width: 96 }} />{/* İşlemler */}
                </colgroup>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Platform</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Müşteri</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Adres</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sipariş No</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ürün</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tutar</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ödeme</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tarih</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Durum</th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const isExpanded = expandedOrder === order.id;
                    const platformCode = order.online_order_platforms.platform_code;
                    const platformColor = getPlatformColor(platformCode);
                    const orderDate = new Date(order.created_at);
                    const getirPhase =
                      order.online_order_platforms.platform_code === 'getir'
                        ? getGetirUiPhase(order)
                        : null;

                    return (
                      <Fragment key={order.id}>
                        {/* ─── ANA SATIR ─── */}
                        <tr
                          onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                          className={`${isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/60'} transition cursor-pointer relative`}
                        >
                          {/* PLATFORM — kurumsal logo + ince renk şeridi */}
                          <td className="px-3 py-2.5 whitespace-nowrap relative">
                            <span
                              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r"
                              style={{ background: platformColor }}
                              aria-hidden
                            />
                            <PlatformLogo code={platformCode} name={order.online_order_platforms.platform_name || platformCode} />
                          </td>

                          {/* MÜŞTERI */}
                          <td className="px-3 py-2.5 font-semibold text-slate-800 truncate text-sm" title={order.customer_name}>
                            {order.customer_name}
                          </td>

                          {/* ADRES */}
                          <td className="px-3 py-2.5">
                            <span
                              className="text-xs text-slate-600 line-clamp-1 block"
                              title={order.customer_address || ''}
                            >
                              {order.customer_address || '—'}
                            </span>
                          </td>

                          {/* SIPARIS NO */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-700 text-xs">
                              #{order.platform_order_number || order.platform_order_id.slice(0, 6)}
                            </div>
                            {platformCode === 'getir' && order.getir_verification_code && (
                              <div className="text-[10px] font-bold text-purple-700 font-mono">
                                {order.getir_verification_code.toUpperCase()}
                              </div>
                            )}
                          </td>

                          {/* ÜRÜN */}
                          <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 text-xs">
                            {order.items.length} ürün
                          </td>

                          {/* TUTAR */}
                          <td className="px-3 py-2.5 whitespace-nowrap text-right">
                            <span className="font-bold text-sm text-slate-800">
                              {order.total_amount.toFixed(0)} ₺
                            </span>
                          </td>

                          {/* ÖDEME */}
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                            <div className="font-medium text-slate-700">Online</div>
                            <div className="text-[10px] text-slate-400">
                              {order.payment_status === 'paid' ? 'Ödendi' : 'Bekliyor'}
                            </div>
                          </td>

                          {/* TARİH */}
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-600">
                            <div>{orderDate.toLocaleDateString('tr-TR')}</div>
                            <div className="text-[10px] text-slate-400">
                              {orderDate.toLocaleTimeString('tr-TR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>

                          {/* DURUM */}
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {getStatusBadge(order.status)}
                          </td>

                          {/* İŞLEMLER */}
                          <td className="px-3 py-2.5 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedOrder(isExpanded ? null : order.id);
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition ${
                                isExpanded
                                  ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5" /> Kapat
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" /> Detay
                                </>
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* ─── DETAY SATIRI ─── */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-slate-50 px-4 py-4 border-t border-slate-200">
                              <div className="space-y-3">
                      {/* Status badge (mobilde header'da yok) + telefon + adres */}
                      <div className="flex flex-wrap items-start gap-3 text-sm">
                        <div className="md:hidden">{getStatusBadge(order.status)}</div>
                        {order.customer_phone && (
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Phone className="w-4 h-4 text-slate-500" />
                            <span className="font-medium">{order.customer_phone}</span>
                          </div>
                        )}
                        {order.customer_address && (
                          <div className="flex items-start gap-1.5 text-slate-700 flex-1 min-w-[200px]">
                            <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{order.customer_address}</span>
                          </div>
                        )}
                      </div>

                      {/* Sipariş notu */}
                      {order.customer_notes && (
                        <div className="bg-amber-50 border-l-4 border-amber-400 rounded p-2.5 text-sm font-semibold text-amber-900">
                          📝 {order.customer_notes}
                        </div>
                      )}

                      {/* Ürün listesi */}
                      <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                        <p className="text-[10px] uppercase font-bold text-slate-400 mb-1.5">Ürünler</p>
                        <div className="space-y-1">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start gap-2 text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800">
                                  <span className="text-slate-500 mr-1">{item.quantity}x</span>
                                  {safeName(item.platform_product_name)}
                                </p>
                                {item.notes && (
                                  <p className="text-xs text-slate-500 italic mt-0.5">{safeName(item.notes, '')}</p>
                                )}
                              </div>
                              <span className="font-bold text-slate-700 shrink-0">{item.total_amount.toFixed(0)} ₺</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Getir özel rozetler */}
                      {platformCode === 'getir' && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {order.getir_verification_code && (
                            <span className="bg-purple-100 text-purple-800 font-black px-2 py-0.5 rounded flex items-center gap-1 md:hidden">
                              <Hash className="w-3 h-3" />
                              {order.getir_verification_code.toUpperCase()}
                            </span>
                          )}
                          {typeof order.getir_status_code === 'number' ? (
                            <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                              {getirStatusLabel(order.getir_status_code)}
                            </span>
                          ) : (
                            (order.getir_platform_order_status ||
                              order.status === 'rejected' ||
                              order.status === 'getir_unmapped') && (
                              <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                                {order.getir_platform_order_status
                                  ? `${order.getir_platform_order_status}: ${internalStatusLabelTr(order.status)}`
                                  : internalStatusLabelTr(order.status)}
                              </span>
                            )
                          )}
                          {order.getir_courier_name && (
                            <span className="bg-indigo-100 text-indigo-900 font-semibold px-2 py-0.5 rounded max-w-full truncate" title={order.getir_courier_phone || ''}>
                              Kurye: {order.getir_courier_name}
                              {order.getir_courier_phone ? ` · ${order.getir_courier_phone}` : ''}
                              {order.getir_courier_pickup_at
                                ? ` · ${new Date(order.getir_courier_pickup_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
                                : ''}
                            </span>
                          )}
                          {order.getir_delivery_type === 1 && (
                            <span className="bg-purple-600 text-white font-bold px-2 py-0.5 rounded">Getir Kurye</span>
                          )}
                          {order.getir_delivery_type === 2 && (
                            <span className="bg-amber-600 text-white font-bold px-2 py-0.5 rounded">Restoran Kurye</span>
                          )}
                          {order.getir_is_scheduled && (
                            <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">İleri Tarih</span>
                          )}
                          {Number(order.getir_total_discount || 0) > 0 && (
                            <span className="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              Ortak Kampanya
                            </span>
                          )}
                        </div>
                      )}

                      {/* GETIR akış: iptal sadece «onay» aşamasında (verify fazı) */}
                      {order.online_order_platforms.platform_code === 'getir' &&
                        getirPhase === 'verify' &&
                        rejectingOrderId === order.id && (
                          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 space-y-3">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                              <AlertTriangle className="w-4 h-4" />
                              Getir İptal Sebebi
                            </div>
                            <select
                              value={getirCancelReasonId}
                              onChange={(e) => setGetirCancelReasonId(e.target.value)}
                              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                              <option value="">— Sebep seçin —</option>
                              {eligibleCancelReasons(
                                order.getir_status_code ?? 325,
                                order.getir_delivery_type ?? 2,
                              ).map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.text}
                                </option>
                              ))}
                            </select>
                            <textarea
                              placeholder="Not (opsiyonel)"
                              value={getirCancelNote}
                              onChange={(e) => setGetirCancelNote(e.target.value)}
                              rows={2}
                              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setRejectingOrderId(null);
                                  setGetirCancelReasonId('');
                                  setGetirCancelNote('');
                                }}
                                className="flex-1 border-2 border-slate-300 text-slate-700 font-bold py-2.5 rounded-xl transition-all hover:bg-slate-50 text-sm"
                              >
                                Vazgeç
                              </button>
                              <button
                                onClick={async () => {
                                  if (!getirCancelReasonId) {
                                    alert('Lütfen iptal sebebi seçin.');
                                    return;
                                  }
                                  const reasonId = getirCancelReasonId;
                                  const note = getirCancelNote;
                                  setRejectingOrderId(null);
                                  setGetirCancelReasonId('');
                                  setGetirCancelNote('');
                                  await doGetirAction(order, 'cancel', { cancelReasonId: reasonId, cancelNote: note });
                                }}
                                disabled={busyOrderId === order.id}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm flex items-center justify-center gap-1.5"
                              >
                                <X className="w-4 h-4" />
                                REDDET
                              </button>
                            </div>
                          </div>
                        )}

                      {/* Reprint + (Getir için) durumu eşle satırı */}
                      <div className="flex justify-end items-center gap-3 -mt-1">
                        <button
                          onClick={() => reprintOnlineOrder(order)}
                          disabled={busyOrderId === order.id}
                          title="Fişi tekrar yazıcıya gönder (mutfak / paket fişi)"
                          className="text-[11px] font-bold text-slate-700 hover:text-slate-900 hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          <Printer className={`w-3 h-3 ${busyOrderId === order.id ? 'animate-pulse' : ''}`} />
                          Fişi Tekrar Bas
                        </button>

                        {order.online_order_platforms.platform_code === 'getir' &&
                          order.status !== 'delivered' &&
                          order.status !== 'cancelled' &&
                          getirPhase &&
                          getirPhase !== 'done' && (
                            <button
                              onClick={() => refreshGetirOrder(order)}
                              disabled={busyOrderId === order.id}
                              title="Getir API ile güncel durumu çek ve tabloyu güncelle"
                              className="text-[11px] font-bold text-purple-700 hover:text-purple-900 hover:underline disabled:opacity-50 flex items-center gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id ? 'Sorguluyor…' : 'Getir ile durumu eşle'}
                            </button>
                          )}
                      </div>

                      {order.online_order_platforms.platform_code === 'getir' && getirPhase && (
                        <>
                          {getirPhase === 'verify' && rejectingOrderId !== order.id && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setGetirCancelReasonId('');
                                  setGetirCancelNote('');
                                  setRejectingOrderId(order.id);
                                }}
                                disabled={busyOrderId === order.id}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <X className="w-5 h-5" />
                                REDDET
                              </button>
                              <button
                                onClick={() =>
                                  doGetirAction(
                                    order,
                                    order.getir_is_scheduled || order.status === 'scheduled_new'
                                      ? 'verify-scheduled'
                                      : 'verify',
                                  )
                                }
                                disabled={busyOrderId === order.id}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <Check className="w-5 h-5" />
                                {busyOrderId === order.id ? 'İşleniyor…' : 'ONAYLA'}
                              </button>
                            </div>
                          )}

                          {getirPhase === 'scheduled_accepted_wait' && (
                            <div className="w-full bg-amber-100 text-amber-800 font-bold py-3 rounded-xl text-center text-sm">
                              İleri tarihli — Getir teslimat saatinden 1 saat önce hazırlanma akışını başlatacak.
                            </div>
                          )}

                          {getirPhase === 'prepare' && (
                            <button
                              onClick={() => markGetirOrderPreparingLocal(order)}
                              disabled={busyOrderId === order.id}
                              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              title="Mutfak takibi için lokal işaret. Getir API'sine prepare aksiyonu gönderilmez (Getir verify sonrası order'u zaten 'Hazırlanıyor' duruma alır)."
                            >
                              <Package className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id ? 'İşleniyor…' : 'HAZIRLANMAYA BAŞLA'}
                            </button>
                          )}

                          {getirPhase === 'ready_local' && (
                            <button
                              onClick={() => markGetirOrderReadyLocal(order)}
                              disabled={busyOrderId === order.id}
                              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              title="Getir'e «yemek hazır» bildirimi (POST …/prepare). Başarılı olunca Getir durumu Hazır (500) olur; ardından kurye teslimi (handover) yapılabilir."
                            >
                              <Check className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id ? 'İşleniyor…' : 'YEMEK HAZIR'}
                            </button>
                          )}

                          {getirPhase === 'handover' && (
                            <button
                              onClick={() => doGetirAction(order, 'handover')}
                              disabled={busyOrderId === order.id}
                              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              <Bike className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id
                                ? 'Getir bekliyor… (auto-retry)'
                                : order.getir_delivery_type === 1
                                  ? 'GETIR KURYESİNE TESLİM ETTİM'
                                  : 'KURYE YOLA ÇIKTI'}
                            </button>
                          )}

                          {getirPhase === 'getir_courier_enroute' && (
                            <div className="w-full bg-purple-100 text-purple-800 font-bold py-3 rounded-xl text-center text-sm flex flex-col items-center gap-1">
                              <div className="flex items-center gap-2">
                                <Bike className="w-4 h-4" />
                                Getir kuryesi yönetiyor
                              </div>
                              <div className="text-[11px] font-normal text-purple-700">
                                Bu sipariş Getir kuryesinde — restoranın «Kurye yola çıktı» / «Teslim edildi» basmasına gerek yok. Durum Getir tarafından otomatik ilerler.
                              </div>
                            </div>
                          )}

                          {getirPhase === 'deliver' && (
                            <button
                              onClick={() => doGetirAction(order, 'deliver')}
                              disabled={busyOrderId === order.id}
                              className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              <Check className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id ? 'İşleniyor…' : 'TESLİM EDİLDİ'}
                            </button>
                          )}

                          {getirPhase === 'arrived_info' && (
                            <div className="w-full bg-teal-100 text-teal-800 font-bold py-3 rounded-xl text-center text-sm">
                              Müşteriye ulaştı (teslim onayı bekleniyor)
                            </div>
                          )}

                          {order.status === 'delivered' && (
                            <div className="w-full bg-green-100 text-green-800 font-bold py-3 rounded-xl text-center text-sm">
                              ✓ Sipariş teslim edildi
                            </div>
                          )}
                          {order.status === 'cancelled' && (
                            <div className="w-full bg-gray-100 text-gray-700 font-bold py-3 rounded-xl text-center text-sm">
                              İptal edildi
                            </div>
                          )}
                        </>
                      )}

                      {/* Diğer platformlar (Yemeksepeti vb.) — eski akış değişmedi */}
                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'new' &&
                        rejectingOrderId === order.id && (
                          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 space-y-3">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
                              <AlertTriangle className="w-4 h-4" />
                              Reddetme Sebebi
                            </div>
                            <select
                              value={selectedRejectReason}
                              onChange={(e) => setSelectedRejectReason(e.target.value)}
                              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
                            >
                              {REJECT_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setRejectingOrderId(null)}
                                className="flex-1 border-2 border-slate-300 text-slate-700 font-bold py-2.5 rounded-xl transition-all hover:bg-slate-50 text-sm"
                              >
                                Vazgec
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingOrderId(null);
                                  updateOrderStatus(order.id, 'cancelled', 'reject', selectedRejectReason);
                                }}
                                disabled={loading}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm flex items-center justify-center gap-1.5"
                              >
                                <X className="w-4 h-4" />
                                REDDET
                              </button>
                            </div>
                          </div>
                        )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'new' && rejectingOrderId !== order.id && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedRejectReason('TOO_BUSY');
                              setRejectingOrderId(order.id);
                            }}
                            disabled={loading || busyOrderId === order.id}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <X className="w-5 h-5" />
                            REDDET
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'accepted', 'accept')}
                            disabled={loading || busyOrderId === order.id}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Check className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                            {busyOrderId === order.id ? 'İşleniyor…' : 'ONAYLA'}
                          </button>
                        </div>
                      )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'accepted' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          disabled={loading || busyOrderId === order.id}
                          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Package className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                          {busyOrderId === order.id ? 'İşleniyor…' : 'HAZIRLANMAYA BAŞLA'}
                        </button>
                      )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'ready', 'prepared')}
                          disabled={loading || busyOrderId === order.id}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Bike className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                          {busyOrderId === order.id ? 'Platforma bildiriliyor…' : 'HAZIR — KURYEYE HAZIR'}
                        </button>
                      )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'ready' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'delivered', 'picked_up')}
                          disabled={loading || busyOrderId === order.id}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Check className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                          {busyOrderId === order.id ? 'Platforma bildiriliyor…' : 'KURYE ALDI / TESLİM EDİLDİ'}
                        </button>
                      )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
