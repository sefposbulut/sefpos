import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Boxes,
  Clock,
  Grid3x3,
  Layers,
  Package,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  Zap,
  Gift,
} from 'lucide-react';
import { isModuleEnabled } from './modules';
import { isSqlServerMode } from './sqlDb';

export type PosMenuTile = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  show: boolean;
  /** App.tsx `handleNavigate` hedefi; `cashier` kasa modalini acar. */
  page: string;
  /** @deprecated Electron ana sayfada `desktopPrimary` kullanin. */
  featured?: boolean;
  /** Electron masaustu ana sayfa — ustteki 4 buyuk kart. */
  desktopPrimary?: boolean;
};

type AuthSlice = {
  permissions: {
    can_view_tables?: boolean;
    can_take_orders?: boolean;
    can_process_payments?: boolean;
    can_manage_products?: boolean;
    can_manage_users?: boolean;
    can_view_reports?: boolean;
    can_manage_cash_register?: boolean;
    can_use_shifts?: boolean;
    can_end_of_day?: boolean;
    can_view_cancel_logs?: boolean;
  };
  tenant: { disabled_modules?: string[] | null } | null;
  shiftsEnabled?: boolean;
};

/**
 * MainMenu ve Electron masaustu ana sayfasi icin ortak modul listesi.
 * Tenant `disabled_modules` ve rol yetkilerine gore filtrelenir.
 */
export function buildPosMenuTiles({
  permissions,
  tenant,
  shiftsEnabled,
}: AuthSlice): PosMenuTile[] {
  const mod = (code: string) => isModuleEnabled(code, tenant as any);
  const showStockProducts = !!permissions.can_manage_products && mod('products');
  const showStockInventory = !!permissions.can_manage_products && mod('inventory');

  const tiles: PosMenuTile[] = [
    {
      id: 'tables',
      label: 'Masalar',
      description: 'Masa durumunu görüntüle',
      icon: Grid3x3,
      show: !!permissions.can_view_tables && mod('tables'),
      page: 'tables',
      desktopPrimary: true,
    },
    {
      id: 'quick-sale',
      label: 'Hızlı Satış',
      description: 'Kasiyer — masa olmadan satış',
      icon: Zap,
      show:
        !!permissions.can_take_orders &&
        !!permissions.can_process_payments &&
        mod('quick-sale'),
      page: 'quick-sale',
      desktopPrimary: true,
    },
    {
      id: 'takeaway',
      label: 'Paket Servis',
      description: 'Paket servis oluştur',
      icon: ShoppingCart,
      show:
        !!(permissions.can_take_orders || permissions.can_view_tables) &&
        mod('takeaway'),
      page: 'takeaway',
      desktopPrimary: true,
    },
    {
      id: 'online-orders',
      label: 'Online Siparişler',
      description: 'Siparişleri yönet',
      icon: ShoppingBag,
      show:
        !isSqlServerMode() &&
        !!(permissions.can_take_orders || permissions.can_view_tables) &&
        mod('online-orders'),
      page: 'online-orders',
      desktopPrimary: true,
    },
    {
      id: 'products',
      label: 'Ürünler',
      description: 'Menu ve fiyatlar',
      icon: Package,
      show: showStockProducts,
      page: 'products',
    },
    {
      id: 'product-stock-count',
      label: 'Ürün Sayımı',
      description: 'Stok sayım belgesi',
      icon: Boxes,
      show: showStockInventory,
      page: 'product-stock-count',
    },
    {
      id: 'inventory',
      label: 'Reçete / Stok',
      description: 'Hammadde ve recete',
      icon: Boxes,
      show: showStockInventory,
      page: 'inventory',
    },
    {
      id: 'customers',
      label: 'Cari Hesaplar',
      description: 'Müşteri kartları',
      icon: Users,
      show:
        !!(permissions.can_process_payments || permissions.can_manage_products) &&
        mod('customers'),
      page: 'customers',
    },
    {
      id: 'loyalty',
      label: 'Sadakat',
      description: 'Puan kazan / kullan',
      icon: Gift,
      show:
        !!permissions.can_process_payments &&
        mod('loyalty') &&
        !isSqlServerMode(),
      page: 'loyalty',
    },
    {
      id: 'reports',
      label: 'Raporlar',
      description: 'Satış ve performans',
      icon: TrendingUp,
      show: !!permissions.can_view_reports && mod('reports'),
      page: 'reports',
    },
    {
      id: 'cashier',
      label: 'Kasa',
      description: 'Kasa giriş / çıkış',
      icon: Wallet,
      show: !!permissions.can_manage_cash_register && mod('cashier'),
      page: 'cashier',
    },
    {
      id: 'shifts',
      label: 'Vardiyalar',
      description: 'Vardiya aç / kapat',
      icon: Layers,
      show:
        !!shiftsEnabled &&
        !!(permissions.can_use_shifts || permissions.can_end_of_day) &&
        mod('shifts'),
      page: 'shifts',
    },
    {
      id: 'endofday',
      label: 'Gün Sonu',
      description: 'Z raporu ve kapanış',
      icon: Clock,
      show: !!permissions.can_end_of_day && mod('endofday'),
      page: 'endofday',
    },
    {
      id: 'users',
      label: 'Kullanıcılar',
      description: 'Personel ve roller',
      icon: UserCog,
      show: !!permissions.can_manage_users,
      page: 'users',
    },
    {
      id: 'cancel-logs',
      label: 'İptal Kayıtları',
      description: 'İptal logları',
      icon: Ban,
      show: !!permissions.can_view_cancel_logs && mod('cancel-logs'),
      page: 'cancel-logs',
    },
  ];

  return tiles.filter((t) => t.show);
}

export type PosMenuHubGroup = {
  id: string;
  title: string;
  /** Gruba dahil tile id sırası */
  tileIds: string[];
};

/** Electron ana sayfa — kategorili hub (referans düzen: 3 bölüm). */
export const POS_MENU_HUB_GROUPS: PosMenuHubGroup[] = [
  {
    id: 'sales',
    title: 'Satış & stok',
    tileIds: [
      'tables',
      'quick-sale',
      'takeaway',
      'online-orders',
      'products',
      'inventory',
      'product-stock-count',
    ],
  },
  {
    id: 'finance',
    title: 'Ön muhasebe',
    tileIds: ['customers', 'cashier', 'loyalty', 'reports', 'shifts', 'endofday'],
  },
  {
    id: 'admin',
    title: 'Yönetim',
    tileIds: ['users', 'cancel-logs', 'settings'],
  },
];

export const POS_HUB_ADMIN_GROUP_ID = 'admin';

/** Electron açılışında arka planda mount edilecek hub sayfaları (anında geçiş). */
export const ELECTRON_HUB_PREMOUNT_PAGES = [
  'tables',
  'quick-sale',
  'takeaway',
  'online-orders',
  'products',
  'inventory',
  'product-stock-count',
  'customers',
  'loyalty',
  'reports',
  'shifts',
  'endofday',
  'users',
  'cancel-logs',
] as const;

/** Hub modül kartı — hafif yatay, orantılı genişlik. */
export const POS_HUB_TILE_CARD_WIDTH = 'clamp(12.5rem, 28vw, 17.5rem)';
export const POS_HUB_TILE_CARD_MIN_HEIGHT = '6.75rem';

/** @deprecated Kare düzen; yatay kart için POS_HUB_TILE_CARD_WIDTH kullanın. */
export const POS_HUB_TILE_SIZE_CLAMP = POS_HUB_TILE_CARD_WIDTH;

/** Electron hub karesi — arka plan + ikon + metin uyumlu tema. */
export type PosHubTileTheme = {
  gradient: string;
  iconWell: string;
  icon: string;
  label: string;
  subtitle: string;
  ring: string;
  shadow: string;
  hoverShadow: string;
};

export const POS_HUB_TILE_THEME_DEFAULT: PosHubTileTheme = {
  gradient: 'from-orange-500 to-orange-600',
  iconWell: 'bg-orange-950/25 ring-1 ring-inset ring-orange-100/35',
  icon: 'text-white',
  label: 'text-white',
  subtitle: 'text-orange-100/95',
  ring: 'ring-orange-200/30',
  shadow: 'shadow-[0_2px_10px_rgba(234,88,12,0.22)]',
  hoverShadow: 'hover:shadow-[0_4px_14px_rgba(234,88,12,0.28)]',
};

/** Modül başına farklı renk; kutu içi sınıflar aynı ton ailesinden. */
export const POS_HUB_TILE_THEME: Record<string, PosHubTileTheme> = {
  tables: {
    gradient: 'from-orange-500 to-orange-600',
    iconWell: 'bg-orange-950/25 ring-1 ring-inset ring-orange-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-orange-100/95',
    ring: 'ring-orange-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(234,88,12,0.22)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(234,88,12,0.28)]',
  },
  'quick-sale': {
    gradient: 'from-amber-500 to-amber-600',
    iconWell: 'bg-amber-950/25 ring-1 ring-inset ring-amber-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-amber-100/95',
    ring: 'ring-amber-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(245,158,11,0.22)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(245,158,11,0.28)]',
  },
  takeaway: {
    gradient: 'from-orange-600 to-red-500',
    iconWell: 'bg-red-950/25 ring-1 ring-inset ring-orange-100/30',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-orange-100/95',
    ring: 'ring-orange-200/25',
    shadow: 'shadow-[0_2px_10px_rgba(234,88,12,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(239,68,68,0.22)]',
  },
  'online-orders': {
    gradient: 'from-red-500 to-red-600',
    iconWell: 'bg-red-950/25 ring-1 ring-inset ring-red-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-red-100/95',
    ring: 'ring-red-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(239,68,68,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(239,68,68,0.26)]',
  },
  products: {
    gradient: 'from-yellow-600 to-amber-600',
    iconWell: 'bg-amber-950/30 ring-1 ring-inset ring-yellow-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-yellow-100/95',
    ring: 'ring-yellow-200/25',
    shadow: 'shadow-[0_2px_10px_rgba(217,119,6,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(217,119,6,0.26)]',
  },
  inventory: {
    gradient: 'from-stone-600 to-stone-700',
    iconWell: 'bg-stone-950/30 ring-1 ring-inset ring-stone-200/30',
    icon: 'text-stone-50',
    label: 'text-stone-50',
    subtitle: 'text-stone-200/95',
    ring: 'ring-stone-300/25',
    shadow: 'shadow-[0_2px_10px_rgba(87,83,78,0.22)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(87,83,78,0.28)]',
  },
  'product-stock-count': {
    gradient: 'from-amber-600 to-orange-600',
    iconWell: 'bg-orange-950/25 ring-1 ring-inset ring-amber-100/30',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-amber-100/95',
    ring: 'ring-amber-200/25',
    shadow: 'shadow-[0_2px_10px_rgba(217,119,6,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(234,88,12,0.24)]',
  },
  reports: {
    gradient: 'from-red-600 to-red-700',
    iconWell: 'bg-red-950/30 ring-1 ring-inset ring-red-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-red-100/95',
    ring: 'ring-red-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(220,38,38,0.22)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(220,38,38,0.28)]',
  },
  customers: {
    gradient: 'from-sky-600 to-sky-700',
    iconWell: 'bg-sky-950/30 ring-1 ring-inset ring-sky-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-sky-100/95',
    ring: 'ring-sky-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(2,132,199,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(2,132,199,0.26)]',
  },
  loyalty: {
    gradient: 'from-rose-500 to-rose-600',
    iconWell: 'bg-rose-950/25 ring-1 ring-inset ring-rose-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-rose-100/95',
    ring: 'ring-rose-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(244,63,94,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(244,63,94,0.26)]',
  },
  cashier: {
    gradient: 'from-emerald-600 to-emerald-700',
    iconWell: 'bg-emerald-950/30 ring-1 ring-inset ring-emerald-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-emerald-100/95',
    ring: 'ring-emerald-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(5,150,105,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(5,150,105,0.26)]',
  },
  shifts: {
    gradient: 'from-indigo-600 to-indigo-700',
    iconWell: 'bg-indigo-950/30 ring-1 ring-inset ring-indigo-100/35',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-indigo-100/95',
    ring: 'ring-indigo-200/30',
    shadow: 'shadow-[0_2px_10px_rgba(79,70,229,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(79,70,229,0.26)]',
  },
  endofday: {
    gradient: 'from-orange-600 to-red-600',
    iconWell: 'bg-red-950/25 ring-1 ring-inset ring-orange-100/30',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-orange-100/95',
    ring: 'ring-orange-200/25',
    shadow: 'shadow-[0_2px_10px_rgba(234,88,12,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(220,38,38,0.22)]',
  },
  users: {
    gradient: 'from-slate-600 to-slate-700',
    iconWell: 'bg-slate-950/30 ring-1 ring-inset ring-slate-200/35',
    icon: 'text-slate-50',
    label: 'text-slate-50',
    subtitle: 'text-slate-200/95',
    ring: 'ring-slate-300/25',
    shadow: 'shadow-[0_2px_10px_rgba(71,85,105,0.22)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(71,85,105,0.28)]',
  },
  'cancel-logs': {
    gradient: 'from-slate-600 to-red-600',
    iconWell: 'bg-red-950/25 ring-1 ring-inset ring-slate-200/30',
    icon: 'text-white',
    label: 'text-white',
    subtitle: 'text-slate-200/95',
    ring: 'ring-slate-300/25',
    shadow: 'shadow-[0_2px_10px_rgba(71,85,105,0.2)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(220,38,38,0.22)]',
  },
  settings: {
    gradient: 'from-slate-700 to-slate-800',
    iconWell: 'bg-slate-950/35 ring-1 ring-inset ring-slate-200/30',
    icon: 'text-slate-50',
    label: 'text-slate-50',
    subtitle: 'text-slate-300/95',
    ring: 'ring-slate-400/20',
    shadow: 'shadow-[0_2px_10px_rgba(51,65,85,0.25)]',
    hoverShadow: 'hover:shadow-[0_4px_14px_rgba(51,65,85,0.32)]',
  },
};

export function getPosHubTileTheme(tileId: string): PosHubTileTheme {
  return POS_HUB_TILE_THEME[tileId] ?? POS_HUB_TILE_THEME_DEFAULT;
}

export function groupPosMenuTilesForHub(
  tiles: PosMenuTile[],
  extraTiles: PosMenuTile[] = [],
): { id: string; title: string; tiles: PosMenuTile[] }[] {
  const byId = new Map<string, PosMenuTile>();
  for (const t of [...tiles, ...extraTiles]) {
    if (t.show) byId.set(t.id, t);
  }
  const used = new Set<string>();
  const groups: { id: string; title: string; tiles: PosMenuTile[] }[] = [];

  for (const g of POS_MENU_HUB_GROUPS) {
    const row: PosMenuTile[] = [];
    for (const id of g.tileIds) {
      const tile = byId.get(id);
      if (tile) {
        row.push(tile);
        used.add(id);
      }
    }
    if (row.length > 0) groups.push({ id: g.id, title: g.title, tiles: row });
  }

  const rest = [...byId.values()].filter((t) => !used.has(t.id));
  if (rest.length > 0) {
    groups.push({ id: 'other', title: 'Diğer', tiles: rest });
  }

  return groups;
}
