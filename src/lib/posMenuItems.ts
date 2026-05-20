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
} from 'lucide-react';
import { isModuleEnabled } from './modules';

export type PosMenuTile = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  show: boolean;
  /** App.tsx `handleNavigate` hedefi; `cashier` kasa modalini acar. */
  page: string;
  /** Ana sayfa grid'inde daha buyuk karo (POS cekirdek modulleri). */
  featured?: boolean;
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
      description: 'Masa düzeni ve sipariş',
      icon: Grid3x3,
      show: !!permissions.can_view_tables && mod('tables'),
      page: 'tables',
      featured: true,
    },
    {
      id: 'quick-sale',
      label: 'Hızlı Satış',
      description: 'Kasiyer — masa olmadan',
      icon: Zap,
      show:
        !!permissions.can_take_orders &&
        !!permissions.can_process_payments &&
        mod('quick-sale'),
      page: 'quick-sale',
      featured: true,
    },
    {
      id: 'takeaway',
      label: 'Paket Servis',
      description: 'Paket ve kurye',
      icon: ShoppingCart,
      show:
        !!(permissions.can_take_orders || permissions.can_view_tables) &&
        mod('takeaway'),
      page: 'takeaway',
      featured: true,
    },
    {
      id: 'online-orders',
      label: 'Online Siparişler',
      description: 'Getir · Yemeksepeti · Trendyol',
      icon: ShoppingBag,
      show:
        !!(permissions.can_take_orders || permissions.can_view_tables) &&
        mod('online-orders'),
      page: 'online-orders',
      featured: true,
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
