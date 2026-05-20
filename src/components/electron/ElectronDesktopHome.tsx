import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Cloud,
  CloudOff,
  Headphones,
  Lock,
  LogOut,
  MapPin,
  Settings,
  Sun,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { publicAsset } from '../../lib/assetUrl';
import { APP_DISPLAY_VERSION } from '../../lib/appVersion';
import { buildPosMenuTiles } from '../../lib/posMenuItems';
import { supabase } from '../../lib/supabase';
import { isSqlServerMode } from '../../lib/sqlDb';
import { INVENTORY_TAB_STORAGE_KEY } from '../../lib/inventoryNav';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';
import { PlatformLogo } from '../PlatformLogo';

const NEWISH_STATUSES = ['new', 'scheduled_new', 'verified', 'accepted'];

type DashboardNotif = {
  id: string;
  customer_name: string;
  platform_code: string;
  platform_name: string;
  created_at: string;
  total_amount: number;
};

interface ElectronDesktopHomeProps {
  onNavigate: (page: string) => void;
  onOpenSettings?: () => void;
  onLockScreen?: () => void;
}

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Şube Müdürü',
  cashier: 'Kasiyer',
  waiter: 'Garson',
  courier: 'Kurye',
  kitchen: 'Mutfak',
};

function formatTurkishDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatNotifTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ElectronDesktopHome({
  onNavigate,
  onOpenSettings,
  onLockScreen,
}: ElectronDesktopHomeProps) {
  const { tenant, profile, user, activeBranch, branches, setActiveBranch, signOut, permissions, shiftsEnabled } =
    useAuth();
  const [now, setNow] = useState(() => new Date());
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [serverOk, setServerOk] = useState(true);
  const [notifs, setNotifs] = useState<DashboardNotif[]>([]);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  const hasPin = !!(tenant as { lock_pin?: string | null })?.lock_pin;
  const canOpenSettings = !!permissions?.can_manage_settings;
  const logoSrc = publicAsset('logo-header.png');

  const tiles = useMemo(
    () =>
      buildPosMenuTiles({
        permissions: permissions || {},
        tenant,
        shiftsEnabled,
      }),
    [permissions, tenant, shiftsEnabled],
  );

  const featuredTiles = tiles.filter((t) => t.featured);
  const otherTiles = tiles.filter((t) => !t.featured);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!tenant?.id || isSqlServerMode()) {
      setServerOk(true);
      return;
    }
    let cancelled = false;
    void supabase
      .from('tenants')
      .select('id')
      .eq('id', tenant.id)
      .maybeSingle()
      .then(({ error }) => {
        if (!cancelled) setServerOk(!error);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant?.id]);

  const loadNotifs = useCallback(async () => {
    if (!tenant?.id || isSqlServerMode()) {
      setNotifs([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('online_orders')
        .select(
          'id, customer_name, total_amount, created_at, status, online_order_platforms(platform_code, platform_name)',
        )
        .eq('tenant_id', tenant.id)
        .in('status', NEWISH_STATUSES)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      const rows: DashboardNotif[] = (data || []).map((row: Record<string, unknown>) => {
        const plat = row.online_order_platforms as { platform_code?: string; platform_name?: string } | null;
        return {
          id: String(row.id),
          customer_name: String(row.customer_name || 'Müşteri'),
          platform_code: plat?.platform_code || '',
          platform_name: plat?.platform_name || 'Online',
          created_at: String(row.created_at || ''),
          total_amount: Number(row.total_amount) || 0,
        };
      });
      setNotifs(rows);
    } catch {
      setNotifs([]);
    }
  }, [tenant?.id]);

  useEffect(() => {
    void loadNotifs();
    if (!tenant?.id || isSqlServerMode()) return;
    const channel = supabase
      .channel(`desktop-home-orders-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'online_orders', filter: `tenant_id=eq.${tenant.id}` },
        () => {
          void loadNotifs();
        },
      )
      .subscribe();
    const poll = setInterval(() => void loadNotifs(), 60_000);
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [tenant?.id, loadNotifs]);

  const handleTileClick = (page: string) => {
    if (page === 'reports') {
      try {
        sessionStorage.setItem(REPORTS_INITIAL_TAB_STORAGE_KEY, 'sales');
        sessionStorage.setItem(REPORTS_MENU_LAST_KEY, 'sales');
      } catch {
        /* ignore */
      }
    }
    if (page === 'inventory') {
      try {
        sessionStorage.setItem(INVENTORY_TAB_STORAGE_KEY, 'recipes');
      } catch {
        /* ignore */
      }
    }
    onNavigate(page);
  };

  const displayName =
    profile?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Kullanıcı';
  const roleLabel = roleLabels[profile?.role || ''] || profile?.role || '';

  return (
    <div
      className="fixed inset-0 z-[30] flex flex-col overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(ellipse 120% 80% at 70% 20%, rgba(249,115,22,0.22) 0%, transparent 55%), radial-gradient(ellipse 90% 70% at 10% 90%, rgba(190,24,93,0.18) 0%, transparent 50%), linear-gradient(145deg, #0f172a 0%, #1e1b4b 38%, #431407 100%)',
        fontFamily: '"Inter", "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Üst şerit */}
      <header className="flex-shrink-0 flex items-center justify-between gap-4 px-5 md:px-8 py-4 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-4 min-w-0">
          <img
            src={logoSrc}
            alt="ŞefPOS"
            className="h-10 md:h-12 w-auto object-contain drop-shadow-lg"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="min-w-0 hidden sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-300/90">ŞefPOS</p>
            <h1 className="text-lg md:text-xl font-black truncate text-white">
              {(tenant as { name?: string })?.name || 'İşletme'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3">
          <StatusPill
            ok={isOnline}
            okLabel="İnternet bağlı"
            badLabel="İnternet yok"
            iconOn={Wifi}
            iconOff={WifiOff}
          />
          <StatusPill
            ok={serverOk && isOnline}
            okLabel="Sunucu bağlı"
            badLabel="Sunucu yanıt vermiyor"
            iconOn={Cloud}
            iconOff={CloudOff}
          />

          {branches.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setBranchPickerOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold transition"
              >
                <MapPin className="w-4 h-4 text-orange-300 shrink-0" />
                <span className="max-w-[120px] truncate">{activeBranch?.name || 'Şube'}</span>
              </button>
              {branchPickerOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBranchPickerOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[200px] rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl py-1">
                    {branches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setActiveBranch(b.id);
                          setBranchPickerOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm font-semibold hover:bg-white/10 ${
                          activeBranch?.id === b.id ? 'text-orange-300' : 'text-white'
                        }`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="hidden md:flex flex-col items-end text-right px-2">
            <span className="text-sm font-bold truncate max-w-[160px]">{displayName}</span>
            <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wide">{roleLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-red-500/30 border border-white/15 text-xs font-bold transition"
            title="Çıkış"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">Çıkış</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Sol panel — saat, bildirimler */}
        <aside className="hidden lg:flex w-[300px] xl:w-[340px] flex-shrink-0 flex-col border-r border-white/10 bg-black/15 p-6 gap-6">
          <div>
            <p className="text-5xl xl:text-6xl font-black tabular-nums tracking-tight">{formatClock(now)}</p>
            <p className="mt-2 text-sm font-semibold text-white/70 capitalize">{formatTurkishDate(now)}</p>
            <div className="mt-4 flex items-center gap-3 text-white/50">
              <Sun className="w-8 h-8 text-amber-300/80" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide">Hava</p>
                <p className="text-sm text-white/60">Yerel hava servisi yakında</p>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-black uppercase tracking-[0.15em] text-orange-200/90 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                Bildirimler
              </h2>
              {notifs.length > 0 && (
                <span className="text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">
                  {notifs.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {notifs.length === 0 ? (
                <p className="text-sm text-white/40 py-4">Yeni online sipariş yok.</p>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onNavigate('online-orders')}
                    className="w-full text-left p-3 rounded-2xl bg-white/8 hover:bg-white/12 border border-white/10 transition group"
                  >
                    <div className="flex items-start gap-3">
                      <PlatformLogo code={n.platform_code} name={n.platform_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-orange-200">Yeni sipariş!</p>
                        <p className="text-sm font-semibold truncate">{n.customer_name}</p>
                        <p className="text-[10px] text-white/50 mt-0.5">
                          {formatNotifTime(n.created_at)} · {n.total_amount.toFixed(2)} ₺
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-orange-300 shrink-0 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>
            {notifs.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('online-orders')}
                className="mt-3 w-full py-2.5 rounded-xl text-xs font-bold text-orange-200 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-400/20 transition"
              >
                Tüm bildirimleri göster
              </button>
            )}
          </div>

          <a
            href="mailto:destek@sefpos.com.tr"
            className="flex items-center gap-2 text-xs font-semibold text-white/50 hover:text-orange-200 transition"
          >
            <Headphones className="w-4 h-4" />
            Müşteri hizmetleri
          </a>
        </aside>

        {/* Ana modül ızgarası */}
        <main className="flex-1 flex flex-col min-w-0 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="lg:hidden mb-4 flex items-end justify-between">
            <div>
              <p className="text-4xl font-black tabular-nums">{formatClock(now)}</p>
              <p className="text-xs text-white/60 capitalize">{formatTurkishDate(now)}</p>
            </div>
            {notifs.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('online-orders')}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-orange-500/20 border border-orange-400/30 text-xs font-bold"
              >
                <Bell className="w-4 h-4" />
                {notifs.length} yeni sipariş
              </button>
            )}
          </div>

          {featuredTiles.length > 0 && (
            <section className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3">Ana modüller</p>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                {featuredTiles.map((tile) => (
                  <ModuleTile key={tile.id} tile={tile} large onClick={() => handleTileClick(tile.page)} />
                ))}
              </div>
            </section>
          )}

          {otherTiles.length > 0 && (
            <section className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-3">Yönetim</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {otherTiles.map((tile) => (
                  <ModuleTile key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                ))}
              </div>
            </section>
          )}

          {tiles.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/50 text-center max-w-md">
                Hesabınız için tanımlı modül bulunamadı. Lisans veya yetkilerinizi kontrol edin.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Alt şerit */}
      <footer className="flex-shrink-0 flex items-center justify-between px-5 md:px-8 py-3 border-t border-white/10 bg-black/25 backdrop-blur-md">
        <p className="text-[11px] font-semibold text-white/40">
          ŞefPOS {APP_DISPLAY_VERSION}
          {activeBranch?.name ? ` · ${activeBranch.name}` : ''}
        </p>
        <div className="flex items-center gap-2">
          {onLockScreen && hasPin && (
            <button
              type="button"
              onClick={onLockScreen}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-sm font-bold transition"
            >
              <Lock className="w-4 h-4" />
              <span className="hidden sm:inline">Kilitle</span>
            </button>
          )}
          {canOpenSettings && onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-sm font-black shadow-lg shadow-orange-900/40 transition active:scale-[0.98]"
            >
              <Settings className="w-4 h-4" />
              Ayarlar
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
  iconOn: IconOn,
  iconOff: IconOff,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
  iconOn: React.ComponentType<{ className?: string }>;
  iconOff: React.ComponentType<{ className?: string }>;
}) {
  const Icon = ok ? IconOn : IconOff;
  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
        ok
          ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
          : 'bg-red-500/15 text-red-200 border-red-400/25'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="hidden md:inline">{ok ? okLabel : badLabel}</span>
    </div>
  );
}

function ModuleTile({
  tile,
  large,
  onClick,
}: {
  tile: ReturnType<typeof buildPosMenuTiles>[number];
  large?: boolean;
  onClick: () => void;
}) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center text-center rounded-2xl md:rounded-3xl border border-white/12 bg-white/[0.07] hover:bg-white/[0.12] hover:border-orange-400/35 hover:shadow-[0_0_40px_rgba(249,115,22,0.15)] transition-all duration-200 active:scale-[0.98] ${
        large ? 'min-h-[140px] md:min-h-[168px] p-5 md:p-6' : 'min-h-[108px] md:min-h-[120px] p-4'
      }`}
    >
      <div
        className={`rounded-2xl flex items-center justify-center mb-3 bg-gradient-to-br from-orange-500/90 to-rose-600/90 shadow-lg shadow-orange-900/30 group-hover:scale-105 transition-transform ${
          large ? 'w-14 h-14 md:w-16 md:h-16' : 'w-11 h-11 md:w-12 md:h-12'
        }`}
      >
        <Icon className={large ? 'w-7 h-7 md:w-8 md:h-8 text-white' : 'w-5 h-5 md:w-6 md:h-6 text-white'} strokeWidth={2.2} />
      </div>
      <span className={`font-black text-white leading-tight ${large ? 'text-base md:text-lg' : 'text-sm'}`}>
        {tile.label}
      </span>
      {tile.description && (
        <span className="mt-1 text-[10px] md:text-xs text-white/45 font-medium leading-snug max-w-[90%]">
          {tile.description}
        </span>
      )}
    </button>
  );
}
