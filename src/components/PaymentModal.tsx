import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Banknote, CreditCard, Receipt, Percent, Printer,
  Plus, Trash2, Users, Search, Phone, ChevronRight,
  RefreshCw, AlertCircle, UserPlus, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { loadPrintSettings, PRINT_SETTINGS_REMOTE_UPDATED_EVENT, PRINT_SETTINGS_CONTEXT_EVENT } from '../lib/printService';

interface PickerCustomer {
  id: string;
  name: string;
  phone?: string | null;
  current_balance: number;
}

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
  open_account: 'Cari hesap',
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
  const [customers, setCustomers] = useState<PickerCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [expanded, setExpanded] = useState(!selected);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    // Cache TTL: 5 dakika
    const cacheKey = `customers_${tenantId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setCustomers(data);
          setLoading(false);
          return;
        }
      } catch (e) {}
    }
    const { data } = await (supabase.from('customers' as any) as any)
      .select('id, name, phone, current_balance')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    if (data) {
      sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
      setCustomers(data as unknown as PickerCustomer[]);
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
      .insert({
        tenant_id: tenantId,
        name: addName.trim(),
        phone: addPhone.trim() || null,
        is_active: true,
        current_balance: 0,
        credit_limit: 0,
      })
      .select('id, name')
      .single();
    if (data) {
      try { sessionStorage.removeItem(`customers_${tenantId}`); } catch { /* ignore */ }
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
              Cari hesaba: {amount.toFixed(2)} ₺ borç yazılacak
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
                {c.current_balance > 0 && (
                  <span className="text-xs text-red-500 font-bold">{Number(c.current_balance).toFixed(0)}₺</span>
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
            Cari ödeme için müşteri seçimi zorunludur
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
  // "Adisyon Yazdır" toggle'ının açılış değeri restoranın Ayarlar →
  // Yazıcılar bölümünden seçtiği `receiptPrintDefaultOn` ayarına bağlıdır.
  // Varsayılan kapalıdır; kullanıcı isterse açar. Restoran her ödemede
  // otomatik adisyon basmak isterse Ayarlar'dan bu seçeneği açar.
  const [printReceipt, setPrintReceipt] = useState<boolean>(() => {
    try {
      return loadPrintSettings().receiptPrintDefaultOn === true;
    } catch {
      return false;
    }
  });
  // Bulut/şube değişiminde ayar tazelendiğinde toggle başlangıç durumunu
  // güncelle (kullanıcı manuel değiştirmediği sürece).
  const printReceiptManuallyToggledRef = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (printReceiptManuallyToggledRef.current) return;
      try {
        setPrintReceipt(loadPrintSettings().receiptPrintDefaultOn === true);
      } catch { /* yoksay */ }
    };
    window.addEventListener(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, refresh);
    window.addEventListener(PRINT_SETTINGS_CONTEXT_EVENT, refresh);
    return () => {
      window.removeEventListener(PRINT_SETTINGS_REMOTE_UPDATED_EVENT, refresh);
      window.removeEventListener(PRINT_SETTINGS_CONTEXT_EVENT, refresh);
    };
  }, []);
  const [submitting, setSubmitting] = useState(false);

  // Mobilde tutar input'una otomatik focus verirsek sanal klavye anında
  // sayfayı kaplıyor — kullanıcı sadece bakmak istese bile rahatsız edici.
  // Desktop'ta klavye yok, autoFocus rahatlık katıyor; mobilde input'a
  // dokunulmadıkça klavye çıkmasın.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  const handleSubmit = () => {
    if (submitting) return;

    for (const split of splits) {
      const amt = parseFloat(split.amount);
      if (isNaN(amt) || amt <= 0) {
        alert('Tüm ödeme tutarlarını doğru girin');
        return;
      }
      if (split.method === 'open_account' && !split.customerId) {
        alert('Cari hesap ödemesi için müşteri seçin');
        return;
      }
    }

    // UI'ı anında kapat. DB yazımı arka planda tek tek (sıralı, paymentTransactions
    // state yarışı olmaması için) — hata olursa OrderPanel.handleAddPayment alert atar.
    const splitsSnapshot = splits.slice();
    const printOnComplete = printReceipt;
    setSubmitting(true);
    onClose();
    void (async () => {
      try {
        for (let i = 0; i < splitsSnapshot.length; i++) {
          const split = splitsSnapshot[i];
          const amt = parseFloat(split.amount);
          const isLast = i === splitsSnapshot.length - 1;
          await onPayment(split.method, amt, isLast ? printOnComplete : false, split.customerId);
        }
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const hasInvalidOpenAccount = splits.some(s => s.method === 'open_account' && !s.customerId);
  const isValid = splits.length > 0
    && splits.every(s => parseFloat(s.amount) > 0)
    && !hasInvalidOpenAccount;

  return (
    <div className="fixed inset-0 bg-black/75 z-[60] flex items-end sm:items-center justify-center sm:p-3">
      {/* Mobil: bottom sheet (tam genişlik, üstten kavisli). Tablet+: ortalanmış kart. */}
      <div
        className={
          'bg-white shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden ' +
          'rounded-t-2xl sm:rounded-2xl ' +
          'h-[100dvh] sm:h-auto sm:max-h-[92dvh]'
        }
      >
        <div
          className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 flex items-center justify-between rounded-t-2xl flex-shrink-0"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <h3 className="text-lg sm:text-xl font-bold text-white">Ödeme Al</h3>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-3 sm:p-4 space-y-3">
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
              <div key={idx} className="border-2 border-slate-200 rounded-xl p-2.5 sm:p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
                    {(['cash', 'credit_card', 'open_account'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => updateSplit(idx, 'method', m)}
                        className={`flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg border-2 text-[11px] sm:text-xs font-bold transition-all active:scale-95 leading-tight ${
                          split.method === m
                            ? m === 'open_account'
                              ? 'border-orange-400 bg-orange-50 text-orange-700'
                              : 'border-green-500 bg-green-50 text-green-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {METHOD_ICONS[m]}
                        <span className="truncate">{METHOD_LABELS[m]}</span>
                      </button>
                    ))}
                  </div>
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(idx)}
                      aria-label="Sil"
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all active:scale-95 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={split.amount}
                    onChange={(e) => updateSplit(idx, 'amount', e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 border-2 rounded-xl text-xl sm:text-2xl font-black focus:border-green-500 focus:outline-none text-right"
                    placeholder="0.00"
                    autoFocus={idx === 0 && !isMobile}
                  />
                  <span className="text-slate-500 font-bold text-sm">₺</span>
                  <button
                    onClick={() => fillRemaining(idx)}
                    className="px-2.5 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg font-bold text-xs transition-all active:scale-95 whitespace-nowrap flex-shrink-0"
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
            onClick={() => {
              printReceiptManuallyToggledRef.current = true;
              setPrintReceipt(v => !v);
            }}
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

        <div
          className="flex gap-2 sm:gap-3 p-3 sm:p-4 border-t border-slate-100 flex-shrink-0 bg-white"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-all active:scale-95"
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || submitting || !isValid}
            className={`flex-[2] font-bold py-3 px-4 sm:px-6 rounded-xl transition-all disabled:opacity-50 shadow-lg active:scale-95 ${
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
