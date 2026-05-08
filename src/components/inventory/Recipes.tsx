import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, ChefHat, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  category_id: string | null;
  is_active: boolean | null;
  price: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
  current_stock: number;
}

interface RecipeRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  ingredient_id: string;
  quantity: number;
  unit: string | null;
  ingredient_name?: string;
  ingredient_unit?: string;
  ingredient_cost?: number;
}

export function Recipes() {
  const { tenant } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipeRows, setRecipeRows] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Yeni satır
  const [pickIngredientId, setPickIngredientId] = useState('');
  const [pickQty, setPickQty] = useState('');

  const loadProducts = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('products')
      .select('id, name, category_id, is_active, price')
      .eq('tenant_id', tenant.id)
      .order('name');
    setProducts(((data as any[] | null) || []).filter((p) => p.is_active !== false));
  }, [tenant?.id]);

  const loadIngredients = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('ingredients')
      .select('id, name, unit, unit_cost, current_stock')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name');
    setIngredients((data as any[] | null) || []);
  }, [tenant?.id]);

  const loadRecipe = useCallback(async (productId: string) => {
    if (!tenant?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('recipes')
      .select('id, product_id, variant_id, ingredient_id, quantity, unit, ingredients(name, unit, unit_cost)')
      .eq('tenant_id', tenant.id)
      .eq('product_id', productId);
    const rows: RecipeRow[] = ((data as any[] | null) || []).map((r) => ({
      id: r.id,
      product_id: r.product_id,
      variant_id: r.variant_id,
      ingredient_id: r.ingredient_id,
      quantity: Number(r.quantity),
      unit: r.unit,
      ingredient_name: r.ingredients?.name,
      ingredient_unit: r.ingredients?.unit,
      ingredient_cost: Number(r.ingredients?.unit_cost || 0),
    }));
    setRecipeRows(rows);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    void loadProducts();
    void loadIngredients();
  }, [loadProducts, loadIngredients]);

  useEffect(() => {
    if (selectedProduct) void loadRecipe(selectedProduct.id);
    else setRecipeRows([]);
  }, [selectedProduct, loadRecipe]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const totalCost = useMemo(
    () => recipeRows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.ingredient_cost || 0), 0),
    [recipeRows],
  );

  const margin = useMemo(() => {
    if (!selectedProduct?.price) return null;
    const m = Number(selectedProduct.price) - totalCost;
    return { value: m, ratio: (m / Number(selectedProduct.price)) * 100 };
  }, [selectedProduct, totalCost]);

  const addRow = useCallback(async () => {
    if (!tenant?.id || !selectedProduct) return;
    if (!pickIngredientId || !pickQty) return;
    const qty = Number(pickQty);
    if (!isFinite(qty) || qty <= 0) { alert('Miktar 0\'dan büyük olmalı'); return; }
    const ing = ingredients.find((i) => i.id === pickIngredientId);
    if (!ing) return;

    setSaving(true);
    const { error } = await supabase.from('recipes').insert({
      tenant_id: tenant.id,
      product_id: selectedProduct.id,
      variant_id: null,
      ingredient_id: pickIngredientId,
      quantity: qty,
      unit: ing.unit,
    } as any);
    setSaving(false);
    if (error) {
      alert('Eklenemedi: ' + error.message + (error.code === '23505' ? '\n(Bu hammadde zaten reçetede var. Önce silip yeniden ekleyin.)' : ''));
      return;
    }
    setPickIngredientId('');
    setPickQty('');
    await loadRecipe(selectedProduct.id);
  }, [tenant?.id, selectedProduct, pickIngredientId, pickQty, ingredients, loadRecipe]);

  const removeRow = useCallback(async (rowId: string) => {
    if (!confirm('Reçete satırı silinsin mi?')) return;
    const { error } = await supabase.from('recipes').delete().eq('id', rowId);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    if (selectedProduct) await loadRecipe(selectedProduct.id);
  }, [selectedProduct, loadRecipe]);

  const updateQty = useCallback(async (rowId: string, qty: number) => {
    if (!isFinite(qty) || qty <= 0) return;
    const { error } = await supabase.from('recipes').update({ quantity: qty }).eq('id', rowId);
    if (error) { alert('Güncellenemedi: ' + error.message); return; }
    if (selectedProduct) await loadRecipe(selectedProduct.id);
  }, [selectedProduct, loadRecipe]);

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <div className="grid md:grid-cols-12 gap-4">
        {/* Sol: ürün listesi */}
        <div className="md:col-span-5 lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[78dvh]">
          <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ürün ara…"
                className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none bg-white"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                className={`w-full text-left px-3 py-2 border-b border-slate-50 transition-all ${
                  selectedProduct?.id === p.id
                    ? 'bg-emerald-50 border-l-4 border-l-emerald-500'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="font-bold text-slate-800 text-sm truncate">{p.name}</div>
                <div className="text-xs text-slate-500">{Number(p.price).toFixed(2)} ₺</div>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">Ürün yok</div>
            )}
          </div>
        </div>

        {/* Sağ: reçete editörü */}
        <div className="md:col-span-7 lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[78dvh]">
          {!selectedProduct ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <ChefHat className="w-12 h-12 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500 font-medium">
                Reçetesini düzenlemek için soldan bir ürün seç
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Ürün</div>
                    <h3 className="text-lg font-black text-slate-800 leading-tight">{selectedProduct.name}</h3>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 font-semibold">Satış Fiyatı</div>
                    <div className="text-base font-black text-emerald-600">
                      {Number(selectedProduct.price).toFixed(2)} ₺
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-3">
                {recipeRows.length === 0 && !loading && (
                  <div className="text-center py-6 text-sm text-slate-400 font-medium border-2 border-dashed border-slate-200 rounded-xl">
                    Bu ürün için henüz reçete tanımlanmamış
                  </div>
                )}
                {loading && (
                  <div className="text-center py-6 text-sm text-slate-400">
                    <RefreshCw className="w-4 h-4 inline animate-spin mr-1.5" />
                    Yükleniyor…
                  </div>
                )}

                {recipeRows.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs font-black text-slate-600 uppercase">
                        <tr>
                          <th className="text-left px-3 py-2">Hammadde</th>
                          <th className="text-right px-3 py-2 w-32">Miktar</th>
                          <th className="text-left px-3 py-2 w-16">Birim</th>
                          <th className="text-right px-3 py-2 w-24">Maliyet</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeRows.map((r) => (
                          <tr key={r.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-bold text-slate-800">{r.ingredient_name}</td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                step="0.001"
                                defaultValue={r.quantity}
                                onBlur={(e) => {
                                  const v = Number(e.target.value);
                                  if (v > 0 && v !== r.quantity) void updateQty(r.id, v);
                                }}
                                className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-right text-sm focus:border-emerald-400 focus:outline-none"
                              />
                            </td>
                            <td className="px-3 py-2 text-slate-500">{r.ingredient_unit}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-700">
                              {(Number(r.quantity) * Number(r.ingredient_cost || 0)).toFixed(2)} ₺
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => void removeRow(r.id)}
                                className="text-red-500 hover:bg-red-50 p-1 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Reçete Maliyeti" value={`${totalCost.toFixed(2)} ₺`} tone="slate" />
                  <Stat label="Kâr" value={margin ? `${margin.value.toFixed(2)} ₺` : '-'} tone={margin && margin.value >= 0 ? 'green' : 'red'} />
                  <Stat label="Kâr Marjı" value={margin ? `${margin.ratio.toFixed(1)}%` : '-'} tone={margin && margin.ratio >= 0 ? 'green' : 'red'} />
                </div>
              </div>

              <div className="border-t border-slate-100 p-3 bg-slate-50">
                <div className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Yeni hammadde ekle</div>
                <div className="flex gap-2 items-stretch">
                  <select
                    value={pickIngredientId}
                    onChange={(e) => setPickIngredientId(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="">Hammadde seç…</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    value={pickQty}
                    onChange={(e) => setPickQty(e.target.value)}
                    placeholder="Miktar"
                    className="w-24 px-2 py-2 border-2 border-slate-200 rounded-xl text-sm focus:border-emerald-400 focus:outline-none text-right"
                  />
                  <button
                    onClick={addRow}
                    disabled={!pickIngredientId || !pickQty || saving}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl font-black text-sm flex items-center gap-1 active:scale-95"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Ekle
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'green' | 'red' }) {
  const cls = tone === 'green'
    ? 'bg-green-50 border-green-200 text-green-700'
    : tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`border-2 rounded-xl px-3 py-2 ${cls}`}>
      <div className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-black">{value}</div>
    </div>
  );
}
