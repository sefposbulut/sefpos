import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Auth } from './components/Auth';
import { ElectronAuth } from './components/ElectronAuth';
import { Header } from './components/Header';
import { MainMenu } from './components/MainMenu';
import { TableGrid } from './components/TableGrid';
import { OrderPanel } from './components/OrderPanel';
import { TerminalLogin, TerminalApp, isTerminalMode, exitTerminalMode } from './components/TerminalMode';
import { DeviceBindingModal } from './components/DeviceBindingModal';

import { SetupWizard } from './components/SetupWizard';
import { SqlServerSettings } from './components/SqlServerSettings';
import { LandingPage } from './components/landing/LandingPage';
import { CourierApp } from './components/CourierApp';
import { Products } from './components/Products';
import { Settings } from './components/Settings';
import { CashRegister } from './components/CashRegister';
import { UserManagement } from './components/UserManagement';
import { OnlineOrders } from './components/OnlineOrders';
import { TakeawayOrders } from './components/TakeawayOrders';
import { OnboardingWizard } from './components/OnboardingWizard';
import { AdminPanel } from './components/AdminPanel';
import { EndOfDay } from './components/EndOfDay';
import { Reports } from './components/reports/Reports';
import { CancelLogs } from './components/CancelLogs';
import { CariAccounts } from './components/CariAccounts';
import { PinLockScreen } from './components/PinLockScreen';
import { Database, supabase } from './lib/supabase';
import { isSqlServerMode, isLocalMode } from './lib/sqlDb';
import { SystemNotificationContainer } from './components/SystemNotificationBanner';
import { getDeviceBindingCode } from './lib/deviceBinding';
import { queryCache } from './lib/queryCache';

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

const isDemoMode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('demo');
};

const isAykaPath = () => window.location.pathname.toLowerCase().startsWith('/ayka');
const AYKA_AUTH_KEY = 'shefpos_ayka_auth';

function UpdateBanner() {
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
}

function FastLoadingScreen({ message = 'Yukleniyor...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)' }}>
      <div className="text-center">
        <div className="mx-auto mb-3 animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
        <p className="text-white/90 text-sm md:text-base font-medium">{message}</p>
      </div>
    </div>
  );
}

function App() {
  const aykaPath = isAykaPath();
  const aykaAuthorized = localStorage.getItem(AYKA_AUTH_KEY) === '1';
  const [courierMode, setCourierMode] = useState(isCourierMode);
  const [terminalSetup, setTerminalSetup] = useState<'login' | 'app' | null>(() => {
    if (isTerminalMode()) return 'app';
    if (localStorage.getItem('shefpos_pending_terminal') === 'true') return 'login';
    return null;
  });
  const { user, profile, tenant, loading, refreshProfile, activeBranch, signOut, profileLoadFailed } = useAuth();
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentPage, setCurrentPage] = useState('tables');
  const [dbMode, setDbMode] = useState<'cloud' | 'sqlserver' | 'postgres' | 'local' | null | 'loading'>('loading');
  const [sqlServerConfigured, setSqlServerConfigured] = useState(false);
  const [showSqlServerSettings, setShowSqlServerSettings] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [showDeviceBinding, setShowDeviceBinding] = useState(false);
  const [waiterKicked, setWaiterKicked] = useState(false);
  const waiterUnauthorizedCountRef = useRef(0);
  const seenNotifIds = useRef<Set<string>>(new Set());
  const tableRefreshRef = useRef<(() => void) | null>(null);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isElectron = !!(window as any).electronAPI;

  useEffect(() => {
    if (!tenant || !user || !profile) return;
    if (isSqlServerMode() || isLocalMode()) return;

    const channel = supabase.channel(`tenant-presence-${tenant.id}`, {
      config: { presence: { key: user.id } },
    });
    presenceChannelRef.current = channel;

    const trackPresence = () =>
      channel.track({
        user_id: user.id,
        tenant_id: tenant.id,
        full_name: profile.full_name,
        role: profile.role,
        branch_id: activeBranch?.id || null,
        at: new Date().toISOString(),
      }).catch(() => {});

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') trackPresence();
    });

    const heartbeat = setInterval(trackPresence, 30000);

    return () => {
      clearInterval(heartbeat);
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      if (presenceChannelRef.current === channel) presenceChannelRef.current = null;
    };
  }, [tenant?.id, user?.id, profile?.id, activeBranch?.id]);

  useEffect(() => {
    if (!isElectron) {
      setDbMode(null);
      return;
    }
    const api = (window as any).electronAPI;
    const timeout = setTimeout(() => {
      const savedMode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'postgres' | null;
      setDbMode(savedMode);
    }, 3000);
    Promise.race([
      api.getDbMode(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
    ]).then(async (mode: 'cloud' | 'sqlserver' | 'postgres' | 'local' | null) => {
      clearTimeout(timeout);
      if (mode === 'sqlserver' || mode === 'postgres' || mode === 'local') {
        localStorage.setItem('dbMode', mode);
      } else if (mode !== null) {
        localStorage.removeItem('dbMode');
      } else {
        mode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'postgres' | 'local' | null;
      }
      setDbMode(mode);
      if (mode === 'sqlserver' || mode === 'postgres') {
        try {
          const cfg = await api.getSqlServerConfig?.();
          const isConfigured = !!(cfg?.host && cfg?.username);
          setSqlServerConfigured(isConfigured);
          if (!isConfigured) setShowSqlServerSettings(true);
        } catch {}
      }
    }).catch(() => {
      clearTimeout(timeout);
      const savedMode = localStorage.getItem('dbMode') as 'cloud' | 'sqlserver' | 'local' | null;
      setDbMode(savedMode);
    });
  }, [isElectron]);

  const showNewNotification = useCallback((n: { id: string; title: string; message: string; type: string; created_at?: string }) => {
    if (!tenant?.id) return;
    const dismissedKey = `notif_dismissed_${tenant.id}`;
    const dismissedIds = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]') as string[]);
    const deletedBeforeKey = `notif_deleted_before_${tenant.id}`;
    const deletedBefore = localStorage.getItem(deletedBeforeKey);

    if (n.type === 'revoke') {
      const msg = String(n.message || '');
      if (msg.startsWith('delete:')) {
        const targetId = msg.replace('delete:', '').trim();
        if (targetId) {
          dismissedIds.add(targetId);
          localStorage.setItem(dismissedKey, JSON.stringify(Array.from(dismissedIds).slice(-500)));
          setSystemNotifications(prev => prev.filter(x => x.id !== targetId));
        }
      }
      if (msg.startsWith('delete_all:')) {
        const ts = msg.replace('delete_all:', '').trim() || new Date().toISOString();
        localStorage.setItem(deletedBeforeKey, ts);
        setSystemNotifications([]);
      }
      return;
    }

    if (deletedBefore && n.created_at && n.created_at <= deletedBefore) return;
    if (dismissedIds.has(n.id)) return;
    if (seenNotifIds.current.has(n.id)) return;
    seenNotifIds.current.add(n.id);
    setSystemNotifications(prev => [...prev, { id: n.id, title: n.title, message: n.message, type: n.type || 'info' }]);
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant || !user) return;
    if (isSqlServerMode()) return;

    const sessionStartKey = `notif_session_start_${tenant.id}_${user.id}`;
    const sessionStart = new Date().toISOString();
    localStorage.setItem(sessionStartKey, sessionStart);

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
            .gte('created_at', sessionStart)
            .order('created_at', { ascending: true });
          if (data && data.length > 0) {
            data.forEach((n: any) => showNewNotification(n));
            lastCheckedRef.value = now;
            localStorage.setItem(lastSeenKey, now);
          }
        }
      });

    const fallbackSync = setInterval(async () => {
      const { data } = await supabase
        .from('support_notifications')
        .select('id, title, message, type, tenant_id, created_at')
        .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
        .gte('created_at', sessionStart)
        .order('created_at', { ascending: true });
      if (data && data.length > 0) {
        data.forEach((n: any) => showNewNotification(n));
      }
    }, 12000);

    return () => {
      clearInterval(fallbackSync);
      supabase.removeChannel(channel);
    };
  }, [tenant, user, showNewNotification]);

  // Device binding check for waiters/couriers (all platforms: Electron + Web)
  useEffect(() => {
    if (!user || !profile) return;
    if (profile.role !== 'waiter' && profile.role !== 'courier') return;

    // Check device only on first login
    const deviceCheckDone = localStorage.getItem('device_binding_checked');
    if (!deviceCheckDone) {
      setShowDeviceBinding(true);
      localStorage.setItem('device_binding_checked', 'true');
    }
  }, [user, profile]);

  useEffect(() => {
    if (!user || !profile || profile.role !== 'waiter') return;
    if (waiterKicked) return;

    const raw = localStorage.getItem('waiter_session');
    if (!raw) {
      setWaiterKicked(true);
      signOut();
      return;
    }

    let waiterSession: { id: string; tenant_id: string } | null = null;
    try {
      waiterSession = JSON.parse(raw);
    } catch {
      waiterSession = null;
    }
    if (!waiterSession?.id) {
      localStorage.removeItem('waiter_session');
      setWaiterKicked(true);
      signOut();
      return;
    }

    const deviceId = getDeviceBindingCode();
    let alive = true;

    const kickIfUnauthorized = async () => {
      const { data: waiterRow } = await supabase
        .from('waiters')
        .select('id, status')
        .eq('id', waiterSession!.id)
        .eq('tenant_id', waiterSession!.tenant_id || tenant?.id || '')
        .maybeSingle();

      if (!alive) return;
      if (!waiterRow?.id || (waiterRow as any).status === 'inactive') {
        localStorage.removeItem('waiter_session');
        setWaiterKicked(true);
        alert('Garson hesabi pasife alinmis veya silinmis. Lutfen yoneticinize basvurun.');
        await signOut();
        return;
      }

      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, is_active, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!alive) return;
      // Some waiter flows may authenticate without a strict waiter role on profiles.
      // Only enforce kick when profile is explicitly inactive.
      if (currentProfile?.id && (currentProfile as any).is_active === false) {
        localStorage.removeItem('waiter_session');
        setWaiterKicked(true);
        alert('Hesabiniz pasife alinmis veya silinmis. Lutfen yoneticinize basvurun.');
        await signOut();
        return;
      }

      const { data } = await supabase
        .from('device_bindings')
        .select('id, status')
        .eq('tenant_id', waiterSession!.tenant_id || tenant?.id || '')
        .eq('waiter_id', waiterSession!.id)
        .eq('device_id', deviceId)
        .eq('status', 'active')
        .maybeSingle();

      if (!alive) return;
      if (data?.id) {
        waiterUnauthorizedCountRef.current = 0;
        return;
      }

      // Avoid false-positive kick on transient replication delays.
      waiterUnauthorizedCountRef.current += 1;
      if (waiterUnauthorizedCountRef.current < 3) return;

      waiterUnauthorizedCountRef.current = 0;
      if (!data?.id) {
        localStorage.removeItem('waiter_session');
        setWaiterKicked(true);
        alert('Cihaz yetkisi kaldırıldı. Lütfen yöneticinize başvurun.');
        await signOut();
      }
    };

    kickIfUnauthorized();
    const watch = supabase
      .channel(`waiter-binding-watch-${waiterSession.id}-${deviceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'device_bindings',
        filter: `waiter_id=eq.${waiterSession.id}`,
      }, () => { kickIfUnauthorized(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, () => { kickIfUnauthorized(); })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`,
      }, () => { kickIfUnauthorized(); })
      .subscribe();
    const timer = setInterval(kickIfUnauthorized, 3000);

    return () => {
      alive = false;
      waiterUnauthorizedCountRef.current = 0;
      clearInterval(timer);
      supabase.removeChannel(watch);
    };
  }, [user?.id, profile?.role, waiterKicked]);

  const handleTableGridRefresh = useCallback((fn: () => void) => {
    tableRefreshRef.current = fn;
  }, []);

  const handleSelectTable = useCallback((nextTable: Table) => {
    if (tenant?.id) {
      // Warm menu cache in background so OrderPanel opens instantly.
      void queryCache.getProductsAndCategories(tenant.id, activeBranch?.id || undefined).catch(() => {});
    }
    setSelectedTable(nextTable);
  }, [tenant?.id, activeBranch?.id]);

  const handleNavigate = useCallback((page: string) => {
    if (page === 'cashier') {
      setShowCashRegister(true);
      return;
    }
    setCurrentPage(page);
  }, []);

  const handleDbModeSelect = async (mode: 'cloud' | 'sqlserver' | 'postgres' | 'terminal' | 'local') => {
    if (mode === 'terminal') {
      localStorage.setItem('shefpos_pending_terminal', 'true');
      setTerminalSetup('login');
      return;
    }
    const api = (window as any).electronAPI;
    await api.setDbMode(mode);
    if (mode === 'sqlserver' || mode === 'postgres') {
      localStorage.setItem('dbMode', mode === 'sqlserver' ? 'sqlserver' : 'postgres');
      setDbMode(mode === 'sqlserver' ? 'sqlserver' : 'postgres');
      setSqlServerConfigured(false);
      setShowSqlServerSettings(true);
    } else if (mode === 'local') {
      localStorage.setItem('dbMode', 'local');
      setDbMode('local');
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
    return <FastLoadingScreen message="Yukleniyor..." />;
  }

  if (isElectron && dbMode === null) {
    return <SetupWizard onModeSelect={handleDbModeSelect} />;
  }

  if (isElectron && (dbMode === 'sqlserver' || dbMode === 'postgres') && (showSqlServerSettings || !sqlServerConfigured)) {
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

  if (loading) return <FastLoadingScreen message="Yukleniyor..." />;

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
          currentDbMode={dbMode as 'cloud' | 'sqlserver' | 'postgres' | 'local' | null}
        />
      );
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
    if (aykaPath) {
      return <Auth />;
    }
    return <LandingPage onLogin={() => setShowAuthModal(true)} />;
  }

  if (user && aykaPath) {
    return <AdminPanel onExit={() => {
      localStorage.removeItem(AYKA_AUTH_KEY);
      window.location.assign('/');
    }} />;
  }

  if (profile?.is_super_admin && showAdminPanel) {
    return <AdminPanel onExit={() => setShowAdminPanel(false)} />;
  }

  const needsOnboarding = user && tenant && profile?.role === 'owner'
    && (tenant.onboarding_completed === false || tenant.onboarding_completed === null || tenant.onboarding_completed === undefined)
    && !onboardingDone;
  if (needsOnboarding || showOnboarding) {
    return <OnboardingWizard onComplete={async () => {
      setOnboardingDone(true);
      setShowOnboarding(false);
      await refreshProfile();
    }} />;
  }

  const show = (page: string) => currentPage === page;
  const isWaiterProfile = profile?.role === 'waiter';
  const hasWaiterSession = !!localStorage.getItem('waiter_session');
  const waiterDisplayName =
    profile?.full_name?.trim()
    || profile?.email?.split('@')[0]
    || user?.email?.split('@')[0]
    || 'Garson';

  if (isWaiterProfile) {
    if (!hasWaiterSession) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center">
            <p className="text-white font-bold text-lg mb-2">Garson Girişi Zorunlu</p>
            <p className="text-slate-300 text-sm mb-5">Bu hesap sadece Garson PIN akışıyla giriş yapabilir.</p>
            <button
              onClick={signOut}
              className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            >
              Giriş Ekranına Dön
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-50">
        {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}

        <div className="h-14 md:h-16 px-4 md:px-6 bg-white border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Garson: <span className="text-orange-600">{waiterDisplayName}</span>
            </p>
            <p className="text-xs text-slate-500">Sadece masalar gorunur</p>
          </div>
          <button
            onClick={signOut}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
          >
            Çıkış
          </button>
        </div>

        <div className="fixed inset-0 top-14 md:top-16 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
          <div className="p-3 md:p-6">
            <TableGrid onSelectTable={handleSelectTable} onRefresh={handleTableGridRefresh} onNavigate={() => {}} showTakeawayButton={false} />
          </div>
        </div>

        {selectedTable && (
          <OrderPanel
            table={selectedTable}
            onClose={() => {
              setSelectedTable(null);
              tableRefreshRef.current?.();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {isLocked && <PinLockScreen onUnlock={() => setIsLocked(false)} />}

      <Header onOpenSettings={() => setShowSettings(true)} onOpenAdmin={() => setShowAdminPanel(true)} onOpenOnboarding={() => setShowOnboarding(true)} />
      <MainMenu
        onNavigate={handleNavigate}
        currentPage={currentPage}
        onOpenSettings={() => setShowSettings(true)}
        onLockScreen={() => setIsLocked(true)}
      />

      {/* Always-mounted pages - hidden via display:none for instant switching */}
      <div style={{ display: show('tables') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
        <div className="p-3 md:p-6">
          <TableGrid onSelectTable={handleSelectTable} onRefresh={handleTableGridRefresh} onNavigate={handleNavigate} />
        </div>
      </div>

      <div style={{ display: show('takeaway') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
        <TakeawayOrders />
      </div>

      <div style={{ display: show('online-orders') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
        <OnlineOrders />
      </div>

      <div style={{ display: show('products') ? undefined : 'none' }} className="fixed inset-0 top-14 md:top-20 overflow-auto">
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

      {show('reports') && <Reports />}

      {show('endofday') && <EndOfDay />}

      {show('cancel-logs') && <CancelLogs onClose={() => setCurrentPage('tables')} />}

      {show('customers') && <CariAccounts />}

      {selectedTable && (
        <OrderPanel
          table={selectedTable}
          onClose={() => {
            setSelectedTable(null);
            tableRefreshRef.current?.();
          }}
        />
      )}

      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}

      {showCashRegister && (
        <CashRegister onClose={() => setShowCashRegister(false)} />
      )}

      <DeviceBindingModal
        isOpen={showDeviceBinding}
        onDismiss={() => setShowDeviceBinding(false)}
        userRole={profile?.role}
      />

      <SystemNotificationContainer
        notifications={systemNotifications}
        onDismiss={(id) => {
          setSystemNotifications(prev => prev.filter(n => n.id !== id));
          if (!tenant?.id) return;
          const dismissedKey = `notif_dismissed_${tenant.id}`;
          const current = new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]') as string[]);
          current.add(id);
          localStorage.setItem(dismissedKey, JSON.stringify(Array.from(current).slice(-500)));
        }}
      />
      {isElectron && <UpdateBanner />}
    </div>
  );
}

export default App;
