import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Save, Trash2, RefreshCw, Truck, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_no?: string | null;
  current_balance: number;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const emptyForm = {
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  tax_no: '',
  notes: '',
};

export function Suppliers() {
  const { tenant } = useAuth();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');
    setItems((data as any[] | null) || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    void load();
    if (!tenant?.id) return;
    const ch = supabase
      .channel(`suppliers-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers', filter: `tenant_id=eq.${tenant.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch { /* noop */ } };
  }, [tenant?.id, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q) || (s.email || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const totalDebt = useMemo(
    () => items.filter((s) => s.is_active).reduce((s, x) => s + Number(x.current_balance || 0), 0),
    [items],
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contact_name: s.contact_name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      tax_no: s.tax_no || '',
      notes: s.notes || '',
    });
    setShowForm(true);
  }, []);

  const save = useCallback(async () => {
    if (!tenant?.id) return;
    if (!form.name.trim()) { alert('Ad zorunlu'); return; }
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      tax_no: form.tax_no.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    let err: any = null;
    if (editing) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
      err = error;
    } else {
      const { error } = await supabase.from('suppliers').insert(payload as any);
      err = error;
    }
    setSaving(false);
    if (err) { alert('Kayıt hatası: ' + err.message); return; }
    setShowForm(false);
    await load();
  }, [tenant?.id, form, editing, load]);

  const remove = useCallback(async (s: Supplier) => {
    if (!confirm(`"${s.name}" silinsin mi?`)) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id);
    if (error) {
      alert('Silinemedi: ' + error.message + (error.code === '23503' ? '\n(Bu tedarikçiye bağlı alış faturaları/hammaddeler var.)' : ''));
      return;
    }
    await load();
  }, [load]);

  const toggleActive = useCallback(async (s: Supplier) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: !s.is_active, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    if (error) { alert('Güncellenemedi: ' + error.message); return; }
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
            placeholder="Tedarikçi ara…"
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
          onClick={openCreate}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl flex items-center gap-1.5 text-sm font-black active:scale-95 shadow"
        >
          <Plus className="w-4 h-4" />
          Yeni Tedarikçi
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-wider text-amber-700">
          Toplam Tedarikçi Borcu
        </span>
        <span className="text-lg font-black text-amber-700">
          {totalDebt.toFixed(2)} ₺
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-600 text-xs font-black uppercase tracking-wider">
                <th className="text-left px-4 py-3">Adı</th>
                <th className="text-left px-4 py-3">İletişim</th>
                <th className="text-right px-4 py-3">Bakiye (Borç)</th>
                <th className="text-center px-4 py-3">Durum</th>
                <th className="text-right px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400 font-medium">
                    {loading ? 'Yükleniyor…' : 'Tedarikçi yok'}
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <button
                        onClick={() => openEdit(s)}
                        className="font-bold text-slate-800 hover:text-emerald-600 text-left"
                      >
                        {s.name}
                      </button>
                    </div>
                    {s.contact_name && (
                      <div className="text-xs text-slate-500 mt-0.5 ml-6">{s.contact_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-xs text-slate-600">
                      {s.phone && (
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>
                      )}
                      {s.email && (
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</span>
                      )}
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-black ${
                    Number(s.current_balance) > 0 ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    {Number(s.current_balance).toFixed(2)} ₺
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(s)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                        s.is_active
                          ? 'bg-green-100 text-green-700 border border-green-300'
                          : 'bg-slate-100 text-slate-500 border border-slate-300'
                      }`}
                    >
                      {s.is_active ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold active:scale-95"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => remove(s)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-3">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 flex items-center justify-between">
              <h3 className="text-white font-black text-lg">
                {editing ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-white hover:bg-white/15 p-1.5 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              <Field label="Firma Adı *">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  autoFocus
                />
              </Field>
              <Field label="Yetkili / İletişim Kişisi">
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Telefon">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </Field>
                <Field label="Vergi No">
                  <input
                    type="text"
                    value={form.tax_no}
                    onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                  />
                </Field>
              </div>
              <Field label="E-posta">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none"
                />
              </Field>
              <Field label="Adres">
                <textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm focus:border-emerald-400 focus:outline-none resize-none"
                />
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
