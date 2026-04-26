import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, X, ChevronRight, Phone, Mail, MapPin, ArrowDownCircle, ArrowUpCircle, FileText, CreditCard as Edit2, Trash2, AlertCircle, CheckCircle, TrendingDown, TrendingUp, Wallet, ReceiptText, Save, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  balance: number;
  is_active: boolean;
  created_at: string;
}

interface CustomerTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  order_id: string | null;
  type: 'sale' | 'payment' | 'refund';
  amount: number;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

const EMPTY_CUSTOMER: Omit<Customer, 'id' | 'tenant_id' | 'created_at'> = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  credit_limit: 0,
  balance: 0,
  is_active: true,
};

export function CariAccounts() {
  const { tenant, profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Modals
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showTransaction, setShowTransaction] = useState<'sale' | 'payment' | null>(null);

  // Form state
  const [form, setForm] = useState(EMPTY_CUSTOMER);
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filter
  const [filterMode, setFilterMode] = useState<'all' | 'debtor' | 'clear'>('all');

  const loadCustomers = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await supabase
      .from('customers' as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');
    setCustomers((data || []) as unknown as Customer[]);
    setLoading(false);
  }, [tenant]);

  const loadTransactions = useCallback(async (customerId: string) => {
    setTxLoading(true);
    const { data } = await supabase
      .from('customer_transactions' as any)
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50);
    setTransactions((data || []) as unknown as CustomerTransaction[]);
    setTxLoading(false);
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  useEffect(() => {
    if (selectedCustomer) loadTransactions(selectedCustomer.id);
  }, [selectedCustomer, loadTransactions]);

  const openAdd = () => {
    setForm(EMPTY_CUSTOMER);
    setError('');
    setShowAddCustomer(true);
    setEditingCustomer(null);
  };

  const openEdit = (c: Customer) => {
    setForm({
      name: c.name,
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      notes: c.notes || '',
      credit_limit: c.credit_limit,
      balance: c.balance,
      is_active: c.is_active,
    });
    setError('');
    setEditingCustomer(c);
    setShowAddCustomer(true);
  };

  const saveCustomer = async () => {
    if (!tenant || !form.name.trim()) { setError('Müşteri adı zorunludur.'); return; }
    setSaving(true);
    setError('');
    try {
      if (editingCustomer) {
        const { error: err } = await (supabase.from('customers' as any) as any)
          .update({
            name: form.name.trim(),
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
            notes: form.notes || null,
            credit_limit: form.credit_limit,
            is_active: form.is_active,
          })
          .eq('id', editingCustomer.id);
        if (err) throw err;
        if (selectedCustomer?.id === editingCustomer.id) {
          setSelectedCustomer(prev => prev ? { ...prev, ...form, name: form.name.trim() } : null);
        }
      } else {
        const { error: err } = await (supabase.from('customers' as any) as any)
          .insert({
            tenant_id: tenant.id,
            name: form.name.trim(),
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
            notes: form.notes || null,
            is_active: form.is_active,
          });
        if (err) throw err;
      }
      await loadCustomers();
      setShowAddCustomer(false);
      setEditingCustomer(null);
    } catch (e: any) {
      setError(e.message || 'Kayıt sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (c: Customer) => {
    if (!confirm(`"${c.name}" müşterisini silmek istediğinizden emin misiniz? Tüm hareketleri de silinecektir.`)) return;
    await (supabase.from('customers' as any) as any).delete().eq('id', c.id);
    if (selectedCustomer?.id === c.id) setSelectedCustomer(null);
    await loadCustomers();
  };

  const addTransaction = async () => {
    if (!tenant || !selectedCustomer || !showTransaction) return;
    const amt = parseFloat(txAmount);
    if (isNaN(amt) || amt <= 0) { setError('Geçerli bir tutar giriniz.'); return; }
    setSaving(true);
    setError('');
    try {
      const { error: txErr } = await (supabase.from('customer_transactions' as any) as any)
        .insert({
          tenant_id: tenant.id,
          customer_id: selectedCustomer.id,
          type: showTransaction,
          amount: amt,
          description: txNote.trim() || null,
          created_by: profile?.id || null,
        });
      if (txErr) throw txErr;

      // Update balance
      const delta = showTransaction === 'sale' ? amt : -amt;
      const newBalance = selectedCustomer.balance + delta;
      await (supabase.from('customers' as any) as any)
        .update({ balance: newBalance })
        .eq('id', selectedCustomer.id);

      setSelectedCustomer(prev => prev ? { ...prev, balance: newBalance } : null);
      setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, balance: newBalance } : c));
      await loadTransactions(selectedCustomer.id);
      setShowTransaction(null);
      setTxAmount('');
      setTxNote('');
    } catch (e: any) {
      setError(e.message || 'İşlem sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.phone || '').includes(search);
    const matchFilter = filterMode === 'all'
      || (filterMode === 'debtor' && c.balance > 0)
      || (filterMode === 'clear' && c.balance <= 0);
    return matchSearch && matchFilter;
  });

  const totalDebt = customers.reduce((s, c) => s + Math.max(0, c.balance), 0);
  const totalDebtors = customers.filter(c => c.balance > 0).length;

  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg md:text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-orange-500" />
              Cari Hesaplar
            </h1>
            <button
              onClick={openAdd}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 md:px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 shadow"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Yeni Cari</span>
              <span className="md:hidden">Ekle</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 md:p-3 text-center">
              <div className="text-xs text-slate-500 mb-0.5">Toplam Müşteri</div>
              <div className="text-lg md:text-2xl font-black text-slate-700">{customers.length}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-2 md:p-3 text-center">
              <div className="text-xs text-red-600 mb-0.5">Borçlu Müşteri</div>
              <div className="text-lg md:text-2xl font-black text-red-600">{totalDebtors}</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-2 md:p-3 text-center">
              <div className="text-xs text-orange-600 mb-0.5">Toplam Alacak</div>
              <div className="text-lg md:text-2xl font-black text-orange-600">{totalDebt.toFixed(2)} ₺</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex max-w-7xl mx-auto w-full">
        {/* Customer list */}
        <div className={`flex flex-col ${selectedCustomer ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1 md:w-80 lg:w-96'} border-r border-slate-200 bg-white`}>
          {/* Search & filter */}
          <div className="p-3 border-b border-slate-100 space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="İsim veya telefon ara..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-orange-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-1.5">
              {(['all', 'debtor', 'clear'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${
                    filterMode === f
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f === 'all' ? 'Tümü' : f === 'debtor' ? 'Borçlular' : 'Temiz'}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                <Users className="w-8 h-8" />
                <p className="text-sm">Müşteri bulunamadı</p>
                {!search && filterMode === 'all' && (
                  <button onClick={openAdd} className="text-orange-500 text-xs font-bold hover:underline">
                    İlk müşteriyi ekle
                  </button>
                )}
              </div>
            ) : (
              filteredCustomers.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(c)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-all ${
                    selectedCustomer?.id === c.id ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm truncate">{c.name}</span>
                        {!c.is_active && (
                          <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-medium">Pasif</span>
                        )}
                      </div>
                      {c.phone && (
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div className={`text-right ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        <div className="text-sm font-black">{Math.abs(c.balance).toFixed(2)} ₺</div>
                        <div className="text-xs">{c.balance > 0 ? 'Borçlu' : c.balance < 0 ? 'Alacaklı' : 'Temiz'}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selectedCustomer ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Detail header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedCustomer(null)}
                    className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                  <div>
                    <h2 className="font-black text-slate-800 text-lg">{selectedCustomer.name}</h2>
                    {selectedCustomer.phone && (
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(selectedCustomer)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-all"
                    title="Düzenle"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteCustomer(selectedCustomer)}
                    className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600 transition-all"
                    title="Sil"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Balance & info cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div className={`rounded-xl p-3 text-center col-span-2 md:col-span-1 ${selectedCustomer.balance > 0 ? 'bg-red-50 border-2 border-red-200' : 'bg-green-50 border-2 border-green-200'}`}>
                  <div className="text-xs text-slate-500 mb-0.5">Güncel Bakiye</div>
                  <div className={`text-2xl font-black ${selectedCustomer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedCustomer.balance > 0 ? '+' : ''}{selectedCustomer.balance.toFixed(2)} ₺
                  </div>
                  <div className="text-xs mt-0.5 text-slate-500">
                    {selectedCustomer.balance > 0 ? 'Borçlu' : selectedCustomer.balance < 0 ? 'Alacaklı' : 'Temiz'}
                  </div>
                </div>
                {selectedCustomer.credit_limit > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">Kredi Limiti</div>
                    <div className="text-lg font-black text-slate-700">{selectedCustomer.credit_limit.toFixed(2)} ₺</div>
                    {selectedCustomer.balance > selectedCustomer.credit_limit && (
                      <div className="text-xs text-red-500 mt-0.5 flex items-center justify-center gap-0.5">
                        <AlertCircle className="w-3 h-3" /> Limit Aşıldı
                      </div>
                    )}
                  </div>
                )}
                {selectedCustomer.email && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 truncate">{selectedCustomer.email}</span>
                  </div>
                )}
                {selectedCustomer.address && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600 truncate">{selectedCustomer.address}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => { setShowTransaction('sale'); setTxAmount(''); setTxNote(''); setError(''); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  <TrendingUp className="w-4 h-4" />
                  Borç Ekle
                </button>
                <button
                  onClick={() => { setShowTransaction('payment'); setTxAmount(''); setTxNote(''); setError(''); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition-all active:scale-95"
                >
                  <TrendingDown className="w-4 h-4" />
                  Ödeme Al
                </button>
              </div>
            </div>

            {/* Transactions list */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-bold text-slate-600">Hareket Geçmişi</span>
              </div>

              {txLoading ? (
                <div className="flex items-center justify-center h-24">
                  <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
                  <FileText className="w-8 h-8" />
                  <p className="text-sm">Henüz hareket yok</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {transactions.map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-all">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.type === 'sale' ? 'bg-red-100' : 'bg-green-100'
                      }`}>
                        {tx.type === 'sale'
                          ? <ArrowUpCircle className="w-4 h-4 text-red-500" />
                          : <ArrowDownCircle className="w-4 h-4 text-green-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${tx.type === 'sale' ? 'text-red-600' : 'text-green-600'}`}>
                            {tx.type === 'sale' ? '+' : '-'}{tx.amount.toFixed(2)} ₺
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            tx.type === 'sale' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                          }`}>
                            {tx.type === 'sale' ? 'Borç' : 'Ödeme'}
                          </span>
                        </div>
                        {tx.description && <div className="text-xs text-slate-500 mt-0.5 truncate">{tx.description}</div>}
                        {tx.order_id && <div className="text-xs text-blue-500 mt-0.5">Sipariş bağlantılı</div>}
                      </div>
                      <div className="text-xs text-slate-400 text-right flex-shrink-0">
                        {new Date(tx.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        <br />
                        {new Date(tx.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-slate-400 flex-col gap-3">
            <Users className="w-12 h-12" />
            <p className="text-base font-medium">Detay görmek için müşteri seçin</p>
          </div>
        )}
      </div>

      {/* Add / Edit Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4 flex items-center justify-between flex-shrink-0 rounded-t-2xl">
              <h3 className="text-lg font-black text-white">
                {editingCustomer ? 'Müşteri Düzenle' : 'Yeni Müşteri'}
              </h3>
              <button onClick={() => setShowAddCustomer(false)} className="text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Ad Soyad *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm"
                  placeholder="Müşteri adı"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Telefon</label>
                  <input
                    type="tel"
                    value={form.phone || ''}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm"
                    placeholder="0xxx xxx xx xx"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">E-posta</label>
                  <input
                    type="email"
                    value={form.email || ''}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm"
                    placeholder="ornek@mail.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Adres</label>
                <textarea
                  value={form.address || ''}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm resize-none"
                  rows={2}
                  placeholder="Adres bilgisi..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">
                  Kredi Limiti (₺) <span className="font-normal text-slate-400">- 0 = sınırsız</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.credit_limit}
                  onChange={e => setForm(f => ({ ...f, credit_limit: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Notlar</label>
                <textarea
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm resize-none"
                  rows={2}
                  placeholder="Notlar..."
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 ${form.is_active ? 'bg-green-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_active ? 'left-6' : 'left-1'}`} />
                </button>
                <span className="text-sm font-medium text-slate-700">
                  {form.is_active ? 'Aktif müşteri' : 'Pasif müşteri'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-slate-100 flex-shrink-0">
              <button
                onClick={() => setShowAddCustomer(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all text-sm"
              >
                İptal
              </button>
              <button
                onClick={saveCustomer}
                disabled={saving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm active:scale-95"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransaction && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className={`px-5 py-4 flex items-center justify-between rounded-t-2xl ${
              showTransaction === 'sale'
                ? 'bg-gradient-to-r from-red-500 to-red-600'
                : 'bg-gradient-to-r from-green-500 to-green-600'
            }`}>
              <div className="text-white">
                <h3 className="text-lg font-black">
                  {showTransaction === 'sale' ? 'Borç Ekle' : 'Ödeme Al'}
                </h3>
                <p className="text-sm opacity-80">{selectedCustomer.name}</p>
              </div>
              <button onClick={() => setShowTransaction(null)} className="text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Current balance info */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                selectedCustomer.balance > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
              }`}>
                <span className="text-xs font-medium text-slate-600">Mevcut Bakiye</span>
                <span className={`text-sm font-black ${selectedCustomer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {selectedCustomer.balance.toFixed(2)} ₺
                </span>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tutar (₺) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                  className="w-full px-3 py-3 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-2xl font-black text-right"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Not (opsiyonel)</label>
                <input
                  type="text"
                  value={txNote}
                  onChange={e => setTxNote(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none text-sm"
                  placeholder="Açıklama..."
                />
              </div>

              {/* Preview */}
              {txAmount && parseFloat(txAmount) > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Mevcut bakiye</span>
                    <span>{selectedCustomer.balance.toFixed(2)} ₺</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{showTransaction === 'sale' ? '+ Borç' : '- Ödeme'}</span>
                    <span className={showTransaction === 'sale' ? 'text-red-500' : 'text-green-500'}>
                      {showTransaction === 'sale' ? '+' : '-'}{parseFloat(txAmount).toFixed(2)} ₺
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-1 flex justify-between text-sm font-black">
                    <span>Yeni bakiye</span>
                    <span className={(selectedCustomer.balance + (showTransaction === 'sale' ? parseFloat(txAmount) : -parseFloat(txAmount))) > 0 ? 'text-red-600' : 'text-green-600'}>
                      {(selectedCustomer.balance + (showTransaction === 'sale' ? parseFloat(txAmount) : -parseFloat(txAmount))).toFixed(2)} ₺
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => setShowTransaction(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition-all text-sm"
              >
                İptal
              </button>
              <button
                onClick={addTransaction}
                disabled={saving || !txAmount || parseFloat(txAmount) <= 0}
                className={`flex-1 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm active:scale-95 ${
                  showTransaction === 'sale'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? 'İşleniyor...' : showTransaction === 'sale' ? 'Borç Ekle' : 'Ödeme Al'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export a hook for selecting a customer (used in PaymentModal)
export type { Customer };
