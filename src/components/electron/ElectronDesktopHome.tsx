import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  LayoutGrid,
  LogOut,
  Settings,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { publicAsset } from '../../lib/assetUrl';
import { APP_DISPLAY_VERSION } from '../../lib/appVersion';
import {
  fetchElectronDashboardSnapshot,
  fetchElectronRecentActivity,
  formatDashboardDateLabel,
  formatMoneyTr,
  formatRelativeTr,
  revenueChangePct,
  type DashboardSnapshot,
  type RecentActivityRow,
} from '../../lib/electronDashboardData';
import { buildPosMenuTiles, type PosMenuTile } from '../../lib/posMenuItems';
import {
  countUnreadNotifications,
  fetchSupportNotifications,
  type SupportNotificationRow,
} from '../../lib/supportNotifications';
import { isSqlServerMode } from '../../lib/sqlDb';
import { INVENTORY_TAB_STORAGE_KEY } from '../../lib/inventoryNav';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';

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

const PRIMARY_ORDER = ['tables', 'takeaway', 'online-orders', 'adisyons'] as const;

export function ElectronDesktopHome({
  onNavigate,
  onOpenSettings,
}: ElectronDesktopHomeProps) {
  const { tenant, profile, user, activeBranch, signOut, permissions, shiftsEnabled } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [stats, setStats] = useState<DashboardSnapshot | null>(null);
  const [recent, setRecent] = useState<RecentActivityRow[]>([]);
  const [systemNotifs, setSystemNotifs] = useState<SupportNotificationRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const canOpenSettings = !!permissions?.can_manage_settings;
  const logoSrc = publicAsset('logo-header.png');

  const allTiles = useMemo(
    () =>
      buildPosMenuTiles({
        permissions: permissions || {},
        tenant,
        shiftsEnabled,
      }),
    [permissions, tenant, shiftsEnabled],
  );

  const primaryTiles = useMemo(() => {
    const byId = new Map(allTiles.map((t) => [t.id, t]));
    const ordered: PosMenuTile[] = [];
    for (const id of PRIMARY_ORDER) {
      const t = byId.get(id);
      if (t) ordered.push(t);
    }
    return ordered;
  }, [allTiles]);

  const quickSaleTile = allTiles.find((t) => t.id === 'quick-sale');

  const moduleTiles = useMemo(() => {
    const skip = new Set([...PRIMARY_ORDER, 'quick-sale']);
    const mods = allTiles.filter((t) => !skip.has(t.id as (typeof PRIMARY_ORDER)[number]));
    if (canOpenSettings && onOpenSettings) {
      mods.push({
        id: 'settings',
        label: 'Ayarlar',
        description: 'Sistem ayarları',
        icon: Settings,
        show: true,
        page: 'settings',
      });
    }
    return mods;
  }, [allTiles, canOpenSettings, onOpenSettings]);

  const unreadBell =
    countUnreadNotifications(systemNotifs, tenant?.id || '') + (stats?.pendingOnlineCount ?? 0);

  const refreshData = useCallback(async () => {
    if (!tenant?.id) return;
    const [snap, activity, notifs] = await Promise.all([
      fetchElectronDashboardSnapshot(tenant.id, activeBranch?.id || null),
      fetchElectronRecentActivity(tenant.id, activeBranch?.id || null, 5),
      isSqlServerMode() ? Promise.resolve([]) : fetchSupportNotifications(tenant.id),
    ]);
    setStats(snap);
    setRecent(activity);
    setSystemNotifs(notifs);
  }, [tenant?.id, activeBranch?.id]);

  useEffect(() => {
    void refreshData();
    const t = setInterval(() => setNow(new Date()), 30_000);
    const poll = setInterval(() => void refreshData(), 90_000);
    return () => {
      clearInterval(t);
      clearInterval(poll);
    };
  }, [refreshData]);

  const handleTileClick = (page: string) => {
    if (page === 'settings') {
      onOpenSettings?.();
      return;
    }
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

  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || 'Kullanıcı';
  const roleLabel = roleLabels[profile?.role || ''] || profile?.role || '';
  const tenantName = (tenant as { name?: string })?.name || 'İşletme';
  const revPct = stats ? revenueChangePct(stats.todayRevenue, stats.yesterdayRevenue) : null;
  const dateFooter = now.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFooter = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[30] flex flex-col bg-slate-100 text-slate-900 overflow-hidden">
      {/* Üst bar — koyu lacivert (mockup) */}
      <header className="flex-shrink-0 bg-slate-900 text-white shadow-lg">
        <div className="flex items-center justify-between gap-4 px-5 md:px-8 h-14 md:h-16">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoSrc}
              alt="ŞefPOS"
              className="h-8 md:h-9 w-auto object-contain brightness-0 invert"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="text-sm md:text-base font-black tracking-wide truncate uppercase">
              {tenantName}
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-lg hover:bg-white/10 transition"
                title="Bildirimler"
              >
                <Bell className="w-5 h-5" />
                {unreadBell > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-black flex items-center justify-center">
                    {unreadBell > 9 ? '9+' : unreadBell}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-30 w-80 max-h-72 overflow-y-auto rounded-xl bg-white text-slate-800 shadow-2xl border border-slate-200 py-2">
                    {systemNotifs.length === 0 && (stats?.pendingOnlineCount ?? 0) === 0 ? (
                      <p className="px-4 py-6 text-sm text-slate-500 text-center">Bildirim yok</p>
                    ) : (
                      <>
                        {(stats?.pendingOnlineCount ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              onNavigate('online-orders');
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-orange-50 border-b border-slate-100"
                          >
                            <p className="text-xs font-bold text-orange-600">Online sipariş</p>
                            <p className="text-sm font-semibold">{stats?.pendingOnlineCount} bekleyen sipariş</p>
                          </button>
                        )}
                        {systemNotifs.slice(0, 8).map((n) => (
                          <div key={n.id} className="px-4 py-2.5 border-b border-slate-50 last:border-0">
                            <p className="text-xs font-bold text-slate-800">{n.title}</p>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{n.message}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {canOpenSettings && onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-2 rounded-lg hover:bg-white/10 transition"
                title="Ayarlar"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-white/20">
              <div className="text-right">
                <p className="text-sm font-bold leading-tight">{displayName}</p>
                <p className="text-[10px] text-slate-400 font-semibold">{roleLabel}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm font-black">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
                title="Çıkış"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sol + orta */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 md:px-8 py-6 space-y-6">
            <section>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900">
                Merhaba, {displayName.split(' ')[0]}
              </h1>
              <p className="text-sm text-slate-600 mt-1 font-medium">
                {tenantName} yönetim paneline hoş geldiniz.
                {activeBranch?.name ? ` (${activeBranch.name})` : ''}
              </p>
              {stats && (
                <div className="flex flex-wrap gap-3 mt-4">
                  <StatChip label="Açık adisyon" value={String(stats.openTickets)} />
                  <StatChip
                    label="Masa dolu"
                    value={`${stats.occupiedTables} / ${stats.totalTables || '—'}`}
                  />
                </div>
              )}
            </section>

            {primaryTiles.length > 0 && (
              <section>
                <SectionLabel title="Ana işlemler" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {primaryTiles.map((tile) => (
                    <PrimaryActionCard key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                  ))}
                </div>
              </section>
            )}

            {moduleTiles.length > 0 && (
              <section>
                <SectionLabel title="Modüller" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {moduleTiles.map((tile) => (
                    <ModuleCard key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Sağ panel */}
        <aside className="hidden lg:flex w-[300px] xl:w-[320px] flex-shrink-0 flex-col border-l border-slate-200 bg-white overflow-y-auto">
          {quickSaleTile && (
            <div className="p-4 border-b border-slate-100">
              <button
                type="button"
                onClick={() => handleTileClick('quick-sale')}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm shadow-lg transition active:scale-[0.99]"
              >
                <Zap className="w-5 h-5 text-amber-400" />
                Hızlı Satış
              </button>
            </div>
          )}

          <div className="p-4 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Günlük özet</p>
            <p className="text-xs text-slate-500 mb-2">{formatDashboardDateLabel()}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Toplam ciro</p>
            <p className="text-2xl font-black text-emerald-600 tabular-nums">
              {formatMoneyTr(stats?.todayRevenue ?? 0)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Dün: {formatMoneyTr(stats?.yesterdayRevenue ?? 0)}</span>
              {revPct != null && (
                <span
                  className={`inline-flex items-center gap-0.5 font-bold ${
                    revPct >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {revPct >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  %{Math.abs(revPct).toFixed(1)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <MiniMetric label="Adisyon" value={String(stats?.todayOrderCount ?? 0)} />
              <MiniMetric
                label="Ort. tutar"
                value={
                  stats && stats.todayOrderCount > 0
                    ? formatMoneyTr(stats.todayRevenue / stats.todayOrderCount)
                    : '—'
                }
              />
              <MiniMetric label="Paket" value={String(stats?.todayTakeawayCount ?? 0)} />
              <MiniMetric label="Online" value={String(stats?.todayOnlineCount ?? 0)} />
            </div>
          </div>

          <div className="p-4 flex-1 min-h-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Son işlemler</p>
            <div className="space-y-2">
              {recent.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Henüz işlem yok</p>
              ) : (
                recent.map((row) => (
                  <RecentRow key={row.id} row={row} onOpen={() => {
                    if (row.kind === 'online') onNavigate('online-orders');
                    else if (row.kind === 'takeaway') onNavigate('takeaway');
                    else onNavigate('tables');
                  }} />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Alt durum çubuğu */}
      <footer className="flex-shrink-0 h-9 px-5 md:px-8 flex items-center justify-between bg-white border-t border-slate-200 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-2">
          ŞefPOS {APP_DISPLAY_VERSION}
          <span className="inline-flex items-center gap-1 text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Sistem çevrimiçi
          </span>
        </span>
        <span className="hidden md:inline capitalize">
          {dateFooter} | {timeFooter}
        </span>
        <a href="tel:+905442449080" className="hover:text-orange-600 transition">
          Destek: 0544 244 90 80
        </a>
      </footer>
    </div>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
      <LayoutGrid className="w-3.5 h-3.5 text-orange-500" />
      {title}
    </h2>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm">
      <span className="text-xs font-bold text-slate-500">{label}:</span>
      <span className="text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}

function PrimaryActionCard({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-4 p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all text-left active:scale-[0.99]"
    >
      <span className="flex-shrink-0 w-14 h-14 rounded-2xl border-2 border-orange-200 bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition">
        <Icon className="w-7 h-7 text-orange-600" strokeWidth={2} />
      </span>
      <span className="min-w-0 pt-1">
        <span className="block text-lg font-extrabold text-slate-900">{tile.label}</span>
        {tile.description && (
          <span className="block text-sm text-slate-500 font-medium mt-0.5">{tile.description}</span>
        )}
      </span>
    </button>
  );
}

function ModuleCard({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-white border border-slate-200 hover:border-orange-300 hover:shadow-sm transition active:scale-[0.98] min-h-[100px]"
    >
      <Icon className="w-6 h-6 text-slate-500" strokeWidth={1.8} />
      <span className="text-xs font-bold text-slate-800 text-center leading-tight">{tile.label}</span>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
      <p className="text-[9px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-black text-slate-800 tabular-nums truncate">{value}</p>
    </div>
  );
}

function RecentRow({ row, onOpen }: { row: RecentActivityRow; onOpen: () => void }) {
  const toneClass =
    row.statusTone === 'open'
      ? 'bg-emerald-100 text-emerald-700'
      : row.statusTone === 'preparing'
        ? 'bg-blue-100 text-blue-700'
        : row.statusTone === 'done'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-amber-100 text-amber-700';

  const KindIcon = row.kind === 'online' ? ShoppingBagIcon : row.kind === 'takeaway' ? CartIcon : TableIcon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition text-left"
    >
      <span className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <KindIcon className="w-4 h-4 text-slate-600" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 truncate">{row.title}</p>
        <p className="text-[10px] text-slate-500">{formatRelativeTr(row.created_at)}</p>
      </span>
      <span className="text-right shrink-0">
        <p className="text-xs font-black text-slate-800 tabular-nums">{formatMoneyTr(row.amount)}</p>
        <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${toneClass}`}>
          {row.status}
        </span>
      </span>
    </button>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M7 20v-2M17 20v-2" />
    </svg>
  );
}

function CartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function ShoppingBagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}
