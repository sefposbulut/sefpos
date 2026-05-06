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
  const isElectron = !!(window as any).electronAPI;

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

  if (!isElectron) {
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
            className="fixed inset-0 bg-black/50 z-40"
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
          className="fixed inset-0 bg-slate-950/80 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div
        className={`fixed inset-0 z-40 transition-all duration-300 ${
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="h-full w-full flex items-center justify-center p-4 md:p-8">
          <div className="w-full max-w-6xl rounded-3xl border border-white/15 bg-gradient-to-b from-orange-600/95 via-orange-700/95 to-red-700/95 shadow-2xl p-4 md:p-8">
            <div className="flex items-center justify-between mb-4 md:mb-6">
              <h2 className="text-xl md:text-3xl font-black text-white">ŞEFPOS MENÜ</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
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
                    className={`w-full min-h-[98px] md:min-h-[118px] flex flex-col items-center justify-center gap-2 md:gap-3 px-3 py-3 rounded-2xl transition-all active:scale-95 ${
                      isActive
                        ? 'bg-white text-orange-600 shadow-xl font-black'
                        : 'text-white bg-white/10 hover:bg-white/20 border border-white/15'
                    }`}
                  >
                    <Icon size={22} className="md:w-7 md:h-7" />
                    <span className="text-xs md:text-sm font-bold text-center leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 md:mt-6 flex flex-wrap gap-2 md:gap-3">
              {canOpenSettings && onOpenSettings && (
                <button
                  onClick={() => {
                    onOpenSettings();
                    setMenuOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold flex items-center gap-2 transition"
                >
                  <Settings size={16} />
                  Ayarlar
                </button>
              )}
              {onLockScreen && hasPin && (
                <button
                  onClick={() => {
                    onLockScreen();
                    setMenuOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold flex items-center gap-2 transition"
                >
                  <Lock size={16} />
                  Sistemi Kilitle
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
