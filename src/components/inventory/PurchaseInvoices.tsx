import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Save, Trash2, RefreshCw, FileText, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Supplier {
  id: string;
  name: string;
  current_balance: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  unit_cost: number;
}

interface InvoiceRow {
  id: string;
  invoice_no: string | null;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  payment_method: string;
  supplier_id: string;
  suppliers?: { name: string };
  notes?: string | null;
}

interface DraftItem {
  id: string;            // local id
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: string;
  unit_cost: string;
}

const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: 'on_account', label: 'Cariye İşlensin' },
  { id: 'cash', label: 'Nakit' },
  { id: 'credit_card', label: 'Kart' },
  { id: 'bank_transfer', label: 'Havale/EFT' },
];

export function PurchaseInvoices() {
  const { tenant, user } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('on_account');
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [{ data: invs }, { data: sups }, { data: ings }] = await Promise.all([
      supabase
        .from('purchase_invoices')
        .select('id, invoice_no, invoice_date, total_amount, paid_amount, status, payment_method, supplier_id, notes, suppliers(name)')
        .eq('tenant_id', tenant.id)
        .order('invoice_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('suppliers')
        .select('id, name, current_balance')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('ingredients')
        .select('id, name, unit, unit_cost')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('name'),
    ]);
    setInvoices((invs as any[] | null) || []);
    setSuppliers((sups as any[] | null) || []);
    setIngredients((ings as any[] | null) || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((iv) =>
      !q ||
      (iv.invoice_no || '').toLowerCase().includes(q) ||
      (iv.suppliers?.name || '').toLowerCase().includes(q),
    );
  }, [invoices, search]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0), 0),
    [items],
  );

  const resetForm = useCallback(() => {
    setSupplierId('');
    setInvoiceNo('');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('on_account');
    setPaidAmount('0');
    setNotes('');
    setItems([]);
  }, []);

  const openForm = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  const addItemRow = useCallback(() => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ingredient_id: '',
        ingredient_name: '',
        unit: '',
        quantity: '',
        unit_cost: '',
      },
    ]);
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const pickIngredient = useCallback((rowId: string, ingredientId: string) => {
    const ing = ingredients.find((x) => x.id === ingredientId);
    if (!ing) return;
    updateItem(rowId, {
      ingredient_id: ingredientId,
      ingredient_name: ing.name,
      unit: ing.unit,
      unit_cost: items.find((it) => it.id === rowId)?.unit_cost || String(ing.unit_cost || ''),
    });
  }, [ingredients, items, updateItem]);

  const removeItemRow = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const submit = useCallback(async () => {
    if (!tenant?.id || !user?.id) return;
    if (!supplierId) { alert('Tedarikçi seçiniz'); return; }
    const validItems = items.filter((it) => it.ingredient_id && Number(it.quantity) > 0);
    if (validItems.length === 0) { alert('En az bir kalem ekleyin'); return; }
    const total = validItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_cost || 0), 0);
    const paid = Number(paidAmount) || 0;
    if (paid > total) { alert('Ödenen tutar fatura toplamından büyük olamaz'); return; }

    setSaving(true);
    try {
      const { data: inv, error: invErr } = await supabase
        .from('purchase_invoices')
        .insert({
          tenant_id: tenant.id,
          supplier_id: supplierId,
          invoice_no: invoiceNo.trim() || null,
          invoice_date: invoiceDate,
          subtotal: total,
          tax_amount: 0,
          total_amount: total,
          paid_amount: paid,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
          status: 'recorded',
          created_by: user.id,
        } as any)
        .select('id')
        .single();
      if (invErr || !inv) throw invErr || new Error('Fatura oluşturulamadı');

      const itemsPayload = validItems.map((it) => ({
        invoice_id: (inv as any).id,
        tenant_id: tenant.id,
        ingredient_id: it.ingredient_id,
        quantity: Number(it.quantity),
        unit_cost: Number(it.unit_cost) || 0,
        total: Number(it.quantity) * Number(it.unit_cost || 0),
      }));
      const { error: itErr } = await supabase
        .from('purchase_invoice_items')
        .insert(itemsPayload as any);
      if (itErr) throw itErr;

      // Eğer kullanıcı nakit/kart/havale ile ödediyse cariden düşmek için ödeme tarihi:
      // Trigger zaten (total - paid)'i suppliers.current_balance'a ekliyor.
      // Yani paid_amount kadar zaten cariye yansımaz, doğru çalışıyor.

      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      alert('Kaydedilemedi: ' + (e?.message || String(e)));
    } finally {
      setSaving(false);
    }
  }, [tenant?.id, user?.id, supplierId, invoiceNo, invoiceDate, paymentMethod, paidAmount, notes, items, resetForm, load]);

  const cancelInvoice = useCallback(async (iv: InvoiceRow) => {
    if (iv.status === 'cancelled') return;
    if (!confirm(`Fatura "${iv.invoice_no || iv.id.slice(0, 8)}" iptal edilsin mi?\n\nNot: Stok hareketi geri alınmaz; manuel düzeltme gerekebilir.`)) return;
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', iv.id);
    if (error) { alert('İptal edilemedi: ' + error.message); return; }
    await load();
  }, [load]);

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row gap-2 md:gap-3 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fatura no veya tedarikçi ara…"
            className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm font-medium focus:border-emerald-400 focus:outline-none bg-white"
          />
        </div>
        <button
          onClick={() => void load()}
          className="px-3 py-2.5 bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-xl text-sm font-bold text-slate-700 active:scale-95 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={openForm}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl flex items-center gap-1.5 text-sm font-black active:scale-95 shadow"
        >
          <Plus className="w-4 h-4" />
          Yeni Alış Faturası
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-black uppercase tracking-wider">
                <th className="text-left px-4 py-3">Tarih</th>
                <th className="text-left px-4 py-3">Fatura No</th>
                <th className="text-left px-4 py-3">Tedarikçi</th>
                <th className="text-right px-4 py-3">Toplam</th>
                <th className="text-right px-4 py-3">Ödenen</th>
                <th className="text-right px-4 py-3">Kalan</th>
                <th className="text-center px-4 py-3">Durum</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 font-medium">
                    {loading ? 'Yükleniyor…' : 'Fatura yok'}
                  </td>
                </tr>
              )}
              {filtered.map((iv) => {
                const remain = Number(iv.total_amount) - Number(iv.paid_amount);
                const cancelled = iv.status === 'cancelled';
                return (
                  <tr key={iv.id} className={`border-b border-slate-100 hover:bg-slate-50 ${cancelled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-slate-600 font-semibold whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(iv.invoice_date).toLocaleDateString('tr-TR')}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      <FileText className="w-3.5 h-3.5 text-emerald-500 inline mr-1" />
                      {iv.invoice_no || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{iv.suppliers?.name || '-'}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-800">
                      {Number(iv.total_amount).toFixed(2)} ₺
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">
                      {Number(iv.paid_amount).toFixed(2)} ₺
                    </td>
                    <td className={`px-4 py-3 text-right font-black ${remain > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      {remain.toFixed(2)} ₺
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        cancelled
                          ? 'bg-red-100 text-red-700 border border-red-300'
                          : 'bg-green-100 text-green-700 border border-green-300'
                      }`}>
                        {cancelled ? 'İPTAL' : 'KAYITLI'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!cancelled && (
                        <button
                          onClick={() => cancelInvoice(iv)}
                          className="text-xs px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold active:scale-95"
                          title="İptal et"
                        >
                          İptal
                        </button>
                      )}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-between">
              <h3 className="text-white font-black text-lg">Yeni Alış Faturası</h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:bg-white/15 p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tedarikçi *">
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-400 focus:outline-none"
                  >
                    <option value="">Seç…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Fatura No">
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tarih">
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </Field>
                <Field label="Ödeme Şekli">
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-400 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-wider">
                    Kalemler
                  </label>
                  <button
                    onClick={addItemRow}
                    className="text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2 py-1 rounded-lg flex items-center gap-1 active:scale-95"
                  >
                    <Plus className="w-3 h-3" /> Kalem ekle
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase">
                      <tr>
                        <th className="text-left px-2 py-1.5">Hammadde</th>
                        <th className="text-right px-2 py-1.5 w-24">Miktar</th>
                        <th className="text-right px-2 py-1.5 w-24">B.Fiyat</th>
                        <th className="text-right px-2 py-1.5 w-24">Toplam</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-3 text-xs text-slate-400">
                            Kalem ekleyin
                          </td>
                        </tr>
                      )}
                      {items.map((it) => (
                        <tr key={it.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <select
                              value={it.ingredient_id}
                              onChange={(e) => pickIngredient(it.id, e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white focus:border-emerald-400 focus:outline-none"
                            >
                              <option value="">Seç…</option>
                              {ingredients.map((ing) => (
                                <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.001"
                              value={it.quantity}
                              onChange={(e) => updateItem(it.id, { quantity: e.target.value })}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-right focus:border-emerald-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={it.unit_cost}
                              onChange={(e) => updateItem(it.id, { unit_cost: e.target.value })}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-right focus:border-emerald-400 focus:outline-none"
                            />
                          </td>
                          <td className="px-2 py-1 text-right font-bold text-slate-700 text-xs">
                            {((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0)).toFixed(2)}
                          </td>
                          <td className="px-1 py-1">
                            <button
                              onClick={() => removeItemRow(it.id)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Ödenen Tutar (₺)">
                  <input
                    type="number"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none text-right font-bold"
                  />
                </Field>
                <div className="flex flex-col justify-end">
                  <div className="flex justify-between text-sm font-bold text-slate-700">
                    <span>Toplam:</span>
                    <span className="text-emerald-600 font-black text-base">{subtotal.toFixed(2)} ₺</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-amber-700 mt-0.5">
                    <span>Cariye yazılacak:</span>
                    <span>{Math.max(0, subtotal - (Number(paidAmount) || 0)).toFixed(2)} ₺</span>
                  </div>
                </div>
              </div>

              <Field label="Not">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                onClick={submit}
                disabled={saving || !supplierId || items.length === 0}
                className="flex-[2] px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-black active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Kaydediliyor…' : 'Faturayı Kaydet (stok ↑, cari ↑)'}
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
