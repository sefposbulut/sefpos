import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, AlertTriangle, X, Save, Trash2, RefreshCw, Boxes } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Ingredient {
  id: string;
  tenant_id: string;
  name: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  is_active: boolean;
  default_supplier_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

const UNITS = ['kg', 'gr', 'lt', 'ml', 'adet', 'paket', 'kutu'] as const;

const emptyForm = {
  name: '',
  unit: 'kg',
  current_stock: '',
  min_stock: '',
  unit_cost: '',
  default_supplier_id: '',
  notes: '',
};

export function Ingredients() {
  const { tenant } = useAuth();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [{ data: ings }, { data: sups }] = await Promise.all([
      supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name'),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name'),
    ]);
    setItems((ings as any[] | null) || []);
    setSuppliers((sups as any[] | null) || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    void load();
    if (!tenant?.id) return;
    const ch = supabase
      .channel(`ingredients-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ingredients', filter: `tenant_id=eq.${tenant.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } };
  }, [tenant?.id, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (showCriticalOnly && Number(i.current_stock) > Number(i.min_stock || 0)) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q);
    });
  }, [items, search, showCriticalOnly]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((it: Ingredient) => {
    setEditing(it);
    setForm({
      name: it.name,
      unit: it.unit,
      current_stock: String(it.current_stock ?? ''),
      min_stock: String(it.min_stock ?? ''),
      unit_cost: String(it.unit_cost ?? ''),
      default_supplier_id: it.default_supplier_id || '',
      notes: it.notes || '',
    });
    setShowForm(true);
  }, []);

  const save = useCallback(async () => {
    if (!tenant?.id) return;
    if (!form.name.trim()) { alert('İsim zorunlu'); return; }
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      name: form.name.trim(),
      unit: form.unit,
      current_stock: Number(form.current_stock) || 0,
      min_stock: Number(form.min_stock) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      default_supplier_id: form.default_supplier_id || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let err: any = null;
    if (editing) {
      const { error } = await supabase.from('ingredients').update(payload).eq('id', editing.id);
      err = error;
    } else {
      const { error } = await supabase.from('ingredients').insert(payload as any);
      err = error;
    }
    setSaving(false);
    if (err) { alert('Kayıt hatası: ' + err.message); return; }
    setShowForm(false);
    await load();
  }, [tenant?.id, form, editing, load]);

  const remove = useCallback(async (it: Ingredient) => {
    if (!confirm(`"${it.name}" silinsin mi? (Bağlı reçete kayıtları da silinir.)`)) return;
    const { error } = await supabase.from('ingredients').delete().eq('id', it.id);
    if (error) { alert('Silinemedi: ' + error.message); return; }
    await load();
  }, [load]);

  const toggleActive = useCallback(async (it: Ingredient) => {
    const { error } = await supabase
      .from('ingredients')
      .update({ is_active: !it.is_active, updated_at: new Date().toISOString() })
      .eq('id', it.id);
    if (error) { alert('Güncellenemedi: ' + error.message); return; }
    await load();
  }, [load]);

  const criticalCount = useMemo(
    () => items.filter((i) => i.is_active && Number(i.current_stock) <= Number(i.min_stock || 0)).length,
    [items],
  );

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hammadde ara…"
            className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-emerald-400 focus:outline-none bg-white"
          />
        </div>
        <button
          onClick={() => setShowCriticalOnly((v) => !v)}
          className={`px-3 py-2.5 rounded-xl flex items-center gap-1.5 text-sm font-bold whitespace-nowrap active:scale-95 transition-all ${
            showCriticalOnly
              ? 'bg-red-500 text-white shadow'
              : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-red-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Kritik ({criticalCount})
        </button>
        <button
          onClick={() => void load()}
          className="px-3 py-2.5 bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-xl text-sm font-bold text-slate-700 active:scale-95 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl flex items-center gap-1.5 text-sm font-black active:scale-95 shadow"
        >
          <Plus className="w-4 h-4" />
          Yeni Hammadde
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-black uppercase tracking-wider">
                <th className="text-left px-4 py-3">Adı</th>
                <th className="text-left px-4 py-3">Birim</th>
                <th className="text-right px-4 py-3">Stok</th>
                <th className="text-right px-4 py-3">Kritik</th>
                <th className="text-right px-4 py-3">Birim Maliyet</th>
                <th className="text-center px-4 py-3">Durum</th>
                <th className="text-right px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                    {loading ? 'Yükleniyor…' : 'Hammadde yok'}
                  </td>
                </tr>
              )}
              {filtered.map((it) => {
                const critical = Number(it.current_stock) <= Number(it.min_stock || 0);
                return (
                  <tr
                    key={it.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${critical ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-emerald-500 shrink-0" />
                        <button
                          onClick={() => openEdit(it)}
                          className="font-bold text-slate-800 hover:text-emerald-600 text-left"
                        >
                          {it.name}
                        </button>
                        {critical && (
                          <span className="text-[9px] font-black bg-red-500 text-white rounded-full px-1.5 py-0.5">
                            KRİTİK
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-semibold">{it.unit}</td>
                    <td className={`px-4 py-3 text-right font-black ${critical ? 'text-red-600' : 'text-slate-800'}`}>
                      {Number(it.current_stock).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 font-semibold">
                      {Number(it.min_stock).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-bold">
                      {Number(it.unit_cost).toFixed(2)} ₺
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActive(it)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          it.is_active
                            ? 'bg-green-100 text-green-700 border border-green-300'
                            : 'bg-slate-100 text-slate-500 border border-slate-300'
                        }`}
                      >
                        {it.is_active ? 'Aktif' : 'Pasif'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(it)}
                          className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold active:scale-95"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => remove(it)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg active:scale-95"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-between">
              <h3 className="text-white font-black text-lg">
                {editing ? 'Hammadde Düzenle' : 'Yeni Hammadde'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:bg-white/15 p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              <Field label="İsim *">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  autoFocus
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Birim">
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-400 focus:outline-none"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Birim Maliyet (₺)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_cost}
                    onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none text-right"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Mevcut Stok">
                  <input
                    type="number"
                    step="0.001"
                    value={form.current_stock}
                    onChange={(e) => setForm({ ...form, current_stock: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none text-right"
                  />
                </Field>
                <Field label="Kritik Seviye">
                  <input
                    type="number"
                    step="0.001"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none text-right"
                  />
                </Field>
              </div>
              <Field label="Varsayılan Tedarikçi">
                <select
                  value={form.default_supplier_id}
                  onChange={(e) => setForm({ ...form, default_supplier_id: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-400 focus:outline-none"
                >
                  <option value="">— Seçilmemiş —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="Not">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none resize-none"
                />
              </Field>
            </div>
            <div className="p-3 border-t border-slate-100 flex gap-2 bg-slate-50">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold active:scale-95"
              >
                İptal
              </button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-black active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-black text-slate-600 uppercase tracking-wider block mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
