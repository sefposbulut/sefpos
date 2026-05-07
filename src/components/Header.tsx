import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Settings, ChevronDown, MapPin, Check, Building2, Zap, ZoomIn, ZoomOut, Bell, Headphones as HeadphonesIcon, X, Send } from 'lucide-react';
import { WaiterCallBell } from './WaiterCallBell';
import { supabase } from '../lib/supabase';

const isElectron = !!(window as any).electronAPI;

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Müdür',
  cashier: 'Kasiyer',
  waiter: 'Garson',
};

const logoSrc = isElectron
  ? new URL('../../public/logo.png', import.meta.url).href
  : '/logo.png';

interface HeaderProps {
  onOpenSettings: () => void;
  /**
   * @deprecated Lisans paneli artık yalnızca /ayka URL'i üzerinden açılır;
   * restoran arayüzünde kalkan ikonu gösterilmez. Geriye dönük uyumluluk
   * için prop tutuldu, render edilmiyor.
   */
  onOpenAdmin?: () => void;
  onOpenOnboarding?: () => void;
}

interface Notification {
  id: string;
  subject: string;
  admin_reply: string | null;
  status: string;
  created_at: string;
  admin_replied_at: string | null;
}

export function Header({ onOpenSettings, onOpenOnboarding }: HeaderProps) {
  const { profile, tenant, user, signOut, activeBranch, branches, setActiveBranch } = useAuth();
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showSupport, setShowSupport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tickets, setTickets] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [systemUnreadCount, setSystemUnreadCount] = useState(0);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportPriority, setSupportPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportSent, setSupportSent] = useState(false);

  const trialInfo = (() => {
    if (!tenant || tenant.subscription_status !== 'trial') return null;
    const now = Date.now();
    const trialEndMs = tenant.subscription_expires_at
      ? new Date(tenant.subscription_expires_at).getTime()
      : (new Date(tenant.created_at).getTime() + (3 * 24 * 60 * 60 * 1000));
    if (!Number.isFinite(trialEndMs)) return null;
    const remainingMs = trialEndMs - now;
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    return {
      remainingDays,
      expired: remainingMs <= 0,
    };
  })();

  useEffect(() => {
    if (!isElectron) return;
    (window as any).electronAPI.getZoom().then((z: number | null) => {
      if (z) setZoom(z);
    });
  }, []);

  useEffect(() => {
    if (!tenant || !user) return;
    loadTickets();
  }, [tenant, user]);

  useEffect(() => {
    if (!tenant || !user) return;

    const unreadKey = `notif_unread_${tenant.id}`;
    const dismissedKey = `notif_dismissed_${tenant.id}`;
    const sessionStartKey = `notif_session_start_${tenant.id}_${user.id}`;
    const sessionStart = localStorage.getItem(sessionStartKey) || new Date().toISOString();
    localStorage.setItem(sessionStartKey, sessionStart);
    const stored = JSON.parse(localStorage.getItem(unreadKey) || '[]') as string[];
    const dismissed = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]') as string[]);
    setSystemUnreadCount(stored.filter(id => !dismissed.has(id)).length);

    supabase
      .from('support_notifications')
      .select('id, tenant_id, created_at, type')
      .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
      .gte('created_at', sessionStart)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const incoming = (data || [])
          .filter((d: any) => d.type !== 'revoke')
          .map((d: any) => d.id)
          .filter((id: string) => !dismissed.has(id));
        const current = new Set(stored.filter(id => !dismissed.has(id)));
        incoming.forEach((id: string) => current.add(id));
        localStorage.setItem(unreadKey, JSON.stringify(Array.from(current).slice(-300)));
        setSystemUnreadCount(current.size);
      });

    const channel = supabase
      .channel(`header-system-notifs-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_notifications',
      }, (payload) => {
        const n = payload.new as any;
        if (n.tenant_id && n.tenant_id !== tenant.id) return;
        if (n.type === 'revoke') return;
        if (n.created_at && n.created_at < sessionStart) return;
        if (dismissed.has(n.id)) return;
        const current = new Set(JSON.parse(localStorage.getItem(unreadKey) || '[]') as string[]);
        current.add(n.id);
        localStorage.setItem(unreadKey, JSON.stringify(Array.from(current).slice(-300)));
        setSystemUnreadCount(current.size);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id, user?.id]);

  const loadTickets = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('support_tickets')
      .select('id, subject, admin_reply, status, created_at, admin_replied_at')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setTickets(data);
      const unread = data.filter(t => t.admin_reply && t.status !== 'closed' && t.admin_replied_at).length;
      setUnreadCount(unread);
    }
  };

  const changeZoom = (delta: number) => {
    if (!isElectron) return;
    const next = Math.min(2, Math.max(0.5, parseFloat((zoom + delta).toFixed(1))));
    setZoom(next);
    (window as any).electronAPI.setZoom(next);
  };

  const handleSupportSubmit = async () => {
    if (!supportSubject.trim() || !supportMessage.trim() || !tenant || !user) return;
    setSupportLoading(true);
    await supabase.from('support_tickets').insert({
      tenant_id: tenant.id,
      created_by: user.id,
      subject: supportSubject.trim(),
      message: supportMessage.trim(),
      priority: supportPriority,
      status: 'open',
    });
    setSupportLoading(false);
    setSupportSent(true);
    setSupportSubject('');
    setSupportMessage('');
    setSupportPriority('medium');
    await loadTickets();
    setTimeout(() => setSupportSent(false), 3000);
  };

  const totalUnread = unreadCount + systemUnreadCount;
  const userLabel = profile?.role === 'waiter'
    ? `Garson: ${profile?.full_name || user?.email?.split('@')[0] || 'Kullanıcı'}`
    : (profile?.full_name || user?.email?.split('@')[0] || 'Kullanıcı');

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-slate-200 z-30">
        <div className="px-3 md:px-6">
          <div className="flex justify-between items-center h-14 md:h-20">
            <div className="flex items-center space-x-2 md:space-x-3 ml-12 md:ml-16">
              <img src={logoSrc} alt="ŞefPOS" className="hidden md:block md:h-12 md:w-auto md:rounded-none object-contain flex-shrink-0" />
              <div className="hidden md:block">
                <p className="text-xs text-slate-500">{tenant?.name}</p>
                {trialInfo && (
                  <p className={`text-[11px] font-semibold mt-0.5 ${trialInfo.expired ? 'text-red-600' : 'text-amber-600'}`}>
                    {trialInfo.expired
                      ? 'Deneme suresi doldu'
                      : `Deneme suresi: ${trialInfo.remainingDays} gun`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 md:space-x-2">
              {branches.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowBranchMenu(!showBranchMenu)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-all active:scale-95 max-w-[130px] md:max-w-none"
                  >
                    <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4 text-orange-600 flex-shrink-0" />
                    <span className="text-xs md:text-sm font-semibold text-orange-700 truncate">
                      {activeBranch?.name || 'Şube Seç'}
                    </span>
                    {branches.length > 1 && (
                      <ChevronDown className={`w-3 h-3 md:w-3.5 md:h-3.5 text-orange-500 flex-shrink-0 transition-transform ${showBranchMenu ? 'rotate-180' : ''}`} />
                    )}
                  </button>

                  {showBranchMenu && branches.length > 1 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowBranchMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-gray-500" />
                            <span className="text-sm font-semibold text-gray-700">Şube Seçin</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{tenant?.name}</p>
                        </div>
                        <div className="py-1 max-h-64 overflow-y-auto">
                          {branches.map((branch) => (
                            <button
                              key={branch.id}
                              onClick={() => {
                                setActiveBranch(branch);
                                setShowBranchMenu(false);
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition ${
                                activeBranch?.id === branch.id ? 'bg-orange-50' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                activeBranch?.id === branch.id ? 'bg-orange-100' : 'bg-gray-100'
                              }`}>
                                <MapPin className={`w-4 h-4 ${activeBranch?.id === branch.id ? 'text-orange-600' : 'text-gray-500'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold truncate ${activeBranch?.id === branch.id ? 'text-orange-700' : 'text-gray-800'}`}>
                                  {branch.name}
                                </p>
                                {branch.address && (
                                  <p className="text-xs text-gray-500 truncate">{branch.address}</p>
                                )}
                                {branch.is_main && (
                                  <span className="text-xs text-orange-500 font-medium">Ana Şube</span>
                                )}
                              </div>
                              {activeBranch?.id === branch.id && (
                                <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2 px-2.5 py-1.5 md:px-3 bg-slate-50 rounded-lg max-w-[160px] md:max-w-[240px]">
                <User className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-xs md:text-sm font-medium text-slate-700 truncate">{userLabel}</p>
                  <p className="text-xs text-slate-500">{roleLabels[profile?.role || ''] || profile?.role}</p>
                </div>
              </div>

              {(profile?.role === 'owner' || profile?.role === 'admin') && onOpenOnboarding && (
                <button
                  onClick={onOpenOnboarding}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all active:scale-95 text-xs font-semibold"
                  title="Hızlı Kurulum"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Kurulum</span>
                </button>
              )}

              <WaiterCallBell />

              <button
                onClick={() => {
                  const next = !showNotifications;
                  setShowNotifications(next);
                  setShowSupport(false);
                  loadTickets();
                  if (next && tenant?.id) {
                    const unreadKey = `notif_unread_${tenant.id}`;
                    localStorage.removeItem(unreadKey);
                    setSystemUnreadCount(0);
                  }
                }}
                className="relative p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Bildirimler"
              >
                <Bell className="w-4 h-4 md:w-5 md:h-5" />
                {totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </button>

              <button
                onClick={() => { setShowSupport(!showSupport); setShowNotifications(false); }}
                className="p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Destek"
              >
                <HeadphonesIcon className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              <button
                onClick={onOpenSettings}
                className="p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Ayarlar"
              >
                <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              {isElectron && (
                <div className="hidden md:flex items-center gap-1 bg-slate-100 rounded-lg px-1 py-1">
                  <button
                    onClick={() => changeZoom(-0.1)}
                    className="p-1.5 rounded hover:bg-slate-200 transition-all active:scale-95 text-slate-600"
                    title="Küçült"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-600 w-9 text-center">{Math.round(zoom * 100)}%</span>
                  <button
                    onClick={() => changeZoom(0.1)}
                    className="p-1.5 rounded hover:bg-slate-200 transition-all active:scale-95 text-slate-600"
                    title="Büyüt"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={signOut}
                className="flex items-center space-x-1 md:space-x-2 text-white bg-gradient-to-r from-red-600 to-red-700 px-2 py-1.5 md:px-4 md:py-2 rounded-lg hover:shadow-lg transition-all active:scale-95"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="text-xs md:text-sm font-medium">Çıkış</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
          <div className="fixed top-14 md:top-20 right-3 md:right-6 z-50 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-600" />
                <span className="font-bold text-slate-700">Bildirimler</span>
              </div>
              <button onClick={() => setShowNotifications(false)} className="p-1 rounded hover:bg-slate-200 transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {tickets.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">Henüz bildirim yok</div>
              ) : (
                tickets.map(ticket => (
                  <div key={ticket.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                    <p className="text-sm font-semibold text-slate-800">{ticket.subject}</p>
                    {ticket.admin_reply && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{ticket.admin_reply}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ticket.status === 'open' ? 'bg-blue-100 text-blue-700' :
                        ticket.status === 'closed' ? 'bg-slate-100 text-slate-600' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {ticket.status === 'open' ? 'Açık' : ticket.status === 'closed' ? 'Kapalı' : 'İşlemde'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(ticket.created_at).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {showSupport && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowSupport(false)} />
          <div className="fixed top-14 md:top-20 right-3 md:right-6 z-50 w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <HeadphonesIcon className="w-4 h-4 text-slate-600" />
                <span className="font-bold text-slate-700">Destek Talebi</span>
              </div>
              <button onClick={() => setShowSupport(false)} className="p-1 rounded hover:bg-slate-200 transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {supportSent && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-semibold">
                  <Check className="w-4 h-4" />
                  Talebiniz iletildi!
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Konu</label>
                <input
                  type="text"
                  value={supportSubject}
                  onChange={e => setSupportSubject(e.target.value)}
                  placeholder="Konu başlığı..."
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mesaj</label>
                <textarea
                  value={supportMessage}
                  onChange={e => setSupportMessage(e.target.value)}
                  placeholder="Sorununuzu açıklayın..."
                  rows={4}
                  className="w-full px-3 py-2 border-2 rounded-xl text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Öncelik</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setSupportPriority(p)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        supportPriority === p
                          ? p === 'high' ? 'border-red-500 bg-red-50 text-red-700'
                            : p === 'medium' ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-green-500 bg-green-50 text-green-700'
                          : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      {p === 'low' ? 'Düşük' : p === 'medium' ? 'Orta' : 'Yüksek'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleSupportSubmit}
                disabled={supportLoading || !supportSubject.trim() || !supportMessage.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50 active:scale-95"
              >
                <Send className="w-4 h-4" />
                {supportLoading ? 'Gönderiliyor...' : 'Gönder'}
              </button>

              <div className="pt-2 border-t border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Destek Yanıtları</p>
                <div className="max-h-36 overflow-y-auto space-y-2">
                  {tickets.filter(t => t.admin_reply).length === 0 ? (
                    <p className="text-xs text-slate-400">Henüz destek yanıtı yok</p>
                  ) : tickets.filter(t => t.admin_reply).map(t => (
                    <div key={t.id} className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <p className="text-[11px] font-semibold text-slate-700 truncate">{t.subject}</p>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{t.admin_reply}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
