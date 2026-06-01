import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Bell, Flame, LogOut, Phone, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { publicAsset } from '../../lib/assetUrl';
import { APP_DISPLAY_VERSION } from '../../lib/appVersion';
import {
  fetchElectronHomeBundle,
  formatMoneyTr,
  formatRelativeTr,
  revenueChangePct,
  type DashboardSnapshot,
  type RecentActivityRow,
  type TopSellerRow,
} from '../../lib/electronDashboardData';
import { startAdaptivePoller } from '../../lib/pollSchedule';
import { isActivePosPage } from '../../lib/pageActivity';
import { readElectronHomeCache, writeElectronHomeCache } from '../../lib/electronHomeCache';
import {
  readElectronHubMenuCache,
  writeElectronHubMenuCache,
  type CachedHubMenuGroup,
} from '../../lib/electronHubMenuCache';
import {
  buildPosMenuTiles,
  groupPosMenuTilesForHub,
  getPosHubTileTheme,
  POS_HUB_TILE_CARD_MIN_HEIGHT,
  POS_HUB_TILE_CARD_WIDTH,
  type PosMenuTile,
} from '../../lib/posMenuItems';
import { ELECTRON_HEADER_ICON_BTN_CLASS, ELECTRON_HEADER_LOGO_CLASS } from '../../lib/electronLayout';
import {
  countUnreadNotifications,
  fetchSupportNotifications,
  type SupportNotificationRow,
} from '../../lib/supportNotifications';
import { INVENTORY_TAB_STORAGE_KEY } from '../../lib/inventoryNav';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../../lib/reportsNav';
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

  const [stats, setStats] = useState<DashboardSnapshot>(() => initialCache?.stats ?? EMPTY_STATS);
  const [recent, setRecent] = useState<RecentActivityRow[]>(() => initialCache?.recent ?? []);
  const [topSellers, setTopSellers] = useState<TopSellerRow[]>(() => initialCache?.topSellers ?? []);
  const [systemNotifs, setSystemNotifs] = useState<SupportNotificationRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dataReady, setDataReady] = useState(() => !!initialCache);
  const [selectedRecent, setSelectedRecent] = useState<RecentActivityRow | null>(null);

  const canOpenSettings = !!permissions?.can_manage_settings;

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

  const menuGroupsLive = useMemo(
    () => groupPosMenuTilesForHub(allTiles, settingsTile ? [settingsTile] : []),
    [allTiles, settingsTile],
  );

  const menuGroupsFromCache = useMemo((): { id: string; title: string; tiles: PosMenuTile[] }[] | null => {
    if (!tenantId) return null;
    const cached = readElectronHubMenuCache(tenantId);
    if (!cached?.groups?.length) return null;
    const byId = new Map(allTiles.map((t) => [t.id, t]));
    if (settingsTile) byId.set(settingsTile.id, settingsTile);
    const merged = cached.groups
      .map((g: CachedHubMenuGroup) => {
        const tiles = g.tiles
          .map((ct) => byId.get(ct.id))
          .filter((t): t is PosMenuTile => !!t && t.show);
        if (!tiles.length) return null;
        return { id: g.id, title: g.title, tiles };
      })
      .filter((g): g is { id: string; title: string; tiles: PosMenuTile[] } => g != null);
    return merged.length > 0 ? merged : null;
  }, [tenantId, allTiles, settingsTile]);

  const menuGroups =
    menuGroupsLive.length > 0 ? menuGroupsLive : (menuGroupsFromCache ?? menuGroupsLive);

  useEffect(() => {
    if (!tenantId || menuGroupsLive.length === 0) return;
    writeElectronHubMenuCache(tenantId, menuGroupsLive);
  }, [tenantId, menuGroupsLive]);

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
  const tenantName = (tenant as { name?: string })?.name || 'İşletme';
  const firstName = displayName.split(' ')[0];
  const revPct = revenueChangePct(stats.todayRevenue, stats.yesterdayRevenue);

  const feedCount = (stats.pendingOnlineCount ?? 0) + recent.length;
  const hubLogoSrc = publicAsset('sefpos-round.png');
  const masaLabel =
    branchId && stats.totalTables > 0
      ? `${stats.occupiedTables}/${stats.totalTables}`
      : branchId
        ? String(stats.openTablesWithOrder)
        : '0';

  return (
    <div className="fixed inset-0 z-[30] flex flex-col overflow-hidden select-none bg-[#eceff3] text-slate-900">
      <div className="relative flex flex-col flex-1 min-h-0">
        <header className="shrink-0 mx-4 mt-4 rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 text-white shadow-lg border border-orange-800/20">
          <div className="px-5 py-4 md:px-6 md:py-5 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={hubLogoSrc}
                alt=""
                className={`${ELECTRON_HEADER_LOGO_CLASS} w-11 h-11 md:w-12 md:h-12`}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = publicAsset('logo.png');
                }}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">Günlük özet</p>
                <h1 className="text-2xl md:text-[1.75rem] font-black leading-tight tracking-tight">
                  Hoş geldiniz, {firstName}
                </h1>
                <p className="text-sm text-white/90 truncate">
                  {tenantName}
                  {activeBranch?.name ? ` · ${activeBranch.name}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HubHeaderKpi label="Bugün fiş" value={branchId ? String(stats.todayOrderCount) : '0'} />
              <HubHeaderKpi label="Günlük ciro" value={formatMoneyTr(stats.todayRevenue)} />
              <HubHeaderKpi label="Dolu masa" value={masaLabel} />
              <HubHeaderKpi
                label="Paket / online"
                value={
                  branchId ? `${stats.todayTakeawayCount} / ${stats.todayOnlineCount}` : '0 / 0'
                }
              />
              <HeaderActions
                onHeader
                unreadBell={unreadBell}
                notifOpen={notifOpen}
                setNotifOpen={setNotifOpen}
                systemNotifs={systemNotifs}
                pendingOnline={stats.pendingOnlineCount ?? 0}
                onNavigate={onNavigate}
                canOpenSettings={canOpenSettings}
                onOpenSettings={onOpenSettings}
                onSignOut={() => void signOut()}
              />
            </div>
          </div>
          {!branchId ? (
            <p className="px-5 pb-3 -mt-1 text-xs text-amber-100">Özet için üst menüden şube seçin</p>
          ) : null}
        </header>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 px-4 pb-4 pt-4 overflow-hidden">
          <main className="flex-1 min-w-0 min-h-0 overflow-y-auto [scrollbar-width:thin] px-1 sm:px-2 py-2 md:py-3">
            {menuGroups.length === 0 ? (
              <p className="text-sm text-slate-500 py-16 text-center">Görünür modül yok.</p>
            ) : (
              <HubModulesPane menuGroups={menuGroups} onTileClick={(page) => handleTileClick(page)} />
            )}
          </main>

          <aside className="w-full lg:w-[300px] xl:w-[320px] shrink-0 min-h-0 overflow-y-auto [scrollbar-width:thin] py-1 lg:py-2">
            <HubInsightsPanel
              stats={stats}
              topSellers={topSellers}
              recent={recent}
              branchId={branchId}
              dataReady={dataReady}
              revPct={revPct}
              feedCount={feedCount}
              pendingOnline={stats.pendingOnlineCount ?? 0}
              onOpenReports={() => handleTileClick('reports')}
              onOpenOnline={() => handleTileClick('online-orders')}
              onOpenRecent={setSelectedRecent}
            />
          </aside>
        </div>

        <footer className="flex-shrink-0 px-4 md:px-6 h-9 flex items-center justify-between gap-4 text-[11px] text-slate-500 border-t border-slate-200 bg-white">
          <span className="flex items-center gap-2 shrink-0">
            ŞefPOS {APP_DISPLAY_VERSION}
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Çevrimiçi
            </span>
          </span>
          <a
            href="tel:+905442449080"
            className="hidden sm:inline-flex items-center gap-1.5 hover:text-orange-600 transition"
          >
            <Phone className="w-3.5 h-3.5" />
            0544 244 90 80
          </a>
        </footer>

        {selectedRecent && (
          <RecentActivityDetailModal
            row={selectedRecent}
            onClose={() => setSelectedRecent(null)}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}

function HeaderActions({
  onHeader,
  unreadBell,
  notifOpen,
  setNotifOpen,
  systemNotifs,
  pendingOnline,
  onNavigate,
  canOpenSettings,
  onOpenSettings,
  onSignOut,
}: {
  onHeader?: boolean;
  unreadBell: number;
  notifOpen: boolean;
  setNotifOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  systemNotifs: SupportNotificationRow[];
  pendingOnline: number;
  onNavigate: (page: string) => void;
  canOpenSettings: boolean;
  onOpenSettings?: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <div className="relative">
        <HeaderIconBtn onHeader={onHeader} onClick={() => setNotifOpen((v) => !v)} title="Bildirimler">
          <Bell className="w-4 h-4" />
          {unreadBell > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-white text-[9px] font-black flex items-center justify-center">
              {unreadBell > 9 ? '9+' : unreadBell}
            </span>
          )}
        </HeaderIconBtn>
        {notifOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setNotifOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-30 w-72 max-h-60 overflow-y-auto bg-white text-slate-800 shadow-lg border border-slate-200 py-1">
              {systemNotifs.length === 0 && pendingOnline === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-500 text-center">Bildirim yok</p>
              ) : (
                <>
                  {pendingOnline > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('online-orders');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm font-semibold"
                    >
                      {pendingOnline} bekleyen online sipariş
                    </button>
                  )}
                  {systemNotifs.slice(0, 6).map((n) => (
                    <div key={n.id} className="px-3 py-2 border-t text-xs">
                      <p className="font-bold">{n.title}</p>
                      <p className="text-slate-500 line-clamp-2">{n.message}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
      {canOpenSettings && onOpenSettings && (
        <HeaderIconBtn onHeader={onHeader} onClick={onOpenSettings} title="Ayarlar">
          <Settings className="w-4 h-4" />
        </HeaderIconBtn>
      )}
      <HeaderIconBtn onHeader={onHeader} onClick={onSignOut} title="Çıkış">
        <LogOut className="w-4 h-4" />
      </HeaderIconBtn>
    </div>
  );
}

function HubHeaderKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[92px] px-3 py-2 rounded-xl bg-white/15 border border-white/25 backdrop-blur-[2px]">
      <p className="text-[9px] font-bold uppercase tracking-wide text-white/75 leading-tight">{label}</p>
      <p className="text-sm md:text-base font-black tabular-nums truncate mt-0.5">{value}</p>
    </div>
  );
}

function HeaderIconBtn({
  children,
  onClick,
  title,
  onHeader,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  onHeader?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        onHeader
          ? `${ELECTRON_HEADER_ICON_BTN_CLASS} relative`
          : 'relative p-2 text-slate-700 hover:bg-orange-50 rounded-lg transition active:scale-95'
      }
    >
      {children}
    </button>
  );
}

function HubInsightsPanel({
  stats,
  topSellers,
  recent,
  branchId,
  dataReady,
  revPct,
  feedCount,
  pendingOnline,
  onOpenReports,
  onOpenOnline,
  onOpenRecent,
}: {
  stats: DashboardSnapshot;
  topSellers: TopSellerRow[];
  recent: RecentActivityRow[];
  branchId: string;
  dataReady: boolean;
  revPct: number | null;
  feedCount: number;
  pendingOnline: number;
  onOpenReports: () => void;
  onOpenOnline: () => void;
  onOpenRecent: (row: RecentActivityRow) => void;
}) {
  const masaLabel =
    branchId && stats.totalTables > 0
      ? `${stats.occupiedTables}/${stats.totalTables}`
      : branchId
        ? String(stats.openTablesWithOrder)
        : '0';

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-3 lg:p-0 lg:pr-1">
      {pendingOnline > 0 && (
        <button
          type="button"
          onClick={onOpenOnline}
          className="w-full text-left px-4 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-sm hover:from-orange-600 hover:to-red-600 transition"
        >
          <p className="text-sm font-bold">Bekleyen online sipariş</p>
          <p className="text-xs text-white/90 mt-0.5">{pendingOnline} adet onay bekliyor</p>
        </button>
      )}

      <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Günlük özet</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900 mt-1">{formatMoneyTr(stats.todayRevenue)}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 mt-1">
          <span>Dün {formatMoneyTr(stats.yesterdayRevenue)}</span>
          {revPct != null && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${
                revPct >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {revPct >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              %{Math.abs(revPct).toFixed(1)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <HubInsightMetric label="Adisyon" value={branchId ? String(stats.todayOrderCount) : '0'} />
          <HubInsightMetric label="Dolu masa" value={masaLabel} />
          <HubInsightMetric label="Paket" value={branchId ? String(stats.todayTakeawayCount) : '0'} />
          <HubInsightMetric
            label="Online"
            value={branchId ? String(stats.todayOnlineCount) : '0'}
            highlight={pendingOnline > 0}
          />
        </div>
      </section>

      <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            En çok satan
          </p>
          <button
            type="button"
            onClick={onOpenReports}
            className="text-[10px] font-bold text-orange-600 hover:text-orange-700"
          >
            Raporlar →
          </button>
        </div>
        {topSellers.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {branchId ? (dataReady ? 'Bu dönemde satış yok' : 'Yükleniyor…') : 'Şube seçin'}
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-[220px] overflow-y-auto [scrollbar-width:thin] pr-0.5">
            {topSellers.slice(0, 8).map((row, idx) => (
              <HubTopSellerRow key={row.productId} rank={idx + 1} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 mb-2">
          Son işlemler
          {feedCount > 0 ? (
            <span className="ml-1.5 text-orange-600">({feedCount > 9 ? '9+' : feedCount})</span>
          ) : null}
        </p>
        {recent.length === 0 && pendingOnline === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {branchId ? (dataReady ? 'Yeni hareket yok' : 'Yükleniyor…') : 'Şube seçin'}
          </p>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto [scrollbar-width:thin] pr-0.5">
            {recent.slice(0, 6).map((row) => (
              <HubFeedCard
                key={row.id}
                title={row.title}
                subtitle={`${row.subtitle} · ${formatMoneyTr(row.amount)}`}
                time={formatRelativeTr(row.created_at)}
                onClick={() => onOpenRecent(row)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HubInsightMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`px-2.5 py-2 rounded-lg border ${
        highlight ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'
      }`}
    >
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-bold tabular-nums truncate mt-0.5 text-slate-900">{value}</p>
    </div>
  );
}

function HubModulesPane({
  menuGroups,
  onTileClick,
}: {
  menuGroups: { id: string; title: string; tiles: PosMenuTile[] }[];
  onTileClick: (page: string) => void;
}) {
  return (
    <div className="space-y-8 md:space-y-10 pb-4 pt-3 md:pt-5">
      {menuGroups.map((group, index) => (
        <section
          key={group.id}
          className={index === 0 ? 'pt-1' : undefined}
        >
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-4">
            {group.title}
          </h2>
          <div className="flex flex-wrap gap-3 sm:gap-3.5 md:gap-4 content-start">
            {group.tiles.map((tile) => (
              <HubMenuCard
                key={tile.id}
                tile={tile}
                onClick={() => onTileClick(tile.page)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HubFeedCard({
  title,
  subtitle,
  time,
  onClick,
}: {
  title: string;
  subtitle: string;
  time: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:bg-orange-50/50 transition text-left"
    >
      <span className="w-8 h-8 shrink-0 flex items-center justify-center bg-orange-100 rounded-lg">
        <Bell className="w-3.5 h-3.5 text-orange-600" />
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate text-slate-900">{title}</p>
        <p className="text-[11px] text-slate-500 truncate mt-0.5">{subtitle}</p>
      </span>
      <span className="text-[10px] text-slate-400 shrink-0">{time}</span>
    </button>
  );
}

function HubTopSellerRow({ rank, row }: { rank: number; row: TopSellerRow }) {
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center text-[10px] font-black bg-orange-600 text-white rounded-md">
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-[11px] font-bold truncate text-slate-900">{row.name}</p>
        <p className="text-[9px] text-slate-500">{row.quantity} adet</p>
      </span>
      <span className="text-[11px] font-black tabular-nums shrink-0 text-slate-800">
        {formatMoneyTr(row.revenue)}
      </span>
    </li>
  );
}

function HubMenuCard({
  tile,
  onClick,
}: {
  tile: PosMenuTile;
  onClick: () => void;
}) {
  const Icon = tile.icon;
  const theme = getPosHubTileTheme(tile.id);
  const subtitle = tile.description?.trim();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: POS_HUB_TILE_CARD_WIDTH, minHeight: POS_HUB_TILE_CARD_MIN_HEIGHT }}
      className={`shrink-0 flex flex-row items-center gap-3.5 rounded-xl bg-gradient-to-br ${theme.gradient} px-4 py-3.5 ring-1 ring-inset ${theme.ring} ${theme.shadow} ${theme.hoverShadow} hover:brightness-[1.03] active:scale-[0.98] transition-[transform,box-shadow,filter] text-left`}
    >
      <span className="w-12 h-12 rounded-lg bg-white/25 flex items-center justify-center shrink-0">
        <Icon className={`w-6 h-6 shrink-0 ${theme.icon}`} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 flex flex-col justify-center gap-0.5 py-0.5">
        <span className={`block text-[14px] font-bold leading-tight line-clamp-2 ${theme.label}`}>
          {tile.label}
        </span>
        {subtitle ? (
          <span
            className={`block text-[11px] font-medium leading-snug line-clamp-2 ${theme.subtitle}`}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}
