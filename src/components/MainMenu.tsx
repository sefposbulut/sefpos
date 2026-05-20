import { Package, Users, TrendingUp, Wallet, Clock, Grid3x3, Menu, X, UserCog, ShoppingBag, ShoppingCart, Ban, Settings, Lock, Zap, Boxes, Layers, ChevronDown, ClipboardList, BarChart3, ChefHat } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUiPrefs } from '../lib/uiPrefs';
import { isModuleEnabled } from '../lib/modules';
import { REPORTS_INITIAL_TAB_STORAGE_KEY, REPORTS_MENU_LAST_KEY } from '../lib/reportsNav';
import { INVENTORY_TAB_STORAGE_KEY } from '../lib/inventoryNav';

interface MainMenuProps {
  onNavigate: (page: string) => void;
  currentPage: string;
  onOpenSettings?: () => void;
  onLockScreen?: () => void;
}

export function MainMenu({ onNavigate, currentPage, onOpenSettings, onLockScreen }: MainMenuProps) {
  const { tenant, permissions, shiftsEnabled } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [stockMgmtExpanded, setStockMgmtExpanded] = useState(false);
  const isElectron = !!(window as any).electronAPI;
  const { headerHidden } = useUiPrefs();

  useEffect(() => {
    if (currentPage === 'reports' || currentPage === 'reports-stock-count') {
      setReportsExpanded(true);
    }
  }, [currentPage]);

  useEffect(() => {
    if (currentPage === 'products' || currentPage === 'inventory' || currentPage === 'product-stock-count') {
      setStockMgmtExpanded(true);
    }
  }, [currentPage]);

  // Sayfa kabugundan (App.tsx) gelen 'open-main-menu' eventi POS modunda
  // sag alt FAB'a basildigida tetiklenir → menuyu yan panel olarak acar.
  useEffect(() => {
    const handler = () => setMenuOpen(true);
    window.addEventListener('sefpos-open-main-menu', handler as EventListener);
    return () => window.removeEventListener('sefpos-open-main-menu', handler as EventListener);
  }, []);

  // Tenant'ın disabled_modules listesinde olan modüller — lisans panelinden
  // süper-admin tarafından gizlenmiştir. UI'da görünmesin diye `show` flag'i
  // ile birleştiriyoruz. `users` ve `settings` her zaman görünür (admin yolu).
  const mod = (code: string) => isModuleEnabled(code, tenant as any);

  const showStockProducts = permissions.can_manage_products && mod('products');
  const showStockInventory = permissions.can_manage_products && mod('inventory');

  let inventoryTabForMenu: string | null = null;
  try {
    inventoryTabForMenu = sessionStorage.getItem(INVENTORY_TAB_STORAGE_KEY);
  } catch {
    inventoryTabForMenu = null;
  }

  const menuItems = [
    { id: 'tables', label: 'Masalar', icon: Grid3x3, show: permissions.can_view_tables && mod('tables') },
    { id: 'quick-sale', label: 'Hızlı Satış', icon: Zap, show: permissions.can_take_orders && permissions.can_process_payments && mod('quick-sale') },
    { id: 'takeaway', label: 'Paket Servis', icon: ShoppingCart, show: (permissions.can_take_orders || permissions.can_view_tables) && mod('takeaway') },
    { id: 'online-orders', label: 'Online Siparişler', icon: ShoppingBag, show: (permissions.can_take_orders || permissions.can_view_tables) && mod('online-orders') },
    {
      id: 'stock-management',
      label: 'Stok yönetimi',
      icon: Boxes,
      show: showStockProducts || showStockInventory,
    },
    { id: 'users', label: 'Kullanıcı Yönetimi', icon: UserCog, show: permissions.can_manage_users },
    { id: 'customers', label: 'Cari Hesaplar', icon: Users, show: (permissions.can_process_payments || permissions.can_manage_products) && mod('customers') },
    { id: 'reports', label: 'Raporlar', icon: TrendingUp, show: permissions.can_view_reports && mod('reports') },
    { id: 'cashier', label: 'Kasa', icon: Wallet, show: permissions.can_manage_cash_register && mod('cashier') },
    { id: 'shifts', label: 'Vardiyalar', icon: Layers, show: shiftsEnabled && (permissions.can_use_shifts || permissions.can_end_of_day) && mod('shifts') },
    { id: 'endofday', label: 'Gün Sonu', icon: Clock, show: permissions.can_end_of_day && mod('endofday') },
    { id: 'cancel-logs', label: 'İptal Kayıtları', icon: Ban, show: permissions.can_view_cancel_logs && mod('cancel-logs') },
  ];

  const availableItems = menuItems.filter(item => item.show);
  const hasPin = !!(tenant as any)?.lock_pin;
  const canOpenSettings = permissions.can_manage_settings;

  // Electron: tek navigasyon ElectronDesktopHome (ana sayfa). Eski tam ekran
  // turuncu overlay menü kapatildi — cift menu ve Menulux benzeri grid kalmasin.
  if (isElectron) {
    return null;
  }

  return (
    <>
        {!headerHidden && (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="fixed top-3 left-3 md:top-4 md:left-4 z-50 p-2 md:p-3 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-lg md:rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95"
          >
            {menuOpen ? <X size={20} className="md:w-6 md:h-6" /> : <Menu size={20} className="md:w-6 md:h-6" />}
          </button>
        )}

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
                if (item.id === 'reports') {
                  const Icon = item.icon;
                  const reportsSectionActive =
                    currentPage === 'reports' || currentPage === 'reports-stock-count';
                  return (
                    <div key="reports-nav">
                      <button
                        type="button"
                        onClick={() => setReportsExpanded((e) => !e)}
                        className={`w-full flex items-center justify-between gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl transition-all active:scale-95 ${
                          reportsSectionActive
                            ? 'bg-white text-orange-600 shadow-lg font-bold'
                            : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-3 md:gap-4 min-w-0">
                          <Icon size={20} className="md:w-6 md:h-6 shrink-0" />
                          <span className="text-sm md:text-lg font-medium truncate">{item.label}</span>
                        </span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 transition-transform opacity-90 ${reportsExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {reportsExpanded && (
                        <div className="mt-1 ml-3 md:ml-4 pl-3 md:pl-4 border-l-2 border-white/40 space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate('reports');
                              setMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                              currentPage === 'reports'
                                ? 'bg-white text-orange-600'
                                : 'text-white/95 hover:bg-white/10'
                            }`}
                          >
                            Genel raporlar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate('reports-stock-count');
                              setMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                              currentPage === 'reports-stock-count'
                                ? 'bg-white text-orange-600'
                                : 'text-white/95 hover:bg-white/10'
                            }`}
                          >
                            <ClipboardList size={16} className="shrink-0 opacity-90" />
                            Sayım raporu
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                if (item.id === 'stock-management') {
                  const Icon = item.icon;
                  const stockSectionActive =
                    currentPage === 'products' ||
                    currentPage === 'inventory' ||
                    currentPage === 'product-stock-count';
                  const countActive = currentPage === 'product-stock-count';
                  const recipesActive =
                    currentPage === 'inventory' && inventoryTabForMenu === 'recipes';
                  return (
                    <div key="stock-mgmt-nav">
                      <button
                        type="button"
                        onClick={() => setStockMgmtExpanded((e) => !e)}
                        className={`w-full flex items-center justify-between gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 rounded-lg md:rounded-xl transition-all active:scale-95 ${
                          stockSectionActive
                            ? 'bg-white text-orange-600 shadow-lg font-bold'
                            : 'text-white hover:bg-white/10'
                        }`}
                      >
                        <span className="flex items-center gap-3 md:gap-4 min-w-0">
                          <Icon size={20} className="md:w-6 md:h-6 shrink-0" />
                          <span className="text-sm md:text-lg font-medium truncate">{item.label}</span>
                        </span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 transition-transform opacity-90 ${stockMgmtExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {stockMgmtExpanded && (
                        <div className="mt-1 ml-3 md:ml-4 pl-3 md:pl-4 border-l-2 border-white/40 space-y-1">
                          {showStockProducts && (
                            <button
                              type="button"
                              onClick={() => {
                                onNavigate('products');
                                setMenuOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                                currentPage === 'products'
                                  ? 'bg-white text-orange-600'
                                  : 'text-white/95 hover:bg-white/10'
                              }`}
                            >
                              <Package size={16} className="shrink-0 opacity-90" />
                              Ürünler
                            </button>
                          )}
                          {showStockInventory && (
                            <button
                              type="button"
                              onClick={() => {
                                onNavigate('product-stock-count');
                                setMenuOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                                countActive
                                  ? 'bg-white text-orange-600'
                                  : 'text-white/95 hover:bg-white/10'
                              }`}
                            >
                              <ClipboardList size={16} className="shrink-0 opacity-90" />
                              Ürün sayımı
                            </button>
                          )}
                          {showStockInventory && (
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  sessionStorage.setItem(INVENTORY_TAB_STORAGE_KEY, 'recipes');
                                } catch {
                                  /* ignore */
                                }
                                onNavigate('inventory');
                                setMenuOpen(false);
                              }}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${
                                recipesActive
                                  ? 'bg-white text-orange-600'
                                  : 'text-white/95 hover:bg-white/10'
                              }`}
                            >
                              <ChefHat size={16} className="shrink-0 opacity-90" />
                              Reçete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
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
