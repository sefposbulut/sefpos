import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { isAykaAdminPath } from './lib/aykaRoute';
import { canAccessAdminPanel, clearAykaSessionFlag } from './lib/adminAccess';
import { Auth } from './components/Auth';
import { AykaLogin } from './components/AykaLogin';
import { ElectronAuth } from './components/ElectronAuth';
import { ElectronConnectionMenu, type ElectronConnectMode } from './components/electron/ElectronConnectionMenu';
import { ElectronDesktopHome } from './components/electron/ElectronDesktopHome';
import { preloadElectronHomeData } from './lib/electronDashboardData';
import { setActivePosPage } from './lib/pageActivity';
import { purgeColdMountedPages, shouldRenderPosPage } from './lib/posPageMount';
import { setDiagnosticsMountedPages } from './lib/resourceDiagnostics';
import { ActiveShiftProvider } from './contexts/ActiveShiftContext';
import { registerPosStressHooks } from './lib/posStressBridge';
import { SqlServerSettings } from './components/SqlServerSettings';
import { LandingPage } from './components/landing/LandingPage';
import { isLandingPath } from './components/landing/landingRoutes';
import { CourierApp } from './components/CourierApp';
import { WaiterApp } from './components/WaiterApp';
import { Header } from './components/Header';
import { MainMenu } from './components/MainMenu';
import { TableGrid } from './components/TableGrid';
import { OrderPanel } from './components/OrderPanel';
import { Products } from './components/Products';
import { Settings } from './components/Settings';
import { CashRegister } from './components/CashRegister';
import { UserManagement } from './components/UserManagement';
import { OnlineOrders } from './components/OnlineOrders';
import { TakeawayOrders } from './components/TakeawayOrders';
import { OnboardingWizard } from './components/OnboardingWizard';
import { TrialExpiredOverlay } from './components/TrialExpiredOverlay';
import { getTrialInfo } from './lib/tenantTrial';
import { AdminPanel } from './components/AdminPanel';
import { Customers } from './components/customers/Customers';
import { LoyaltyPage } from './components/loyalty/LoyaltyPage';
import { EndOfDay } from './components/EndOfDay';
import { Reports } from './components/reports/Reports';
import { primeReportsStockCountTab } from './lib/reportsNav';
import { CancelLogs } from './components/CancelLogs';
import { PinLockScreen } from './components/PinLockScreen';
import { Inventory } from './components/inventory/Inventory';
import { ProductStockCount } from './components/inventory/ProductStockCount';
import { QuickSale } from './components/QuickSale';
import { ShiftManager } from './components/ShiftManager';
import { ShiftAutoStartPrompt } from './components/ShiftAutoStartPrompt';
import { ShiftQuickClose } from './components/ShiftQuickClose';
import { useUiPrefs, setHeaderHidden } from './lib/uiPrefs';
import { Maximize2, Menu as MenuIcon } from 'lucide-react';
import { Database, supabase } from './lib/supabase';
import { isSqlServerMode } from './lib/sqlDb';
import { isSqlOnlineOnlyPage, sqlOnlineOnlyPageMessage } from './lib/sqlServerCompat';
import { queryCache } from './lib/queryCache';
import { SystemNotificationContainer } from './components/SystemNotificationBanner';
import {
  fetchSupportNotifications,
  getDismissedIds,
  isNotificationUnread,
} from './lib/supportNotifications';
import { processWipeLocalNotification, shouldAutoProcessWipeLocal } from './lib/remoteWipe';
import { OnlineOrderToast } from './components/OnlineOrderToast';
import { GlobalGetirSync } from './components/GlobalGetirSync';
import { PrintStatusToast } from './components/PrintStatusToast';
import { TerminalLogin, TerminalApp, isTerminalMode, exitTerminalMode } from './components/TerminalMode';
import { isCapacitorNative } from './lib/capacitorPlatform';
import { BrandSplash } from './components/BrandSplash';

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: string;
}

type Table = Database['public']['Tables']['restaurant_tables']['Row'];

function readInitialElectronDbMode(): 'cloud' | 'sqlserver' | null {
  if (!(window as Window & { electronAPI?: unknown }).electronAPI) return null;
  try {
    const saved = localStorage.getItem('dbMode');
    if (saved === 'sqlserver' || saved === 'cloud') return saved;
  } catch {
    /* ignore */
  }
  return null;
}

const isCourierMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('courier') || !!localStorage.getItem('shefpos_courier_session');
};

const isWaiterAppRoute = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('waiter') || params.has('garson') || !!localStorage.getItem('waiter_session');
};

// UpdateBanner kaldırıldı — ElectronDesktopShell (main.tsx, AuthProvider altinda)
// dinamik pencere başlığı + auto-update bildirimi işlevini yapıyor.

export default function App() {
  const [courierMode, setCourierMode] = useState(isCourierMode);
  const [terminalSetup, setTerminalSetup] = useState<'login' | 'app' | null>(() => {
    if (isTerminalMode()) return 'app';
    if (localStorage.getItem('shefpos_pending_terminal') === 'true') return 'login';
    return null;
  });

  const isElectron = useMemo(() => !!(window as any).electronAPI, []);
  const uiPrefs = useUiPrefs();
  // POS modu (Tam Ekran / Header gizle) sadece masaustu (md+) icin etkin.
  // Mobilde zaten alan dar ve farkli optimizasyonlar var; orada Header
  // kalmali. Pencere kuculunce otomatik devre disi kalir.
  const [isDesktopViewport, setIsDesktopViewport] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Web: arayuz olcegi rem ile (CSS zoom modal/vh bozar). Electron: preload setZoomFactor.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isElectron) {
      document.documentElement.style.removeProperty('--sefpos-ui-scale');
      return;
    }
    document.documentElement.style.setProperty('--sefpos-ui-scale', String(uiPrefs.uiScale));
  }, [isElectron, uiPrefs.uiScale]);

  // Browser autoplay policy: AudioContext yalnizca kullanici etkilesimi
  // sonrasi ses calabilir. Ilk tiklamasinda audio'yu unlock et ki online
  // sipariş alarmi sessiz kalmasin.
  useEffect(() => {
    let cancelled = false;
    void import('./lib/notification').then((m) => {
      if (cancelled) return;
      m.installAudioUnlockOnInteraction();
    });
    return () => { cancelled = true; };
  }, []);
  const { user, profile, tenant, loading, refreshProfile, activeBranch, signOut, profileLoadFailed } = useAuth();
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentPage, setCurrentPage] = useState(() =>
    !!(window as any).electronAPI ? 'desktop-home' : 'tables',
  );
  // Tenant'ın "Masalar" modülü kapalıysa açılış sayfası olarak ilk uygun
  // modülü seç (hızlı satış / paket servis / vs.). Bu sayede sadece "Hızlı
  // Satış" kullanan müşteri girer girmez doğru ekrana düşer.
  useEffect(() => {
    if (!tenant) return;
    const disabled = Array.isArray((tenant as any).disabled_modules)
      ? new Set<string>((tenant as any).disabled_modules as string[])
      : new Set<string>();
    if (currentPage === 'tables' && disabled.has('tables')) {
      const fallback = ['quick-sale', 'takeaway', 'online-orders', 'products', 'reports']
        .find((m) => !disabled.has(m));
      if (fallback) setCurrentPage(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);
  const [showShiftQuickClose, setShowShiftQuickClose] = useState(false);
  const [dbMode, setDbMode] = useState<'cloud' | 'sqlserver' | null>(readInitialElectronDbMode);
  // Sıcak yol (masa/paket/online): bir kez açılınca display:none ile saklanır.
  // Soğuk sayfalar (stok, rapor, gün sonu…): çıkınca unmount — gizli poll/kanal birikmez.
  // Web: yalnızca masalar önceden mount — online/paket ilk tıklamada açılır (gizli yük azalır).
  const mountedPagesRef = useRef<Set<string>>(
    new Set(isElectron ? ['desktop-home'] : ['tables']),
  );
  const [mountedPagesVersion, setMountedPagesVersion] = useState(0);
  useEffect(() => {
    if (!currentPage) return;
    mountedPagesRef.current.add(currentPage);
    purgeColdMountedPages(mountedPagesRef.current, currentPage);
    setMountedPagesVersion((v) => v + 1);
  }, [currentPage]);

  /** Electron: yalnızca masalar geç yüklenir; paket ilk tıklamada mount (arka planda CID/realtime şişmesin). */
  useEffect(() => {
    if (!isElectron || !tenant?.id || !user) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      mountedPagesRef.current.add('tables');
      setMountedPagesVersion((v) => v + 1);
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [isElectron, tenant?.id, user?.id]);
  useEffect(() => {
    setActivePosPage(currentPage);
  }, [currentPage]);

  useEffect(() => {
    setDiagnosticsMountedPages([...mountedPagesRef.current]);
  }, [currentPage, mountedPagesVersion]);
  const [sqlServerConfigured, setSqlServerConfigured] = useState(false);
  const [showSqlServerSettings, setShowSqlServerSettings] = useState(false);
  // /login veya AYKA_ADMIN_PATH açıkken Auth tam sayfa (modal değil).
  // DEV ortamında localhost / kökünde de doğrudan login’e yönlendirilir.
  const isAuthRoutePath = (p: string): boolean =>
    p.startsWith('/login') || isAykaAdminPath(p);

  const [showLoginPage, setShowLoginPage] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const path = (window.location.pathname || '/').toLowerCase();
      if (isAuthRoutePath(path)) return true;
      const host = window.location.hostname;
      const isLocalHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host.endsWith('.local');
      // Yerel geliştirme: kök URL pazarlama değil, giriş / POS
      if (import.meta.env.DEV && isLocalHost && path === '/') return true;
      if (isLandingPath(path)) return false;
      const params = new URLSearchParams(window.location.search);
      if (params.has('landing')) return false;
    } catch {
      /* ignore */
    }
    return false;
  });

  const goToLogin = useCallback(() => {
    try {
      const path = (window.location.pathname || '/').toLowerCase();
      if (!isAuthRoutePath(path)) {
        window.history.pushState({}, '', '/login');
      }
    } catch {
      /* ignore */
    }
    setShowLoginPage(true);
  }, []);

  const goToLanding = useCallback(() => {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      /* ignore */
    }
    setShowLoginPage(false);
  }, []);

  // Tarayıcı geri/ileri tuşlarıyla URL değişince login/landing geçişi
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const path = (window.location.pathname || '/').toLowerCase();
      setShowLoginPage(isAuthRoutePath(path));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [onboardingDone, setOnboardingDone] = useState(() => {
    return localStorage.getItem('onboarding_dismissed') === 'true';
  });
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const tableRefreshRef = useRef<(() => void) | null>(null);

  
  useEffect(() => {
    if (!isElectron) {
      setDbMode(null);
      return;
    }
    const api = (window as any).electronAPI;
    void Promise.race([
      api.getDbMode?.() ?? Promise.resolve(null),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 600)),
    ])
      .then(async (mode: 'cloud' | 'sqlserver' | null) => {
        if (mode === 'sqlserver') {
          localStorage.setItem('dbMode', 'sqlserver');
          setDbMode('sqlserver');
        } else if (mode === 'cloud') {
          localStorage.setItem('dbMode', 'cloud');
          setDbMode('cloud');
        } else if (mode === null) {
          const saved = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | null;
          if (saved === 'sqlserver' || saved === 'cloud') setDbMode(saved);
        }
        const effectiveMode =
          mode === 'sqlserver'
            ? 'sqlserver'
            : (localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | null);
        if (effectiveMode === 'sqlserver') {
          try {
            const cfg = await api.getSqlServerConfig?.();
            const isConfigured = !!(cfg?.host && cfg?.username);
            setSqlServerConfigured(isConfigured);
            if (!isConfigured) setShowSqlServerSettings(true);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        /* localStorage ile zaten acildi */
      });
  }, [isElectron]);

  const showNewNotification = useCallback((n: { id: string; title: string; message: string; type: string }) => {
    if (seenNotifIds.current.has(n.id)) return;
    seenNotifIds.current.add(n.id);
    setSystemNotifications(prev => [...prev, { id: n.id, title: n.title, message: n.message, type: n.type || 'info' }]);
  }, []);

  useEffect(() => {
    if (!tenant?.id) return;
    void queryCache.hydrateForTenant(tenant.id);
  }, [tenant?.id]);

  /** Electron ana sayfa verisi masalar ekranina gecmeden once yuklensin (cache). */
  useEffect(() => {
    if (!isElectron || !tenant?.id || !activeBranch?.id) return;
    preloadElectronHomeData(tenant.id, activeBranch.id);
  }, [isElectron, tenant?.id, activeBranch?.id, dbMode]);

  useEffect(() => {
    if (!tenant || !user) return;

    const channel = supabase
      .channel(`system-notifs-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_notifications',
      }, (payload) => {
        const n = payload.new as any;
        if (n.tenant_id && n.tenant_id !== tenant.id) return;
        if (n.type === 'revoke') return;
        if (n.type === 'wipe_local') {
          if (shouldAutoProcessWipeLocal(n, 'realtime')) {
            void processWipeLocalNotification(n);
          }
          return;
        }
        showNewNotification(n);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Kanal baglanmadan hemen once gelen bildirimleri kacirmamak icin kisa pencere
          const since = new Date(Date.now() - 60_000).toISOString();
          const rows = await fetchSupportNotifications(tenant.id, 20);
          const dismissed = getDismissedIds(tenant.id);
          rows
            .filter(
              (n) =>
                n.created_at >= since &&
                isNotificationUnread(n, tenant.id, dismissed),
            )
            .reverse()
            .forEach((n) => {
              if (n.type === 'wipe_local') {
                if (shouldAutoProcessWipeLocal(n, 'catchup')) {
                  void processWipeLocalNotification(n);
                }
                return;
              }
              showNewNotification(n);
            });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant, user, showNewNotification]);

  const handleTableGridRefresh = useCallback((fn: () => void) => {
    tableRefreshRef.current = fn;
  }, []);

  const handleNavigate = useCallback((page: string) => {
    if (page === 'cashier') {
      setShowCashRegister(true);
      return;
    }
    if (isSqlOnlineOnlyPage(page)) {
      window.alert(sqlOnlineOnlyPageMessage(page));
      return;
    }
    if (page === 'reports-stock-count') {
      primeReportsStockCountTab();
      setCurrentPage('reports');
      return;
    }
    setCurrentPage(page);
  }, []);

  useEffect(() => {
    const onSefposNavigate = (e: Event) => {
      const detail = (e as CustomEvent<{ page?: string }>).detail;
      if (detail?.page) handleNavigate(detail.page);
    };
    window.addEventListener('sefpos-navigate', onSefposNavigate as EventListener);
    return () => window.removeEventListener('sefpos-navigate', onSefposNavigate as EventListener);
  }, [handleNavigate]);

  useEffect(() => {
    registerPosStressHooks({
      navigate: (page) => handleNavigate(page),
      premount: (pages) => {
        for (const p of pages) mountedPagesRef.current.add(p);
        setMountedPagesVersion((v) => v + 1);
      },
      getMountedPages: () => [...mountedPagesRef.current],
    });
    return () => registerPosStressHooks(null);
  }, [handleNavigate]);

  const handleDbModeSelect = async (mode: ElectronConnectMode) => {
    if (mode === 'terminal') {
      localStorage.setItem('shefpos_pending_terminal', 'true');
      setTerminalSetup('login');
      return;
    }
    const api = (window as any).electronAPI;
    await api?.setDbMode?.(mode);

    if (mode === 'local') {
      localStorage.setItem('dbMode', 'local');
      setDbMode('cloud');
      return;
    }
    if (mode === 'sqlserver' || mode === 'postgres') {
      localStorage.setItem('dbMode', mode);
      setDbMode('sqlserver');
      setSqlServerConfigured(false);
      setShowSqlServerSettings(true);
      return;
    }
    localStorage.removeItem('dbMode');
    setDbMode('cloud');
  };

  if (terminalSetup === 'login') {
    return (
      <TerminalLogin
        onBack={() => {
          localStorage.removeItem('shefpos_pending_terminal');
          setTerminalSetup(null);
        }}
        onConnected={() => {
          localStorage.removeItem('shefpos_pending_terminal');
          setTerminalSetup('app');
          window.location.reload();
        }}
      />
    );
  }

  if (terminalSetup === 'app' && isTerminalMode()) {
    return (
      <TerminalApp
        onExit={() => {
          exitTerminalMode();
          setTerminalSetup(null);
          window.location.reload();
        }}
      />
    );
  }

  if (courierMode) {
    return <CourierApp onExit={() => {
      localStorage.removeItem('shefpos_courier_session');
      const url = new URL(window.location.href);
      url.searchParams.delete('courier');
      window.history.replaceState({}, '', url.toString());
      setCourierMode(false);
    }} />;
  }

  if (isElectron && dbMode === null) {
    return <ElectronConnectionMenu onSelect={handleDbModeSelect} />;
  }

  if (isElectron && dbMode === 'sqlserver' && (showSqlServerSettings || !sqlServerConfigured)) {
    return (
      <SqlServerSettings
        showBack={true}
        onBack={() => {
          setDbMode(null);
          setSqlServerConfigured(false);
          setShowSqlServerSettings(false);
          const api = (window as any).electronAPI;
          api?.setDbMode(null);
        }}
        onSave={() => {
          setSqlServerConfigured(true);
          setShowSqlServerSettings(false);
        }}
        onClose={() => {
          setSqlServerConfigured(true);
          setShowSqlServerSettings(false);
        }}
      />
    );
  }

  const sessionRestoring = loading && !profile;
  if (sessionRestoring) {
    return <BrandSplash hint="Oturum açılıyor…" compact />;
  }

  if (
    user &&
    profile &&
    (profile.role === 'waiter' || isWaiterAppRoute())
  ) {
    return (
      <WaiterApp
        onLogout={async () => {
          try {
            localStorage.removeItem('waiter_session');
          } catch {
            /* ignore */
          }
          const url = new URL(window.location.href);
          url.searchParams.delete('waiter');
          url.searchParams.delete('garson');
          window.history.replaceState({}, '', url.toString());
          await signOut();
          window.location.assign('/login?waiter=1');
        }}
      />
    );
  }

  if (user && !profile && profileLoadFailed) {
    const api = (window as any).electronAPI;
    const handleRecovery = async () => {
      await signOut();
      if (api?.setDbMode) {
        api.setDbMode(null);
        localStorage.removeItem('dbMode');
      }
      window.location.reload();
    };
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)' }}>
        <p className="text-white text-base font-medium">Profil yuklenemedi</p>
        <p className="text-slate-400 text-sm">Sunucuya baglanamadi veya hesap bulunamadi.</p>
        <button
          onClick={handleRecovery}
          className="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Cikis yap ve tekrar giris yap
        </button>
      </div>
    );
  }

  if (!user && !profile) {
    if (isElectron) {
      return (
        <ElectronAuth
          onSwitchMode={() => {
            const api = (window as any).electronAPI;
            api?.setDbMode?.(null);
            localStorage.removeItem('dbMode');
            setDbMode(null);
          }}
          currentDbMode={
            (localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'postgres' | 'local' | null) ||
            (dbMode as 'cloud' | 'sqlserver' | null)
          }
        />
      );
    }
    if (isCapacitorNative()) {
      // Garson APK / iOS: aynı WaiterLogin bileşeni, mobilde "Garson" ile açılan ekran
      return <Auth />;
    }
    if (showLoginPage) {
      // Gizli lisans paneli yolu (src/lib/aykaRoute.ts) — ayrı login ekranı.
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (isAykaAdminPath(path)) {
        return <AykaLogin onBackToLanding={goToLanding} />;
      }
      // /login → restoran kullanıcıları için genel giriş ekranı
      return <Auth onBackToLanding={goToLanding} />;
    }
    return <LandingPage onLogin={goToLogin} />;
  }

  const isAykaRoute =
    typeof window !== 'undefined' && isAykaAdminPath(window.location.pathname);

  if (user && profile && isAykaRoute) {
    if (canAccessAdminPanel(profile, { isAykaRoute: true })) {
      return (
        <AdminPanel
          onExit={() => {
            setShowAdminPanel(false);
            clearAykaSessionFlag();
            void signOut();
            window.location.assign('/');
          }}
        />
      );
    }
    if (profile.is_super_admin) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-xl font-black">Yetkisiz erişim</h1>
            <p className="text-slate-300 text-sm">
              Bu hesap lisans paneline erişemez. Yalnızca yetkili kurucu hesabı ve gizli giriş yolu kullanılabilir.
            </p>
            <button
              type="button"
              onClick={() => {
                clearAykaSessionFlag();
                void signOut();
              }}
              className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-sm"
            >
              Çıkış
            </button>
          </div>
        </div>
      );
    }
  }

  const needsOnboarding = user && tenant && profile?.role === 'owner' && (tenant.onboarding_completed === false || tenant.onboarding_completed === null) && !onboardingDone;
  if (needsOnboarding || showOnboarding) {
    return <OnboardingWizard onComplete={async () => {
      localStorage.setItem('onboarding_dismissed', 'true');
      setOnboardingDone(true);
      setShowOnboarding(false);
      await refreshProfile();
    }} />;
  }

  // Trial bittiyse super_admin / aykasoft hesaplari haric tum app erisimi engelle.
  // - Onboarding tamamlanmadan ekran gosterilmez (ust adim daha onemli).
  // - Lisans aktif edildiginde (subscription_status: active/expired ise plan != trial)
  //   bu blok otomatik kapanir.
  const trialInfo = getTrialInfo(tenant);
  const isAdminRole = profile?.role === 'super_admin';
  if (trialInfo.expired && tenant && !isAdminRole) {
    return <TrialExpiredOverlay />;
  }

  const show = (page: string) => currentPage === page;
  const shouldRenderPage = (page: string) =>
    shouldRenderPosPage(page, currentPage, mountedPagesRef.current);
  const onElectronHome = isElectron && currentPage === 'desktop-home';

  // Mobilde efektif olarak her zaman header acik.
  const headerHidden = (uiPrefs.headerHidden && isDesktopViewport) || onElectronHome;

  return (
    <ActiveShiftProvider>
    <div
      className="min-h-screen bg-slate-50"
      data-header-hidden={headerHidden ? 'true' : 'false'}
    >
      {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}

      {!headerHidden && (
        <Header
          onOpenSettings={() => setShowSettings(true)}
          onOpenOnboarding={() => setShowOnboarding(true)}
          currentPage={currentPage}
          onBackToTables={() => {
            setSelectedTable(null);
            handleNavigate(isElectron ? 'desktop-home' : 'tables');
          }}
          onOpenShifts={() => setShowShiftQuickClose(true)}
        />
      )}

      {onElectronHome && (
        <ElectronDesktopHome
          onNavigate={handleNavigate}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* Header gizliyken geri acma — Electron masalar vb.; ana sayfada ElectronDesktopHome kendi barini kullanir */}
      {headerHidden && !onElectronHome && (
        <div className="fixed bottom-3 right-3 z-[60] flex items-center gap-2">
          {isElectron ? (
            <button
              type="button"
              onClick={() => handleNavigate('desktop-home')}
              title="Ana sayfa"
              aria-label="Ana sayfa"
              className="group inline-flex items-center gap-1.5 h-11 pl-2.5 pr-3 rounded-full bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-2xl ring-1 ring-white/10 active:scale-95 transition-all"
            >
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <MenuIcon className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black tracking-wide max-w-0 overflow-hidden opacity-0 group-hover:max-w-[72px] group-hover:opacity-100 group-hover:ml-0.5 transition-all duration-200 whitespace-nowrap">
                ANA SAYFA
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('sefpos-open-main-menu'))}
              title="Menü"
              aria-label="Menü"
              className="group inline-flex items-center gap-1.5 h-11 pl-2.5 pr-3 rounded-full bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white shadow-2xl ring-1 ring-white/10 active:scale-95 transition-all"
            >
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <MenuIcon className="w-4 h-4" />
              </span>
              <span className="text-[11px] font-black tracking-wide max-w-0 overflow-hidden opacity-0 group-hover:max-w-[60px] group-hover:opacity-100 group-hover:ml-0.5 transition-all duration-200 whitespace-nowrap">
                MENÜ
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setHeaderHidden(false)}
            title="Üst menüyü göster"
            aria-label="Üst menüyü göster"
            className="group inline-flex items-center gap-1.5 h-11 pl-2.5 pr-3 rounded-full bg-slate-900/90 hover:bg-slate-900 text-white shadow-2xl backdrop-blur ring-1 ring-white/10 active:scale-95 transition-all"
          >
            <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
              <Maximize2 className="w-4 h-4" />
            </span>
            <span className="text-[11px] font-bold tracking-wide whitespace-nowrap px-0.5">
              ÜST MENÜ
            </span>
          </button>
        </div>
      )}

      <ShiftAutoStartPrompt />
      <ShiftQuickClose open={showShiftQuickClose} onClose={() => setShowShiftQuickClose(false)} />
      <MainMenu
        onNavigate={handleNavigate}
        currentPage={currentPage}
        onOpenSettings={() => setShowSettings(true)}
        onLockScreen={() => setIsLocked(true)}
      />

      {/* Sıcak yol: display:none ile saklanır. Soğuk sayfalar: çıkınca unmount. */}
      {shouldRenderPage('tables') && (
        <div
          style={{
            display: show('tables') ? undefined : 'none',
            overscrollBehaviorY: 'contain',
            WebkitOverflowScrolling: 'touch',
          }}
          className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto"
        >
          <div className="p-3 md:p-6">
            <TableGrid
              isActive={currentPage === 'tables'}
              onSelectTable={setSelectedTable}
              onRefresh={handleTableGridRefresh}
              onNavigate={handleNavigate}
            />
          </div>
        </div>
      )}

      {shouldRenderPage('takeaway') && (
        <div style={{ display: show('takeaway') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
          <TakeawayOrders isActive={currentPage === 'takeaway'} />
        </div>
      )}

      {shouldRenderPage('online-orders') && (
        <div style={{ display: show('online-orders') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
          <OnlineOrders isActive={currentPage === 'online-orders'} />
        </div>
      )}

      {shouldRenderPage('products') && (
        <div className="fixed inset-0 top-14 md:top-20 overflow-hidden">
          <Products isActive />
        </div>
      )}

      {shouldRenderPage('product-stock-count') && (
        <div
          style={{ display: show('product-stock-count') ? undefined : 'none' }}
          className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto min-h-0"
        >
          <ProductStockCount />
        </div>
      )}

      {shouldRenderPage('users') && (
        <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
          <div className="p-3 md:p-6 max-w-7xl mx-auto">
            <UserManagement />
          </div>
        </div>
      )}

      {shouldRenderPage('customers') && (
        <div
          style={{ display: show('customers') ? undefined : 'none' }}
          className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden"
        >
          <Customers isActive={currentPage === 'customers'} />
        </div>
      )}

      {shouldRenderPage('loyalty') && (
        <div
          style={{ display: show('loyalty') ? undefined : 'none' }}
          className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden"
        >
          <LoyaltyPage
            isActive={currentPage === 'loyalty'}
            onBack={() => setCurrentPage(isElectron ? 'desktop-home' : 'tables')}
          />
        </div>
      )}

      {shouldRenderPage('reports') && (
        <div>
          <Reports isActive />
        </div>
      )}

      {shouldRenderPage('endofday') && (
        <div>
          <EndOfDay isActive />
        </div>
      )}

      {shouldRenderPage('cancel-logs') && (
        <div style={{ display: show('cancel-logs') ? undefined : 'none' }}>
          <CancelLogs onClose={() => setCurrentPage(isElectron ? 'desktop-home' : 'tables')} />
        </div>
      )}

      {shouldRenderPage('inventory') && (
        <div
          style={{ display: show('inventory') ? undefined : 'none' }}
          className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden"
        >
          <Inventory />
        </div>
      )}

      {shouldRenderPage('quick-sale') && (
        <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
          <QuickSale isActive />
        </div>
      )}

      {shouldRenderPage('shifts') && (
        <div>
          <ShiftManager />
        </div>
      )}

      {selectedTable && (
        <OrderPanel
          table={selectedTable}
          onClose={() => {
            setSelectedTable(null);
          }}
          onAfterMergeNavigate={(destinationTable) => {
            setSelectedTable(destinationTable as any);
          }}
        />
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}

      {showCashRegister && (
        <CashRegister onClose={() => setShowCashRegister(false)} />
      )}

      <SystemNotificationContainer
        notifications={systemNotifications}
        onDismiss={(id) => setSystemNotifications(prev => prev.filter(n => n.id !== id))}
      />
      <GlobalGetirSync />
      <OnlineOrderToast
        onOpenOnlineOrders={() => handleNavigate('online-orders')}
        currentPage={currentPage}
      />
      <PrintStatusToast />
    </div>
    </ActiveShiftProvider>
  );
}
