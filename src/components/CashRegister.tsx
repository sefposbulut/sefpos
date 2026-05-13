import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import {
  X, Plus, Wallet, Banknote, CreditCard, Receipt, TrendingUp, TrendingDown,
  DollarSign, Calendar, User, Filter, ChevronDown, ChevronUp, ShoppingCart,
  MapPin, Clock, Package, Printer, Ban, Loader2
} from 'lucide-react';
import { ReprintReceiptModal } from './ReprintReceiptModal';

/** Kasa satırı (Supabase Database tipinde tablo eksik; void alanları migration ile gelir). */
export interface CashTransaction {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  shift_id?: string | null;
  transaction_type: string;
  payment_method: string | null;
  amount: number;
  reference_id: string | null;
  reference_type: string | null;
  description: string;
  order_number: string | null;
  table_name: string | null;
  notes?: string | null;
  created_at: string;
  created_by: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  profiles?: { full_name: string } | null;
}

type OrderItem = Database['public']['Tables']['order_items']['Row'] & {
  products: Database['public']['Tables']['products']['Row'];
};

interface CashRegisterProps {
  onClose: () => void;
}

type DatePreset = 'today' | 'yesterday' | 'custom';

function getLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getBusinessDayRange(): { start: Date; end: Date } {
  const now = new Date();
  const hour = now.getHours();
  const start = new Date(now);
  const end = new Date(now);
  if (hour < 6) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(6, 0, 0, 0);
  if (hour >= 6) {
    end.setDate(end.getDate() + 1);
  }
  end.setHours(4, 0, 0, 0);
  return { start, end };
}

/** PostgREST şemada void kolonları yokken dönen hata metnini tanır. */
function cashVoidMigrationHint(errMsg: string): string | null {
  if (/void_reason|voided_at|schema cache/i.test(errMsg)) {
    return (
      'Veritabanında kasa iptal sütunları henüz yok. Supabase Studio → SQL editöründe şu dosyanın içeriğini çalıştırın: supabase/migrations/20260515103000_cash_register_transaction_void.sql\n\n' +
      'Alternatif: GitHub’da “Supabase Migrations” iş akışını (workflow_dispatch) çalıştırın. Ardından sayfayı yenileyin.'
    );
  }
  return null;
}

function getPresetRange(preset: DatePreset): { start: Date; end: Date } {
  if (preset === 'today') {
    return getBusinessDayRange();
  } else if (preset === 'yesterday') {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(6, 0, 0, 0);
    const end = new Date(now);
    end.setHours(4, 0, 0, 0);
    return { start, end };
  }
  const now = new Date();
  return { start: now, end: now };
}

export function CashRegister({ onClose }: CashRegisterProps) {
  const { tenant, user, activeBranch, branches, isOwnerOrAdmin, permissions } = useAuth();
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [showCashForm, setShowCashForm] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [hideVoided, setHideVoided] = useState(false);
  const [voidModalTx, setVoidModalTx] = useState<CashTransaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [cashFormType, setCashFormType] = useState<'cash_in' | 'cash_out' | 'expense'>('cash_in');
  const [cashAmount, setCashAmount] = useState('');
  const [cashDescription, setCashDescription] = useState('');
  const [cashPaymentMethod, setCashPaymentMethod] = useState<'cash' | 'credit_card'>('cash');
  const [filterType, setFilterType] = useState<'all' | 'order_payment' | 'cash_in' | 'cash_out' | 'expense'>('all');
  const [filterMethod, setFilterMethod] = useState<'all' | 'cash' | 'credit_card' | 'open_account'>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState<string>(() => {
    return getLocalDateTimeString(getBusinessDayRange().start);
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return getLocalDateTimeString(getBusinessDayRange().end);
  });
  const [filterBranch, setFilterBranch] = useState<string>(activeBranch?.id || 'all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [availableUsers, setAvailableUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<{ [key: string]: OrderItem[] }>({});
  const [loading, setLoading] = useState(false);

  const getDateRange = useCallback((): { start: Date; end: Date } | null => {
    if (datePreset !== 'custom') {
      return getPresetRange(datePreset);
    }
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  useEffect(() => {
    if (tenant) {
      loadAvailableUsers();
    }
  }, [tenant]);

  useEffect(() => {
    if (tenant) {
      loadCashTransactions();
    }
  }, [tenant, filterType, filterMethod, datePreset, customStart, customEnd, filterBranch, filterUser]);

  const loadAvailableUsers = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', tenant.id)
      .order('full_name');
    if (data) setAvailableUsers(data);
  };

  const loadCashTransactions = async () => {
    if (!tenant) return;
    setLoading(true);

    let query = supabase
      .from('cash_register_transactions')
      .select('*, profiles(full_name)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : filterBranch;
    if (effectiveBranch !== 'all') {
      query = query.eq('branch_id', effectiveBranch);
    }
    if (filterType !== 'all') {
      query = query.eq('transaction_type', filterType);
    }
    if (filterMethod !== 'all') {
      query = query.eq('payment_method', filterMethod);
    }
    if (filterUser !== 'all') {
      query = query.eq('created_by', filterUser);
    }
    const range = getDateRange();
    if (range) {
      query = query.gte('created_at', range.start.toISOString()).lte('created_at', range.end.toISOString());
    }

    const { data } = await query;
    if (data) setCashTransactions(data as CashTransaction[]);
    setLoading(false);
  };

  const loadOrderItemsForCashTx = async (cashTxId: string, orderId: string) => {
    if (!orderId || orderItems[cashTxId]) return;
    const { data } = await supabase
      .from('order_items')
      .select('*, products(*)')
      .eq('order_id', orderId);
    if (data) setOrderItems(prev => ({ ...prev, [cashTxId]: data as OrderItem[] }));
  };

  const toggleTransactionDetails = async (t: CashTransaction) => {
    const hasOrderPayment = t.transaction_type === 'order_payment' && t.reference_id;
    if (!hasOrderPayment) return;
    if (expandedTransaction === t.id) {
      setExpandedTransaction(null);
      return;
    }
    setExpandedTransaction(t.id);
    let orderId: string | null = null;
    if (t.reference_type === 'order') orderId = t.reference_id;
    else if (t.reference_type === 'payment_transaction') {
      const { data } = await supabase
        .from('payment_transactions')
        .select('order_id')
        .eq('id', t.reference_id!)
        .maybeSingle();
      orderId = (data as any)?.order_id ?? null;
    }
    if (orderId) await loadOrderItemsForCashTx(t.id, orderId);
  };

  const handleAddCashTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !user) return;
    const amount = parseFloat(cashAmount);
    if (isNaN(amount) || amount <= 0) { alert('Geçerli bir tutar girin'); return; }

    const { error } = await (supabase as any)
      .from('cash_register_transactions')
      .insert({
        tenant_id: tenant.id,
        branch_id: activeBranch?.id || null,
        transaction_type: cashFormType,
        payment_method: cashPaymentMethod,
        amount: cashFormType === 'cash_out' || cashFormType === 'expense' ? -Math.abs(amount) : Math.abs(amount),
        description: cashDescription || (cashFormType === 'cash_in' ? 'Para Girişi' : cashFormType === 'cash_out' ? 'Para Çıkışı' : 'Gider'),
        created_by: user.id,
      });

    if (error) { alert('Hata: ' + error.message); return; }
    setCashAmount('');
    setCashDescription('');
    setShowCashForm(false);
    loadCashTransactions();
  };

  const summary = useMemo(() => {
    const s = { totalCash: 0, totalCreditCard: 0, totalOpenAccount: 0, orderPayments: 0, expenses: 0, cashIn: 0, cashOut: 0, grandTotal: 0 };
    cashTransactions.forEach(t => {
      if (t.voided_at) return;
      const amount = Number(t.amount);
      if (t.payment_method === 'cash') s.totalCash += amount;
      else if (t.payment_method === 'credit_card') s.totalCreditCard += amount;
      else if (t.payment_method === 'open_account') s.totalOpenAccount += amount;
      if (t.transaction_type === 'order_payment') s.orderPayments += amount;
      else if (t.transaction_type === 'expense') s.expenses += Math.abs(amount);
      else if (t.transaction_type === 'cash_in') s.cashIn += amount;
      else if (t.transaction_type === 'cash_out') s.cashOut += Math.abs(amount);
    });
    s.grandTotal = s.totalCash + s.totalCreditCard + s.totalOpenAccount;
    return s;
  }, [cashTransactions]);

  const visibleTransactions = useMemo(() => {
    if (!hideVoided) return cashTransactions;
    return cashTransactions.filter(t => !t.voided_at);
  }, [cashTransactions, hideVoided]);

  const canVoidCashRows = permissions.can_manage_cash_register || isOwnerOrAdmin;

  const submitVoid = async () => {
    if (!voidModalTx || !user?.id) return;
    const reason = voidReason.trim();
    if (reason.length < 5) {
      alert('İptal gerekçesi en az 5 karakter olmalıdır.');
      return;
    }
    if (['opening_balance', 'closing_balance'].includes(voidModalTx.transaction_type)) {
      alert('Açılış / kapanış bakiyesi bu ekrandan iptal edilemez.');
      return;
    }
    setVoidSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from('cash_register_transactions')
        .update({
          voided_at: new Date().toISOString(),
          voided_by: user.id,
          void_reason: reason,
        })
        .eq('id', voidModalTx.id);
      if (error) throw error;
      setVoidModalTx(null);
      setVoidReason('');
      await loadCashTransactions();
    } catch (e: any) {
      const raw = e?.message || String(e);
      const hint = cashVoidMigrationHint(raw);
      alert(hint ? `İptal kaydedilemedi.\n\n${hint}` : `İptal kaydedilemedi: ${raw}`);
    } finally {
      setVoidSubmitting(false);
    }
  };

  const formatDateRange = () => {
    const range = getDateRange();
    if (!range) return '';
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    return `${range.start.toLocaleString('tr-TR', opts)} – ${range.end.toLocaleString('tr-TR', opts)}`;
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="bg-gradient-to-r from-green-600 to-emerald-700 px-3 md:px-8 py-4 md:py-5 flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-2 md:gap-4 text-white">
          <Wallet className="w-6 h-6 md:w-8 md:h-8" />
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Kasa Yönetimi</h2>
            {activeBranch && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 opacity-80" />
                <span className="text-xs opacity-90">{activeBranch.name}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrAdmin && branches.length > 1 && (
            <select
              value={filterBranch}
              onChange={e => setFilterBranch(e.target.value)}
              className="bg-white/20 text-white text-sm px-3 py-1.5 rounded-lg border border-white/30 focus:outline-none"
            >
              <option value="all" className="text-gray-800 bg-white">Tüm Şubeler</option>
              {branches.map(b => <option key={b.id} value={b.id} className="text-gray-800 bg-white">{b.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowReprintModal(true)}
            className="hidden sm:flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-1.5 rounded-lg border border-white/30 transition-all active:scale-95"
            title="Geçmiş siparişlerin adisyonunu yeniden bas"
          >
            <Printer className="w-4 h-4" />
            <span className="font-bold">Adisyon Yazdır</span>
          </button>
          <button onClick={onClose} className="text-white hover:bg-white/20 p-2 rounded-lg transition-all active:scale-95">
            <X className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        </div>
      </div>

      {showReprintModal && (
        <ReprintReceiptModal onClose={() => setShowReprintModal(false)} />
      )}

      {voidModalTx && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
          onClick={() => { if (!voidSubmitting) { setVoidModalTx(null); setVoidReason(''); } }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-black text-lg text-slate-800 mb-1">Kasa işlemini iptal et</h3>
            <p className="text-sm text-slate-600 mb-2">
              Kayıt silinmez; <b>iptal</b> olarak işaretlenir ve üstteki kasa özetinden düşer. Gün sonu ve raporlarda gerekçe ile görünür.
            </p>
            <div className="text-xs font-mono bg-slate-50 rounded-lg p-2 mb-3 border border-slate-100 text-slate-700">
              {voidModalTx.description} · {Number(voidModalTx.amount).toFixed(2)} ₺
            </div>
            <label className="block text-xs font-bold text-slate-700 mb-1">İptal gerekçesi (zorunlu, en az 5 karakter)</label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-400 focus:border-transparent text-sm resize-none"
              placeholder="Örn: Yanlış tutar girildi / müşteri ödemesi iade / test kaydı silinmeli"
              disabled={voidSubmitting}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={voidSubmitting}
                onClick={() => { setVoidModalTx(null); setVoidReason(''); }}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={voidSubmitting}
                onClick={() => void submitVoid()}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {voidSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                İptali kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-4">

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-3 md:p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <Banknote className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
                <TrendingUp className="w-4 h-4 opacity-60" />
              </div>
              <p className="text-xs opacity-80 mb-1">Nakit</p>
              <p className="text-xl md:text-3xl font-bold">{summary.totalCash.toFixed(0)} ₺</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 md:p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <CreditCard className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
                <TrendingUp className="w-4 h-4 opacity-60" />
              </div>
              <p className="text-xs opacity-80 mb-1">Kart</p>
              <p className="text-xl md:text-3xl font-bold">{summary.totalCreditCard.toFixed(0)} ₺</p>
            </div>
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-3 md:p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <Receipt className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
                <DollarSign className="w-4 h-4 opacity-60" />
              </div>
              <p className="text-xs opacity-80 mb-1">Açık Hesap</p>
              <p className="text-xl md:text-3xl font-bold">{summary.totalOpenAccount.toFixed(0)} ₺</p>
            </div>
            <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-3 md:p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <Wallet className="w-6 h-6 md:w-8 md:h-8 opacity-80" />
                <DollarSign className="w-4 h-4 opacity-60" />
              </div>
              <p className="text-xs opacity-80 mb-1">Toplam Ciro</p>
              <p className="text-xl md:text-3xl font-bold">{summary.grandTotal.toFixed(0)} ₺</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl p-3 md:p-4 border-2 border-blue-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-semibold text-gray-500">Siparişler</p>
              </div>
              <p className="text-lg md:text-2xl font-bold text-blue-600">{summary.orderPayments.toFixed(0)} ₺</p>
            </div>
            <div className="bg-white rounded-xl p-3 md:p-4 border-2 border-green-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-xs font-semibold text-gray-500">Para Girişi</p>
              </div>
              <p className="text-lg md:text-2xl font-bold text-green-600">+{summary.cashIn.toFixed(0)} ₺</p>
            </div>
            <div className="bg-white rounded-xl p-3 md:p-4 border-2 border-red-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <p className="text-xs font-semibold text-gray-500">Para Çıkışı</p>
              </div>
              <p className="text-lg md:text-2xl font-bold text-red-600">-{summary.cashOut.toFixed(0)} ₺</p>
            </div>
            <div className="bg-white rounded-xl p-3 md:p-4 border-2 border-orange-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-4 h-4 text-orange-500" />
                <p className="text-xs font-semibold text-gray-500">Giderler</p>
              </div>
              <p className="text-lg md:text-2xl font-bold text-orange-600">-{summary.expenses.toFixed(0)} ₺</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800 text-base md:text-lg">Kasa İşlemleri</h3>
              <button
                onClick={() => setShowCashForm(!showCashForm)}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 md:px-5 md:py-2.5 rounded-lg transition shadow-sm font-bold text-sm active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Yeni İşlem</span>
                <span className="sm:hidden">Ekle</span>
              </button>
            </div>

            {showCashForm && (
              <form onSubmit={handleAddCashTransaction} className="p-4 md:p-6 border-b border-gray-100 space-y-4 bg-slate-50">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: 'cash_in' as const, label: 'Para Girişi', icon: <TrendingUp className="w-5 h-5 mx-auto mb-1.5" />, active: 'border-green-500 bg-green-50 text-green-700' },
                    { type: 'cash_out' as const, label: 'Para Çıkışı', icon: <TrendingDown className="w-5 h-5 mx-auto mb-1.5" />, active: 'border-red-500 bg-red-50 text-red-700' },
                    { type: 'expense' as const, label: 'Gider', icon: <Receipt className="w-5 h-5 mx-auto mb-1.5" />, active: 'border-orange-500 bg-orange-50 text-orange-700' },
                  ].map(opt => (
                    <button key={opt.type} type="button" onClick={() => setCashFormType(opt.type)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${cashFormType === opt.type ? opt.active : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                      {opt.icon}
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { method: 'cash' as const, label: 'Nakit', icon: <Banknote className="w-5 h-5 mx-auto mb-1" />, active: 'border-green-500 bg-green-50' },
                    { method: 'credit_card' as const, label: 'Kredi Kartı', icon: <CreditCard className="w-5 h-5 mx-auto mb-1" />, active: 'border-blue-500 bg-blue-50' },
                  ].map(opt => (
                    <button key={opt.method} type="button" onClick={() => setCashPaymentMethod(opt.method)}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${cashPaymentMethod === opt.method ? opt.active : 'border-gray-200 hover:border-gray-300'}`}>
                      {opt.icon}
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tutar (₺)</label>
                  <input
                    type="number" step="0.01" value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg font-bold"
                    placeholder="0.00" required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Açıklama</label>
                  <textarea
                    value={cashDescription} onChange={e => setCashDescription(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    rows={2} placeholder="İşlem açıklaması..."
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-sm transition active:scale-95 shadow-sm">Ekle</button>
                  <button type="button" onClick={() => setShowCashForm(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-bold text-sm transition active:scale-95">İptal</button>
                </div>
              </form>
            )}

            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="font-bold text-gray-700 text-sm">Filtreler</span>
              </div>

              <div className="flex gap-2 flex-wrap">
                {(['today', 'yesterday', 'custom'] as const).map(p => (
                  <button key={p} onClick={() => setDatePreset(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${datePreset === p ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {p === 'today' ? 'Bugün' : p === 'yesterday' ? 'Dün' : 'Özel Dönem'}
                  </button>
                ))}
              </div>

              {datePreset === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Başlangıç
                    </label>
                    <input
                      type="datetime-local"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Bitiş
                    </label>
                    <input
                      type="datetime-local"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              )}

              {datePreset !== 'custom' && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-slate-50 rounded-lg px-3 py-2">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{formatDateRange()}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tipi</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm">
                    <option value="all">Tümü</option>
                    <option value="order_payment">Sipariş Ödemesi</option>
                    <option value="cash_in">Para Girişi</option>
                    <option value="cash_out">Para Çıkışı</option>
                    <option value="expense">Gider</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ödeme Yöntemi</label>
                  <select value={filterMethod} onChange={e => setFilterMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm">
                    <option value="all">Tümü</option>
                    <option value="cash">Nakit</option>
                    <option value="credit_card">Kredi Kartı</option>
                    <option value="open_account">Açık Hesap</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kullanıcı</label>
                  <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm">
                    <option value="all">Tüm Kullanıcılar</option>
                    {availableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  checked={hideVoided}
                  onChange={(e) => setHideVoided(e.target.checked)}
                />
                İptal edilenleri listede gizle (üstteki özet yalnızca geçerli işlemleri toplar)
              </label>
            </div>

            <div className="p-3 md:p-4 space-y-2">
              {loading && (
                <div className="text-center py-10 text-gray-400 text-sm">Yükleniyor...</div>
              )}
              {!loading && visibleTransactions.length === 0 && (
                <div className="text-center py-16">
                  <Wallet className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">
                    {hideVoided && cashTransactions.length > 0
                      ? 'Bu dönemde listelenecek geçerli (iptal edilmemiş) işlem yok'
                      : 'Bu dönemde işlem kaydı bulunamadı'}
                  </p>
                </div>
              )}
              {!loading && visibleTransactions.map(transaction => {
                const isExpanded = expandedTransaction === transaction.id;
                const items = orderItems[transaction.id];
                const hasOrderDetails = transaction.transaction_type === 'order_payment' && !!transaction.reference_id;
                const isPositive = Number(transaction.amount) > 0;
                const isVoided = !!transaction.voided_at;

                const typeLabel: Record<string, string> = {
                  order_payment: 'Sipariş Ödemesi',
                  cash_in: 'Para Girişi',
                  cash_out: 'Para Çıkışı',
                  expense: 'Gider',
                  opening_balance: 'Açılış',
                  closing_balance: 'Kapanış',
                };

                const canVoidThis =
                  canVoidCashRows &&
                  !isVoided &&
                  !['opening_balance', 'closing_balance'].includes(transaction.transaction_type);

                return (
                  <div key={transaction.id}
                    className={`bg-white rounded-xl border-l-4 shadow-sm transition-shadow ${
                      isVoided ? 'opacity-75 border-slate-300' : 'hover:shadow-md'
                    } ${isPositive && !isVoided ? 'border-green-500' : !isVoided ? 'border-red-400' : ''}`}>
                    <div
                      className={`p-3 md:p-4 ${hasOrderDetails && !isVoided ? 'cursor-pointer select-none' : ''}`}
                      onClick={() => hasOrderDetails && !isVoided && void toggleTransactionDetails(transaction)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-xl shrink-0 ${
                            transaction.payment_method === 'cash' ? 'bg-green-100 text-green-600' :
                            transaction.payment_method === 'credit_card' ? 'bg-blue-100 text-blue-600' :
                            transaction.payment_method === 'open_account' ? 'bg-orange-100 text-orange-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {transaction.payment_method === 'cash' && <Banknote className="w-5 h-5" />}
                            {transaction.payment_method === 'credit_card' && <CreditCard className="w-5 h-5" />}
                            {transaction.payment_method === 'open_account' && <Receipt className="w-5 h-5" />}
                            {!transaction.payment_method && <DollarSign className="w-5 h-5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`font-bold text-gray-800 text-sm truncate ${isVoided ? 'line-through text-slate-500' : ''}`}>{transaction.description}</p>
                              {isVoided && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 bg-rose-100 text-rose-800 border border-rose-200">
                                  İPTAL
                                </span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                transaction.transaction_type === 'order_payment' ? 'bg-blue-100 text-blue-700' :
                                transaction.transaction_type === 'expense' ? 'bg-orange-100 text-orange-700' :
                                transaction.transaction_type === 'cash_in' ? 'bg-green-100 text-green-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {typeLabel[transaction.transaction_type] || transaction.transaction_type}
                              </span>
                              {hasOrderDetails && !isVoided && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold shrink-0 flex items-center gap-1">
                                  <Package className="w-3 h-3" />Ürünler
                                </span>
                              )}
                            </div>
                            {isVoided && transaction.void_reason && (
                              <p className="text-[11px] text-rose-700 font-semibold mt-1 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1">
                                İptal: {transaction.void_reason}
                                {transaction.voided_at && (
                                  <span className="text-rose-500 font-normal">
                                    {' '}· {new Date(transaction.voided_at).toLocaleString('tr-TR')}
                                  </span>
                                )}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 mt-1">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(transaction.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {transaction.profiles && (
                                <div className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  <span>{transaction.profiles.full_name}</span>
                                </div>
                              )}
                              {transaction.table_name && (
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  <span>{transaction.table_name}</span>
                                </div>
                              )}
                              {transaction.order_number && (
                                <span className="font-mono text-gray-400">#{transaction.order_number}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-base md:text-xl font-bold ${isVoided ? 'text-slate-400 line-through' : isPositive ? 'text-green-600' : 'text-red-500'}`}>
                              {isPositive ? '+' : ''}{Number(transaction.amount).toFixed(2)} ₺
                            </p>
                            {hasOrderDetails && !isVoided && (
                              isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </div>
                          {canVoidThis && (
                            <button
                              type="button"
                              title="Kasa satırını iptal et (silmez; gerekçe ile kayıt altına alınır)"
                              onClick={(e) => {
                                e.stopPropagation();
                                setVoidReason('');
                                setVoidModalTx(transaction);
                              }}
                              className="text-[11px] font-black px-2 py-1 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 active:scale-95 flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              İptal
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && !isVoided && (
                      <div className="border-t border-gray-100 bg-slate-50 p-4 rounded-b-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <ShoppingCart className="w-4 h-4 text-blue-500" />
                          <h4 className="font-bold text-gray-700 text-sm">Sipariş Ürünleri</h4>
                        </div>
                        {items && items.length > 0 ? (
                          <div className="space-y-1.5">
                            {items.map(item => (
                              <div key={item.id} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center justify-between">
                                <div>
                                  <p className="font-bold text-gray-800 text-sm">{item.products.name}</p>
                                  <p className="text-xs text-gray-500">{item.quantity} x {Number(item.unit_price).toFixed(2)} ₺</p>
                                  {(item as any).notes && <p className="text-xs text-blue-600 mt-0.5">Not: {(item as any).notes}</p>}
                                </div>
                                <p className="font-bold text-blue-600">{Number(item.total_amount).toFixed(2)} ₺</p>
                              </div>
                            ))}
                            <div className="flex justify-between font-bold text-sm text-gray-700 pt-1 border-t border-slate-200">
                              <span>Toplam</span>
                              <span className="text-green-600">{items.reduce((s, i) => s + Number(i.total_amount), 0).toFixed(2)} ₺</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-center py-3">Ürün bilgisi yükleniyor...</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
