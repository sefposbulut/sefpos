import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User, Settings, ChevronDown, MapPin, Check, Building2, Zap, ZoomIn, ZoomOut, Bell, Headphones as HeadphonesIcon, X, Send, Sparkles, Phone, Mail, ArrowLeft, LayoutGrid, PlayCircle, Lock, Minimize2, UserCheck } from 'lucide-react';
import { WaiterCallBell } from './WaiterCallBell';
import { supabase } from '../lib/supabase';
import { getTrialInfo, formatTrialRemaining } from '../lib/tenantTrial';
import { useActiveShift } from '../lib/useActiveShift';
import { shiftDurationLabel, shiftIcon } from '../lib/businessDay';
import { useUiPrefs, setHeaderHidden, setUiScale, bumpUiScale, resetUiScale, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP } from '../lib/uiPrefs';

const isElectron = !!(window as any).electronAPI;

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Şube Müdürü',
  cashier: 'Kasiyer',
  waiter: 'Garson',
  courier: 'Kurye',
  kitchen: 'Mutfak',
  super_admin: 'Süper Admin',
};

// Header'da gosterilen ana logo. Kullanicinin atttigi yeni
// "ŞefPOS chef-hat" logosu, sadece bu konumda kullanilir; Auth/Onboarding/Landing
// hala /logo.png kullanir.
const logoSrc = isElectron
  ? new URL('../../public/logo-header.png', import.meta.url).href
  : '/logo-header.png';

interface HeaderProps {
  onOpenSettings: () => void;
  /**
   * @deprecated Lisans paneli artık yalnızca gizli URL (aykaRoute) üzerinden açılır;
   * restoran arayüzünde kalkan ikonu gösterilmez. Geriye dönük uyumluluk
   * için prop tutuldu, render edilmiyor.
   */
  onOpenAdmin?: () => void;
  onOpenOnboarding?: () => void;
  /** Aktif sayfa anahtari (App.tsx currentPage). 'tables' degilse "Masalara Dön" butonu gosterilir. */
  currentPage?: string;
  /** Header icindeki "Masalara Dön" butonunun aksiyonu (genelde onNavigate('tables')). */
  onBackToTables?: () => void;
  /** Aktif vardiya rozetine tiklayinca yonlendirilecek aksiyon (genelde onNavigate('shifts')). */
  onOpenShifts?: () => void;
}

interface Notification {
  id: string;
  subject: string;
  admin_reply: string | null;
  status: string;
  created_at: string;
  admin_replied_at: string | null;
}

/** Sayfa anahtari → kullanici dostu Turkce ad. Header breadcrumb'inda gosterilir. */
const PAGE_LABELS: Record<string, string> = {
  tables: 'Masalar',
  takeaway: 'Paket Servis',
  'online-orders': 'Online Siparişler',
  'quick-sale': 'Hızlı Satış',
  products: 'Ürünler',
  'product-stock-count': 'Ürün sayımı',
  customers: 'Müşteriler',
  users: 'Kullanıcılar',
  reports: 'Raporlar',
  'reports-stock-count': 'Sayım raporu',
  endofday: 'Gün Sonu',
  'cancel-logs': 'İptal Kayıtları',
  inventory: 'Stok yönetimi',
  cash: 'Kasa',
  shifts: 'Vardiyalar',
};

export function Header({ onOpenSettings, onOpenOnboarding, currentPage, onBackToTables, onOpenShifts }: HeaderProps) {
  const {
    profile,
    tenant,
    user,
    signOut,
    activeBranch,
    branches,
    setActiveBranch,
    shiftsEnabled,
    permissions,
    businessDayStartHour,
    impersonationTenantId,
    clearTenantImpersonation,
  } = useAuth();
  const canUseShifts = !!permissions?.can_use_shifts;
  const { activeShift, todayClosure } = useActiveShift({
    tenantId: tenant?.id || null,
    branchId: activeBranch?.id || null,
    userId: user?.id || null,
    enabled: !!tenant && shiftsEnabled && canUseShifts,
    cutoffHour: businessDayStartHour,
  });
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const uiPrefs = useUiPrefs();
  const zoom = uiPrefs.uiScale;
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
  const [showTrialInfo, setShowTrialInfo] = useState(false);

  const trialInfo = getTrialInfo(tenant as any);
  const showTrialBadge = trialInfo.isTrial;
  const trialUrgent = trialInfo.isTrial && (trialInfo.expired || trialInfo.remainingHours <= 24);

  // Electron uzerinde calisirken (varsa) Electron'in zoom state'ini de
  // uygulamamiz tercihine senkronize et — boylece pencere yenilense bile
  // ayni olcekte acilir.
  useEffect(() => {
    if (!isElectron) return;
    try {
      (window as any).electronAPI?.setZoom?.(uiPrefs.uiScale);
    } catch {
      /* ignore */
    }
  }, [isElectron, uiPrefs.uiScale]);

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
    bumpUiScale(delta);
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
            <div className="flex items-center gap-2 md:gap-3 ml-12 md:ml-16 min-w-0">
              <img
                src={logoSrc}
                alt="ŞefPOS"
                className="h-9 md:h-12 w-auto object-contain flex-shrink-0 select-none"
                draggable={false}
              />

              {/* "Masalara Dön" hizli yonlendirici — sadece tables disindaki sayfalarda
                  ve **sadece tablet/desktop**ta gosteriliyor. Mobilde sube secici
                  ile yan yana sigmadigi icin gizlendi; mobil kullanicisi MainMenu
                  hamburger menusunden "Masalar"a tek tikla doner. */}
              {currentPage && currentPage !== 'tables' && onBackToTables && (
                <>
                  <button
                    type="button"
                    onClick={onBackToTables}
                    title="Masalara dön"
                    className="group hidden md:inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-sm hover:shadow transition active:scale-95 flex-shrink-0"
                  >
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center group-hover:-translate-x-0.5 transition-transform">
                      <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-sm font-extrabold tracking-tight whitespace-nowrap">
                      Masalara Dön
                    </span>
                  </button>

                  {/* Breadcrumb: hangi sayfadayim — masaüstü icin */}
                  {PAGE_LABELS[currentPage] && (
                    <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 font-semibold pl-1">
                      <ChevronDown className="w-3 h-3 -rotate-90" />
                      <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-600">{PAGE_LABELS[currentPage]}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center space-x-1.5 md:space-x-2">
              {impersonationTenantId && (
                <div
                  className="flex items-center gap-1.5 max-w-[min(100%,14rem)] sm:max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] sm:text-xs font-bold text-amber-950"
                  title="Lisans panelinden açılan müşteri kiracısı görünümü"
                >
                  <UserCheck className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" aria-hidden />
                  <span className="truncate hidden sm:inline">{tenant?.name || 'Müşteri'}</span>
                  <button
                    type="button"
                    onClick={() => void clearTenantImpersonation()}
                    className="flex-shrink-0 px-1.5 py-0.5 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-black"
                  >
                    Çık
                  </button>
                </div>
              )}
              {showTrialBadge && (
                <button
                  type="button"
                  onClick={() => setShowTrialInfo(true)}
                  title={
                    trialInfo.expired
                      ? 'Deneme süreniz sona erdi — detay için tıklayın'
                      : `${formatTrialRemaining(trialInfo)} kaldı — detay için tıklayın`
                  }
                  className="hidden sm:inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-transparent hover:bg-slate-100/70 transition active:scale-95"
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center shadow-inner ${
                      trialInfo.expired
                        ? 'bg-gradient-to-br from-red-500 to-rose-600'
                        : 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </span>
                  <span className="flex items-baseline gap-1.5 leading-none">
                    <span
                      className={`text-[9px] md:text-[10px] uppercase tracking-[0.12em] font-bold ${
                        trialInfo.expired ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      Deneme
                    </span>
                    <span
                      className={`text-sm md:text-base font-extrabold whitespace-nowrap ${
                        trialInfo.expired
                          ? 'text-red-700'
                          : trialUrgent
                            ? 'text-orange-700'
                            : 'text-slate-800'
                      }`}
                    >
                      {trialInfo.expired ? 'Süre bitti' : formatTrialRemaining(trialInfo)}
                    </span>
                  </span>
                </button>
              )}

              {tenant && shiftsEnabled && canUseShifts && (
                <ShiftBadge
                  activeShift={activeShift}
                  dayLocked={!!todayClosure}
                  onClick={onOpenShifts}
                />
              )}

              {branches.length > 0 && (
                <div className="relative ml-1 md:ml-0">
                  <button
                    onClick={() => setShowBranchMenu(!showBranchMenu)}
                    className="flex items-center gap-1 md:gap-1.5 px-1.5 py-1 md:px-3 md:py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md md:rounded-lg transition-all active:scale-95 max-w-[88px] md:max-w-none"
                  >
                    <MapPin className="w-3 h-3 md:w-4 md:h-4 text-orange-600 flex-shrink-0" />
                    <span className="text-[10px] md:text-sm font-semibold text-orange-700 truncate leading-tight">
                      {activeBranch?.name || 'Şube Seç'}
                    </span>
                    {branches.length > 1 && (
                      <ChevronDown className={`w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-orange-500 flex-shrink-0 transition-transform ${showBranchMenu ? 'rotate-180' : ''}`} />
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

              <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 py-1.5 sm:px-2.5 md:px-3 bg-slate-50 rounded-lg max-w-[44px] sm:max-w-[160px] md:max-w-[240px] min-w-0 flex-shrink overflow-hidden" title={userLabel}>
                <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <div className="min-w-0 hidden sm:block">
                  <p className="text-xs md:text-sm font-medium text-slate-700 truncate">{userLabel}</p>
                  <p className="text-[10px] md:text-xs text-slate-500 truncate">{roleLabels[profile?.role || ''] || profile?.role}</p>
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
                className="hidden sm:inline-flex p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Destek"
              >
                <HeadphonesIcon className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              <button
                onClick={onOpenSettings}
                className="hidden sm:inline-flex p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Ayarlar"
              >
                <Settings className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              {/* Arayuz olcegi (her ortamda calisir, kalicidir). */}
              <div className="hidden md:flex items-center gap-1 bg-slate-100 rounded-lg px-1 py-1">
                <button
                  onClick={() => changeZoom(-UI_SCALE_STEP)}
                  disabled={zoom <= UI_SCALE_MIN + 0.001}
                  className="p-1.5 rounded hover:bg-slate-200 transition-all active:scale-95 text-slate-600 disabled:opacity-40"
                  title="Arayüzü küçült"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => resetUiScale()}
                  className="text-xs font-bold text-slate-600 w-12 text-center hover:bg-slate-200 rounded py-1 active:scale-95"
                  title="%100'e döndür"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  onClick={() => changeZoom(UI_SCALE_STEP)}
                  disabled={zoom >= UI_SCALE_MAX - 0.001}
                  className="p-1.5 rounded hover:bg-slate-200 transition-all active:scale-95 text-slate-600 disabled:opacity-40"
                  title="Arayüzü büyüt"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* Tam Ekran POS — ust meunyu gizler, kalicidir. Sadece masaustu. */}
              <button
                onClick={() => setHeaderHidden(true)}
                className="hidden md:inline-flex p-1.5 md:p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-all active:scale-95"
                title="Tam Ekran POS modu (üst menüyü gizle)"
              >
                <Minimize2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>

              <button
                onClick={() => {
                  if (shiftsEnabled && canUseShifts && activeShift) {
                    const ok = window.confirm(
                      `Açık vardiyanız var (${activeShift.shift_name}).\n\nÖnce vardiyayı bitirmek ister misiniz?\n\n• TAMAM: Vardiyamı bitir penceresini aç\n• İPTAL: Vardiyayı açık bırakıp çık`,
                    );
                    if (ok) {
                      onOpenShifts && onOpenShifts();
                      return;
                    }
                  }
                  signOut();
                }}
                className="flex items-center gap-1 md:gap-2 text-white bg-gradient-to-r from-red-600 to-red-700 px-2 py-1.5 md:px-4 md:py-2 rounded-lg hover:shadow-lg transition-all active:scale-95 flex-shrink-0"
                title="Çıkış"
              >
                <LogOut className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline text-xs md:text-sm font-medium">Çıkış</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {showTrialInfo && tenant && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowTrialInfo(false)}
          />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 px-6 py-7 text-white text-center relative">
                <button
                  onClick={() => setShowTrialInfo(false)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-white/20 transition"
                  title="Kapat"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur mb-3 ring-4 ring-white/20">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-black tracking-tight">Değerli Müşterimiz</h3>
                <p className="text-white/90 text-sm mt-1">
                  Hesabınız ŞefPOS&apos;a başarıyla kaydedildi.
                </p>
              </div>

              <div className="p-6">
                <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Kayıt Bilgileri
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Firma</span>
                      <span className="font-bold text-slate-800 text-right truncate">
                        {tenant.name}
                      </span>
                    </div>
                    {profile?.full_name && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Yetkili</span>
                        <span className="font-semibold text-slate-700 text-right truncate">
                          {profile.full_name}
                        </span>
                      </div>
                    )}
                    {(tenant as any)?.email && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">E-posta</span>
                        <span className="font-semibold text-slate-700 text-right truncate">
                          {(tenant as any).email}
                        </span>
                      </div>
                    )}
                    {(tenant as any)?.created_at && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Kayıt Tarihi</span>
                        <span className="font-semibold text-slate-700">
                          {new Date((tenant as any).created_at).toLocaleDateString('tr-TR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 pt-1.5 mt-1.5 border-t border-slate-200">
                      <span className="text-slate-500">Deneme Durumu</span>
                      <span
                        className={`font-extrabold ${
                          trialInfo.expired ? 'text-red-600' : 'text-orange-600'
                        }`}
                      >
                        {trialInfo.expired
                          ? 'Süre doldu'
                          : `${formatTrialRemaining(trialInfo)} kaldı`}
                      </span>
                    </div>
                    {trialInfo.endDate && !trialInfo.expired && (
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Bitiş</span>
                        <span className="font-semibold text-slate-700">
                          {trialInfo.endDate.toLocaleDateString('tr-TR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-600 leading-relaxed text-center mb-5">
                  Tüm ŞefPOS modüllerini ücretsiz deneme süresi boyunca sınırsız
                  kullanabilirsiniz. Süre sonunda hizmet kesintisiz devam etsin
                  diye bir paket seçmek ister misiniz?
                </p>

                <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/60 p-4">
                  <p className="text-xs font-bold text-orange-700 uppercase tracking-wider text-center mb-3">
                    Paket bilgisi için iletişim
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href="tel:+905442449080"
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs md:text-sm transition active:scale-95"
                    >
                      <Phone className="w-4 h-4" />
                      0544 244 90 80
                    </a>
                    <a
                      href={`mailto:bilgi@sefpos.com.tr?subject=${encodeURIComponent(
                        'ŞefPOS Paket Bilgisi',
                      )}&body=${encodeURIComponent(
                        `Merhaba,\n\nFirma: ${tenant.name}\nYetkili: ${
                          profile?.full_name || ''
                        }\n\nPaket bilgisi almak istiyorum.`,
                      )}`}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs md:text-sm transition active:scale-95"
                    >
                      <Mail className="w-4 h-4" />
                      bilgi@sefpos.com.tr
                    </a>
                  </div>
                </div>

                <button
                  onClick={() => setShowTrialInfo(false)}
                  className="w-full mt-4 py-2.5 text-slate-500 hover:text-slate-700 font-semibold text-sm transition"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

interface ShiftBadgeProps {
  activeShift: ReturnType<typeof useActiveShift>['activeShift'];
  dayLocked: boolean;
  onClick?: () => void;
}
function ShiftBadge({ activeShift, dayLocked, onClick }: ShiftBadgeProps) {
  if (dayLocked && !activeShift) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Gün kapatıldı — Vardiyalar"
        className="hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 border border-amber-200 transition active:scale-95"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-inner">
          <Lock className="w-3 h-3" />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Gün Kapalı</span>
      </button>
    );
  }
  if (!activeShift) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Aktif vardiya yok — Vardiyalar sayfasını aç"
        className="hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 transition active:scale-95"
      >
        <span className="w-6 h-6 rounded-full bg-gradient-to-br from-rose-500 to-orange-600 text-white flex items-center justify-center shadow-inner animate-pulse">
          <PlayCircle className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-rose-700">Vardiya Yok</span>
      </button>
    );
  }
  const Icon = shiftIcon(activeShift.shift_no);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${activeShift.shift_name} • ${activeShift.opener_full_name || ''} • ${shiftDurationLabel(activeShift.opened_at)}`}
      className="hidden sm:inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition active:scale-95"
    >
      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-inner">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="flex items-baseline gap-1.5 leading-none">
        <span className="text-[9px] uppercase tracking-[0.12em] font-bold text-emerald-600">Vardiya</span>
        <span className="text-xs md:text-sm font-extrabold text-emerald-800 whitespace-nowrap">
          {activeShift.shift_name.replace(' Vardiyasi', '').replace(' Vardiyası', '')}
        </span>
      </span>
    </button>
  );
}
