import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Search, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Category = { id: string; name: string };
type ProductRow = {
  id: string;
  name: string;
  unit: string;
  category_id: string;
  barcode: string | null;
  stock_quantity: number;
  cost: number;
};

function symRefNo(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  const mm = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  return `SYM-${y}${m}${d}-${hh}${mm}${ss}`;
}

export function ProductStockCount() {
  const { tenant, activeBranch, branches, profile } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [branchMap, setBranchMap] = useState<Record<string, number>>({});
  const [branchStockOk, setBranchStockOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (activeBranch?.id) setBranchId(activeBranch.id);
  }, [activeBranch?.id]);

  const loadCategories = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .eq('tenant_id', tenant.id)
      .order('sort_order', { ascending: true });
    setCategories((data as Category[]) || []);
  }, [tenant?.id]);

  const loadProducts = useCallback(async () => {
    if (!tenant?.id) return;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, unit, category_id, barcode, stock_quantity, cost')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) {
      console.error('[sayim] urunler', error);
      setProducts([]);
      return;
    }
    setProducts((data as ProductRow[]) || []);
  }, [tenant?.id]);

  const loadBranchStocks = useCallback(async () => {
    if (!tenant?.id || !branchId) return;
    const { data, error } = await supabase
      .from('branch_product_stocks')
      .select('product_id, quantity')
      .eq('tenant_id', tenant.id)
      .eq('branch_id', branchId);
    if (error) {
      const msg = String((error as any)?.message || '').toLowerCase();
      const code = String((error as any)?.code || '');
      const missing =
        code === 'pgrst205' ||
        code === '42p01' ||
        msg.includes('branch_product_stocks') ||
        msg.includes('does not exist');
      if (missing) {
        setBranchStockOk(false);
        setBranchMap({});
        return;
      }
      setBranchMap({});
      return;
    }
    setBranchStockOk(true);
    const m: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      m[r.product_id] = Number(r.quantity || 0);
    });
    setBranchMap(m);
  }, [tenant?.id, branchId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tenant?.id) return;
      setLoading(true);
      await loadCategories();
      await loadProducts();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, loadCategories, loadProducts]);

  useEffect(() => {
    void loadBranchStocks();
  }, [loadBranchStocks]);

  const systemQty = useCallback(
    (p: ProductRow) => {
      if (!branchStockOk) return Number(p.stock_quantity || 0);
      const b = branchMap[p.id];
      if (b !== undefined) return Number(b || 0);
      if ((branches?.length || 0) > 1) return 0;
      return Number(p.stock_quantity || 0);
    },
    [branchMap, branchStockOk, branches?.length],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryId !== 'all' && p.category_id !== categoryId) return false;
      if (!q) return true;
      const bc = (p.barcode || '').toLowerCase();
      return p.name.toLowerCase().includes(q) || bc.includes(q);
    });
  }, [products, categoryId, search]);

  const setCount = (productId: string, raw: string) => {
    setCounts((prev) => ({ ...prev, [productId]: raw.replace(',', '.') }));
  };

  const clearCounts = () => setCounts({});

  const linesToApply = useMemo(() => {
    const out: { product: ProductRow; counted: number; sys: number; delta: number }[] = [];
    for (const p of filtered) {
      const raw = (counts[p.id] || '').trim();
      if (raw === '') continue;
      const counted = Number(raw);
      if (!Number.isFinite(counted) || counted < 0) continue;
      const sys = systemQty(p);
      const delta = counted - sys;
      if (Math.abs(delta) < 0.0001) continue;
      out.push({ product: p, counted, sys, delta });
    }
    return out;
  }, [filtered, counts, systemQty]);

  const upsertBranch = async (bid: string, productId: string, qty: number) => {
    if (!tenant?.id) return;
    const { error } = await supabase.from('branch_product_stocks').upsert(
      {
        tenant_id: tenant.id,
        branch_id: bid,
        product_id: productId,
        quantity: Number(qty.toFixed(2)),
      },
      { onConflict: 'tenant_id,branch_id,product_id' },
    );
    if (error) throw error;
  };

  const apply = async () => {
    if (!tenant?.id || !branchId) return;
    if (linesToApply.length === 0) {
      alert('Uygulanacak fark yok. Sayım sütununa gerçek stok miktarlarını girin.');
      return;
    }
    if (!branchStockOk) {
      if (!confirm('Şube stok tablosu yok; yalnızca merkez ürün stoku (products.stock_quantity) güncellenecek. Devam?')) return;
    } else if ((branches?.length || 0) > 1) {
      if (
        !confirm(
          `${linesToApply.length} ürün için seçili şubede stok sayım farkı uygulanacak. Onaylıyor musunuz?`,
        )
      )
        return;
    } else if (!confirm(`${linesToApply.length} ürün için stok sayım farkı uygulanacak. Onaylıyor musunuz?`)) return;

    setApplying(true);
    const refNo = symRefNo();
    const noteBase = `Ürün sayımı (${branches?.find((b) => b.id === branchId)?.name || 'şube'})`;

    try {
      for (const line of linesToApply) {
        const { product, counted, sys, delta } = line;
        const movementType = delta > 0 ? 'in' : 'out';
        const qty = Math.abs(delta);

        if (branchStockOk) {
          await upsertBranch(branchId, product.id, counted);
        }

        const isMultiBranch = (branches?.length || 0) > 1;
        if (!isMultiBranch || !branchStockOk) {
          const { error: pErr } = await supabase
            .from('products')
            .update({ stock_quantity: counted })
            .eq('id', product.id)
            .eq('tenant_id', tenant.id);
          if (pErr) throw new Error(`${product.name}: ${pErr.message}`);
        }

        const unitCost = Number(product.cost);
        const { error: mErr } = await supabase.from('stock_movements').insert({
          tenant_id: tenant.id,
          product_id: product.id,
          movement_type: movementType,
          quantity: qty,
          unit_cost: Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null,
          total_cost: null,
          supplier_name: null,
          note: `${noteBase} — sistem ${sys} → sayım ${counted}`,
          created_by: profile?.id || null,
          source_branch_id: delta < 0 ? branchId : null,
          target_branch_id: delta > 0 ? branchId : null,
          reference_type: 'stock_count',
          reference_no: refNo,
        } as any);
        if (mErr) throw new Error(`${product.name} hareket: ${mErr.message}`);
      }

      await loadProducts();
      await loadBranchStocks();
      clearCounts();
      alert(`Sayım uygulandı. Referans: ${refNo}\n\nKayıtları görmek için: Raporlar → Sayım raporu.`);
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setApplying(false);
    }
  };

  if (!tenant) {
    return <div className="p-6 text-slate-600 text-sm">Oturum gerekli.</div>;
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow shrink-0">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-black text-slate-800">Ürün sayımı</h2>
            <p className="text-xs md:text-sm text-slate-600 mt-0.5 leading-relaxed max-w-xl">
              Şubedeki gerçek miktarı girin; sistem stoku ile farkı hesaplar, onayda stok ve stok hareketi
              kaydı oluşturulur.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearCounts}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Sayım alanını temizle
          </button>
          <button
            type="button"
            disabled={applying || linesToApply.length === 0}
            onClick={() => void apply()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-black shadow disabled:opacity-50"
          >
            {applying ? 'Uygulanıyor…' : `Farkları uygula (${linesToApply.length})`}
          </button>
        </div>
      </div>

      {!branchStockOk && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <strong>Şube stok tablosu</strong> bu projede yok veya erişilemiyor. Sayım yalnızca ürün kartındaki
            merkez stok alanına yazılır.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-xs font-bold text-slate-600">
          Şube
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            {(branches || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_main ? ' (Ana)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Kategori
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="all">Tümü</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-[26px] w-4 h-4 text-slate-400" />
          <label className="block text-xs font-bold text-slate-600 mb-1">Ara</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün veya barkod"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
              <tr className="text-left text-xs font-black text-slate-600 uppercase tracking-wide">
                <th className="px-3 py-2">Ürün</th>
                <th className="px-3 py-2 w-20">Birim</th>
                <th className="px-3 py-2 w-24 text-right">Sistem</th>
                <th className="px-3 py-2 w-28">Sayım</th>
                <th className="px-3 py-2 w-24 text-right">Fark</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin inline mr-2" />
                    Yükleniyor…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Bu filtreye uygun ürün yok.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const sys = systemQty(p);
                  const raw = (counts[p.id] || '').trim();
                  const counted = raw === '' ? null : Number(raw.replace(',', '.'));
                  const diff =
                    counted != null && Number.isFinite(counted) ? counted - sys : null;
                  const diffCls =
                    diff == null || Math.abs(diff) < 0.0001
                      ? 'text-slate-400'
                      : diff > 0
                        ? 'text-emerald-700 font-bold'
                        : 'text-red-600 font-bold';
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2">
                        <div className="font-bold text-slate-800">{p.name}</div>
                        {p.barcode ? (
                          <div className="text-[11px] text-slate-500 font-mono">{p.barcode}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{p.unit || 'adet'}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">{sys.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <input
                          value={counts[p.id] ?? ''}
                          onChange={(e) => setCount(p.id, e.target.value)}
                          inputMode="decimal"
                          placeholder="—"
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right font-mono text-sm"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${diffCls}`}>
                        {diff == null || !Number.isFinite(diff) ? '—' : diff.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {linesToApply.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {linesToApply.length} satırda fark var; uygulayınca tek referans numarasıyla stok hareketine yazılır.
        </div>
      )}
    </div>
  );
}
