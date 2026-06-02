import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  Gift,
  Loader2,
  Phone,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Users,
  AlertCircle,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  CUSTOMERS_CHANGED_EVENT,
  fetchCustomersList,
  type CustomerListRow,
} from '../../lib/customersApi';
import { useAuth } from '../../contexts/AuthContext';
import { LoyaltySettingsPanel } from './LoyaltySettingsPanel';

type TxRow = {
  id: string;
  customer_id: string;
  type: string;
  points_delta: number;
  tl_amount: number | null;
  created_at: string;
  customer?: { name: string } | null;
};

type FilterTab = 'all' | 'with_points' | 'zero';

type Props = {
  onBack?: () => void;
  isActive?: boolean;
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const TX_LABEL: Record<string, string> = {
  earn: 'Kazanım',
  redeem: 'Kullanım',
  adjust: 'Düzeltme',
  welcome: 'Hoş geldin',
};

type StatTone = 'slate' | 'orange' | 'emerald' | 'amber';

const STAT_TONE_CLASS: Record<StatTone, string> = {
  slate: 'border-slate-300 bg-white/95',
  orange: 'border-orange-300 bg-white/95',
  emerald: 'border-emerald-300 bg-white/95',
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
    <div className={`rounded-xl border-l-4 p-3 shadow-sm backdrop-blur-sm ${STAT_TONE_CLASS[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-bold text-slate-600 uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base md:text-lg font-black text-slate-900 mt-1 truncate">{value}</div>
    </div>
  );
}

function TxList({
  rows,
  emptyText,
  customerNameById,
}: {
  rows: TxRow[];
  emptyText: string;
  customerNameById: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        <Gift className="w-10 h-10 mx-auto mb-2 text-slate-300" />
        <p className="font-semibold">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((t) => {
        const positive = t.points_delta >= 0;
        const customerName =
          customerNameById[t.customer_id] ||
          (t.customer as { name?: string } | null)?.name ||
          'Müşteri';
        return (
          <li key={t.id} className="px-4 py-3 hover:bg-orange-50/40 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      positive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-orange-50 text-orange-700 border border-orange-100'
                    }`}
                  >
                    {positive ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownLeft className="w-3 h-3" />
                    )}
                    {TX_LABEL[t.type] || t.type}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 truncate">{customerName}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{fmtDate(t.created_at)}</p>
                {t.tl_amount != null && Number(t.tl_amount) > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sipariş tutarı: {Number(t.tl_amount).toLocaleString('tr-TR')} ₺
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-base font-black tabular-nums ${
                    positive ? 'text-emerald-600' : 'text-orange-600'
                  }`}
                >
                  {positive ? '+' : ''}
                  {t.points_delta}
                </span>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">puan</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function LoyaltyPage({ onBack, isActive = true }: Props) {
  const { tenant } = useAuth();
  const [customers, setCustomers] = useState<CustomerListRow[]>([]);
  const [recentTxs, setRecentTxs] = useState<TxRow[]>([]);
  const [customerTxs, setCustomerTxs] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError(null);

    const [{ data: custRes, error: custErr }, { data: txData, error: txErr }] = await Promise.all([
      fetchCustomersList(tenant.id),
      supabase
        .from('loyalty_transactions')
        .select('id, customer_id, type, points_delta, tl_amount, created_at, customer:customers(name)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    if (custErr) {
      console.error('[Sadakat] müşteri listesi:', custErr);
      setError(custErr.message || 'Müşteriler yüklenemedi.');
      setCustomers([]);
    } else {
      setCustomers(custRes);
    }

    if (txErr) {
      console.warn('[Sadakat] hareketler:', txErr.message);
      setRecentTxs([]);
    } else {
      setRecentTxs((txData || []) as TxRow[]);
    }

    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    if (!isActive) return;
    void load();
  }, [load, isActive]);

  useEffect(() => {
    if (!tenant?.id || !isActive) return;
    const onCustomersChanged = (ev: Event) => {
      const tid = (ev as CustomEvent<{ tenantId?: string }>).detail?.tenantId;
      if (tid && tid !== tenant.id) return;
      void load();
    };
    window.addEventListener(CUSTOMERS_CHANGED_EVENT, onCustomersChanged);
    return () => window.removeEventListener(CUSTOMERS_CHANGED_EVENT, onCustomersChanged);
  }, [tenant?.id, isActive, load]);

  const customerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers) {
      if (c.id && c.name) map[c.id] = c.name;
    }
    return map;
  }, [customers]);

  const loadCustomerTxs = useCallback(
    async (customerId: string) => {
      if (!tenant?.id) return;
      setTxLoading(true);
      const { data } = await supabase
        .from('loyalty_transactions')
        .select('id, customer_id, type, points_delta, tl_amount, created_at, customer:customers(name)')
        .eq('tenant_id', tenant.id)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      setCustomerTxs((data || []) as TxRow[]);
      setTxLoading(false);
    },
    [tenant?.id],
  );

  useEffect(() => {
    if (!tenant?.id || !isActive) return;
    const ch = supabase
      .channel(`loyalty-page-${tenant.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `tenant_id=eq.${tenant.id}` },
        () => {
          void load();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'loyalty_transactions', filter: `tenant_id=eq.${tenant.id}` },
        () => {
          void load();
          if (selectedId) void loadCustomerTxs(selectedId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tenant?.id, isActive, load, selectedId, loadCustomerTxs]);

  useEffect(() => {
    if (!selectedId) {
      setCustomerTxs([]);
      return;
    }
    void loadCustomerTxs(selectedId);
  }, [selectedId, loadCustomerTxs]);

  const stats = useMemo(() => {
    const active = customers.filter((c) => c.is_active !== false);
    const totalPoints = active.reduce((s, c) => s + (c.loyalty_points ?? 0), 0);
    const withPoints = active.filter((c) => (c.loyalty_points ?? 0) > 0).length;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let earned = 0;
    let redeemed = 0;
    for (const t of recentTxs) {
      const ts = new Date(t.created_at).getTime();
      if (ts < thirtyDaysAgo) continue;
      if (t.points_delta > 0) earned += t.points_delta;
      else redeemed += Math.abs(t.points_delta);
    }
    return { totalPoints, withPoints, memberCount: active.length, earned, redeemed };
  }, [customers, recentTxs]);

  const sortedCustomers = useMemo(
    () =>
      [...customers].sort((a, b) => (b.loyalty_points ?? 0) - (a.loyalty_points ?? 0)),
    [customers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedCustomers.filter((c) => {
      const pts = c.loyalty_points ?? 0;
      if (filterTab === 'with_points' && pts <= 0) return false;
      if (filterTab === 'zero' && pts > 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    });
  }, [sortedCustomers, filterTab, search]);

  const selected = useMemo(
    () => customers.find((c) => c.id === selectedId) || null,
    [customers, selectedId],
  );

  if (!tenant) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition shrink-0"
                aria-label="Geri"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0 border-l-4 border-orange-500 pl-3">
              <h1 className="text-lg md:text-xl font-black text-slate-900 leading-tight">Sadakat Programı</h1>
              <p className="text-slate-500 text-xs md:text-sm mt-0.5">
                Puan kazanma ve kullanma — cari borçtan bağımsız
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2.5 rounded-xl border transition ${
                showSettings
                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                  : 'border-slate-200 text-slate-600 hover:border-orange-200 hover:text-orange-600'
              }`}
              title="Program ayarları"
            >
              <Settings2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:border-orange-200 hover:text-orange-600 transition disabled:opacity-50"
              title="Yenile"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="px-4 md:px-6 pb-3 md:pb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <StatCard
            icon={<Sparkles className="w-4 h-4 text-orange-600" />}
            label="Toplam puan"
            value={stats.totalPoints.toLocaleString('tr-TR')}
            tone="orange"
          />
          <StatCard
            icon={<Users className="w-4 h-4 text-slate-600" />}
            label={`Puanlı müşteri (${stats.withPoints})`}
            value={String(stats.withPoints)}
            tone="slate"
          />
          <StatCard
            icon={<ArrowUpRight className="w-4 h-4 text-emerald-600" />}
            label="30 gün kazanım"
            value={`+${stats.earned.toLocaleString('tr-TR')}`}
            tone="emerald"
          />
          <StatCard
            icon={<ArrowDownLeft className="w-4 h-4 text-amber-600" />}
            label="30 gün kullanım"
            value={`-${stats.redeemed.toLocaleString('tr-TR')}`}
            tone="amber"
          />
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="shrink-0 border-b border-orange-100 bg-white/90 backdrop-blur-sm px-3 md:px-4 py-3 md:py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-800">Program kuralları</p>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <LoyaltySettingsPanel tenantId={tenant.id} embedded />
          </div>
        </div>
      )}

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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="İsim veya telefon ara…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 bg-white"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  ['all', 'Tümü'],
                  ['with_points', 'Puanlı'],
                  ['zero', 'Puan yok'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterTab(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    filterTab === id
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-200'
                  }`}
                >
                  {label}
                </button>
              ))}
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
                  onClick={() => void load()}
                  className="w-full py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700"
                >
                  Tekrar dene
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold">Müşteri bulunamadı</p>
                <p className="text-xs mt-1">Ödeme ekranından müşteri seçerek puan kazandırın.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const pts = c.loyalty_points ?? 0;
                  const isSelected = selectedId === c.id;
                  const rank = sortedCustomers.findIndex((x) => x.id === c.id) + 1;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full text-left px-3 py-3 hover:bg-orange-50/60 transition flex items-center gap-3 touch-manipulation ${
                          isSelected ? 'bg-orange-50 ring-1 ring-inset ring-orange-200' : ''
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                            pts >= 100
                              ? 'bg-gradient-to-br from-amber-400 to-orange-600'
                              : pts > 0
                                ? 'bg-gradient-to-br from-orange-500 to-red-600'
                                : 'bg-gradient-to-br from-slate-400 to-slate-500'
                          }`}
                        >
                          {(c.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-800 truncate flex items-center gap-1.5">
                            {rank <= 3 && pts > 0 && (
                              <span className="text-[10px] font-black text-amber-600">#{rank}</span>
                            )}
                            {c.name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{c.phone || c.email || '—'}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-black text-orange-600 tabular-nums">{pts}</div>
                          <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                            puan
                          </div>
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

        <div
          className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col min-h-0 overflow-hidden ${
            selected ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {selected ? (
            <>
              <div className="p-4 md:p-5 border-b border-slate-100 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-white/80 text-slate-600"
                    aria-label="Listeye dön"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg md:text-xl font-black text-slate-900 truncate">{selected.name}</h2>
                    {selected.phone && (
                      <p className="text-sm text-slate-600 flex items-center gap-1.5 mt-1">
                        <Phone className="w-4 h-4 text-orange-500" />
                        {selected.phone}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Cari borç / alacak ayrı takip edilir — sadakat puanı bağımsızdır.
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Puan bakiyesi</p>
                    <p className="text-2xl md:text-3xl font-black text-orange-600 tabular-nums">
                      {selected.loyalty_points ?? 0}
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <h3 className="text-sm font-bold text-slate-800">Puan hareketleri</h3>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                {txLoading ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-orange-500" />
                    Hareketler yükleniyor…
                  </div>
                ) : (
                  <TxList
                    rows={customerTxs}
                    emptyText="Bu müşteride henüz puan hareketi yok."
                    customerNameById={customerNameById}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/60">
                <h2 className="text-sm font-bold text-slate-800">Son puan hareketleri</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Detay için soldan bir müşteri seçin veya ödeme ekranından puan işlemi yapın.
                </p>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <TxList
                  rows={recentTxs}
                  emptyText="Henüz sadakat işlemi yok."
                  customerNameById={customerNameById}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
