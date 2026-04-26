import { Package, Users, TrendingUp, Wallet, Clock, Grid3x3, Menu, X, UserCog, ShoppingBag, ShoppingCart, Ban, Settings, Lock } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface MainMenuProps {
  onNavigate: (page: string) => void;
  currentPage: string;
  onOpenSettings?: () => void;
  onLockScreen?: () => void;
}

export function MainMenu({ onNavigate, currentPage, onOpenSettings, onLockScreen }: MainMenuProps) {
  const { tenant, permissions } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const menuItems = [
    { id: 'tables', label: 'Masalar', icon: Grid3x3, show: permissions.can_view_tables },
    { id: 'takeaway', label: 'Paket Servis', icon: ShoppingCart, show: permissions.can_take_orders || permissions.can_view_tables },
    { id: 'online-orders', label: 'Online Siparişler', icon: ShoppingBag, show: permissions.can_take_orders || permissions.can_view_tables },
    { id: 'products', label: 'Stok Yönetimi', icon: Package, show: permissions.can_manage_products },
    { id: 'users', label: 'Kullanıcı Yönetimi', icon: UserCog, show: permissions.can_manage_users },
    { id: 'customers', label: 'Cari Hesaplar', icon: Users, show: permissions.can_process_payments || permissions.can_manage_products },
    { id: 'reports', label: 'Raporlar', icon: TrendingUp, show: permissions.can_view_reports },
    { id: 'cashier', label: 'Kasa', icon: Wallet, show: permissions.can_manage_cash_register },
    { id: 'endofday', label: 'Gün Sonu', icon: Clock, show: permissions.can_end_of_day },
    { id: 'cancel-logs', label: 'İptal Kayıtları', icon: Ban, show: permissions.can_view_cancel_logs },
  ];

  const availableItems = menuItems.filter(item => item.show);
  const hasPin = !!(tenant as any)?.lock_pin;
  const canOpenSettings = permissions.can_manage_settings;

  return (
    <>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-3 left-3 md:top-4 md:left-4 z-50 p-2 md:p-3 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-lg md:rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95"
      >
        {menuOpen ? <X size={20} className="md:w-6 md:h-6" /> : <Menu size={20} className="md:w-6 md:h-6" />}
      </button>

      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className={`fixed top-0 left-0 h-full w-64 md:w-80 bg-gradient-to-b from-orange-600 via-orange-700 to-red-700 shadow-2xl z-40 transform transition-transform duration-300 flex flex-col ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 md:p-6 pt-16 md:pt-20 flex-1 overflow-y-auto">
          <h2 className="text-xl md:text-2xl font-bold text-white mb-6 md:mb-8">ŞEFPOS</h2>

          <div className="space-y-1.5 md:space-y-2">
            {availableItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl transition-all active:scale-95 ${
                    isActive
                      ? 'bg-white text-orange-600 shadow-lg font-bold'
                      : 'text-white hover:bg-white/10'
                  }`}
                >
                  <Icon size={20} className="md:w-6 md:h-6" />
                  <span className="text-sm md:text-lg font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 md:p-6 border-t border-white/20 space-y-2">
          {canOpenSettings && onOpenSettings && (
            <button
              onClick={() => {
                onOpenSettings();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl text-white hover:bg-white/10 transition-all active:scale-95"
            >
              <Settings size={20} className="md:w-6 md:h-6" />
              <span className="text-sm md:text-lg font-medium">Ayarlar</span>
            </button>
          )}
          {onLockScreen && hasPin && (
            <button
              onClick={() => {
                onLockScreen();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-all active:scale-95"
            >
              <Lock size={20} className="md:w-6 md:h-6" />
              <span className="text-sm md:text-lg font-medium">Sistemi Kilitle</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
