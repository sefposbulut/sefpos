import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ElectronAuth } from './components/ElectronAuth';
import { SetupWizard } from './components/SetupWizard';
import { SqlServerSettings } from './components/SqlServerSettings';
import { LandingPage } from './components/landing/LandingPage';
import { CourierApp } from './components/CourierApp';
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
import { AdminPanel } from './components/AdminPanel';
import { Customers } from './components/customers/Customers';
import { EndOfDay } from './components/EndOfDay';
import { Reports } from './components/reports/Reports';
import { CancelLogs } from './components/CancelLogs';
import { PinLockScreen } from './components/PinLockScreen';
import { Database, supabase } from './lib/supabase';
import { isSqlServerMode } from './lib/sqlDb';
import { queryCache } from './lib/queryCache';
import { SystemNotificationContainer } from './components/SystemNotificationBanner';
import { TerminalLogin, TerminalApp, isTerminalMode, exitTerminalMode } from './components/TerminalMode';
import { isCapacitorNative } from './lib/capacitorPlatform';

interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: string;
}

type Table = Database['public']['Tables']['restaurant_tables']['Row'];

const isCourierMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('courier') || !!localStorage.getItem('shefpos_courier_session');
};

const UpdateBanner = React.memo(function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const api = (window as any).electronAPI;

  useEffect(() => {
    if (!api?.onUpdateAvailable) return;
    api.onUpdateAvailable((info: { version: string }) => setUpdateInfo(info));
    api.onUpdateDownloadProgress((info: { percent: number }) => setDownloadPercent(info.percent));
    api.onUpdateDownloaded((info: { version: string }) => { setDownloaded(true); setDownloadPercent(100); setUpdateInfo(info); });
    return () => api.removeUpdateListeners?.();
  }, []);

  if (!updateInfo || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm w-full">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold">Guncelleme Mevcut</p>
            <p className="text-slate-400 text-xs mt-0.5">Surum {updateInfo.version} hazir</p>
            {downloadPercent !== null && !downloaded && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Indiriliyor...</span>
                  <span>%{downloadPercent}</span>
                </div>
                <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${downloadPercent}%` }} />
                </div>
              </div>
            )}
            {downloaded && (
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => api?.installUpdate?.()}
                  className="flex-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Yeniden Baslat ve Yukle
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  Sonra
                </button>
              </div>
            )}
          </div>
          {!downloaded && (
            <button onClick={() => setDismissed(true)} className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

function App() {
  const [courierMode, setCourierMode] = useState(isCourierMode);
  const [terminalSetup, setTerminalSetup] = useState<'login' | 'app' | null>(() => {
    if (isTerminalMode()) return 'app';
    if (localStorage.getItem('shefpos_pending_terminal') === 'true') return 'login';
    return null;
  });

  const isElectron = useMemo(() => !!(window as any).electronAPI, []);
  const { user, profile, tenant, loading, refreshProfile, activeBranch, signOut, profileLoadFailed } = useAuth();
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentPage, setCurrentPage] = useState('tables');
  const [dbMode, setDbMode] = useState<'cloud' | 'sqlserver' | null | 'loading'>('loading');
  const [sqlServerConfigured, setSqlServerConfigured] = useState(false);
  const [showSqlServerSettings, setShowSqlServerSettings] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('landing')) return false;
      const host = window.location.hostname;
      const path = window.location.pathname || '/';
      const isLocalHost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host.endsWith('.local');
      if (import.meta.env.DEV && isLocalHost && path === '/') return true;
    } catch {
      /* ignore */
    }
    return false;
  });
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
    const timeout = setTimeout(() => {
      const savedMode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | null;
      setDbMode(savedMode);
    }, 3000);
    Promise.race([
      api.getDbMode(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    ]).then(async (mode: 'cloud' | 'sqlserver' | null) => {
      clearTimeout(timeout);
      if (mode === 'sqlserver') {
        localStorage.setItem('dbMode', 'sqlserver');
      } else if (mode !== null) {
        localStorage.removeItem('dbMode');
      } else {
        mode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | null;
      }
      setDbMode(mode);
      if (mode === 'sqlserver') {
        try {
          const cfg = await api.getSqlServerConfig?.();
          const isConfigured = !!(cfg?.host && cfg?.username);
          setSqlServerConfigured(isConfigured);
          if (!isConfigured) setShowSqlServerSettings(true);
        } catch {}
      }
    }).catch(() => {
      clearTimeout(timeout);
      const savedMode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | null;
      setDbMode(savedMode);
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

  useEffect(() => {
    if (!tenant || !user) return;
    if (isSqlServerMode()) return;

    const lastSeenKey = `notif_last_seen_${tenant.id}`;
    const lastCheckedRef = { value: localStorage.getItem(lastSeenKey) || new Date(Date.now() - 60000).toISOString() };

    const channel = supabase
      .channel(`system-notifs-${tenant.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_notifications',
      }, (payload) => {
        const n = payload.new as any;
        if (n.tenant_id && n.tenant_id !== tenant.id) return;
        showNewNotification(n);
        lastCheckedRef.value = new Date().toISOString();
        localStorage.setItem(lastSeenKey, lastCheckedRef.value);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const now = new Date().toISOString();
          const { data } = await supabase
            .from('support_notifications')
            .select('id, title, message, type, tenant_id, created_at')
            .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
            .gt('created_at', lastCheckedRef.value)
            .order('created_at', { ascending: true });
          if (data && data.length > 0) {
            data.forEach((n: any) => showNewNotification(n));
            lastCheckedRef.value = now;
            localStorage.setItem(lastSeenKey, now);
          }
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
    setCurrentPage(page);
  }, []);

  const handleDbModeSelect = async (mode: 'cloud' | 'sqlserver' | 'terminal') => {
    if (mode === 'terminal') {
      localStorage.setItem('shefpos_pending_terminal', 'true');
      setTerminalSetup('login');
      return;
    }
    const api = (window as any).electronAPI;
    await api.setDbMode(mode);
    if (mode === 'sqlserver') {
      localStorage.setItem('dbMode', 'sqlserver');
      setDbMode('sqlserver');
      setSqlServerConfigured(false);
      setShowSqlServerSettings(true);
    } else {
      localStorage.removeItem('dbMode');
      setDbMode('cloud');
    }
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

  if (isElectron && dbMode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)' }}>
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
      </div>
    );
  }

  if (isElectron && dbMode === null) {
    return <SetupWizard onModeSelect={handleDbModeSelect} />;
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

  if (loading) return null;

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

  if (!user) {
    if (isElectron) {
      return (
        <ElectronAuth
          onSwitchMode={() => {
            const api = (window as any).electronAPI;
            api?.setDbMode(null);
            localStorage.removeItem('dbMode');
            setDbMode(null);
          }}
          currentDbMode={dbMode as 'cloud' | 'sqlserver' | null}
        />
      );
    }
    if (isCapacitorNative()) {
      // Garson APK / iOS: aynı WaiterLogin bileşeni, mobilde "Garson" ile açılan ekran
      return <Auth />;
    }
    if (showAuthModal) {
      return (
        <div className="min-h-screen relative">
          <LandingPage onLogin={() => setShowAuthModal(true)} />
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md">
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors"
              >
                ×
              </button>
              <Auth />
            </div>
          </div>
        </div>
      );
    }
    return <LandingPage onLogin={() => setShowAuthModal(true)} />;
  }

  const isAykaRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.toLowerCase().startsWith('/ayka');

  if (profile?.is_super_admin && (showAdminPanel || isAykaRoute)) {
    return (
      <AdminPanel
        onExit={() => {
          setShowAdminPanel(false);
          if (isAykaRoute) {
            try {
              localStorage.removeItem('shefpos_ayka_auth');
            } catch {
              /* ignore */
            }
            window.location.assign('/');
          }
        }}
      />
    );
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

  const show = (page: string) => currentPage === page;

  return (
    <div className="min-h-screen bg-slate-50">
      {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}

      <Header onOpenSettings={() => setShowSettings(true)} onOpenOnboarding={() => setShowOnboarding(true)} />
      <MainMenu
        onNavigate={handleNavigate}
        currentPage={currentPage}
        onOpenSettings={() => setShowSettings(true)}
        onLockScreen={() => setIsLocked(true)}
      />

      {/* Always-mounted pages - hidden via display:none for instant switching */}
      <div style={{ display: show('tables') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
        <div className="p-3 md:p-6">
          <TableGrid onSelectTable={setSelectedTable} onRefresh={handleTableGridRefresh} onNavigate={handleNavigate} />
        </div>
      </div>

      <div style={{ display: show('takeaway') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
        <TakeawayOrders />
      </div>

      <div style={{ display: show('online-orders') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
        <OnlineOrders />
      </div>

      <div style={{ display: show('products') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-hidden">
        <Products />
      </div>

      {/* On-demand pages */}
      {show('users') && (
        <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
          <div className="p-3 md:p-6 max-w-7xl mx-auto">
            <UserManagement />
          </div>
        </div>
      )}

      {show('customers') && <Customers />}

      {show('reports') && <Reports />}

      {show('endofday') && <EndOfDay />}

      {show('cancel-logs') && <CancelLogs onClose={() => setCurrentPage('tables')} />}

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
      {isElectron && <UpdateBanner />}
    </div>
  );
}

export default App;
