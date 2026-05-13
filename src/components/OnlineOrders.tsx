import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { ShoppingBag, Clock, Phone, MapPin, Check, X, ChevronDown, ChevronUp, Bike, Package, RefreshCw, Volume2, VolumeX, AlertTriangle, Hash, Tag, BellRing } from 'lucide-react';
import {
  startContinuousAlert,
  stopContinuousAlert,
  stopAllAlerts,
  getActiveAlertOrderIds,
} from '../lib/notification';
import { callGetir, eligibleCancelReasons, getirStatusLabel } from '../lib/getirApi';

type OnlineOrder = Database['public']['Tables']['online_orders']['Row'];
type OnlineOrderItem = Database['public']['Tables']['online_order_items']['Row'];
type OnlineOrderPlatform = Database['public']['Tables']['online_order_platforms']['Row'];

interface OrderWithDetails extends OnlineOrder {
  online_order_platforms: OnlineOrderPlatform;
  items: OnlineOrderItem[];
}

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
  const [filter, setFilter] = useState<'all' | 'new' | 'active' | 'on_the_way' | 'done'>('new');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_sound_enabled');
    return saved === null ? true : saved === 'true';
  });
  const previousOrderCount = useRef<number>(0);
  // Daha onceden goruldumu listesi — yeni gelenleri platforma gore uyarmak icin
  const seenOrderIds = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef<boolean>(false);

  const filterRef = useRef(filter);
  filterRef.current = filter;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

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

      // Filter gruplamasi:
      //   new     → 'new' veya 'scheduled_new' (henuz onaylanmadi)
      //   active  → 'verified' / 'preparing' / 'ready' / 'scheduled_accepted'
      //   on_the_way → 'handed_over' / 'on_the_way' / 'arrived'
      //   done    → 'delivered' / 'cancelled'
      //   all     → tumu
      const filterGroups: Record<string, string[]> = {
        new: ['new', 'scheduled_new'],
        active: ['verified', 'preparing', 'ready', 'scheduled_accepted', 'accepted'],
        on_the_way: ['handed_over', 'on_the_way', 'arrived'],
        done: ['delivered', 'cancelled'],
      };
      const allowedStatuses = filterGroups[filterRef.current];
      if (allowedStatuses) {
        query = query.in('status', allowedStatuses);
      }

      const { data, error } = await query;
      if (error) throw error;

      const newOrders = (data as any[]) || [];

      // ────────────────────────────────────────────────────────────────
      // SURESLI ALARM MANTIGI
      // 1) İlk yüklemede: "new"/"scheduled_new" durumundaki sipariş varsa
      //    onlar zaten onaylanmamış demektir → her biri için alarm baslat.
      // 2) Sonraki yüklemelerde: yeni gelen ve "new" status'unda olanlar
      //    için alarm başlat; artık "new" olmayanlar için alarm durdur.
      // ────────────────────────────────────────────────────────────────
      const newishStatuses = new Set(['new', 'scheduled_new']);
      const currentNewOrderIds = new Set(
        newOrders.filter((o) => newishStatuses.has(o.status)).map((o) => o.id),
      );

      if (!firstLoadDone.current) {
        for (const o of newOrders) seenOrderIds.current.add(o.id);
        firstLoadDone.current = true;
        // İlk açılışta zaten new sipariş varsa onlar için alarm başlat
        if (soundEnabledRef.current) {
          for (const o of newOrders) {
            if (newishStatuses.has(o.status)) {
              const label = o.online_order_platforms?.platform_name || 'Online';
              startContinuousAlert(o.id, label);
            }
          }
        }
      } else if (soundEnabledRef.current) {
        // Yeni eklenen siparişler için alarm başlat
        for (const o of newOrders) {
          if (!seenOrderIds.current.has(o.id)) {
            seenOrderIds.current.add(o.id);
            if (newishStatuses.has(o.status)) {
              const label = o.online_order_platforms?.platform_name || 'Online';
              startContinuousAlert(o.id, label);
            }
          }
        }
      }

      // Artık "new" durumunda olmayan veya listeden kaybolan siparişlerin
      // alarmlarını durdur — onaylanmış demektir, ses kesilmeli.
      for (const id of getActiveAlertOrderIds()) {
        if (!currentNewOrderIds.has(id)) stopContinuousAlert(id);
      }

      previousOrderCount.current = newOrders.length;
      setOrders(newOrders);
    } catch (error: any) {
      console.error('Error loading online orders:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [tenant]);

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

  // Otomatik polling: webhook tanimi yapilmamis olsa bile, ekran acikken
  // her 25 sn'de aktif Getir platformlarini sorgular. Yeni siparis varsa
  // backend online_orders'a insert eder; realtime channel onu yakalar ve
  // sayfa kendiliginden yenilenir (sesli uyari + otomatik mutfak fisi).
  useEffect(() => {
    if (!tenant) return;
    let stopped = false;

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const { data: platforms } = await supabase
          .from('online_order_platforms')
          .select('id, platform_code, is_active')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .eq('platform_code', 'getir');
        for (const p of platforms || []) {
          if (stopped) break;
          await callGetir({ platformId: p.id, action: 'poll-active' });
        }
      } catch (e) {
        console.warn('[OnlineOrders] auto-poll uyari:', e);
      }
    };

    // Ilk tick'i 5 sn sonra at (sayfa acilir acilmaz aniden cagri olmasin),
    // sonra her 25 sn'de bir tekrarla.
    const firstId = window.setTimeout(tick, 5000);
    const intervalId = window.setInterval(tick, 25000);
    return () => {
      stopped = true;
      window.clearTimeout(firstId);
      window.clearInterval(intervalId);
    };
  }, [tenant]);

  useEffect(() => {
    loadOrders();
  }, [filter]);

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

  const updateOrderStatus = async (
    orderId: string,
    status: string,
    dhAction?: 'accept' | 'reject' | 'prepared' | 'picked_up',
    rejectReason?: string
  ) => {
    if (!tenant) return;

    const now = new Date().toISOString();
    const updateData: any = { status };
    if (status === 'accepted') updateData.accepted_at = now;
    else if (status === 'ready') updateData.ready_at = now;
    else if (status === 'cancelled') updateData.cancelled_at = now;
    else if (status === 'delivered') updateData.delivered_at = now;

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));

    if (dhAction) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yemeksepeti-callback`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ orderId, action: dhAction, rejectReason }),
            }
          );
        }
      } catch (err) {
        console.error('DH callback error:', err);
      }
    } else {
      const { error } = await supabase.from('online_orders').update(updateData).eq('id', orderId);
      if (error) {
        console.error('Error updating order:', error);
        alert('Sipariş güncellenirken hata: ' + error.message);
        loadOrders();
      }
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
    return `Getir hata mesajı (${action}): ${raw}`;
  };

  /**
   * Getir'e bir aksiyon (verify/prepare/handover/deliver/cancel) gonderir.
   *
   * Akilli senkron stratejisi:
   *   1) Action'dan ONCE inquiry yapilir — Getir'deki gercek status DB'ye yansir.
   *      Boylece "invalid status" hatasinin buyuk cogunlugu basta engellenir.
   *   2) Inquiry sonucu DB'de status guncellendiyse, action gerekli mi diye
   *      kontrol edilir. Aksiyon zaten yapilmissa atlanir (no-op).
   *   3) Action yine de fail ederse: time-limit ise otomatik retry, invalid
   *      status ise sessizce inquiry + UI yenileme + kullaniciya bilgi.
   */
  const doGetirAction = async (
    order: OrderWithDetails,
    action: 'verify' | 'verify-scheduled' | 'prepare' | 'handover' | 'deliver' | 'cancel',
    extra?: { cancelReasonId?: string; cancelNote?: string },
    retryCount: number = 0,
  ): Promise<void> => {
    setBusyOrderId(order.id);
    try {
      // ── 1) ON-FLIGHT INQUIRY ── Getir'deki gercek statusu DB'ye yansit
      // (sadece ilk denemede; retry'larda yapma — sonsuz dongu olmasin)
      if (retryCount === 0 && action !== 'cancel') {
        try {
          await callGetir({
            platformId: order.platform_id,
            action: 'inquiry',
            orderId: order.platform_order_id,
          });
        } catch (e) {
          console.warn('[Getir] pre-action inquiry hatasi (devam ediliyor):', e);
        }
      }

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
        const isTimeLimit = lower.includes('time limit') || lower.includes('prepared time');
        const isInvalidStatus =
          lower.includes('status is invalid') || lower.includes('invalid status');

        // Time-limit hatalari icin otomatik retry (max 3, 12 sn ara ile)
        if (isTimeLimit && retryCount < 3) {
          const delaySec = 12;
          console.log(`[Getir] ${action} time-limit → ${delaySec} sn sonra otomatik tekrar (${retryCount + 1}/3)`);
          await new Promise((r) => setTimeout(r, delaySec * 1000));
          await doGetirAction(order, action, extra, retryCount + 1);
          return;
        }

        // "Invalid status" hatasi → DB resync (already ran above but maybe stale)
        // Sessizce UI'yi yenile, kullaniciya gore guncel butonu sunsun.
        if (isInvalidStatus && retryCount === 0) {
          console.log(`[Getir] ${action} invalid status → ek inquiry + UI refresh`);
          try {
            await callGetir({
              platformId: order.platform_id,
              action: 'inquiry',
              orderId: order.platform_order_id,
            });
          } catch (e) {
            console.warn('[Getir] inquiry hatasi:', e);
          }
          await loadOrders();
          alert(
            'Sipariş Getir ile senkronize edildi. Güncel butona göre lütfen tekrar deneyin.',
          );
          return;
        }

        alert(friendlyGetirError(action, raw));
        await loadOrders();
        return;
      }
      await loadOrders();
    } catch (err: any) {
      alert(`Getir aksiyonu sırasında hata: ${err?.message || err}`);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
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

      const getirPlatforms = (platforms || []).filter((p: any) => p.platform_code === 'getir');
      for (const gp of getirPlatforms) {
        const res = await callGetir({ platformId: gp.id, action: 'poll-active' });
        if (res.ok) {
          totalSaved += res.saved || 0;
          messages.push(`Getir: ${res.saved ?? 0}/${res.fetched ?? 0}`);
        } else {
          messages.push(`Getir hata: ${res.error || 'bilinmeyen'}`);
        }
      }

      // Eski sync-online-orders (Yemeksepeti vb.) — sadece Getir DISI platform varsa
      const nonGetir = (platforms || []).filter((p: any) => p.platform_code !== 'getir');
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

  /**
   * Platform logosu — gerçek SVG asset'i yok, her platform için kurumsal
   * renkli badge component'i. Resmi renk paletleriyle uyumlu.
   */
  const PlatformLogo = ({ code, name }: { code: string; name: string }) => {
    const c = (code || '').toLowerCase();
    const display = (name || code || '').toLowerCase();

    if (c.includes('getir')) {
      return (
        <div className="inline-flex flex-col items-center justify-center bg-purple-700 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm" style={{ minWidth: 78 }}>
          <span className="text-[11px] font-black tracking-wide">getir</span>
          <span className="text-[8px] font-bold opacity-90 -mt-0.5">YEMEK</span>
        </div>
      );
    }
    if (c.includes('yemeksepeti')) {
      return (
        <div className="inline-flex items-center justify-center bg-red-600 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm italic" style={{ minWidth: 78 }}>
          <span className="text-[10px] font-black">yemek</span>
          <span className="text-[11px] font-extrabold ml-0.5">sepeti</span>
        </div>
      );
    }
    if (c.includes('trendyol')) {
      return (
        <div className="inline-flex flex-col items-center justify-center bg-orange-500 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm" style={{ minWidth: 78 }}>
          <span className="text-[11px] font-black tracking-tight">trendyol</span>
          <span className="text-[8px] font-bold opacity-90 -mt-0.5">YEMEK</span>
        </div>
      );
    }
    if (c.includes('migros')) {
      return (
        <div className="inline-flex flex-col items-center justify-center bg-amber-400 text-orange-900 px-2.5 py-1.5 rounded-md leading-none shadow-sm" style={{ minWidth: 78 }}>
          <span className="text-[11px] font-black tracking-tight">migros</span>
          <span className="text-[8px] font-bold opacity-90 -mt-0.5">YEMEK</span>
        </div>
      );
    }
    if (c.includes('fody')) {
      return (
        <div className="inline-flex items-center justify-center bg-teal-500 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm italic" style={{ minWidth: 78 }}>
          <span className="text-[12px] font-black tracking-wide">Fody</span>
        </div>
      );
    }
    if (c.includes('fuudy')) {
      return (
        <div className="inline-flex items-center justify-center bg-cyan-600 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm" style={{ minWidth: 78 }}>
          <span className="text-[12px] font-black tracking-wide">Fuudy</span>
        </div>
      );
    }
    // Default — bilinmeyen platform
    return (
      <div className="inline-flex items-center justify-center bg-slate-700 text-white px-2.5 py-1.5 rounded-md leading-none shadow-sm" style={{ minWidth: 78 }}>
        <span className="text-[11px] font-black tracking-wide">{display.slice(0, 10).toUpperCase()}</span>
      </div>
    );
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
    };

    const badge = badges[status] || badges.new;
    return (
      <span
        className={`${badge.color} text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide inline-flex items-center`}
      >
        {badge.label}
      </span>
    );
  };

  const filteredOrders = orders;

  const activeAlertCount = orders.filter(
    (o) => o.status === 'new' || o.status === 'scheduled_new',
  ).length;

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

      {/* ─────────── FİLTRE BAR ─────────── */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {[
            { id: 'new', label: 'Yeni', icon: ShoppingBag },
            { id: 'active', label: 'Mutfakta', icon: Package },
            { id: 'on_the_way', label: 'Yolda', icon: Bike },
            { id: 'done', label: 'Tamamlanan', icon: Check },
            { id: 'all', label: 'Tümü', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition text-xs ${
                  active
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
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
                    const platformLabel = (order.online_order_platforms.platform_name || platformCode || '').toUpperCase();
                    const orderDate = new Date(order.created_at);

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
                          {typeof order.getir_status_code === 'number' && (
                            <span className="bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                              {getirStatusLabel(order.getir_status_code)}
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

                      {/* GETIR akış: yeni siparişte iptal sebepleri Getir resmi listesinden */}
                      {order.online_order_platforms.platform_code === 'getir' &&
                        order.status === 'new' &&
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
                                order.getir_status_code ?? 400,
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

                      {/* GETIR butonları — Resmi status code akisi:
                          325 (new) → verify → 400 (verified)
                          400      → prepare → 410 (preparing)
                          410      → handover → 700 (on_the_way)
                          700      → deliver → 900 (delivered) [sadece Restoran Kuryesi]
                      */}
                      {order.online_order_platforms.platform_code === 'getir' && (
                        <>
                          {/* 1️⃣  YENI / SCHEDULED_NEW — REDDET + ONAYLA */}
                          {(order.status === 'new' || order.status === 'scheduled_new') &&
                            rejectingOrderId !== order.id && (
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

                          {/* 2️⃣  SCHEDULED_ACCEPTED — Getir kendisi tetikleyecek */}
                          {order.status === 'scheduled_accepted' && (
                            <div className="w-full bg-amber-100 text-amber-800 font-bold py-3 rounded-xl text-center text-sm">
                              İleri tarihli — Getir teslimat saatinden 1 saat önce hazırlanma akışını başlatacak.
                            </div>
                          )}

                          {/* 3️⃣  VERIFIED (Getir 400) — HAZIRLANMAYA BAŞLA (prepare) */}
                          {(order.status === 'verified' || order.status === 'accepted') && (
                            <button
                              onClick={() => doGetirAction(order, 'prepare')}
                              disabled={busyOrderId === order.id}
                              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              <Package className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                              {busyOrderId === order.id ? 'Getir bekliyor… (auto-retry)' : 'HAZIRLANMAYA BAŞLA'}
                            </button>
                          )}

                          {/* 4️⃣  PREPARING / READY (Getir 410/500) — KURYEYE VER (handover) */}
                          {(order.status === 'preparing' || order.status === 'ready') && (
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

                          {/* 5️⃣  HANDED_OVER / ON_THE_WAY (Getir 550/700) */}
                          {(order.status === 'handed_over' || order.status === 'on_the_way') &&
                            order.getir_delivery_type === 1 && (
                              <div className="w-full bg-purple-100 text-purple-800 font-bold py-3 rounded-xl text-center text-sm flex items-center justify-center gap-2">
                                <Bike className="w-4 h-4" />
                                Getir kuryesinde — teslim bekleniyor
                              </div>
                            )}

                          {(order.status === 'handed_over' || order.status === 'on_the_way') &&
                            order.getir_delivery_type !== 1 && (
                              <button
                                onClick={() => doGetirAction(order, 'deliver')}
                                disabled={busyOrderId === order.id}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <Check className={`w-5 h-5 ${busyOrderId === order.id ? 'animate-spin' : ''}`} />
                                {busyOrderId === order.id ? 'İşleniyor…' : 'TESLİM EDİLDİ'}
                              </button>
                            )}

                          {/* 6️⃣  ARRIVED / DELIVERED / CANCELLED — bilgi */}
                          {order.status === 'arrived' && (
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
                            disabled={loading}
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <X className="w-5 h-5" />
                            REDDET
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, 'accepted', 'accept')}
                            disabled={loading}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Check className="w-5 h-5" />
                            ONAYLA
                          </button>
                        </div>
                      )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'accepted' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'preparing')}
                          disabled={loading}
                          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Package className="w-5 h-5" />
                          HAZIRLANIYOR
                        </button>
                      )}

                      {order.online_order_platforms.platform_code !== 'getir' && order.status === 'preparing' && (
                        <button
                          onClick={() => updateOrderStatus(order.id, 'ready', 'prepared')}
                          disabled={loading}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <Bike className="w-5 h-5" />
                          HAZIR
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
