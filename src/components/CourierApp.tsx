import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bike, Bell, BellOff, Package, MapPin, Phone, Clock, CheckCircle2, ChevronRight, ChevronLeft, LogOut, AlertCircle, Navigation } from 'lucide-react';

interface CourierData {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  full_name: string;
  phone: string;
  status: string;
  is_active: boolean;
  pin_code: string | null;
}

interface CourierNotification {
  id: string;
  courier_id: string;
  order_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface AssignedOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  total_amount: number;
  delivery_status: string;
  payment_method: string | null;
  payment_collected: boolean;
  created_at: string;
  estimated_delivery_minutes: number | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  on_the_way: { label: 'Paket Kuryede', color: 'text-orange-700', bg: 'bg-orange-100' },
  delivered: { label: 'Teslim Edildi', color: 'text-green-700', bg: 'bg-green-100' },
  cancelled: { label: 'İptal', color: 'text-red-700', bg: 'bg-red-100' },
  ready: { label: 'Hazır', color: 'text-teal-700', bg: 'bg-teal-100' },
  preparing: { label: 'Hazırlanıyor', color: 'text-blue-700', bg: 'bg-blue-100' },
  pending: { label: 'Bekliyor', color: 'text-amber-700', bg: 'bg-amber-100' },
};

function CourierLogin({ onLogin, onExit }: { onLogin: (courier: CourierData) => void; onExit?: () => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!phone.trim()) { setError('Telefon numarası gereklidir'); return; }
    setLoading(true);

    const cleaned = phone.replace(/\D/g, '');

    let query = supabase
      .from('couriers')
      .select('*')
      .eq('phone', cleaned)
      .eq('is_active', true);

    if (pin.trim()) {
      query = query.eq('pin_code', pin.trim());
    } else {
      query = query.is('pin_code', null);
    }

    const { data, error: dbErr } = await query.maybeSingle();

    if (dbErr || !data) {
      setError('Telefon veya PIN hatalı. Lütfen tekrar deneyin.');
      setLoading(false);
      return;
    }

    await supabase.from('couriers').update({ status: 'available' }).eq('id', data.id);
    onLogin(data as CourierData);
    setLoading(false);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 flex items-center justify-center p-4">
      {onExit && (
        <button
          onClick={onExit}
          className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition backdrop-blur-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Geri Don
        </button>
      )}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Bike className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Kurye Girisi</h1>
          <p className="text-slate-500 text-sm mt-1">Telefon numaranizla giris yapin</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Telefon Numarası</label>
            <input
              type="text"
              inputMode="numeric"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              placeholder="0532 123 45 67"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">
              PIN Kodu <span className="text-slate-400 font-normal">(varsa)</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="PIN yoksa boş bırakın"
              className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-widest text-center text-xl"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white font-black rounded-xl shadow-lg transition active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          PIN kodunuzu restoran yöneticinizden alın
        </p>
      </div>
    </div>
  );
}

function CourierDashboard({ courier, onLogout }: { courier: CourierData; onLogout: () => void }) {
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [notifications, setNotifications] = useState<CourierNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'completed' | 'notifications'>('active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'tracking' | 'denied'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevNotifCount = useRef(0);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, customer_phone, delivery_address, delivery_note, total_amount, delivery_status, payment_method, payment_collected, created_at, estimated_delivery_minutes')
      .eq('courier_id', courier.id)
      .not('delivery_status', 'in', '(cancelled)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setOrders(data as AssignedOrder[]);
    setLoading(false);
  };

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('courier_notifications')
      .select('*')
      .eq('courier_id', courier.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (data) {
      if (prevNotifCount.current > 0 && data.length > prevNotifCount.current && soundEnabled) {
        try {
          if (!audioRef.current) {
            audioRef.current = new Audio('/notification.mp3');
          }
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        } catch {}
      }
      prevNotifCount.current = data.length;
      setNotifications(data as CourierNotification[]);
    }
  };

  const updateLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocationStatus('tracking');
        await supabase.from('couriers').update({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        }).eq('id', courier.id);
      },
      () => {
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startLocationTracking = () => {
    updateLocation();
    locationIntervalRef.current = setInterval(updateLocation, 30000);
  };

  useEffect(() => {
    loadOrders();
    loadNotifications();
    startLocationTracking();
    pollIntervalRef.current = setInterval(loadOrders, 10000);

    const ch = supabase
      .channel(`courier-${courier.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.new && payload.new.courier_id === courier.id) {
          loadOrders();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'courier_notifications', filter: `courier_id=eq.${courier.id}` }, (payload) => {
        loadNotifications();
        if (payload.new && payload.new.is_read === false) {
          setTab('notifications');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [courier.id]);

  const markPickedUp = async (orderId: string, orderNumber: string) => {
    await supabase.from('orders').update({
      delivery_status: 'on_the_way',
      picked_up_at: new Date().toISOString(),
    }).eq('id', orderId);

    await supabase.from('couriers').update({ status: 'busy' }).eq('id', courier.id);

    await supabase.from('courier_notifications').insert({
      tenant_id: courier.tenant_id,
      courier_id: courier.id,
      order_id: orderId,
      title: 'Paket Alındı',
      message: `${orderNumber} numaralı paketi teslim almaya başladınız.`,
      type: 'picked_up',
      is_read: true,
    });

    loadOrders();
  };

  const markDelivered = async (orderId: string, orderNumber: string) => {
    await supabase.from('orders').update({
      delivery_status: 'delivered',
      status: 'completed',
      delivered_at: new Date().toISOString(),
    }).eq('id', orderId);

    await supabase.from('couriers').update({ status: 'available' }).eq('id', courier.id);

    await supabase.from('courier_notifications').insert({
      courier_id: courier.id,
      order_id: orderId,
      title: 'Teslimat Tamamlandı',
      message: `${orderNumber} numaralı sipariş teslim edildi.`,
      type: 'delivery_complete',
      is_read: false,
    });

    loadOrders();
  };

  const markRead = async (notifId: string) => {
    await supabase.from('courier_notifications').update({ is_read: true }).eq('id', notifId);
    setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from('courier_notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const activeOrders = orders.filter(o => o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled');
  const completedOrders = orders.filter(o => o.delivery_status === 'delivered' || o.delivery_status === 'cancelled');
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const getElapsed = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (diff < 60) return `${diff} dk`;
    return `${Math.floor(diff / 60)}s ${diff % 60}dk`;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-4 py-4 shadow-lg">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <p className="font-black text-lg leading-tight">{courier.full_name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {locationStatus === 'tracking' ? (
                  <>
                    <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    <p className="text-blue-200 text-xs">Konum aktif</p>
                  </>
                ) : locationStatus === 'denied' ? (
                  <>
                    <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                    <p className="text-blue-200 text-xs">Konum kapalı</p>
                  </>
                ) : (
                  <p className="text-blue-200 text-xs">Kurye Paneli</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {locationStatus === 'denied' && (
              <button
                onClick={startLocationTracking}
                title="Konumu etkinleştir"
                className="p-2 rounded-xl bg-red-400/30 hover:bg-red-400/50 transition"
              >
                <Navigation className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setSoundEnabled(s => !s)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              {soundEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5 opacity-50" />}
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 mt-4 max-w-lg mx-auto">
          {([
            ['active', `Aktif (${activeOrders.length})`],
            ['completed', 'Tamamlanan'],
            ['notifications', unreadCount > 0 ? `Bildirimler (${unreadCount})` : 'Bildirimler'],
          ] as [string, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition relative ${tab === t ? 'bg-white text-blue-700' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {label}
              {t === 'notifications' && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] font-black flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'active' ? (
          activeOrders.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Package className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-lg">Aktif teslimat yok</p>
              <p className="text-sm mt-1">Size atanan siparişler burada görünecek</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-black text-slate-800 text-base">{order.order_number}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs text-slate-500">{getElapsed(order.created_at)} önce</span>
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_MAP[order.delivery_status]?.bg} ${STATUS_MAP[order.delivery_status]?.color}`}>
                        {STATUS_MAP[order.delivery_status]?.label}
                      </div>
                    </div>

                    {order.customer_name && (
                      <div className="flex items-center gap-2 text-sm text-slate-700 mb-1.5">
                        <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold">{order.customer_name[0]}</span>
                        </div>
                        <span className="font-semibold">{order.customer_name}</span>
                      </div>
                    )}

                    {order.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="flex items-center gap-2 text-sm text-blue-600 font-semibold mb-1.5 hover:underline"
                      >
                        <Phone className="w-4 h-4 shrink-0" />
                        {order.customer_phone}
                      </a>
                    )}

                    {order.delivery_address && (
                      <div className="flex items-start gap-2 text-sm text-slate-600 mb-2">
                        <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                        <span className="leading-snug">{order.delivery_address}</span>
                      </div>
                    )}

                    {order.delivery_address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-blue-500 font-semibold mb-3 hover:underline"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Haritada Aç
                      </a>
                    )}

                    {order.delivery_note && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 mb-3">
                        Not: {order.delivery_note}
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-800 text-lg">{order.total_amount.toFixed(2)} ₺</span>
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_MAP[order.delivery_status]?.bg} ${STATUS_MAP[order.delivery_status]?.color}`}>
                          {STATUS_MAP[order.delivery_status]?.label}
                        </div>
                      </div>
                      {order.payment_collected ? (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-green-700">Ödendi</p>
                            <p className="text-[11px] text-green-600">
                              {order.payment_method === 'cash' ? 'Nakit' : order.payment_method === 'card' ? 'Kart' : 'Online'} ile ödeme alındı
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-amber-700">
                              {order.payment_method === 'cash' ? 'Kapıda Nakit Tahsil Et' : order.payment_method === 'card' ? 'Kapıda Kart ile Tahsil Et' : 'Kapıda Tahsil Et'}
                            </p>
                            <p className="text-[11px] text-amber-600 font-bold">{order.total_amount.toFixed(2)} ₺</p>
                          </div>
                        </div>
                      )}
                      {(order.delivery_status === 'pending' || order.delivery_status === 'preparing' || order.delivery_status === 'ready') && (
                        <button
                          onClick={() => markPickedUp(order.id, order.order_number)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition"
                        >
                          <Package className="w-4 h-4" />
                          Paketi Aldım
                        </button>
                      )}
                      {order.delivery_status === 'on_the_way' && (
                        <button
                          onClick={() => markDelivered(order.id, order.order_number)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-bold text-sm shadow-md active:scale-95 transition"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Teslim Ettim
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'completed' ? (
          completedOrders.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-lg">Tamamlanan teslimat yok</p>
            </div>
          ) : (
            <div className="space-y-3">
              {completedOrders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-700">{order.order_number}</p>
                      {order.customer_name && <p className="text-sm text-slate-500">{order.customer_name}</p>}
                      {order.delivery_address && (
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {order.delivery_address}
                        </p>
                      )}
                    </div>
                    <div>
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_MAP[order.delivery_status]?.bg} ${STATUS_MAP[order.delivery_status]?.color}`}>
                        {STATUS_MAP[order.delivery_status]?.label}
                      </div>
                      <p className="text-sm font-bold text-slate-800 text-right mt-1">{order.total_amount.toFixed(2)} ₺</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="w-full py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition">
                Tümünü okundu işaretle
              </button>
            )}
            {notifications.length === 0 ? (
              <div className="text-center py-20 text-slate-400">
                <Bell className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <p className="font-semibold text-lg">Bildirim yok</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={`bg-white rounded-2xl shadow-sm border-2 p-4 cursor-pointer transition active:scale-[0.98] ${notif.is_read ? 'border-slate-100 opacity-70' : 'border-blue-300'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${notif.is_read ? 'bg-slate-100' : 'bg-blue-100'}`}>
                      <Bell className={`w-4 h-4 ${notif.is_read ? 'text-slate-400' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`font-bold text-sm ${notif.is_read ? 'text-slate-600' : 'text-slate-800'}`}>{notif.title}</p>
                        {!notif.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                      </div>
                      <p className="text-sm text-slate-600 mt-0.5 leading-snug">{notif.message}</p>
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(notif.created_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const COURIER_SESSION_KEY = 'shefpos_courier_session';

export function CourierApp({ onExit }: { onExit?: () => void }) {
  const [courier, setCourier] = useState<CourierData | null>(() => {
    const saved = localStorage.getItem(COURIER_SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (c: CourierData) => {
    localStorage.setItem(COURIER_SESSION_KEY, JSON.stringify(c));
    setCourier(c);
  };

  const handleLogout = async () => {
    if (courier) {
      await supabase.from('couriers').update({ status: 'offline', latitude: null, longitude: null }).eq('id', courier.id);
    }
    localStorage.removeItem(COURIER_SESSION_KEY);
    setCourier(null);
  };

  if (!courier) {
    return <CourierLogin onLogin={handleLogin} onExit={onExit} />;
  }

  return <CourierDashboard courier={courier} onLogout={handleLogout} />;
}
