import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { isAykaAdminPath } from './lib/aykaRoute';
import { canAccessAdminPanel, clearAykaSessionFlag } from './lib/adminAccess';
import { Auth } from './components/Auth';
import { ElectronAuth } from './components/ElectronAuth';
import { ElectronConnectionMenu, type ElectronConnectMode } from './components/electron/ElectronConnectionMenu';
import { ElectronSetupWizard } from './components/electron/ElectronSetupWizard';
import { ElectronDesktopHome } from './components/electron/ElectronDesktopHome';
import { setActivePosPage } from './lib/pageActivity';
import { purgeMountedPagesForSession, shouldRenderPosPage } from './lib/posPageMount';
import { setDiagnosticsMountedPages } from './lib/resourceDiagnostics';
import { ActiveShiftProvider } from './contexts/ActiveShiftContext';
import { registerPosStressHooks } from './lib/posStressBridge';
import { SqlServerSettings } from './components/SqlServerSettings';
import { isLandingPath } from './components/landing/landingRoutes';
import { Header } from './components/Header';
import { MainMenu } from './components/MainMenu';
import { TableGrid } from './components/TableGrid';
import { OrderPanel } from './components/OrderPanel';
import { OnlineOrders } from './components/OnlineOrders';
import { TakeawayOrders } from './components/TakeawayOrders';
import { TrialExpiredOverlay } from './components/TrialExpiredOverlay';
import {
  LazyAdminPanel,
  LazyAykaLogin,
  LazyCancelLogs,
  LazyCashRegister,
  LazyCourierApp,
  LazyCustomers,
  LazyEndOfDay,
  LazyInventory,
  LazyLandingPage,
  LazyLoyaltyPage,
  LazyOnboardingWizard,
  LazyProductStockCount,
  LazyProducts,
  LazyQuickSale,
  LazyReports,
  LazySettings,
  LazyShiftManager,
  LazyUserManagement,
  LazyWaiterApp,
  PosPageSuspense,
} from './lib/lazyPosPages';
import { ShiftAutoStartPrompt } from './components/ShiftAutoStartPrompt';
import { ShiftQuickClose } from './components/ShiftQuickClose';
import { getTrialInfo } from './lib/tenantTrial';
import { getLicenseInfo } from './lib/licenseDisplay';
import { primeReportsStockCountTab } from './lib/reportsNav';
import { PinLockScreen } from './components/PinLockScreen';
import { useUiPrefs, setHeaderHidden } from './lib/uiPrefs';
import { Maximize2, Menu as MenuIcon } from 'lucide-react';
import { Database, supabase } from './lib/supabase';
import { isSqlServerMode, isLocalMode, isHybridMode, persistElectronDbMode } from './lib/sqlDb';
import {
  isElectronSqlReady,
  isElectronSqlReadySync,
  isHybridCloudLinked,
  markSqlSetupComplete,
  activateElectronCloudMode,
} from './lib/hybridMode';
import { isSqlOnlineOnlyPage, sqlOnlineOnlyPageMessage } from './lib/sqlServerCompat';
import { queryCache } from './lib/queryCache';
import { SystemNotificationContainer } from './components/SystemNotificationBanner';
import { SUPPORT_NOTIF_BANNER_EVENT, type SupportNotifBannerDetail } from './lib/supportNotificationBridge';
import { OnlineOrderToast } from './components/OnlineOrderToast';
import { GlobalGetirSync } from './components/GlobalGetirSync';
import { GlobalHybridSync } from './components/GlobalHybridSync';
import { PrintStatusToast } from './components/PrintStatusToast';
import { TerminalLogin, TerminalApp } from './components/TerminalMode';
import { isTerminalMode, exitTerminalMode } from './lib/terminalMode';
import { isCapacitorNative } from './lib/capacitorPlatform';
import { BrandSplash } from './components/BrandSplash';

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: string;
}

type Table = Database['public']['Tables']['restaurant_tables']['Row'];

function readInitialElectronDbMode(): 'cloud' | 'sqlserver' | 'hybrid' | null {
  if (!(window as Window & { electronAPI?: unknown }).electronAPI) return null;
  try {
    const saved = localStorage.getItem('dbMode');
    if (saved === 'postgres') {
      localStorage.setItem('dbMode', 'sqlserver');
      return 'sqlserver';
    }
    if (saved === 'sqlserver' || saved === 'hybrid' || saved === 'cloud') return saved as 'cloud' | 'sqlserver' | 'hybrid';
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
  const headerTopOffset = isElectron ? 'top-14' : 'top-14 md:top-20';
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
  const [dbMode, setDbMode] = useState<'cloud' | 'sqlserver' | 'hybrid' | null>(readInitialElectronDbMode);
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
    purgeMountedPagesForSession(mountedPagesRef.current, currentPage, { electron: isElectron });
    setMountedPagesVersion((v) => v + 1);
  }, [currentPage, isElectron]);

  // Electron: masalar arka planda pre-mount yok — yalnizca kullanici Masalar'a gecince mount olur.
  useEffect(() => {
    setActivePosPage(currentPage);
  }, [currentPage]);

  useEffect(() => {
    setDiagnosticsMountedPages([...mountedPagesRef.current]);
  }, [currentPage, mountedPagesVersion]);
  const [sqlServerConfigured, setSqlServerConfigured] = useState(() => isElectronSqlReadySync());
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
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'system' | 'branches' | undefined
  >(undefined);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const SEEN_NOTIF_IDS_CAP = 500;
  const tableRefreshRef = useRef<(() => void) | null>(null);

  
  useEffect(() => {
    const onOpenSettingsTab = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      setShowSettings(true);
      if (tab === 'system') setSettingsInitialTab('system');
    };
    window.addEventListener('sefpos:open-settings-tab', onOpenSettingsTab);
    return () => window.removeEventListener('sefpos:open-settings-tab', onOpenSettingsTab);
  }, []);

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
      .then(async (mode: 'cloud' | 'sqlserver' | 'hybrid' | null) => {
        if (mode === 'sqlserver' || mode === 'hybrid') {
          persistElectronDbMode(mode);
          setDbMode(mode);
        } else if (mode === 'cloud') {
          persistElectronDbMode('cloud');
          setDbMode('cloud');
        } else if (mode === null) {
          const saved = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'hybrid' | null;
          if (saved === 'sqlserver' || saved === 'cloud' || saved === 'hybrid') {
            setDbMode(saved);
            persistElectronDbMode(saved);
          }
        }
        const effectiveMode =
          mode === 'sqlserver' || mode === 'hybrid'
            ? mode
            : (localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'hybrid' | null);
        if (effectiveMode === 'sqlserver' || effectiveMode === 'hybrid') {
          try {
            const ready = await isElectronSqlReady();
            setSqlServerConfigured(ready);
            if (!ready && !isHybridCloudLinked()) setShowSqlServerSettings(true);
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
    if (seenNotifIds.current.size > SEEN_NOTIF_IDS_CAP) {
      let drop = seenNotifIds.current.size - SEEN_NOTIF_IDS_CAP;
      for (const id of seenNotifIds.current) {
        seenNotifIds.current.delete(id);
        if (--drop <= 0) break;
      }
    }
    setSystemNotifications(prev => [...prev, { id: n.id, title: n.title, message: n.message, type: n.type || 'info' }]);
  }, []);

  useEffect(() => {
    if (!tenant?.id) return;
    void (async () => {
      const { APP_VERSION } = await import('./lib/appVersion');
      queryCache.bustMenuCacheIfAppVersionChanged(APP_VERSION, tenant.id);
      if (!isSqlServerMode()) {
        if (isElectron) {
          await new Promise((r) => window.setTimeout(r, 20_000));
        }
        await queryCache.hydrateForTenant(tenant.id);
      }
    })();
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant || !user || isSqlServerMode()) return;

    const onBanner = (e: Event) => {
      const detail = (e as CustomEvent<SupportNotifBannerDetail>).detail;
      if (!detail?.id) return;
      showNewNotification(detail);
    };

    window.addEventListener(SUPPORT_NOTIF_BANNER_EVENT, onBanner);
    return () => window.removeEventListener(SUPPORT_NOTIF_BANNER_EVENT, onBanner);
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
    if (mode === 'cloud') {
      await activateElectronCloudMode();
      setDbMode('cloud');
      return;
    }
    if (mode === 'sqlserver' || mode === 'postgres' || mode === 'hybrid') {
      const target = mode === 'hybrid' ? 'hybrid' : 'sqlserver';
      localStorage.setItem('dbMode', target);
      setDbMode(target);
      const ready = await isElectronSqlReady();
      setSqlServerConfigured(ready);
      if (!ready) setShowSqlServerSettings(true);
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
    return (
      <PosPageSuspense>
        <LazyCourierApp onExit={() => {
          localStorage.removeItem('shefpos_courier_session');
          const url = new URL(window.location.href);
          url.searchParams.delete('courier');
          window.history.replaceState({}, '', url.toString());
          setCourierMode(false);
        }} />
      </PosPageSuspense>
    );
  }

  if (isElectron && (dbMode === null || ((dbMode === 'sqlserver' || dbMode === 'hybrid') && !sqlServerConfigured))) {
    return (
      <ElectronSetupWizard
        initialMode={dbMode}
        needsSqlSetup={(dbMode === 'sqlserver' || dbMode === 'hybrid') && !sqlServerConfigured}
        onComplete={(mode) => {
          if (mode === 'sqlserver' || mode === 'hybrid') {
            setDbMode(mode);
            markSqlSetupComplete();
            setSqlServerConfigured(true);
            setShowSqlServerSettings(false);
          } else if (mode === 'local') {
            setDbMode('cloud');
          } else {
            setDbMode('cloud');
            persistElectronDbMode('cloud');
          }
        }}
      />
    );
  }

  if (isElectron && showSqlServerSettings) {
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
          markSqlSetupComplete();
          setSqlServerConfigured(true);
          setShowSqlServerSettings(false);
        }}
        onClose={() => {
          markSqlSetupComplete();
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
      <PosPageSuspense>
        <LazyWaiterApp
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
      </PosPageSuspense>
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
            (dbMode as 'cloud' | 'sqlserver' | 'hybrid' | 'postgres' | 'local' | null) ||
            (localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'postgres' | 'local' | null)
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
        return (
          <PosPageSuspense>
            <LazyAykaLogin onBackToLanding={goToLanding} />
          </PosPageSuspense>
        );
      }
      // /login → restoran kullanıcıları için genel giriş ekranı
      return <Auth onBackToLanding={goToLanding} />;
    }
    return (
      <PosPageSuspense>
        <LazyLandingPage onLogin={goToLogin} />
      </PosPageSuspense>
    );
  }

  const isAykaRoute =
    typeof window !== 'undefined' && isAykaAdminPath(window.location.pathname);

  if (user && profile && isAykaRoute) {
    if (canAccessAdminPanel(profile, { isAykaRoute: true })) {
      return (
        <PosPageSuspense>
          <LazyAdminPanel
            onExit={() => {
              setShowAdminPanel(false);
              clearAykaSessionFlag();
              void signOut();
              window.location.assign('/');
            }}
          />
        </PosPageSuspense>
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
    return (
      <PosPageSuspense>
        <LazyOnboardingWizard onComplete={async () => {
          localStorage.setItem('onboarding_dismissed', 'true');
          setOnboardingDone(true);
          setShowOnboarding(false);
          await refreshProfile();
        }} />
      </PosPageSuspense>
    );
  }

  // Trial bittiyse super_admin / aykasoft hesaplari haric tum app erisimi engelle.
  // - Onboarding tamamlanmadan ekran gosterilmez (ust adim daha onemli).
  // - Lisans aktif edildiginde (subscription_status: active/expired ise plan != trial)
  //   bu blok otomatik kapanir.
  const trialInfo = getTrialInfo(tenant);
  const licenseInfo = getLicenseInfo(tenant);
  const isAdminRole = profile?.role === 'super_admin';
  if ((trialInfo.expired || licenseInfo.blocked) && tenant && !isAdminRole) {
    return <TrialExpiredOverlay />;
  }

  const show = (page: string) => currentPage === page;
  const shouldRenderPage = (page: string) =>
    shouldRenderPosPage(page, currentPage, mountedPagesRef.current);
  const onElectronHome = isElectron && currentPage === 'desktop-home';
  const shiftPages = new Set(['shifts', 'endofday', 'quick-sale', 'tables', 'cashier']);
  /** Paket/ürün/rapor gün boyu açıkken gereksiz vardiya poll+realtime açma */
  const shiftTrackingEnabled = shiftPages.has(currentPage) || showShiftQuickClose;

  // Mobilde efektif olarak her zaman header acik.
  const headerHidden = (uiPrefs.headerHidden && isDesktopViewport) || onElectronHome;

  return (
    <ActiveShiftProvider trackingEnabled={shiftTrackingEnabled}>
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
          className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto`}
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
        <div style={{ display: show('takeaway') ? undefined : 'none' }} className={`fixed inset-0 ${headerTopOffset} overflow-auto`}>
          <TakeawayOrders isActive={currentPage === 'takeaway'} />
        </div>
      )}

      {shouldRenderPage('online-orders') && (
        <div style={{ display: show('online-orders') ? undefined : 'none' }} className={`fixed inset-0 ${headerTopOffset} overflow-auto`}>
          <OnlineOrders isActive={currentPage === 'online-orders'} />
        </div>
      )}

      {shouldRenderPage('products') && (
        <div className={`fixed inset-0 ${headerTopOffset} overflow-hidden`}>
          <PosPageSuspense>
            <LazyProducts isActive />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('product-stock-count') && (
        <div
          style={{ display: show('product-stock-count') ? undefined : 'none' }}
          className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto min-h-0`}
        >
          <PosPageSuspense>
            <LazyProductStockCount />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('users') && (
        <div className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto`}>
          <div className="p-3 md:p-6 max-w-7xl mx-auto">
            <PosPageSuspense>
              <LazyUserManagement />
            </PosPageSuspense>
          </div>
        </div>
      )}

      {shouldRenderPage('customers') && (
        <div
          style={{ display: show('customers') ? undefined : 'none' }}
          className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden`}
        >
          <PosPageSuspense>
            <LazyCustomers isActive={currentPage === 'customers'} />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('loyalty') && (
        <div
          style={{ display: show('loyalty') ? undefined : 'none' }}
          className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden`}
        >
          <PosPageSuspense>
            <LazyLoyaltyPage
              isActive={currentPage === 'loyalty'}
              onBack={() => setCurrentPage(isElectron ? 'desktop-home' : 'tables')}
            />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('reports') && (
        <div>
          <PosPageSuspense>
            <LazyReports isActive />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('endofday') && (
        <div>
          <PosPageSuspense>
            <LazyEndOfDay isActive />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('cancel-logs') && (
        <div style={{ display: show('cancel-logs') ? undefined : 'none' }}>
          <PosPageSuspense>
            <LazyCancelLogs onClose={() => setCurrentPage(isElectron ? 'desktop-home' : 'tables')} />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('inventory') && (
        <div
          style={{ display: show('inventory') ? undefined : 'none' }}
          className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden`}
        >
          <PosPageSuspense>
            <LazyInventory />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('quick-sale') && (
        <div className={`fixed inset-0 ${headerTopOffset} bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden`}>
          <PosPageSuspense>
            <LazyQuickSale isActive />
          </PosPageSuspense>
        </div>
      )}

      {shouldRenderPage('shifts') && (
        <div>
          <PosPageSuspense>
            <LazyShiftManager />
          </PosPageSuspense>
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
        <PosPageSuspense>
          <LazySettings
            initialTab={settingsInitialTab}
            onClose={() => {
              setShowSettings(false);
              setSettingsInitialTab(undefined);
            }}
          />
        </PosPageSuspense>
      )}

      {showCashRegister && (
        <PosPageSuspense>
          <LazyCashRegister onClose={() => setShowCashRegister(false)} />
        </PosPageSuspense>
      )}

      <SystemNotificationContainer
        notifications={systemNotifications}
        onDismiss={(id) => setSystemNotifications(prev => prev.filter(n => n.id !== id))}
      />
      <GlobalGetirSync />
      <GlobalHybridSync />
      <OnlineOrderToast
        onOpenOnlineOrders={() => handleNavigate('online-orders')}
        currentPage={currentPage}
      />
      <PrintStatusToast />
    </div>
    </ActiveShiftProvider>
  );
}
