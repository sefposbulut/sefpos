import { lazy, Suspense, type ReactNode } from 'react';

/** Soğuk / ağır POS sayfaları — Electron açılışında parse edilmez, sayfa açılınca yüklenir. */
export const LazyLandingPage = lazy(() =>
  import('../components/landing/LandingPage').then((m) => ({ default: m.LandingPage })),
);
export const LazyAdminPanel = lazy(() =>
  import('../components/AdminPanel').then((m) => ({ default: m.AdminPanel })),
);
export const LazyAykaLogin = lazy(() =>
  import('../components/AykaLogin').then((m) => ({ default: m.AykaLogin })),
);
export const LazyOnboardingWizard = lazy(() =>
  import('../components/OnboardingWizard').then((m) => ({ default: m.OnboardingWizard })),
);
export const LazyCourierApp = lazy(() =>
  import('../components/CourierApp').then((m) => ({ default: m.CourierApp })),
);
export const LazyWaiterApp = lazy(() =>
  import('../components/WaiterApp').then((m) => ({ default: m.WaiterApp })),
);
export const LazyProducts = lazy(() =>
  import('../components/Products').then((m) => ({ default: m.Products })),
);
export const LazyProductStockCount = lazy(() =>
  import('../components/inventory/ProductStockCount').then((m) => ({ default: m.ProductStockCount })),
);
export const LazyUserManagement = lazy(() =>
  import('../components/UserManagement').then((m) => ({ default: m.UserManagement })),
);
export const LazyCustomers = lazy(() =>
  import('../components/customers/Customers').then((m) => ({ default: m.Customers })),
);
export const LazyLoyaltyPage = lazy(() =>
  import('../components/loyalty/LoyaltyPage').then((m) => ({ default: m.LoyaltyPage })),
);
export const LazyReports = lazy(() =>
  import('../components/reports/Reports').then((m) => ({ default: m.Reports })),
);
export const LazyEndOfDay = lazy(() =>
  import('../components/EndOfDay').then((m) => ({ default: m.EndOfDay })),
);
export const LazyCancelLogs = lazy(() =>
  import('../components/CancelLogs').then((m) => ({ default: m.CancelLogs })),
);
export const LazyInventory = lazy(() =>
  import('../components/inventory/Inventory').then((m) => ({ default: m.Inventory })),
);
export const LazyQuickSale = lazy(() =>
  import('../components/QuickSale').then((m) => ({ default: m.QuickSale })),
);
export const LazyShiftManager = lazy(() =>
  import('../components/ShiftManager').then((m) => ({ default: m.ShiftManager })),
);
export const LazySettings = lazy(() =>
  import('../components/Settings').then((m) => ({ default: m.Settings })),
);
export const LazyCashRegister = lazy(() =>
  import('../components/CashRegister').then((m) => ({ default: m.CashRegister })),
);

export function PosPageSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-50/95">
          <p className="text-sm font-semibold text-slate-600 animate-pulse">Sayfa yükleniyor…</p>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
