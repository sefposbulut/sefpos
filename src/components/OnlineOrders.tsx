import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { ShoppingBag, Clock, Phone, MapPin, Check, X, ChevronDown, ChevronUp, Bike, Package, RefreshCw, Volume2, VolumeX, AlertTriangle, Hash, Tag } from 'lucide-react';
import { playNotificationSound } from '../lib/notification';
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
  const [filter, setFilter] = useState<'all' | 'new' | 'accepted' | 'preparing' | 'ready'>('new');
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('notification_sound_enabled');
    return saved === null ? true : saved === 'true';
  });
  const previousOrderCount = useRef<number>(0);

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

      if (filterRef.current !== 'all') {
        query = query.eq('status', filterRef.current);
      }

      const { data, error } = await query;
      if (error) throw error;

      const newOrders = (data as any) || [];
      if (previousOrderCount.current > 0 && newOrders.length > previousOrderCount.current && soundEnabledRef.current) {
        playNotificationSound();
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

  useEffect(() => {
    loadOrders();
  }, [filter]);

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('notification_sound_enabled', newValue.toString());
    if (newValue) {
      playNotificationSound();
    }
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
  const doGetirAction = async (
    order: OrderWithDetails,
    action: 'verify' | 'verify-scheduled' | 'prepare' | 'handover' | 'deliver' | 'cancel',
    extra?: { cancelReasonId?: string; cancelNote?: string },
  ) => {
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
        const detail = (res as any)?.data?.message || res.error || 'Getir tarafı hata döndü';
        alert(`Getir aksiyonu başarısız (${action}): ${detail}`);
        await loadOrders();
        return;
      }
      // Backend zaten online_orders'u guncelledi — local state'i de yenile
      await loadOrders();
    } catch (err: any) {
      alert(`Getir aksiyonu sırasında hata: ${err?.message || err}`);
      await loadOrders();
    } finally {
      setBusyOrderId(null);
    }
  };

  const syncOrders = async () => {
    if (!user) return;

    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-online-orders`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      if (result.newOrders > 0) {
        alert(`${result.newOrders} yeni sipariş eklendi!`);
      } else {
        alert('Yeni sipariş yok.');
      }

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
      trendyol: '#F27A1A',
      migros: '#FF6600',
    };
    return colors[platformCode.toLowerCase()] || '#F97316';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      new: { label: 'YENİ', color: 'bg-red-600 animate-pulse' },
      accepted: { label: 'ONAYLANDI', color: 'bg-blue-600' },
      preparing: { label: 'HAZIRLANIYOR', color: 'bg-yellow-600' },
      ready: { label: 'HAZIR', color: 'bg-green-600' },
      delivered: { label: 'TESLİM EDİLDİ', color: 'bg-gray-600' },
      cancelled: { label: 'İPTAL', color: 'bg-gray-800' },
    };

    const badge = badges[status] || badges.new;
    return (
      <span className={`${badge.color} text-white text-xs font-black px-3 py-1.5 rounded-full`}>
        {badge.label}
      </span>
    );
  };

  const filteredOrders = orders;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 pb-20">
      <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-3 md:p-6 lg:p-8 shadow-lg">
        <div className="flex items-center justify-between mb-3 md:mb-6">
          <div>
            <h1 className="text-xl md:text-3xl lg:text-4xl font-black flex items-center gap-2 md:gap-3">
              <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
              <span className="hidden sm:inline">ONLİNE SİPARİŞLER</span>
              <span className="sm:hidden">SİPARİŞLER</span>
            </h1>
            <p className="text-xs md:text-sm lg:text-base opacity-90 mt-1 md:mt-2 hidden md:block">
              Yemeksepeti, Getir Yemek ve diğer platformlardan gelen siparişler
            </p>
          </div>
          <div className="flex gap-1.5 md:gap-3">
            <button
              onClick={toggleSound}
              className="bg-white/20 hover:bg-white/30 text-white px-2 py-2 md:px-4 md:py-3 rounded-lg md:rounded-xl font-bold flex items-center gap-1 md:gap-2 transition-all active:scale-95"
              title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 md:w-5 md:h-5" /> : <VolumeX className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button
              onClick={syncOrders}
              disabled={syncing}
              className="bg-white/20 hover:bg-white/30 text-white px-3 py-2 md:px-6 md:py-3 rounded-lg md:rounded-xl font-bold flex items-center gap-1 md:gap-2 transition-all active:scale-95 disabled:opacity-50 text-xs md:text-base"
            >
              <RefreshCw className={`w-4 h-4 md:w-5 md:h-5 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{syncing ? 'Senkronize ediliyor...' : 'Siparişleri Çek'}</span>
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'new', label: 'Yeni', icon: ShoppingBag },
            { id: 'accepted', label: 'Onaylı', icon: Check },
            { id: 'preparing', label: 'Hazırlanıyor', icon: Package },
            { id: 'ready', label: 'Hazır', icon: Bike },
            { id: 'all', label: 'Tümü', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`flex items-center gap-1.5 md:gap-2 px-3 py-2 md:px-5 md:py-2.5 rounded-lg md:rounded-xl font-bold whitespace-nowrap transition-all text-xs md:text-base ${
                  filter === tab.id
                    ? 'bg-white text-orange-600 shadow-lg'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 max-w-7xl mx-auto">
        {loading && orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-600 mx-auto"></div>
            <p className="text-slate-600 mt-4 font-medium">Siparişler yükleniyor...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-20 h-20 text-slate-300 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-slate-400 mb-2">Sipariş Yok</h3>
            <p className="text-slate-500">
              {filter === 'new' ? 'Yeni sipariş bekleniyor...' : 'Bu kategoride sipariş bulunmuyor.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrder === order.id;
              const platformColor = getPlatformColor(order.online_order_platforms.platform_code);

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl md:rounded-2xl shadow-lg hover:shadow-xl transition-all overflow-hidden border-2"
                  style={{ borderColor: platformColor }}
                >
                  <div
                    className="p-3 md:p-4 text-white relative"
                    style={{ background: `linear-gradient(135deg, ${platformColor} 0%, ${platformColor}dd 100%)` }}
                  >
                    <div className="flex items-start justify-between mb-2 md:mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-base md:text-xl font-black uppercase truncate">
                          {order.online_order_platforms.platform_name}
                        </h3>
                        <p className="text-xs md:text-sm opacity-90 font-bold truncate">
                          #{order.platform_order_number || order.platform_order_id.slice(0, 8)}
                        </p>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>

                    <div className="flex items-center gap-1.5 md:gap-2 text-xs md:text-sm opacity-95">
                      <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />
                      <span className="font-semibold">
                        {new Date(order.created_at).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 md:p-4 space-y-2 md:space-y-3">
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{order.customer_name}</p>
                        {order.customer_phone && (
                          <p className="text-sm text-slate-600">{order.customer_phone}</p>
                        )}
                      </div>
                    </div>

                    {order.customer_address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-slate-600 line-clamp-2">{order.customer_address}</p>
                      </div>
                    )}

                    <button
                      onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                      className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 p-3 rounded-xl transition-all"
                    >
                      <span className="font-bold text-slate-700">
                        {order.items.length} Ürün
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 bg-slate-50 p-3 rounded-xl">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-start text-sm">
                            <div className="flex-1">
                              <p className="font-bold text-slate-800">{item.platform_product_name}</p>
                              {item.notes && (
                                <p className="text-xs text-slate-500 italic">{item.notes}</p>
                              )}
                            </div>
                            <div className="text-right ml-2">
                              <p className="font-bold text-slate-700">x{item.quantity}</p>
                              <p className="text-xs text-slate-600">{item.total_amount.toFixed(0)} ₺</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t-2 pt-3 mt-3">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-slate-600 font-bold">TOPLAM</span>
                        <span className="text-2xl font-black" style={{ color: platformColor }}>
                          {order.total_amount.toFixed(0)} ₺
                        </span>
                      </div>

                      {/* Getir-spesifik bilgi rozeti: doğrulama kodu + statu */}
                      {order.online_order_platforms.platform_code === 'getir' && (
                        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                          {order.getir_verification_code && (
                            <span className="bg-purple-100 text-purple-800 font-black px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {order.getir_verification_code.toUpperCase()}
                            </span>
                          )}
                          {typeof order.getir_status_code === 'number' && (
                            <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg">
                              {getirStatusLabel(order.getir_status_code)}
                            </span>
                          )}
                          {order.getir_delivery_type === 1 && (
                            <span className="bg-purple-600 text-white font-bold px-2.5 py-1 rounded-lg">Getir Kurye</span>
                          )}
                          {order.getir_delivery_type === 2 && (
                            <span className="bg-amber-600 text-white font-bold px-2.5 py-1 rounded-lg">Restoran Kurye</span>
                          )}
                          {order.getir_is_scheduled && (
                            <span className="bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg">İleri Tarih</span>
                          )}
                          {Number(order.getir_total_discount || 0) > 0 && (
                            <span className="bg-rose-100 text-rose-800 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
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

                      {/* GETIR butonları */}
                      {order.online_order_platforms.platform_code === 'getir' && (
                        <>
                          {order.status === 'new' && rejectingOrderId !== order.id && (
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
                                  doGetirAction(order, order.getir_is_scheduled ? 'verify-scheduled' : 'verify')
                                }
                                disabled={busyOrderId === order.id}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <Check className="w-5 h-5" />
                                ONAYLA
                              </button>
                            </div>
                          )}

                          {order.status === 'scheduled_accepted' && (
                            <div className="w-full bg-amber-100 text-amber-800 font-bold py-3 rounded-xl text-center text-sm">
                              İleri tarihli — Getir teslimat saatinden 1 saat önce hazırlanma akışını başlatacak.
                            </div>
                          )}

                          {(order.status === 'preparing' || order.status === 'new' /* verify sonrası backend preparing yaptı */) &&
                            order.getir_status_code !== 500 && (
                              <button
                                onClick={() => doGetirAction(order, 'prepare')}
                                disabled={busyOrderId === order.id}
                                className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                <Package className="w-5 h-5" />
                                HAZIRLANMAYA BAŞLA
                              </button>
                            )}

                          {(order.status === 'preparing' || order.getir_status_code === 500) && (
                            <div className="grid grid-cols-1 gap-2 mt-2">
                              {order.getir_delivery_type === 1 ? (
                                <button
                                  onClick={() => doGetirAction(order, 'handover')}
                                  disabled={busyOrderId === order.id}
                                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  <Bike className="w-5 h-5" />
                                  GETIR KURYESİNE TESLİM ETTİM
                                </button>
                              ) : (
                                <button
                                  onClick={() => doGetirAction(order, 'deliver')}
                                  disabled={busyOrderId === order.id}
                                  className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                  <Check className="w-5 h-5" />
                                  TESLİM EDİLDİ
                                </button>
                              )}
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
