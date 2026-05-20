import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  LayoutGrid,
  LogOut,
  Settings,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { publicAsset } from '../../lib/assetUrl';
import { APP_DISPLAY_VERSION } from '../../lib/appVersion';
import {
  fetchElectronHomeBundle,
  formatDashboardDateLabel,
  formatMoneyTr,
  formatRelativeTr,
  revenueChangePct,
  type DashboardSnapshot,
  type RecentActivityRow,
  type TopSellerRow,
} from '../../lib/electronDashboardData';
import { readElectronHomeCache, writeElectronHomeCache } from '../../lib/electronHomeCache';
import { buildPosMenuTiles, type PosMenuTile } from '../../lib/posMenuItems';
import {
  countUnreadNotifications,
  fetchSupportNotifications,
  type SupportNotificationRow,
} from '../../lib/supportNotifications';
import { isSqlServerMode } from '../../lib/sqlDb';
import { INVENTORY_TAB_STORAGE_KEY } from '../../lib/inventoryNav';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';
import {
  ELECTRON_HEADER_BAR_CLASS,
  ELECTRON_HEADER_LOGO_CLASS,
  ELECTRON_HEADER_PADDING,
  ELECTRON_HEADER_ROW_CLASS,
} from '../../lib/electronLayout';

interface ElectronDesktopHomeProps {
  onNavigate: (page: string) => void;
  onOpenSettings?: () => void;
  onLockScreen?: () => void;
}

const EMPTY_STATS: DashboardSnapshot = {
  openTablesWithOrder: 0,
  occupiedTables: 0,
  totalTables: 0,
  todayRevenue: 0,
  yesterdayRevenue: 0,
  todayOrderCount: 0,
  todayTakeawayCount: 0,
  todayOnlineCount: 0,
  pendingOnlineCount: 0,
};

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Şube Müdürü',
  cashier: 'Kasiyer',
  waiter: 'Garson',
  courier: 'Kurye',
  kitchen: 'Mutfak',
};

const PRIMARY_ORDER = ['tables', 'takeaway', 'online-orders', 'quick-sale'] as const;

export function ElectronDesktopHome({
  onNavigate,
  onOpenSettings,
}: ElectronDesktopHomeProps) {
  const { tenant, profile, user, activeBranch, signOut, permissions, shiftsEnabled } = useAuth();
  const tenantId = tenant?.id || '';
  const branchId = activeBranch?.id || '';

  const initialCache = useMemo(() => {
    if (!tenantId || !branchId) return null;
    return readElectronHomeCache(tenantId, branchId);
  }, [tenantId, branchId]);

  const [now, setNow] = useState(() => new Date());
  const [stats, setStats] = useState<DashboardSnapshot>(() => initialCache?.stats ?? EMPTY_STATS);
  const [recent, setRecent] = useState<RecentActivityRow[]>(() => initialCache?.recent ?? []);
  const [topSellers, setTopSellers] = useState<TopSellerRow[]>(() => initialCache?.topSellers ?? []);
  const [systemNotifs, setSystemNotifs] = useState<SupportNotificationRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dataReady, setDataReady] = useState(() => !!initialCache);

  const canOpenSettings = !!permissions?.can_manage_settings;
  const roundLogoSrc = publicAsset('sefpos-round.png');

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
    const skip = new Set<string>([...PRIMARY_ORDER]);
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

  const applyBundle = useCallback(
    (bundle: { stats: DashboardSnapshot; recent: RecentActivityRow[]; topSellers: TopSellerRow[] }) => {
      setStats(bundle.stats);
      setRecent(bundle.recent);
      setTopSellers(bundle.topSellers);
      setDataReady(true);
      if (tenantId && branchId) {
        writeElectronHomeCache(tenantId, branchId, bundle);
      }
    },
    [tenantId, branchId],
  );

  const refreshData = useCallback(async () => {
    if (!tenantId || !branchId) return;
    const bundle = await fetchElectronHomeBundle(tenantId, branchId);
    applyBundle(bundle);
    if (!isSqlServerMode()) {
      const notifs = await fetchSupportNotifications(tenantId);
      setSystemNotifs(notifs);
    }
  }, [tenantId, branchId, applyBundle]);

  useEffect(() => {
    if (!tenantId || !branchId) return;
    const cached = readElectronHomeCache(tenantId, branchId);
    if (cached) {
      applyBundle(cached);
    } else {
      setStats(EMPTY_STATS);
      setRecent([]);
      setTopSellers([]);
      setDataReady(false);
    }
    void refreshData();
    const t = setInterval(() => setNow(new Date()), 30_000);
    const poll = setInterval(() => void refreshData(), 90_000);
    return () => {
      clearInterval(t);
      clearInterval(poll);
    };
  }, [tenantId, branchId, applyBundle, refreshData]);

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
  const revPct = revenueChangePct(stats.todayRevenue, stats.yesterdayRevenue);
  const dateFooter = now.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFooter = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[30] flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 overflow-hidden">
      <header className={ELECTRON_HEADER_BAR_CLASS}>
        <div className={ELECTRON_HEADER_PADDING}>
          <div className={ELECTRON_HEADER_ROW_CLASS}>
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={roundLogoSrc}
              alt="ŞefPOS"
              className={ELECTRON_HEADER_LOGO_CLASS}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = publicAsset('logo.png');
              }}
            />
            <span className="text-sm md:text-base font-black tracking-wide truncate uppercase text-white">
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
                <Bell className="w-5 h-5 text-white" />
                {unreadBell > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-orange-700 text-[10px] font-black flex items-center justify-center">
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
                <Settings className="w-5 h-5 text-white" />
              </button>
            )}

            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-white/25">
              <div className="text-right text-white">
                <p className="text-sm font-bold leading-tight text-white">{displayName}</p>
                <p className="text-[10px] text-white/80 font-semibold">{roleLabel}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-sm font-black text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="p-2 rounded-lg hover:bg-white/10 text-white"
                title="Çıkış"
              >
                <LogOut className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-5 md:px-8 py-5 md:py-6 space-y-5">
            <section className="bg-white rounded-2xl shadow-md border border-slate-200/80 p-5 md:p-6">
              <h1 className="text-2xl md:text-3xl font-black text-slate-900">
                Merhaba, {displayName.split(' ')[0]}
              </h1>
              <p className="text-sm text-slate-600 mt-1 font-medium">
                {tenantName}
                {activeBranch?.name ? ` · ${activeBranch.name}` : ''}
              </p>
              {activeBranch?.id ? (
                <div className="flex flex-wrap gap-2 mt-4">
                  <StatChip
                    label={`Açık masa`}
                    value={String(stats.openTablesWithOrder)}
                  />
                  <StatChip
                    label="Dolu masa"
                    value={`${stats.occupiedTables} / ${stats.totalTables || '—'}`}
                  />
                  <StatChip label="Bugün adisyon" value={String(stats.todayOrderCount)} accent />
                </div>
              ) : (
                <p className="mt-3 text-sm text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                  Özet için üst menüden şube seçin.
                </p>
              )}
            </section>

            <section>
              <SectionLabel title="Ana işlemler" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 min-h-[168px]">
                {primaryTiles.map((tile) => (
                  <PrimaryActionCard key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                ))}
              </div>
            </section>

            <section>
              <SectionLabel title="Modüller" />
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 min-h-[120px]">
                {moduleTiles.map((tile) => (
                  <ModuleCard key={tile.id} tile={tile} onClick={() => handleTileClick(tile.page)} />
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="hidden lg:flex w-[300px] xl:w-[340px] flex-shrink-0 flex-col border-l border-orange-200/60 bg-white shadow-[inset_4px_0_12px_rgba(0,0,0,0.02)] overflow-hidden">
          {quickSaleTile && (
            <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white">
              <button
                type="button"
                onClick={() => handleTileClick('quick-sale')}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 hover:from-amber-500 hover:via-orange-600 hover:to-red-600 text-white font-black text-sm shadow-lg border-2 border-orange-600 transition active:scale-[0.99]"
              >
                <Zap className="w-5 h-5" strokeWidth={2.5} />
                Hızlı Satış
              </button>
            </div>
          )}

          <div className="p-4 border-b border-slate-100">
            <PanelTitle icon={TrendingUp} title="En çok satanlar" subtitle="Bugün · Masa & Hızlı Satış" />
            <div className="mt-2 space-y-1.5 min-h-[200px]">
              {topSellers.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  {branchId ? (dataReady ? 'Bugün satış yok' : 'Yükleniyor…') : 'Şube seçin'}
                </p>
              ) : (
                topSellers.map((row, idx) => (
                  <TopSellerRow key={row.productId} rank={idx + 1} row={row} />
                ))
              )}
            </div>
          </div>

          <div className="p-4 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 mb-1">Günlük özet</p>
            <p className="text-xs text-slate-500 mb-2">{formatDashboardDateLabel()}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Toplam ciro</p>
            <p className="text-2xl font-black text-emerald-600 tabular-nums">
              {formatMoneyTr(stats.todayRevenue)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Dün: {formatMoneyTr(stats.yesterdayRevenue)}</span>
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
            <div className="grid grid-cols-2 gap-2 mt-3">
              <MiniMetric label="Adisyon" value={String(stats.todayOrderCount)} />
              <MiniMetric
                label="Ort. tutar"
                value={
                  stats.todayOrderCount > 0
                    ? formatMoneyTr(stats.todayRevenue / stats.todayOrderCount)
                    : '—'
                }
              />
              <MiniMetric label="Paket" value={String(stats.todayTakeawayCount)} />
              <MiniMetric label="Online" value={String(stats.todayOnlineCount)} />
            </div>
          </div>

          <div className="p-4 flex-1 min-h-0 overflow-y-auto">
            <PanelTitle title="Son işlemler" subtitle="Canlı" />
            <div className="mt-2 space-y-1.5 min-h-[140px]">
              {recent.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  {branchId ? (dataReady ? 'Henüz işlem yok' : 'Yükleniyor…') : 'Şube seçin'}
                </p>
              ) : (
                recent.map((row) => (
                  <RecentRow
                    key={row.id}
                    row={row}
                    onOpen={() => {
                      if (row.kind === 'online') onNavigate('online-orders');
                      else if (row.kind === 'takeaway') onNavigate('takeaway');
                      else onNavigate('tables');
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer
        className="flex-shrink-0 h-9 px-5 md:px-8 flex items-center justify-between text-[11px] font-semibold text-white shadow-[0_-2px_6px_rgba(0,0,0,0.12)] border-t border-orange-700/40"
        style={{ background: '#f97316' }}
      >
        <span className="flex items-center gap-2">
          ŞefPOS {APP_DISPLAY_VERSION}
          <span className="inline-flex items-center gap-1 text-white/95">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
            Çevrimiçi
          </span>
        </span>
        <span className="hidden md:inline capitalize text-white/90">
          {dateFooter} · {timeFooter}
        </span>
        <a href="tel:+905442449080" className="hover:text-white transition text-white/95">
          0544 244 90 80
        </a>
      </footer>
    </div>
  );
}

function PanelTitle({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {title}
      </p>
      {subtitle ? <span className="text-[9px] font-bold text-slate-400">{subtitle}</span> : null}
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

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm ${
        accent
          ? 'bg-orange-50 border-orange-200'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      <span className="text-xs font-bold text-slate-500">{label}:</span>
      <span className={`text-sm font-black tabular-nums ${accent ? 'text-orange-700' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );
}

function PrimaryActionCard({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 p-4 md:p-5 rounded-2xl bg-white border-2 border-orange-200/80 shadow-md hover:shadow-lg hover:border-orange-400 transition-all text-left active:scale-[0.99]"
    >
      <span className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-md border border-orange-600 group-hover:scale-[1.02] transition">
        <Icon className="w-7 h-7 text-white" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 pt-0.5">
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
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-orange-300 hover:shadow-md transition active:scale-[0.98] min-h-[96px]"
    >
      <span className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center">
        <Icon className="w-5 h-5 text-orange-600" strokeWidth={2} />
      </span>
      <span className="text-xs font-bold text-slate-800 text-center leading-tight">{tile.label}</span>
    </button>
  );
}

function TopSellerRow({ rank, row }: { rank: number; row: TopSellerRow }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5">
      <span
        className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
          rank <= 3 ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-600'
        }`}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 truncate">{row.name}</p>
        <p className="text-[10px] text-slate-500 tabular-nums">{row.quantity} adet</p>
      </span>
      <span className="text-xs font-black text-emerald-700 tabular-nums shrink-0">
        {formatMoneyTr(row.revenue)}
      </span>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-orange-50/50 border border-orange-100 px-2.5 py-2">
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
      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-orange-200 hover:bg-orange-50/40 transition text-left"
    >
      <span className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
        <KindIcon className="w-4 h-4 text-orange-600" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 truncate">{row.title}</p>
        <p className="text-[10px] text-slate-500">
          {row.subtitle} · {formatRelativeTr(row.created_at)}
        </p>
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
