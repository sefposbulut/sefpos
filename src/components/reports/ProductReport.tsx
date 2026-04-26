import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Package, RefreshCw, TrendingUp, Tag } from 'lucide-react';

interface ProductStat {
  name: string;
  category: string;
  quantity: number;
  revenue: number;
  orderCount: number;
  avgPrice: number;
}

interface CategoryStat {
  category: string;
  quantity: number;
  revenue: number;
  productCount: number;
}

interface ProductReportProps {
  selectedBranch: string;
}

type Period = 'today' | 'week' | 'month' | 'custom';

export function ProductReport({ selectedBranch }: ProductReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [products, setProducts] = useState<ProductStat[]>([]);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [view, setView] = useState<'products' | 'categories'>('products');
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity'>('revenue');

  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (period === 'today') return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
    if (period === 'week') {
      const w = new Date(now); w.setDate(w.getDate() - 6);
      return { start: w.toISOString().split('T')[0] + 'T00:00:00', end: today + 'T23:59:59' };
    }
    if (period === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: m.toISOString().split('T')[0] + 'T00:00:00', end: today + 'T23:59:59' };
    }
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart + 'T00:00:00', end: customEnd + 'T23:59:59' };
    }
    return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
  };

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getDateRange();

    let ordersQ = supabase
      .from('orders')
      .select('id, branch_id, order_items(quantity, total_amount, products(name, categories(name)))')
      .eq('tenant_id', tenant.id)
      .eq('status', 'completed')
      .gte('created_at', start)
      .lte('created_at', end);

    if (effectiveBranch !== 'all') {
      ordersQ = ordersQ.eq('branch_id', effectiveBranch);
    }

    const { data: orders } = await ordersQ;

    const productMap: Record<string, ProductStat> = {};
    const categoryMap: Record<string, CategoryStat> = {};

    (orders || []).forEach((order: any) => {
      (order.order_items || []).forEach((item: any) => {
        const pName = item.products?.name || 'Bilinmeyen';
        const cName = item.products?.categories?.name || 'Kategorisiz';

        if (!productMap[pName]) {
          productMap[pName] = { name: pName, category: cName, quantity: 0, revenue: 0, orderCount: 0, avgPrice: 0 };
        }
        productMap[pName].quantity += item.quantity;
        productMap[pName].revenue += item.total_amount || 0;
        productMap[pName].orderCount += 1;

        if (!categoryMap[cName]) {
          categoryMap[cName] = { category: cName, quantity: 0, revenue: 0, productCount: 0 };
        }
        categoryMap[cName].quantity += item.quantity;
        categoryMap[cName].revenue += item.total_amount || 0;
      });
    });

    const productList = Object.values(productMap).map(p => ({
      ...p,
      avgPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
    })).sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity);

    const allProductNames = new Set(productList.map(p => p.name));
    Object.entries(categoryMap).forEach(([cat, catData]) => {
      catData.productCount = productList.filter(p => p.category === cat).length;
    });

    const categoryList = Object.values(categoryMap)
      .sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity);

    setProducts(productList);
    setCategories(categoryList);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
  }, [tenant, effectiveBranch, period, sortBy]);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const maxRevenue = products[0]?.revenue || 1;

  const periodLabels: Record<Period, string> = { today: 'Bugün', week: 'Son 7 Gün', month: 'Bu Ay', custom: 'Özel' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 text-xs font-semibold transition-all ${period === p ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <span className="text-slate-400">—</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <button onClick={load} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold">Uygula</button>
          </div>
        )}
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ml-auto">
          <button onClick={() => setView('products')} className={`px-3 py-2 text-xs font-semibold transition-all ${view === 'products' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            Ürünler
          </button>
          <button onClick={() => setView('categories')} className={`px-3 py-2 text-xs font-semibold transition-all ${view === 'categories' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
            Kategoriler
          </button>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <button onClick={() => setSortBy('revenue')} className={`px-3 py-2 text-xs font-semibold transition-all ${sortBy === 'revenue' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Ciroya Göre</button>
          <button onClick={() => setSortBy('quantity')} className={`px-3 py-2 text-xs font-semibold transition-all ${sortBy === 'quantity' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Adete Göre</button>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition">
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : (
        <>
          {view === 'products' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Toplam Ürün Çeşidi', value: products.length, icon: Package, color: 'bg-blue-500', text: 'text-blue-700' },
                  { label: 'Toplam Satış', value: products.reduce((s, p) => s + p.quantity, 0) + ' adet', icon: TrendingUp, color: 'bg-emerald-500', text: 'text-emerald-700' },
                  { label: 'Toplam Ciro', value: fmt(totalRevenue) + ' ₺', icon: TrendingUp, color: 'bg-orange-500', text: 'text-orange-700' },
                  { label: 'En Çok Satan', value: products[0]?.name || '—', icon: Tag, color: 'bg-amber-500', text: 'text-amber-700' },
                ].map(({ label, value, icon: Icon, color, text }) => (
                  <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                      <div className={`w-7 h-7 ${color} rounded-lg flex items-center justify-center`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <p className={`text-lg font-black ${text} truncate`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-700">Ürün Performansı</h3>
                </div>
                {products.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500">Bu dönem için satış verisi bulunamadı</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left py-3 px-5 text-slate-500 font-semibold">#</th>
                          <th className="text-left py-3 px-5 text-slate-500 font-semibold">Ürün</th>
                          <th className="text-left py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Kategori</th>
                          <th className="text-right py-3 px-5 text-slate-500 font-semibold">Adet</th>
                          <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Ort. Fiyat</th>
                          <th className="text-right py-3 px-5 text-slate-500 font-semibold">Ciro</th>
                          <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p, i) => {
                          const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
                          return (
                            <tr key={p.name} className="border-t border-slate-50 hover:bg-slate-50 transition">
                              <td className="py-3 px-5">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                                  {i + 1}
                                </span>
                              </td>
                              <td className="py-3 px-5">
                                <div>
                                  <p className="font-semibold text-slate-800">{p.name}</p>
                                  <div className="h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden w-32">
                                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-5 hidden md:table-cell">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{p.category}</span>
                              </td>
                              <td className="py-3 px-5 text-right font-semibold text-slate-700">{p.quantity}</td>
                              <td className="py-3 px-5 text-right text-slate-500 hidden md:table-cell">{fmt(p.avgPrice)} ₺</td>
                              <td className="py-3 px-5 text-right font-bold text-emerald-700">{fmt(p.revenue)} ₺</td>
                              <td className="py-3 px-5 text-right hidden md:table-cell">
                                <span className="text-xs font-semibold text-slate-500">{pct.toFixed(1)}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {view === 'categories' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">Kategori Performansı</h3>
              </div>
              {categories.length === 0 ? (
                <div className="p-12 text-center">
                  <Tag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500">Bu dönem için veri bulunamadı</p>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  {categories.map((c, i) => {
                    const pct = totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0;
                    const colors = ['bg-orange-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-400', 'bg-teal-500', 'bg-pink-500'];
                    const color = colors[i % colors.length];
                    return (
                      <div key={c.category} className="flex items-center gap-4">
                        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0`}>
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between mb-1">
                            <div>
                              <span className="font-bold text-slate-800">{c.category}</span>
                              <span className="text-xs text-slate-400 ml-2">{c.productCount} ürün çeşidi · {c.quantity} adet</span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-emerald-700">{fmt(c.revenue)} ₺</span>
                              <span className="text-xs text-slate-400 ml-2">%{pct.toFixed(1)}</span>
                            </div>
                          </div>
                          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
