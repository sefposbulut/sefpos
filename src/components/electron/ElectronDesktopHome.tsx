import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Cloud,
  Headphones,
  LayoutGrid,
  Lock,
  LogOut,
  MapPin,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { publicAsset } from '../../lib/assetUrl';
import { APP_DISPLAY_VERSION } from '../../lib/appVersion';
import { buildPosMenuTiles, type PosMenuTile } from '../../lib/posMenuItems';
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

  const quickTiles = tiles.filter((t) => t.featured);
  const moreTiles = tiles.filter((t) => !t.featured);

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
        .limit(5);
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
  const tenantName = (tenant as { name?: string })?.name || 'İşletme';

  return (
    <div className="fixed inset-0 z-[30] flex flex-col bg-gradient-to-br from-slate-50 via-white to-orange-50/40 overflow-hidden">
      {/* Üst bar — Header ile aynı dil: beyaz + turuncu vurgu */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoSrc}
              alt="ŞefPOS"
              className="h-9 md:h-11 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">ŞefPOS Masaüstü</p>
              <h1 className="text-base md:text-lg font-extrabold text-slate-900 truncate">{tenantName}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusChip ok={isOnline} label={isOnline ? 'Çevrimiçi' : 'Çevrimdışı'} icon={isOnline ? Wifi : WifiOff} />
            <StatusChip
              ok={serverOk && isOnline}
              label={serverOk ? 'Bulut' : 'Sunucu'}
              icon={Cloud}
            />

            {branches.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBranchPickerOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition"
                >
                  <MapPin className="w-3.5 h-3.5 text-orange-500" />
                  <span className="max-w-[100px] truncate">{activeBranch?.name || 'Şube'}</span>
                </button>
                {branchPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setBranchPickerOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-xl border border-slate-200 bg-white shadow-xl py-1">
                      {branches.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setActiveBranch(b.id);
                            setBranchPickerOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm font-semibold hover:bg-orange-50 ${
                            activeBranch?.id === b.id ? 'text-orange-600' : 'text-slate-700'
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

            <div className="hidden sm:block text-right px-1">
              <p className="text-sm font-bold text-slate-800 truncate max-w-[140px]">{displayName}</p>
              <p className="text-[10px] font-semibold text-slate-500">{roleLabel}</p>
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
              title="Çıkış"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
          {/* Karşılama — saat/hava yok; ŞefPOS tipi kısa özet */}
          <section className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                Merhaba, {displayName.split(' ')[0]}
              </h2>
              <p className="mt-1 text-sm text-slate-600 font-medium">
                Modül seçerek devam edin
                {activeBranch?.name ? ` · ${activeBranch.name}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canOpenSettings && onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:border-orange-300 hover:bg-orange-50 transition shadow-sm"
                >
                  <Settings className="w-4 h-4 text-orange-500" />
                  Ayarlar
                </button>
              )}
              {onLockScreen && hasPin && (
                <button
                  type="button"
                  onClick={onLockScreen}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-100 transition shadow-sm"
                >
                  <Lock className="w-4 h-4" />
                  Kilitle
                </button>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
            <div className="space-y-8">
              {/* Hızlı erişim — yatay kartlar, turuncu şerit */}
              {quickTiles.length > 0 && (
                <section>
                  <SectionTitle icon={LayoutGrid} title="Hızlı erişim" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quickTiles.map((tile) => (
                      <QuickLaunchCard key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                    ))}
                  </div>
                </section>
              )}

              {moreTiles.length > 0 && (
                <section>
                  <SectionTitle title="Diğer modüller" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {moreTiles.map((tile) => (
                      <CompactModuleButton key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                    ))}
                  </div>
                </section>
              )}

              {tiles.length === 0 && (
                <p className="text-slate-500 text-center py-12">
                  Hesabınız için tanımlı modül bulunamadı. Lisans veya yetkilerinizi kontrol edin.
                </p>
              )}
            </div>

            {/* Bildirimler — sağda ince panel, tam sol sidebar değil */}
            <aside className="xl:sticky xl:top-6 h-fit">
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-600 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-orange-500" />
                    Online siparişler
                  </span>
                  {notifs.length > 0 && (
                    <span className="text-[10px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full">
                      {notifs.length}
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-2 max-h-[320px] overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">Bekleyen sipariş yok</p>
                  ) : (
                    notifs.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => onNavigate('online-orders')}
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-orange-50 border border-transparent hover:border-orange-100 transition text-left"
                      >
                        <PlatformLogo code={n.platform_code} name={n.platform_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate">{n.customer_name}</p>
                          <p className="text-[10px] text-slate-500">
                            {formatNotifTime(n.created_at)} · {n.total_amount.toFixed(2)} ₺
                          </p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
                {notifs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate('online-orders')}
                    className="w-full py-2.5 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border-t border-orange-100 transition"
                  >
                    Tümünü aç
                  </button>
                )}
              </div>
              <a
                href="mailto:destek@sefpos.com.tr"
                className="mt-3 flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400 hover:text-orange-600 transition"
              >
                <Headphones className="w-3.5 h-3.5" />
                destek@sefpos.com.tr
              </a>
            </aside>
          </div>
        </div>
      </div>

      <footer className="flex-shrink-0 px-4 md:px-8 py-2 border-t border-slate-200 bg-white/80 text-[11px] font-semibold text-slate-400 text-center">
        ŞefPOS {APP_DISPLAY_VERSION}
      </footer>
    </div>
  );
}

function SectionTitle({
  title,
  icon: Icon,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-orange-500" />}
      {title}
    </h3>
  );
}

function StatusChip({
  ok,
  label,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold ${
        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

/** Büyük hızlı erişim — beyaz kart, sol turuncu çizgi (ŞefPOS POS kart dili). */
function QuickLaunchCard({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 w-full text-left p-4 md:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all active:scale-[0.99] border-l-4 border-l-orange-500"
    >
      <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-md shadow-orange-200/50 group-hover:scale-105 transition-transform">
        <Icon className="w-6 h-6 text-white" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base md:text-lg font-extrabold text-slate-900">{tile.label}</span>
        {tile.description && (
          <span className="block text-xs text-slate-500 font-medium mt-0.5">{tile.description}</span>
        )}
      </span>
      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-orange-500 shrink-0 transition-colors" />
    </button>
  );
}

/** Küçük modül — kompakt chip, koyu gradient yok. */
function CompactModuleButton({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl bg-white border border-slate-200 hover:border-orange-400 hover:bg-orange-50/50 shadow-sm transition active:scale-[0.98] min-h-[88px]"
    >
      <span className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </span>
      <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">{tile.label}</span>
    </button>
  );
}
