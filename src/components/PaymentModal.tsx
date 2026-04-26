import { useState, useEffect, useCallback } from 'react';
import {
  X, Banknote, CreditCard, Receipt, Percent, Printer,
  Plus, Trash2, Users, Search, Phone, ChevronRight,
  RefreshCw, AlertCircle, UserPlus, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Customer } from './CariAccounts';

interface PaymentSplit {
  method: 'cash' | 'credit_card' | 'open_account';
  amount: string;
  customerId?: string;
  customerName?: string;
}

interface PaymentModalProps {
  remainingAmount: number;
  discount: number;
  onDiscountChange: (value: number) => void;
  onPayment: (method: 'cash' | 'credit_card' | 'open_account', amount: number, printReceipt: boolean, customerId?: string) => Promise<void> | void;
  onClose: () => void;
  loading: boolean;
}

const METHOD_LABELS: Record<PaymentSplit['method'], string> = {
  cash: 'Nakit',
  credit_card: 'Kart',
  open_account: 'Veresiye',
};

const METHOD_ICONS: Record<PaymentSplit['method'], React.ReactNode> = {
  cash: <Banknote className="w-4 h-4" />,
  credit_card: <CreditCard className="w-4 h-4" />,
  open_account: <Receipt className="w-4 h-4" />,
};

// ─── Customer Picker ────────────────────────────────────────────────────────

interface CustomerPickerProps {
  tenantId: string;
  selected: { id: string; name: string } | null;
  onSelect: (c: { id: string; name: string } | null) => void;
  amount: number;
}

function CustomerPicker({ tenantId, selected, onSelect, amount }: CustomerPickerProps) {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [expanded, setExpanded] = useState(!selected);

  const load = useCallback(async () => {
    setLoading(true);
    const cached = sessionStorage.getItem(`customers_${tenantId}`);
    if (cached) {
      try {
        setCustomers(JSON.parse(cached));
        setLoading(false);
        return;
      } catch (e) {}
    }
    const { data } = await (supabase.from('customers' as any) as any)
      .select('id, name, phone, balance')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    if (data) {
      sessionStorage.setItem(`customers_${tenantId}`, JSON.stringify(data));
      setCustomers(data as unknown as Customer[]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search)
  );

  const quickAdd = async () => {
    if (!addName.trim()) return;
    setAddSaving(true);
    const { data } = await (supabase.from('customers' as any) as any)
      .insert({ tenant_id: tenantId, name: addName.trim(), phone: addPhone.trim() || null, is_active: true })
      .select()
      .single();
    if (data) {
      onSelect({ id: data.id, name: data.name });
      setExpanded(false);
    }
    setAddSaving(false);
    setShowAdd(false);
    setAddName('');
    setAddPhone('');
  };

  if (selected && !expanded) {
    return (
      <div className="flex items-center justify-between bg-orange-50 border-2 border-orange-300 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-orange-500 shrink-0" />
          <div>
            <div className="text-sm font-black text-slate-800">{selected.name}</div>
            <div className="text-xs text-orange-600">
              Veresiye: {amount.toFixed(2)} ₺ eklenecek
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 hover:bg-white rounded-lg transition-all"
        >
          Değiştir
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-orange-300 rounded-xl overflow-hidden">
      <div className="bg-orange-50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-orange-700">
          <Users className="w-4 h-4" />
          <span className="text-xs font-black">Cari Müşteri Seç</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded-lg font-bold transition-all"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Yeni
          </button>
          {selected && (
            <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="px-3 py-2.5 bg-amber-50 border-b border-orange-200 space-y-2">
          <input
            type="text"
            value={addName}
            onChange={e => setAddName(e.target.value)}
            placeholder="Müşteri adı *"
            className="w-full text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-orange-400 focus:outline-none"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              type="tel"
              value={addPhone}
              onChange={e => setAddPhone(e.target.value)}
              placeholder="Telefon (opsiyonel)"
              className="flex-1 text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-orange-400 focus:outline-none"
            />
            <button
              onClick={quickAdd}
              disabled={!addName.trim() || addSaving}
              className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-1 transition-all"
            >
              {addSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Ekle
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-b border-orange-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-orange-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="max-h-40 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-4">
            <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">
            {search ? 'Müşteri bulunamadı' : 'Henüz müşteri yok'}
          </div>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => { onSelect({ id: c.id, name: c.name }); setExpanded(false); }}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 transition-all flex items-center justify-between border-b border-slate-50 last:border-0"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-black text-orange-600">{c.name[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{c.name}</div>
                  {c.phone && (
                    <div className="text-xs text-slate-400 flex items-center gap-0.5">
                      <Phone className="w-2.5 h-2.5" /> {c.phone}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                {c.balance > 0 && (
                  <span className="text-xs text-red-500 font-bold">{c.balance.toFixed(0)}₺</span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              </div>
            </button>
          ))
        )}
      </div>

      {!selected && (
        <div className="px-3 py-2 bg-amber-50 border-t border-orange-200">
          <div className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Veresiye için cari müşteri seçimi zorunludur
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export function PaymentModal({
  remainingAmount,
  discount,
  onDiscountChange,
  onPayment,
  onClose,
  loading,
}: PaymentModalProps) {
  const { tenant } = useAuth();
  const [splits, setSplits] = useState<PaymentSplit[]>([
    { method: 'cash', amount: remainingAmount.toFixed(2) }
  ]);
  const [printReceipt, setPrintReceipt] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSplits([{ method: 'cash', amount: remainingAmount.toFixed(2) }]);
  }, [remainingAmount]);

  const totalSplit = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const splitDiff = remainingAmount - totalSplit;
  const afterPayment = Math.max(0, remainingAmount - totalSplit);
  const isFullPayment = totalSplit >= remainingAmount - 0.01;

  const addSplit = () => {
    const remaining = Math.max(0, splitDiff);
    setSplits(prev => [...prev, { method: 'credit_card', amount: remaining.toFixed(2) }]);
  };

  const removeSplit = (idx: number) => {
    setSplits(prev => prev.filter((_, i) => i !== idx));
  };

  const updateSplit = (idx: number, field: keyof PaymentSplit, value: string) => {
    setSplits(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      if (field === 'method') {
        return { ...s, method: value as PaymentSplit['method'], customerId: undefined, customerName: undefined };
      }
      return { ...s, [field]: value };
    }));
  };

  const updateSplitCustomer = (idx: number, customer: { id: string; name: string } | null) => {
    setSplits(prev => prev.map((s, i) =>
      i === idx ? { ...s, customerId: customer?.id, customerName: customer?.name } : s
    ));
  };

  const fillRemaining = (idx: number) => {
    const otherTotal = splits.reduce((s, p, i) => i === idx ? s : s + (parseFloat(p.amount) || 0), 0);
    const fill = Math.max(0, remainingAmount - otherTotal);
    setSplits(prev => prev.map((s, i) => i === idx ? { ...s, amount: fill.toFixed(2) } : s));
  };

  const handleSubmit = async () => {
    if (submitting) return;

    for (const split of splits) {
      const amt = parseFloat(split.amount);
      if (isNaN(amt) || amt <= 0) {
        alert('Tüm ödeme tutarlarını doğru girin');
        return;
      }
      if (split.method === 'open_account' && !split.customerId) {
        alert('Veresiye için cari müşteri seçimi zorunludur');
        return;
      }
    }

    setSubmitting(true);
    try {
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const amt = parseFloat(split.amount);
        const isLast = i === splits.length - 1;
        await onPayment(split.method, amt, isLast ? printReceipt : false, split.customerId);

        // Record veresiye transaction
        if (split.method === 'open_account' && split.customerId && tenant) {
          await (supabase.from('customer_transactions' as any) as any).insert({
            tenant_id: tenant.id,
            customer_id: split.customerId,
            type: 'sale',
            amount: amt,
            description: 'Sipariş veresiyesi',
          });
          const { data: cust } = await (supabase.from('customers' as any) as any)
            .select('balance')
            .eq('id', split.customerId)
            .maybeSingle();
          if (cust) {
            await (supabase.from('customers' as any) as any)
              .update({ balance: (cust.balance || 0) + amt })
              .eq('id', split.customerId);
          }
        }
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const hasInvalidOpenAccount = splits.some(s => s.method === 'open_account' && !s.customerId);
  const isValid = splits.length > 0
    && splits.every(s => parseFloat(s.amount) > 0)
    && !hasInvalidOpenAccount;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[calc(100vh-16px)] overflow-hidden">
        <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 flex items-center justify-between rounded-t-2xl flex-shrink-0">
          <h3 className="text-xl font-bold text-white">Ödeme Al</h3>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-all active:scale-95">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Tutar özeti */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 font-medium mb-0.5">Kalan Tutar</div>
              <div className="text-2xl font-black text-orange-600">{remainingAmount.toFixed(0)} ₺</div>
            </div>
            <div className={`border-2 rounded-xl p-3 text-center transition-all ${isFullPayment ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-300'}`}>
              <div className="text-xs text-slate-500 font-medium mb-0.5">
                {isFullPayment ? 'Tam Ödeme' : 'Ödemeden Sonra Kalan'}
              </div>
              <div className={`text-2xl font-black ${isFullPayment ? 'text-green-600' : 'text-amber-600'}`}>
                {isFullPayment ? '0 ₺' : `${afterPayment.toFixed(0)} ₺`}
              </div>
            </div>
          </div>

          {/* İskonto */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <Percent className="w-4 h-4 text-slate-500 shrink-0" />
            <label className="text-sm font-bold text-slate-700 w-24 shrink-0">İskonto (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={discount}
              onChange={(e) => onDiscountChange(Math.min(100, Math.max(0, Number(e.target.value))))}
              className="flex-1 px-3 py-1.5 border-2 rounded-lg text-base font-bold focus:border-green-500 focus:outline-none text-right"
            />
          </div>

          {/* Ödeme bölümleri */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Ödeme Yöntemi</label>
              <button
                onClick={addSplit}
                className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                Böl
              </button>
            </div>

            {splits.map((split, idx) => (
              <div key={idx} className="border-2 border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-1">
                    {(['cash', 'credit_card', 'open_account'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => updateSplit(idx, 'method', m)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold transition-all active:scale-95 ${
                          split.method === m
                            ? m === 'open_account'
                              ? 'border-orange-400 bg-orange-50 text-orange-700'
                              : 'border-green-500 bg-green-50 text-green-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {METHOD_ICONS[m]}
                        {METHOD_LABELS[m]}
                      </button>
                    ))}
                  </div>
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(idx)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={split.amount}
                    onChange={(e) => updateSplit(idx, 'amount', e.target.value)}
                    className="flex-1 px-3 py-2 border-2 rounded-xl text-2xl font-black focus:border-green-500 focus:outline-none text-right"
                    placeholder="0.00"
                    autoFocus={idx === 0}
                  />
                  <span className="text-slate-500 font-bold text-sm">₺</span>
                  <button
                    onClick={() => fillRemaining(idx)}
                    className="px-2.5 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg font-bold text-xs transition-all active:scale-95 whitespace-nowrap"
                  >
                    Tümü
                  </button>
                </div>

                {/* Customer picker - only for open_account */}
                {split.method === 'open_account' && tenant && (
                  <CustomerPicker
                    tenantId={tenant.id}
                    selected={split.customerId ? { id: split.customerId, name: split.customerName || '' } : null}
                    onSelect={c => updateSplitCustomer(idx, c)}
                    amount={parseFloat(split.amount) || 0}
                  />
                )}
              </div>
            ))}

            {Math.abs(splitDiff) > 0.01 && (
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold ${
                splitDiff > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <span>{splitDiff > 0 ? 'Eksik tutar:' : 'Fazla tutar:'}</span>
                <span>{Math.abs(splitDiff).toFixed(2)} ₺</span>
              </div>
            )}
          </div>

          <button
            onClick={() => setPrintReceipt(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 transition-all active:scale-95 ${
              printReceipt
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Printer className={`w-4 h-4 ${printReceipt ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className={`font-bold text-sm ${printReceipt ? 'text-blue-700' : 'text-slate-600'}`}>
                Adisyon Yazdır
              </span>
            </div>
            <div className={`w-10 h-6 rounded-full transition-all relative ${printReceipt ? 'bg-blue-500' : 'bg-slate-300'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${printReceipt ? 'left-5' : 'left-1'}`} />
            </div>
          </button>
        </div>

        <div className="flex gap-3 p-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-all active:scale-95"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || submitting || !isValid}
            className={`flex-2 font-bold py-3 px-6 rounded-xl transition-all disabled:opacity-50 shadow-lg active:scale-95 ${
              isFullPayment
                ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white'
            }`}
          >
            {(loading || submitting) ? 'İşleniyor...' : isFullPayment ? 'Ödemeyi Tamamla' : `${totalSplit.toFixed(0)}₺ Al`}
          </button>
        </div>
      </div>
    </div>
  );
}
