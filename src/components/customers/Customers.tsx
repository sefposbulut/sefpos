import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, Users,
  Wallet, TrendingUp, TrendingDown, X, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Receipt, Send, Power, ChevronRight, FileText, AlertCircle,
  Package, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fetchCustomersList } from '../../lib/customersApi';

// =====================================================================
// Tipler
// =====================================================================
interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  current_balance: number;
  is_active: boolean;
  loyalty_points?: number;
  created_at: string | null;
}

interface CustomerTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  order_id: string | null;
  type: 'debt' | 'payment';
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string | null;
  order?: { order_number: string | null; total_amount: number | null } | null;
  _running?: number;
}

type FilterTab = 'all' | 'debtors' | 'creditors' | 'inactive';

// =====================================================================
// Yardımcılar
// =====================================================================
const TRY = (v: number | null | undefined) =>
  `${(Number(v) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

const onlyDigits = (v: string) => v.replace(/\D/g, '');

const buildWhatsAppMessage = (c: Customer) => {
  const balance = Number(c.current_balance) || 0;
  const direction = balance > 0 ? `borç bakiyeniz` : balance < 0 ? `alacak bakiyeniz` : `bakiyeniz`;
  return `Merhaba ${c.name}, ${direction}: ${TRY(Math.abs(balance))}.\nİyi günler dileriz.`;
};

// =====================================================================
// Ana bileşen
// =====================================================================
export function Customers() {
  const { tenant, user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const [showTxModal, setShowTxModal] = useState<{ kind: 'debt' | 'payment'; customer: Customer } | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchCustomersList(tenant.id);
    if (err) {
      console.error('[Cari] customers load error:', err);
      setError(err.message || 'Cari hesaplar yüklenemedi.');
      setCustomers([]);
    } else {
      setCustomers(data as Customer[]);
    }
    setLoading(false);
  }, [tenant]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  // Realtime: müşteri değişiminde liste tazelenir
  useEffect(() => {
    if (!tenant?.id) return;
    const ch = supabase
      .channel(`cari-customers-${tenant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `tenant_id=eq.${tenant.id}` }, () => {
        void loadCustomers();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_transactions', filter: `tenant_id=eq.${tenant.id}` }, () => {
        void loadCustomers();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenant?.id, loadCustomers]);

  // İstatistikler — yalnızca aktif müşteriler dikkate alınır
  const stats = useMemo(() => {
    const active = customers.filter(c => c.is_active);
    const totalDebt = active.reduce((s, c) => s + Math.max(0, Number(c.current_balance) || 0), 0);
    const totalCredit = active.reduce((s, c) => s + Math.abs(Math.min(0, Number(c.current_balance) || 0)), 0);
    const debtors = active.filter(c => Number(c.current_balance) > 0).length;
    const creditors = active.filter(c => Number(c.current_balance) < 0).length;
    return { count: active.length, totalDebt, totalCredit, debtors, creditors, net: totalDebt - totalCredit };
  }, [customers]);

  // Liste filtreleme
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      if (filterTab === 'inactive' && c.is_active) return false;
      if (filterTab !== 'inactive' && !c.is_active) return false;
      if (filterTab === 'debtors' && !(Number(c.current_balance) > 0)) return false;
      if (filterTab === 'creditors' && !(Number(c.current_balance) < 0)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q)
      );
    });
  }, [customers, filterTab, search]);

  const selected = useMemo(
    () => customers.find(c => c.id === selectedId) || null,
    [customers, selectedId],
  );

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setShowForm(true);
  };

  const handleSoftDelete = async (c: Customer) => {
    if (!confirm(`"${c.name}" pasifleştirilsin mi? (Hareketler korunur)`)) return;
    const { error: err } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', c.id);
    if (err) alert('Pasifleştirme hatası: ' + err.message);
    else void loadCustomers();
  };

  const handleReactivate = async (c: Customer) => {
    const { error: err } = await supabase
      .from('customers')
      .update({ is_active: true })
      .eq('id', c.id);
    if (err) alert('Aktifleştirme hatası: ' + err.message);
    else void loadCustomers();
  };

  const handleHardDelete = async (c: Customer) => {
    if (!confirm(`"${c.name}" KALICI olarak silinecek. TÜM hareketler de silinecek. Devam edilsin mi?`)) return;
    const { error: err } = await supabase
      .from('customers')
      .delete()
      .eq('id', c.id);
    if (err) {
      alert('Silme hatası: ' + err.message);
    } else {
      setSelectedId(null);
      void loadCustomers();
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-orange-50/20 to-slate-50">
      <div className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-red-600 text-white px-4 md:px-6 py-4 shadow-md">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg md:text-2xl font-black leading-tight">Cari Hesaplar</h1>
              <p className="text-orange-100 text-xs md:text-sm">Borç, tahsilat ve müşteri kartları</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadCustomers()}
              disabled={loading}
              className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition disabled:opacity-50"
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-2 bg-white text-orange-700 hover:bg-orange-50 px-4 py-2.5 rounded-xl text-sm font-bold shadow transition active:scale-95"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Yeni cari</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <StatCard
            icon={<Users className="w-4 h-4 text-slate-600" />}
            label="Aktif cari"
            value={String(stats.count)}
            tone="slate"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4 text-rose-600" />}
            label={`Borçlu (${stats.debtors})`}
            value={TRY(stats.totalDebt)}
            tone="rose"
          />
          <StatCard
            icon={<TrendingDown className="w-4 h-4 text-emerald-600" />}
            label={`Alacaklı (${stats.creditors})`}
            value={TRY(stats.totalCredit)}
            tone="emerald"
          />
          <StatCard
            icon={<Wallet className="w-4 h-4 text-orange-600" />}
            label="Net bakiye"
            value={TRY(stats.net)}
            tone={stats.net >= 0 ? 'orange' : 'amber'}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-3 md:gap-4 p-3 md:p-4">
        <div
          className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-0 overflow-hidden ${
            selected ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3 border-b border-slate-100 space-y-3 bg-slate-50/80">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="search"
                placeholder="İsim, telefon veya e-posta ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-3 py-2.5 w-full text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-orange-400 focus:border-orange-300 outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: 'Tümü', cnt: customers.filter((c) => c.is_active).length },
                { id: 'debtors', label: 'Borçlu', cnt: stats.debtors },
                { id: 'creditors', label: 'Alacaklı', cnt: stats.creditors },
                { id: 'inactive', label: 'Pasif', cnt: customers.filter((c) => !c.is_active).length },
              ].map((t) => {
                const active = filterTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilterTab(t.id as FilterTab)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      active
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-200'
                    }`}
                  >
                    {t.label}
                    <span className={`ml-1 ${active ? 'text-orange-100' : 'text-slate-400'}`}>
                      {t.cnt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="p-10 text-center text-slate-500 text-sm">
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-orange-500" />
                <p>Yükleniyor…</p>
              </div>
            ) : error ? (
              <div className="p-4 m-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Liste yüklenemedi</p>
                    <p className="text-red-700/90 mt-1 text-xs">{error}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadCustomers()}
                  className="w-full py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                >
                  Tekrar dene
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold">Kayıt yok</p>
                <p className="text-xs mt-1">Yeni cari hesap ekleyin.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map(c => {
                  const balance = Number(c.current_balance) || 0;
                  const isSelected = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left px-3 py-3 hover:bg-orange-50/60 transition flex items-center gap-3 touch-manipulation ${
                          isSelected ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : ''
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                          balance > 0 ? 'bg-gradient-to-br from-rose-500 to-red-600'
                          : balance < 0 ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                          : 'bg-gradient-to-br from-slate-400 to-slate-500'
                        }`}>
                          {(c.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-800 truncate flex items-center gap-1.5">
                            {c.name}
                            {!c.is_active && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-600 rounded">PASİF</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{c.phone || c.email || '—'}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`text-sm font-bold ${
                            balance > 0 ? 'text-rose-600' : balance < 0 ? 'text-emerald-600' : 'text-slate-500'
                          }`}>
                            {TRY(Math.abs(balance))}
                          </div>
                          <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                            {balance > 0 ? 'Borç' : balance < 0 ? 'Alacak' : 'Sıfır'}
                          </div>
                          {(c.loyalty_points ?? 0) > 0 && (
                            <div className="text-[10px] font-bold text-violet-600 mt-0.5">
                              {c.loyalty_points} puan
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 hidden lg:block" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Sağ: detay */}
        <div
          className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-0 overflow-hidden ${
            selected ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selected ? (
            <CustomerDetail
              key={selected.id}
              customer={selected}
              currentUserId={user?.id || null}
              onBack={() => setSelectedId(null)}
              onEdit={() => openEdit(selected)}
              onAddDebt={() => setShowTxModal({ kind: 'debt', customer: selected })}
              onAddPayment={() => setShowTxModal({ kind: 'payment', customer: selected })}
              onSoftDelete={() => handleSoftDelete(selected)}
              onReactivate={() => handleReactivate(selected)}
              onHardDelete={() => handleHardDelete(selected)}
              onChange={loadCustomers}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-slate-400">
              <div className="text-center">
                <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-semibold">Detay görmek için bir cari seçin</p>
                <p className="text-xs mt-1 text-slate-400">Sol listeden bir müşteriye tıklayın</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modaller */}
      {showForm && (
        <CustomerFormModal
          tenantId={tenant?.id || ''}
          customer={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={(c) => {
            setShowForm(false);
            setEditing(null);
            void loadCustomers();
            if (c?.id) setSelectedId(c.id);
          }}
        />
      )}

      {showTxModal && (
        <TransactionModal
          tenantId={tenant?.id || ''}
          createdBy={user?.id || null}
          customer={showTxModal.customer}
          kind={showTxModal.kind}
          onClose={() => setShowTxModal(null)}
          onSaved={() => {
            setShowTxModal(null);
            void loadCustomers();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// İstatistik kartı
// =====================================================================
type StatTone = 'slate' | 'rose' | 'emerald' | 'orange' | 'amber';

const STAT_TONE_CLASS: Record<StatTone, string> = {
  slate: 'border-slate-300 bg-white/95',
  rose: 'border-rose-300 bg-white/95',
  emerald: 'border-emerald-300 bg-white/95',
  orange: 'border-orange-300 bg-white/95',
  amber: 'border-amber-300 bg-white/95',
};

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: StatTone;
}) {
  return (
    <div
      className={`rounded-xl border-l-4 p-3 shadow-sm backdrop-blur-sm ${STAT_TONE_CLASS[tone]}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base md:text-lg font-black text-slate-900 mt-1 truncate">{value}</div>
    </div>
  );
}

/** Cari hareket satırına tıklanınca: siparişe bağlıysa ürün kalemleri, değilse özet bilgi */
function CariTransactionDetailModal({
  tx,
  customerName,
  onClose,
}: {
  tx: CustomerTransaction;
  customerName: string;
  onClose: () => void;
}) {
  const orderId = tx.order_id;
  const [loading, setLoading] = useState(!!orderId);
  const [orderHead, setOrderHead] = useState<{
    order_number: string | null;
    total_amount: number | null;
    created_at: string | null;
  } | null>(null);
  const [lines, setLines] = useState<
    Array<{
      quantity: number;
      unit_price: number;
      total_amount: number | null;
      notes: string | null;
      variant_name: string | null;
      products: { name: string } | null;
    }>
  >([]);
  const [fetchErr, setFetchErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFetchErr(null);
      setLines([]);
      setOrderHead(null);
      if (!orderId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [ordRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('order_number, total_amount, created_at').eq('id', orderId).maybeSingle(),
        supabase
          .from('order_items')
          .select('quantity, unit_price, total_amount, notes, variant_name, products(name)')
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;
      if (ordRes.error) setFetchErr(ordRes.error.message);
      else setOrderHead(ordRes.data as typeof orderHead);
      if (itemsRes.error) {
        if (!ordRes.error) setFetchErr(itemsRes.error.message);
      } else {
        setLines((itemsRes.data || []) as typeof lines);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const linesSum = useMemo(
    () =>
      lines.reduce((s, li) => {
        const tot =
          li.total_amount != null && !Number.isNaN(Number(li.total_amount))
            ? Number(li.total_amount)
            : Number(li.quantity || 0) * Number(li.unit_price || 0);
        return s + tot;
      }, 0),
    [lines],
  );

  const lineAmount = (li: (typeof lines)[number]) => {
    if (li.total_amount != null && !Number.isNaN(Number(li.total_amount))) return Number(li.total_amount);
    return Number(li.quantity || 0) * Number(li.unit_price || 0);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 p-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-800">Hareket detayı</h3>
            <p className="text-xs text-slate-500 truncate">{customerName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg flex-shrink-0" aria-label="Kapat">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-bold ${tx.type === 'debt' ? 'text-rose-700' : 'text-emerald-700'}`}>
                {tx.type === 'debt' ? 'Borç' : 'Ödeme'}
              </span>
              <span className="font-black text-slate-800">{TRY(Number(tx.amount) || 0)}</span>
              {tx.order?.order_number && (
                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-800 text-[10px] font-bold rounded">#{tx.order.order_number}</span>
              )}
            </div>
            <div className="text-xs text-slate-500">{fmtDate(tx.created_at)}</div>
            {tx.note && <div className="text-xs text-slate-700 whitespace-pre-wrap pt-1 border-t border-slate-200">{tx.note}</div>}
          </div>

          {!orderId && (
            <p className="text-sm text-slate-500 flex items-start gap-2">
              <Package className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-400" />
              Bu hareket bir siparişe bağlı değil; manuel borç veya ödeme kaydıdır.
            </p>
          )}

          {orderId && (
            <>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sipariş kalemleri yükleniyor…
                </div>
              )}
              {fetchErr && !loading && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fetchErr}</div>
              )}
              {!loading && !fetchErr && orderHead && (
                <div className="text-xs text-slate-500">
                  Sipariş toplamı: <span className="font-bold text-slate-700">{TRY(Number(orderHead.total_amount) || 0)}</span>
                  {orderHead.created_at && (
                    <span className="ml-2">• {fmtDate(orderHead.created_at)}</span>
                  )}
                </div>
              )}
              {!loading && !fetchErr && lines.length === 0 && (
                <p className="text-sm text-slate-400">Bu siparişte kalem bulunamadı.</p>
              )}
              {!loading && lines.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">Siparişte ne var</div>
                  <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {lines.map((li, idx) => {
                      const pname = li.products?.name || 'Ürün';
                      const vname = li.variant_name ? ` (${li.variant_name})` : '';
                      return (
                        <li key={idx} className="px-3 py-2.5 bg-white text-sm">
                          <div className="flex justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-800 truncate">
                                {pname}
                                {vname && <span className="font-normal text-slate-600">{vname}</span>}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {li.quantity} × {TRY(Number(li.unit_price) || 0)}
                              </div>
                              {li.notes && <div className="text-xs text-slate-500 mt-1 italic">{li.notes}</div>}
                            </div>
                            <div className="text-right font-bold text-slate-800 flex-shrink-0">{TRY(lineAmount(li))}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="flex justify-end mt-2 text-sm font-bold text-slate-700">
                    Kalemler: {TRY(linesSum)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tarih araligi + devir mantigiyla yazdirilabilir hesap ekstresi */
function CariStatementModal({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalInput = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0);
  const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const [startStr, setStartStr] = useState(toLocalInput(monthStart));
  const [endStr, setEndStr] = useState(toLocalInput(dayEnd));
  const [includeItems, setIncludeItems] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'debt' | 'payment'>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setRange = (preset: 'today' | 'week' | 'month' | 'last30' | 'last90' | 'all') => {
    const now = new Date();
    let s = new Date(now);
    let e = new Date(now);
    if (preset === 'today') {
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 0);
    } else if (preset === 'week') {
      const dow = s.getDay() === 0 ? 7 : s.getDay();
      s.setDate(s.getDate() - dow + 1);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 0);
    } else if (preset === 'month') {
      s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (preset === 'last30') {
      s = new Date(now);
      s.setDate(s.getDate() - 30);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 0);
    } else if (preset === 'last90') {
      s = new Date(now);
      s.setDate(s.getDate() - 90);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 0);
    } else {
      s = new Date(2000, 0, 1, 0, 0, 0);
      e.setHours(23, 59, 59, 0);
    }
    setStartStr(toLocalInput(s));
    setEndStr(toLocalInput(e));
  };

  const handlePrint = async () => {
    setBusy(true);
    setErr(null);
    try {
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error('Geçersiz tarih.');
      }
      if (endDate.getTime() < startDate.getTime()) {
        throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
      }
      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      const openRes = await supabase
        .from('customer_transactions')
        .select('type, amount')
        .eq('customer_id', customer.id)
        .lt('created_at', startISO);
      if (openRes.error) throw openRes.error;
      const opening = (openRes.data || []).reduce(
        (s: number, t: any) => s + (t.type === 'debt' ? Number(t.amount || 0) : -Number(t.amount || 0)),
        0,
      );

      let q = supabase
        .from('customer_transactions')
        .select('id, order_id, type, amount, note, created_at')
        .eq('customer_id', customer.id)
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .order('created_at', { ascending: true });
      if (typeFilter !== 'all') q = q.eq('type', typeFilter);
      const txRes = await q;
      if (txRes.error) throw txRes.error;
      const txs = (txRes.data || []) as Array<{
        id: string;
        order_id: string | null;
        type: 'debt' | 'payment';
        amount: number;
        note: string | null;
        created_at: string | null;
      }>;

      const orderIds = [...new Set(txs.map((t) => t.order_id).filter((x): x is string => !!x))];
      const orderMap = new Map<string, { order_number: string | null; total_amount: number | null }>();
      const itemsMap = new Map<
        string,
        Array<{ quantity: number; unit_price: number; total_amount: number | null; notes: string | null; variant_name: string | null; products: { name: string } | null }>
      >();
      if (orderIds.length > 0) {
        const ordRes = await supabase
          .from('orders')
          .select('id, order_number, total_amount')
          .in('id', orderIds);
        if (ordRes.error) throw ordRes.error;
        for (const o of (ordRes.data || []) as any[]) {
          orderMap.set(o.id, {
            order_number: o.order_number ?? null,
            total_amount: o.total_amount != null ? Number(o.total_amount) : null,
          });
        }
        if (includeItems) {
          const itRes = await supabase
            .from('order_items')
            .select('order_id, quantity, unit_price, total_amount, notes, variant_name, created_at, products(name)')
            .in('order_id', orderIds)
            .order('created_at', { ascending: true });
          if (itRes.error) throw itRes.error;
          for (const it of (itRes.data || []) as any[]) {
            const arr = itemsMap.get(it.order_id) || [];
            arr.push(it);
            itemsMap.set(it.order_id, arr);
          }
        }
      }

      let debtSum = 0;
      let paymentSum = 0;
      for (const t of txs) {
        if (t.type === 'debt') debtSum += Number(t.amount || 0);
        else paymentSum += Number(t.amount || 0);
      }
      const closing = opening + debtSum - paymentSum;

      const escape = (v: any) =>
        String(v ?? '').replace(/[<>&"']/g, (c) =>
          ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c],
        );

      let running = opening;
      const rowsHtml = txs
        .map((t) => {
          const ord = t.order_id ? orderMap.get(t.order_id) : null;
          const a = Number(t.amount || 0);
          running += t.type === 'debt' ? a : -a;
          const items = includeItems && t.order_id ? itemsMap.get(t.order_id) || [] : [];
          const itemsHtml = items.length
            ? `<tr class="items-row"><td colspan="6" class="items-cell">
                <div class="items-title">Sipariş kalemleri${ord?.order_number ? ' — #' + escape(ord.order_number) : ''}</div>
                <table class="items-table">
                  <thead><tr><th>Ürün</th><th class="r">Adet</th><th class="r">Birim</th><th class="r">Tutar</th></tr></thead>
                  <tbody>${items
                    .map((it) => {
                      const pname = it.products?.name || 'Ürün';
                      const vname = it.variant_name ? ` (${escape(it.variant_name)})` : '';
                      const tot =
                        it.total_amount != null && !Number.isNaN(Number(it.total_amount))
                          ? Number(it.total_amount)
                          : Number(it.quantity || 0) * Number(it.unit_price || 0);
                      return `<tr>
                        <td>${escape(pname)}${vname}${it.notes ? `<div class="note">${escape(it.notes)}</div>` : ''}</td>
                        <td class="r">${escape(it.quantity)}</td>
                        <td class="r">${TRY(Number(it.unit_price || 0))}</td>
                        <td class="r">${TRY(tot)}</td>
                      </tr>`;
                    })
                    .join('')}</tbody>
                </table>
              </td></tr>`
            : '';
          return `<tr>
            <td>${escape(fmtDate(t.created_at))}</td>
            <td>${t.type === 'debt' ? 'Borç' : 'Ödeme'}</td>
            <td>${ord?.order_number ? '#' + escape(ord.order_number) : '-'}</td>
            <td>${escape(t.note || '-')}</td>
            <td class="r ${t.type === 'debt' ? 'debt' : 'pay'}">${t.type === 'debt' ? '+' : '-'}${TRY(a)}</td>
            <td class="r">${TRY(running)}</td>
          </tr>${itemsHtml}`;
        })
        .join('');

      const win = window.open('', '_blank');
      if (!win) {
        throw new Error('Popup engellendi. Lütfen yeni pencere açma izni verin.');
      }
      win.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"/><title>Cari Ekstre - ${escape(customer.name)}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#0f172a;font-size:12px;}
  h1{font-size:18px;margin:0 0 4px;}
  .meta{font-size:11px;color:#475569;margin-bottom:12px;line-height:1.5;}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0;}
  .card{border:1px solid #e2e8f0;border-radius:6px;padding:8px;}
  .card .lbl{color:#64748b;text-transform:uppercase;font-size:9px;font-weight:bold;letter-spacing:.5px;}
  .card .val{font-size:14px;font-weight:bold;margin-top:2px;}
  table{width:100%;border-collapse:collapse;}
  th,td{border-bottom:1px solid #e2e8f0;padding:5px 6px;text-align:left;vertical-align:top;}
  th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.3px;}
  td.r,th.r{text-align:right;}
  .debt{color:#b91c1c;}
  .pay{color:#15803d;}
  .opening td{background:#f8fafc;font-weight:bold;}
  .closing td{background:#f1f5f9;font-weight:bold;border-top:2px solid #94a3b8;}
  .items-row td{padding:0;border-bottom:1px solid #e2e8f0;}
  .items-cell{background:#fafafa;padding:6px 16px !important;}
  .items-title{font-size:10px;color:#475569;margin-bottom:4px;font-weight:bold;}
  .items-table{font-size:11px;}
  .items-table th{background:transparent;border-bottom:1px solid #cbd5e1;}
  .items-table td{border-bottom:1px dashed #e2e8f0;}
  .note{color:#64748b;font-size:10px;font-style:italic;margin-top:2px;}
  @media print{body{padding:8mm;}}
</style></head><body>
<h1>Cari Hesap Ekstresi — ${escape(customer.name)}</h1>
<div class="meta">
  ${customer.phone ? `Telefon: ${escape(customer.phone)} • ` : ''}${customer.email ? `E-posta: ${escape(customer.email)}` : ''}<br/>
  Aralık: <b>${escape(fmtDate(startISO))}</b> — <b>${escape(fmtDate(endISO))}</b>${typeFilter !== 'all' ? ` • Tür: ${typeFilter === 'debt' ? 'Borç' : 'Ödeme'}` : ''}<br/>
  Yazdırma: ${escape(new Date().toLocaleString('tr-TR'))}
</div>
<div class="summary">
  <div class="card"><div class="lbl">Devir Bakiyesi</div><div class="val">${TRY(opening)}</div></div>
  <div class="card"><div class="lbl">Dönem Borçları</div><div class="val debt">+${TRY(debtSum)}</div></div>
  <div class="card"><div class="lbl">Dönem Ödemeleri</div><div class="val pay">-${TRY(paymentSum)}</div></div>
  <div class="card"><div class="lbl">Kapanış Bakiyesi</div><div class="val">${TRY(closing)}</div></div>
</div>
<table>
  <thead><tr>
    <th>Tarih</th><th>Tür</th><th>Sipariş</th><th>Açıklama</th><th class="r">Tutar</th><th class="r">Bakiye</th>
  </tr></thead>
  <tbody>
    <tr class="opening"><td colspan="5">DEVİR BAKİYESİ</td><td class="r">${TRY(opening)}</td></tr>
    ${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px;">Bu aralıkta hareket yok</td></tr>`}
    <tr class="closing"><td colspan="5">KAPANIŞ BAKİYESİ ${closing > 0 ? '(Borç)' : closing < 0 ? '(Alacak)' : ''}</td><td class="r">${TRY(closing)}</td></tr>
  </tbody>
</table>
<script>window.onload=()=>setTimeout(()=>window.print(),120);</script>
</body></html>`);
      win.document.close();
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Ekstre oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 p-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-800">Hesap Ekstresi</h3>
            <p className="text-xs text-slate-500 truncate">{customer.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg flex-shrink-0" aria-label="Kapat">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5">Hızlı seçim</div>
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => setRange('today')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Bugün</button>
              <button type="button" onClick={() => setRange('week')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Bu Hafta</button>
              <button type="button" onClick={() => setRange('month')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Bu Ay</button>
              <button type="button" onClick={() => setRange('last30')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Son 30g</button>
              <button type="button" onClick={() => setRange('last90')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Son 90g</button>
              <button type="button" onClick={() => setRange('all')} className="px-2 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 rounded">Tümü</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Başlangıç</label>
              <input
                type="datetime-local"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Bitiş</label>
              <input
                type="datetime-local"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Hareket türü</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="all">Tümü (borç + ödeme)</option>
              <option value="debt">Sadece Borç</option>
              <option value="payment">Sadece Ödeme</option>
            </select>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeItems}
              onChange={(e) => setIncludeItems(e.target.checked)}
              className="w-4 h-4 mt-0.5"
            />
            <span>
              <b>Detaylı</b> — siparişe bağlı borçların altına ürün listesi eklensin (ne yenmiş, kaç adet, kaç TL)
            </span>
          </label>

          <div className="text-[11px] text-slate-600 bg-orange-50 border border-orange-100 rounded-lg p-2.5 leading-relaxed">
            <b>Mantık:</b> Seçilen aralık için <b>devir bakiyesi</b> (öncesindeki tüm hareketlerin net toplamı) hesaplanır, dönem hareketleri yürüyen bakiyeyle listelenir, en altta <b>kapanış bakiyesi</b> yazılır. Böylece müşteri 5 ay boyunca her gün borç yazdırmış olsa bile sadece istediğin ay/hafta basılır; öncesinden gelen borç “devir” olarak görünür.
          </div>

          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <div className="flex-shrink-0 flex gap-2 p-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm font-semibold border border-slate-300 hover:bg-slate-50 rounded-lg"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={busy}
            className="flex-1 px-4 py-2.5 text-sm font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Yazdır
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Müşteri detay paneli (hareketler / bilgiler / siparişler)
// =====================================================================
interface CustomerDetailProps {
  customer: Customer;
  currentUserId: string | null;
  onBack: () => void;
  onEdit: () => void;
  onAddDebt: () => void;
  onAddPayment: () => void;
  onSoftDelete: () => void;
  onReactivate: () => void;
  onHardDelete: () => void;
  onChange: () => void;
}

function CustomerDetail({
  customer, onBack, onEdit, onAddDebt, onAddPayment, onSoftDelete, onReactivate, onHardDelete, onChange,
}: CustomerDetailProps) {
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txLoadError, setTxLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'transactions' | 'info'>('transactions');
  const [detailTx, setDetailTx] = useState<CustomerTransaction | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxLoadError(null);
    // NOT: customer_transactions.order_id icin DB'de FK yoksa PostgREST "order:orders" embed'i
    // PGRST200 ile patlar; tum liste bos gorunur. Once duz select, siparis etiketleri ayri yuklenir.
    const { data: rows, error } = await supabase
      .from('customer_transactions')
      .select('id, tenant_id, customer_id, order_id, type, amount, note, created_by, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[Cari] tx load:', error);
      setTxLoadError(error.message || 'Hareketler yüklenemedi.');
      setTransactions([]);
      setTxLoading(false);
      return;
    }
    const list = (rows || []) as CustomerTransaction[];
    const orderIds = [...new Set(list.map((r) => r.order_id).filter((id): id is string => !!id))];
    const orderMap = new Map<string, { order_number: string | null; total_amount: number | null }>();
    if (orderIds.length > 0) {
      const { data: ords, error: ordErr } = await supabase
        .from('orders')
        .select('id, order_number, total_amount')
        .in('id', orderIds);
      if (ordErr) {
        console.warn('[Cari] siparis etiketleri:', ordErr);
      } else {
        for (const o of ords || []) {
          orderMap.set(String(o.id), {
            order_number: (o as any).order_number ?? null,
            total_amount: (o as any).total_amount != null ? Number((o as any).total_amount) : null,
          });
        }
      }
    }
    setTransactions(
      list.map((r) => ({
        ...r,
        order: r.order_id ? orderMap.get(r.order_id) ?? null : null,
      })),
    );
    setTxLoading(false);
  }, [customer.id]);

  useEffect(() => { void loadTransactions(); }, [loadTransactions]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`cari-tx-${customer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_transactions', filter: `customer_id=eq.${customer.id}` }, () => {
        void loadTransactions();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customer.id, loadTransactions]);

  const balance = Number(customer.current_balance) || 0;
  const limit = Number(customer.credit_limit) || 0;
  const limitUsage = limit > 0 ? Math.min(100, Math.max(0, (Math.max(0, balance) / limit) * 100)) : 0;
  const limitOver = limit > 0 && balance > limit;

  // Hareketler için yürüyen bakiye (son hareketten geriye)
  const txWithRunning = useMemo(() => {
    const ascending = [...transactions].reverse();
    let running = 0;
    const map = new Map<string, number>();
    for (const t of ascending) {
      const a = Number(t.amount) || 0;
      running += t.type === 'debt' ? a : -a;
      map.set(t.id, running);
    }
    return transactions.map(t => ({ ...t, _running: map.get(t.id) || 0 }));
  }, [transactions]);

  const handleDeleteTx = async (tx: CustomerTransaction) => {
    if (!confirm('Bu hareket silinsin mi? Bakiye otomatik düzeltilecek.')) return;
    const { error } = await supabase.from('customer_transactions').delete().eq('id', tx.id);
    if (error) { alert('Silme hatası: ' + error.message); return; }
    // Bakiyeyi geri al
    const delta = (tx.type === 'debt' ? -1 : 1) * Number(tx.amount || 0);
    const newBalance = Number(customer.current_balance) + delta;
    await supabase.from('customers').update({ current_balance: newBalance }).eq('id', customer.id);
    await loadTransactions();
    onChange?.();
  };

  const sendWhatsApp = () => {
    if (!customer.phone) { alert('Bu cari için telefon kayıtlı değil.'); return; }
    const phone = onlyDigits(customer.phone);
    if (!phone) return;
    const intl = phone.startsWith('0') ? '90' + phone.slice(1) : phone.startsWith('90') ? phone : '90' + phone;
    const text = encodeURIComponent(buildWhatsAppMessage(customer));
    window.open(`https://wa.me/${intl}?text=${text}`, '_blank', 'noopener');
  };

  // NOT: ekstre artik tarih araligi + devir mantigiyla CariStatementModal icinde uretiliyor.

  return (
    <>
      {/* başlık */}
      <div className="flex-shrink-0 p-3 md:p-4 border-b border-slate-200">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg flex-shrink-0">
            <X className="w-5 h-5 text-slate-600" />
          </button>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0 ${
            balance > 0 ? 'bg-gradient-to-br from-rose-500 to-red-600'
            : balance < 0 ? 'bg-gradient-to-br from-emerald-500 to-green-600'
            : 'bg-gradient-to-br from-slate-400 to-slate-500'
          }`}>
            {(customer.name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-black text-slate-800 truncate">{customer.name}</h2>
              {!customer.is_active && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-600 rounded">PASİF</span>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-0.5">
              {customer.phone && (
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{customer.email}</span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1 truncate max-w-xs"><MapPin className="w-3 h-3" />{customer.address}</span>
              )}
            </div>
          </div>
        </div>

        {/* bakiye + limit */}
        <div className="grid grid-cols-2 gap-2 md:gap-3 mt-3">
          <div className={`rounded-lg p-3 ${
            balance > 0 ? 'bg-rose-50 border border-rose-200'
            : balance < 0 ? 'bg-emerald-50 border border-emerald-200'
            : 'bg-slate-50 border border-slate-200'
          }`}>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Güncel Bakiye</div>
            <div className={`text-lg md:text-xl font-black mt-0.5 ${
              balance > 0 ? 'text-rose-700' : balance < 0 ? 'text-emerald-700' : 'text-slate-700'
            }`}>{TRY(balance)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {balance > 0 ? 'Müşteri size borçlu' : balance < 0 ? 'Müşteriye borcunuz var' : 'Bakiye sıfır'}
            </div>
          </div>
          <div className="rounded-lg p-3 bg-orange-50 border border-orange-200">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Kredi Limiti</div>
            <div className="text-lg md:text-xl font-black mt-0.5 text-orange-700">{TRY(limit)}</div>
            {limit > 0 && (
              <div className="mt-1.5">
                <div className="h-1 bg-orange-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${limitOver ? 'bg-rose-500' : 'bg-orange-500'}`}
                    style={{ width: `${limitUsage}%` }}
                  />
                </div>
                <div className={`text-[10px] mt-0.5 font-semibold ${limitOver ? 'text-rose-600' : 'text-slate-500'}`}>
                  Kullanım: {limitUsage.toFixed(0)}% {limitOver && '— LİMİT AŞILDI'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* aksiyonlar */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onAddDebt}
            disabled={!customer.is_active}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition active:scale-95"
          >
            <ArrowUpRight className="w-4 h-4" /> Borç Ekle
          </button>
          <button
            onClick={onAddPayment}
            disabled={!customer.is_active}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition active:scale-95"
          >
            <ArrowDownLeft className="w-4 h-4" /> Ödeme Al
          </button>
          <button onClick={onEdit} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95">
            <Edit2 className="w-4 h-4" /> Düzenle
          </button>
          <button onClick={sendWhatsApp} className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 text-green-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95" title="WhatsApp ile bakiye gönder">
            <Send className="w-4 h-4" />
          </button>
          <button onClick={() => setShowStatement(true)} className="flex items-center gap-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95" title="Hesap ekstresi (tarih aralıklı)">
            <FileText className="w-4 h-4" />
          </button>
          {customer.is_active ? (
            <button onClick={onSoftDelete} className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95" title="Pasifleştir">
              <Power className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={onReactivate} className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95" title="Aktifleştir">
              <Power className="w-4 h-4" />
            </button>
          )}
          <button onClick={onHardDelete} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm font-semibold transition active:scale-95" title="Kalıcı sil">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* sekmeler */}
      <div className="flex-shrink-0 px-3 md:px-4 pt-2 border-b border-slate-200 flex gap-1">
        {[
          { id: 'transactions', label: `Hareketler (${transactions.length})` },
          { id: 'info', label: 'Bilgiler' },
        ].map(t => {
          const active = tab === (t.id as any);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
                active ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {tab === 'transactions' ? (
          txLoading ? (
            <div className="text-center text-slate-400 text-sm py-8">
              <div className="inline-block animate-spin rounded-full w-6 h-6 border-2 border-orange-500 border-t-transparent mb-2" />
              <p>Yükleniyor...</p>
            </div>
          ) : txLoadError ? (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-3 rounded-lg">
              <AlertCircle className="inline w-4 h-4 mr-1" />
              {txLoadError}
            </div>
          ) : txWithRunning.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-8">
              <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="font-semibold">Henüz hareket yok</p>
              <p className="text-xs mt-1">Borç ekleyerek veya ödeme alarak başlayın.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 -my-2">
              {txWithRunning.map(t => (
                <li key={t.id} className="flex items-stretch gap-2 py-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailTx(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailTx(t);
                      }
                    }}
                    className="flex-1 min-w-0 flex items-start gap-3 py-2 px-1 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      t.type === 'debt' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {t.type === 'debt' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${t.type === 'debt' ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {t.type === 'debt' ? 'Borç' : 'Ödeme'} • {TRY(Number(t.amount) || 0)}
                        </span>
                        {t.order?.order_number && (
                          <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 text-[10px] font-bold rounded">
                            #{t.order.order_number}
                          </span>
                        )}
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" aria-hidden />
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{fmtDate(t.created_at)}</div>
                      {t.note && (
                        <div className="text-xs text-slate-600 mt-1 bg-slate-50 px-2 py-1 rounded">{t.note}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end py-2 pr-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Bakiye</div>
                    <div className={`text-sm font-bold ${
                      (t._running || 0) > 0 ? 'text-rose-600'
                      : (t._running || 0) < 0 ? 'text-emerald-600'
                      : 'text-slate-500'
                    }`}>{TRY(t._running || 0)}</div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteTx(t)}
                      className="mt-1 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                      title="Hareketi sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : (
          <CustomerInfoView customer={customer} />
        )}
      </div>

      {detailTx && (
        <CariTransactionDetailModal
          tx={detailTx}
          customerName={customer.name}
          onClose={() => setDetailTx(null)}
        />
      )}

      {showStatement && (
        <CariStatementModal
          customer={customer}
          onClose={() => setShowStatement(false)}
        />
      )}
    </>
  );
}

function CustomerInfoView({ customer }: { customer: Customer }) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-100 text-sm">
      <div className="text-slate-500 font-semibold">{label}</div>
      <div className="col-span-2 text-slate-800">{value || <span className="text-slate-400">—</span>}</div>
    </div>
  );
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <Row label="Ad Soyad" value={customer.name} />
      <Row label="Telefon" value={customer.phone} />
      <Row label="E-posta" value={customer.email} />
      <Row label="Adres" value={customer.address} />
      <Row label="Kredi Limiti" value={TRY(customer.credit_limit)} />
      <Row label="Güncel Bakiye" value={TRY(customer.current_balance)} />
      <Row label="Durum" value={customer.is_active ? 'Aktif' : 'Pasif'} />
      <Row label="Kayıt Tarihi" value={fmtDate(customer.created_at)} />
      <Row label="Notlar" value={customer.notes ? <span className="whitespace-pre-wrap">{customer.notes}</span> : null} />
    </div>
  );
}

// =====================================================================
// Yeni / düzenle modal
// =====================================================================
interface CustomerFormModalProps {
  tenantId: string;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (c: Customer | null) => void;
}

function CustomerFormModal({ tenantId, customer, onClose, onSaved }: CustomerFormModalProps) {
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    notes: customer?.notes || '',
    credit_limit: customer?.credit_limit ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Ad zorunlu'); return; }
    if (!tenantId) { setErr('Tenant bilgisi yok'); return; }
    setSaving(true);
    setErr(null);
    const payload = {
      tenant_id: tenantId,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      credit_limit: Number(form.credit_limit) || 0,
    };
    let res;
    if (customer) {
      res = await supabase.from('customers').update(payload).eq('id', customer.id).select('*').single();
    } else {
      res = await supabase.from('customers').insert({ ...payload, current_balance: 0, is_active: true }).select('*').single();
    }
    setSaving(false);
    if (res.error) { setErr(res.error.message); return; }
    onSaved(res.data as Customer);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-black text-slate-800">{customer ? 'Cari Düzenle' : 'Yeni Cari Hesap'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto p-4 space-y-3">
          <Field label="Ad Soyad / Firma *">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Telefon">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </Field>
            <Field label="E-posta">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </Field>
          </div>
          <Field label="Adres">
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </Field>
          <Field label="Kredi Limiti (₺)" hint="0 = limit yok">
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.credit_limit}
              onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </Field>
          <Field label="Notlar">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </Field>
          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
              <AlertCircle className="inline w-3.5 h-3.5 mr-1" />
              {err}
            </div>
          )}
        </form>
        <div className="flex-shrink-0 flex justify-end gap-2 p-4 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold transition">İptal</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white rounded-lg font-semibold transition">
            {saving ? 'Kaydediliyor...' : (customer ? 'Güncelle' : 'Kaydet')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">
        {label}
        {hint && <span className="ml-1 text-slate-400 font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

// =====================================================================
// Borç / Ödeme modal
// =====================================================================
interface TransactionModalProps {
  tenantId: string;
  createdBy: string | null;
  customer: Customer;
  kind: 'debt' | 'payment';
  onClose: () => void;
  onSaved: () => void;
}

function TransactionModal({ tenantId, createdBy, customer, kind, onClose, onSaved }: TransactionModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const numericAmount = Number(amount.replace(',', '.')) || 0;
  const limit = Number(customer.credit_limit) || 0;
  const projectedBalance =
    Number(customer.current_balance) + (kind === 'debt' ? numericAmount : -numericAmount);
  const willExceed = kind === 'debt' && limit > 0 && projectedBalance > limit;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) { setErr('Tutar 0\'dan büyük olmalı'); return; }
    setSaving(true);
    setErr(null);
    const txInsert = await supabase.from('customer_transactions').insert({
      tenant_id: tenantId,
      customer_id: customer.id,
      type: kind,
      amount: numericAmount,
      note: note.trim() || null,
      created_by: createdBy,
    });
    if (txInsert.error) {
      setErr(txInsert.error.message);
      setSaving(false);
      return;
    }
    const newBalance = projectedBalance;
    const balUpdate = await supabase
      .from('customers')
      .update({ current_balance: newBalance })
      .eq('id', customer.id);
    setSaving(false);
    if (balUpdate.error) {
      setErr('Hareket kaydedildi ama bakiye güncellenemedi: ' + balUpdate.error.message);
      return;
    }
    onSaved();
  };

  const isDebt = kind === 'debt';
  const accent = isDebt ? 'rose' : 'emerald';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className={`flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r ${
          isDebt ? 'from-rose-500 to-red-600' : 'from-emerald-500 to-green-600'
        } text-white rounded-t-2xl`}>
          <div className="flex items-center gap-2">
            {isDebt ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
            <h2 className="text-lg font-black">{isDebt ? 'Borç Ekle' : 'Ödeme Al'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="font-bold text-slate-800">{customer.name}</div>
            <div className="flex justify-between mt-1 text-xs text-slate-600">
              <span>Mevcut bakiye:</span>
              <span className={`font-bold ${
                customer.current_balance > 0 ? 'text-rose-600'
                : customer.current_balance < 0 ? 'text-emerald-600'
                : 'text-slate-500'
              }`}>{TRY(customer.current_balance)}</span>
            </div>
          </div>

          <Field label="Tutar (₺) *">
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
              className={`w-full px-3 py-3 text-lg font-bold border-2 rounded-lg outline-none ${
                isDebt ? 'border-rose-200 focus:border-rose-500' : 'border-emerald-200 focus:border-emerald-500'
              }`}
            />
          </Field>

          {numericAmount > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">İşlem sonrası bakiye:</span>
                <span className={`font-bold ${
                  projectedBalance > 0 ? 'text-rose-600'
                  : projectedBalance < 0 ? 'text-emerald-600'
                  : 'text-slate-700'
                }`}>{TRY(projectedBalance)}</span>
              </div>
            </div>
          )}

          {willExceed && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
              <AlertCircle className="inline w-3.5 h-3.5 mr-1" />
              Bu işlem kredi limitini aşıyor (Limit: {TRY(limit)}).
            </div>
          )}

          <Field label="Açıklama">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Opsiyonel: işlem detayı..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
            />
          </Field>

          {err && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg">
              <AlertCircle className="inline w-3.5 h-3.5 mr-1" />
              {err}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold transition">İptal</button>
            <button
              type="submit"
              disabled={saving || numericAmount <= 0}
              className={`flex-1 px-4 py-2.5 text-sm text-white rounded-lg font-semibold transition disabled:opacity-60 active:scale-95 bg-gradient-to-r ${
                isDebt ? 'from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700'
                : 'from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
              }`}
            >
              {saving ? 'Kaydediliyor...' : (isDebt ? 'Borç Ekle' : 'Ödeme Al')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
