import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Flame,
  LayoutGrid,
  LogOut,
  Receipt,
  Settings,
  ShoppingBag,
  TrendingUp,
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
import { startAdaptivePoller } from '../../lib/pollSchedule';
import { isActivePosPage } from '../../lib/pageActivity';
import { subscribeLiveTick } from '../../lib/liveTick';
import { readElectronHomeCache, writeElectronHomeCache } from '../../lib/electronHomeCache';
import {
  buildPosMenuTiles,
  groupPosMenuTilesForHub,
  POS_HUB_TILE_GRADIENT,
  type PosMenuTile,
} from '../../lib/posMenuItems';
import {
  countUnreadNotifications,
  fetchSupportNotifications,
  type SupportNotificationRow,
} from '../../lib/supportNotifications';
import { INVENTORY_TAB_STORAGE_KEY } from '../../lib/inventoryNav';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';
import {
  ELECTRON_HEADER_ICON_BTN_CLASS,
  ELECTRON_HEADER_LOGO_CLASS,
} from '../../lib/electronLayout';
import { RecentActivityDetailModal } from './RecentActivityDetailModal';

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
  const [selectedRecent, setSelectedRecent] = useState<RecentActivityRow | null>(null);

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

  const settingsTile = useMemo((): PosMenuTile | null => {
    if (!canOpenSettings || !onOpenSettings) return null;
    return {
      id: 'settings',
      label: 'Ayarlar',
      description: 'Sistem ve yazıcı',
      icon: Settings,
      show: true,
      page: 'settings',
    };
  }, [canOpenSettings, onOpenSettings]);

  const menuGroups = useMemo(
    () => groupPosMenuTilesForHub(allTiles, settingsTile ? [settingsTile] : []),
    [allTiles, settingsTile],
  );

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
    try {
      const notifs = await fetchSupportNotifications(tenantId);
      setSystemNotifs(notifs);
    } catch {
      setSystemNotifs([]);
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
    const stopTick = subscribeLiveTick(() => setNow(new Date()));
    const stopPoll = startAdaptivePoller({
      baseMs: 120_000,
      idleMs: 240_000,
      hiddenMs: 0,
      run: () => {
        if (!isActivePosPage('desktop-home')) return;
        void refreshData();
      },
      immediate: false,
    });
    return () => {
      stopTick();
      stopPoll();
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
  const firstName = displayName.split(' ')[0];

  const kpiCards = [
    {
      key: 'receipts',
      icon: Receipt,
      value: branchId ? String(stats.todayOrderCount) : '—',
      label: 'Bugün fiş',
    },
    {
      key: 'revenue',
      icon: TrendingUp,
      value: branchId ? formatMoneyTr(stats.todayRevenue) : '—',
      label: 'Günlük ciro',
    },
    {
      key: 'tables',
      icon: LayoutGrid,
      value: branchId
        ? stats.totalTables > 0
          ? `${stats.occupiedTables}/${stats.totalTables}`
          : String(stats.openTablesWithOrder)
        : '—',
      label: stats.totalTables > 0 ? 'Dolu masa' : 'Açık masa',
    },
    {
      key: 'online',
      icon: ShoppingBag,
      value: branchId ? String(stats.pendingOnlineCount) : '—',
      label: 'Bekleyen online',
      highlight: (stats.pendingOnlineCount ?? 0) > 0,
    },
  ];

  return (
    <div className="fixed inset-0 z-[30] flex flex-col bg-slate-100 text-slate-900 overflow-hidden">
      {/* Üst özet şeridi — görsel örnekteki mavi hub bandı (ŞefPOS turuncu) */}
      <section className="flex-shrink-0 bg-gradient-to-r from-orange-600 via-orange-600 to-orange-700 text-white shadow-lg">
        <div className="px-4 md:px-8 pt-4 pb-5 md:pt-5 md:pb-6">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <img
                src={roundLogoSrc}
                alt="ŞefPOS"
                className={`${ELECTRON_HEADER_LOGO_CLASS} hidden sm:block`}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = publicAsset('logo.png');
                }}
              />
              <div className="min-w-0">
                <p className="text-xs md:text-sm font-semibold text-white/85 uppercase tracking-wide">
                  Günlük özet
                </p>
                <h1 className="text-xl md:text-2xl font-black leading-tight mt-0.5">
                  Hoş geldiniz, {firstName}
                </h1>
                <p className="text-sm md:text-base font-bold text-white/95 mt-1 truncate">
                  {tenantName}
                  {activeBranch?.name ? (
                    <span className="font-semibold text-white/80"> · {activeBranch.name}</span>
                  ) : null}
                </p>
                {roleLabel ? (
                  <p className="text-[11px] text-white/70 font-medium mt-0.5">{roleLabel}</p>
                ) : null}
                {!branchId && (
                  <p className="mt-2 text-xs font-semibold text-amber-100 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 inline-block">
                    Özet için üst menüden şube seçin
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 xl:gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 flex-1 min-w-0">
                {kpiCards.map((kpi) => (
                  <KpiGlassCard
                    key={kpi.key}
                    icon={kpi.icon}
                    value={kpi.value}
                    label={kpi.label}
                    highlight={kpi.highlight}
                  />
                ))}
              </div>

              <div className="flex items-center justify-end gap-1 sm:pl-2 sm:border-l sm:border-white/25 shrink-0">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    className={ELECTRON_HEADER_ICON_BTN_CLASS}
                    title="Bildirimler"
                  >
                    <Bell className="w-5 h-5" />
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
                                <p className="text-sm font-semibold">
                                  {stats?.pendingOnlineCount} bekleyen sipariş
                                </p>
                              </button>
                            )}
                            {systemNotifs.slice(0, 8).map((n) => (
                              <div
                                key={n.id}
                                className="px-4 py-2.5 border-b border-slate-50 last:border-0"
                              >
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
                    className={ELECTRON_HEADER_ICON_BTN_CLASS}
                    title="Ayarlar"
                  >
                    <Settings className="w-5 h-5" />
                  </button>
                )}

                <div className="hidden md:flex items-center gap-2 pl-2">
                  <div className="w-9 h-9 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-sm font-black">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className={ELECTRON_HEADER_ICON_BTN_CLASS}
                    title="Çıkış"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-7 md:space-y-8">
            {menuGroups.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-12">
                Bu hesap için görünür modül yok. Yöneticinizle yetkileri kontrol edin.
              </p>
            ) : (
              menuGroups.map((group) => (
                <section key={group.title}>
                  <h2 className="text-[11px] md:text-xs font-black uppercase tracking-widest text-slate-500 mb-3 md:mb-4">
                    {group.title}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                    {group.tiles.map((tile) => (
                      <HubMenuTile
                        key={tile.id}
                        tile={tile}
                        onClick={() => handleTileClick(tile.page)}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </main>

        <aside className="hidden lg:flex w-[280px] xl:w-[320px] flex-shrink-0 flex-col border-l border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                En çok satan
              </p>
              <button
                type="button"
                onClick={() => handleTileClick('reports')}
                className="text-[10px] font-bold text-orange-600 hover:text-orange-700"
              >
                Raporlar →
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium -mt-2 mb-2">Bugün · salon</p>
            <div
              className={`space-y-1.5 ${
                topSellers.length === 0
                  ? 'min-h-[100px] flex items-center justify-center'
                  : 'max-h-[200px] overflow-y-auto [scrollbar-width:thin]'
              }`}
            >
              {topSellers.length === 0 ? (
                <p className="text-xs text-slate-400 text-center px-2">
                  {branchId ? (dataReady ? 'Bu dönemde satış yok' : 'Yükleniyor…') : 'Şube seçin'}
                </p>
              ) : (
                topSellers.map((row, idx) => (
                  <TopSellerRow key={row.productId} rank={idx + 1} row={row} />
                ))
              )}
            </div>
          </div>

          <div className="p-4 border-b border-slate-100 bg-slate-50/80">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
              Günlük ciro
            </p>
            <p className="text-xs text-slate-400 mb-2">{formatDashboardDateLabel()}</p>
            <p className="text-2xl font-black text-emerald-600 tabular-nums">
              {formatMoneyTr(stats.todayRevenue)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
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
              <MiniMetric label="Paket" value={String(stats.todayTakeawayCount)} />
              <MiniMetric label="Online" value={String(stats.todayOnlineCount)} />
            </div>
          </div>

          <div className="p-4 flex-1 min-h-0 overflow-y-auto">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">
              Son işlemler
            </p>
            <div className="space-y-1.5 min-h-[120px]">
              {recent.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  {branchId ? (dataReady ? 'Henüz işlem yok' : 'Yükleniyor…') : 'Şube seçin'}
                </p>
              ) : (
                recent.map((row) => (
                  <RecentRow
                    key={row.id}
                    row={row}
                    onOpen={() => setSelectedRecent(row)}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {selectedRecent && (
        <RecentActivityDetailModal
          row={selectedRecent}
          onClose={() => setSelectedRecent(null)}
          onNavigate={onNavigate}
        />
      )}

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
        <button
          type="button"
          onClick={() => void signOut()}
          className="md:hidden text-white/95 hover:text-white font-bold"
        >
          Çıkış
        </button>
        <a href="tel:+905442449080" className="hidden md:inline hover:text-white transition text-white/95">
          0544 244 90 80
        </a>
      </footer>
    </div>
  );
}

function KpiGlassCard({
  icon: Icon,
  value,
  label,
  highlight,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 md:px-4 md:py-3 backdrop-blur-sm transition ${
        highlight
          ? 'bg-white text-orange-800 border-white shadow-md'
          : 'bg-white/15 border-white/25 text-white hover:bg-white/20'
      }`}
    >
      <div className="flex items-center gap-2 md:gap-3">
        <span
          className={`flex-shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center ${
            highlight ? 'bg-orange-100 text-orange-600' : 'bg-white/20 text-white'
          }`}
        >
          <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p
            className={`text-lg md:text-xl font-black tabular-nums leading-none truncate ${
              highlight ? 'text-orange-700' : 'text-white'
            }`}
          >
            {value}
          </p>
          <p
            className={`text-[9px] md:text-[10px] font-bold uppercase tracking-wide mt-0.5 ${
              highlight ? 'text-orange-600/90' : 'text-white/80'
            }`}
          >
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function HubMenuTile({ tile, onClick }: { tile: PosMenuTile; onClick: () => void }) {
  const Icon = tile.icon;
  const gradient = POS_HUB_TILE_GRADIENT[tile.id] ?? 'from-slate-500 to-slate-700';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col items-start justify-between min-h-[120px] md:min-h-[140px] p-4 md:p-5 rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-md hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all text-left overflow-hidden`}
    >
      <span className="absolute -right-3 -bottom-3 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
      <span className="relative w-11 h-11 md:w-12 md:h-12 rounded-xl bg-white/20 flex items-center justify-center border border-white/25 group-hover:bg-white/30 transition">
        <Icon className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2} />
      </span>
      <span className="relative mt-3 md:mt-4 min-w-0 w-full">
        <span className="block text-base md:text-lg font-black leading-tight">{tile.label}</span>
        {tile.description ? (
          <span className="block text-[11px] md:text-xs font-medium text-white/85 mt-1 line-clamp-2">
            {tile.description}
          </span>
        ) : null}
      </span>
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
    <div className="rounded-lg bg-white border border-slate-200 px-2.5 py-2">
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
      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-orange-200 hover:bg-orange-50/40 transition text-left"
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
