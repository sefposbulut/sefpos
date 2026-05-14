import { useState, useEffect } from 'react';
import { Boxes, Truck, ChefHat, FileText, AlertTriangle, ClipboardList } from 'lucide-react';
import { Ingredients } from './Ingredients';
import { Suppliers } from './Suppliers';
import { Recipes } from './Recipes';
import { PurchaseInvoices } from './PurchaseInvoices';
import { ProductStockCount } from './ProductStockCount';
import { useCriticalStockCount } from './useCriticalStockCount';

type Tab = 'ingredients' | 'suppliers' | 'recipes' | 'purchases' | 'product-count';

export function Inventory() {
  const [tab, setTab] = useState<Tab>('ingredients');
  const criticalCount = useCriticalStockCount();

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('sefpos_inventory_tab');
      if (v === 'product-count') {
        setTab('product-count');
        sessionStorage.removeItem('sefpos_inventory_tab');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: 'ingredients', label: 'Hammadde', icon: Boxes, badge: criticalCount },
    { id: 'product-count', label: 'Ürün sayımı', icon: ClipboardList },
    { id: 'suppliers', label: 'Tedarikçi', icon: Truck },
    { id: 'recipes', label: 'Reçete', icon: ChefHat },
    { id: 'purchases', label: 'Alış Faturası', icon: FileText },
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white border-b border-slate-200 shadow-sm shrink-0 px-3 md:px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow">
              <Boxes className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-black text-slate-800">Reçete / Sayım</h1>
              <div className="text-[11px] md:text-xs text-slate-500 font-semibold">
                Reçete, ürün sayımı, hammadde, tedarikçi, alış faturası
              </div>
            </div>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-black text-red-700">
                {criticalCount} kritik stok
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto -mx-3 md:-mx-6 px-3 md:px-6 pb-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 md:px-4 py-2 rounded-xl flex items-center gap-1.5 text-sm font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 ${
                  active
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
                {t.badge ? (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    active ? 'bg-white text-red-600' : 'bg-red-500 text-white'
                  }`}>
                    {t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {tab === 'ingredients' && <Ingredients />}
        {tab === 'suppliers' && <Suppliers />}
        {tab === 'recipes' && <Recipes />}
        {tab === 'purchases' && <PurchaseInvoices />}
        {tab === 'product-count' && <ProductStockCount />}
      </div>
    </div>
  );
}
