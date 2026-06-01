import { useState, useEffect } from 'react';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Banknote,
  CreditCard,
  Utensils,
  Bike,
  Globe,
  Printer,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  buildReportInsights,
  fmtMoney,
  formatPctDelta,
  getPreviousReportDateRange,
  getReportDateRange,
  pctChange,
  printReportSection,
  type ReportPeriod,
} from '../../lib/reportUtils';
import { ReportPeriodBar } from './shared/ReportPeriodBar';
import { ReportInsights } from './shared/ReportInsights';

interface SummaryMetrics {
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  onlineRevenue: number;
  expenses: number;
  netCash: number;
}

interface ExecutiveSummaryReportProps {
  selectedBranch: string;
}

async function loadMetrics(
  tenantId: string,
  branchId: string,
  start: string,
  end: string,
): Promise<SummaryMetrics> {
  let ordersQ = supabase
    .from('orders')
    .select('id, status, total_amount, order_type')
    .eq('tenant_id', tenantId)
    .gte('created_at', start)
    .lte('created_at', end);
  if (branchId !== 'all') ordersQ = ordersQ.eq('branch_id', branchId);

  let txQ = supabase
    .from('cash_register_transactions')
    .select('amount, transaction_type, payment_method, voided_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', start)
    .lte('created_at', end);
  if (branchId !== 'all') txQ = txQ.eq('branch_id', branchId);

  const [{ data: orders }, { data: txs }] = await Promise.all([ordersQ, txQ]);
  const ordersData = (orders ?? []) as { status: string; total_amount: number; order_type: string }[];
  const txData = (txs ?? []).filter((t: { voided_at?: string | null }) => !t.voided_at) as {
    amount: number;
    transaction_type: string;
    payment_method: string;
  }[];

  const completed = ordersData.filter((o) => o.status === 'completed');
  const cancelled = ordersData.filter((o) => o.status === 'cancelled');

  const cashRevenue = txData
    .filter((t) => t.transaction_type === 'order_payment' && t.payment_method === 'cash')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const cardRevenue = txData
    .filter((t) => t.transaction_type === 'order_payment' && t.payment_method === 'credit_card')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalRevenue = cashRevenue + cardRevenue;
  const expenses = txData
    .filter((t) => t.transaction_type === 'expense')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const cashIn = txData
    .filter((t) => t.transaction_type === 'cash_in')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const cashOut = txData
    .filter((t) => t.transaction_type === 'cash_out')
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const dineIn = completed.filter((o) => o.order_type === 'dine_in');
  const takeaway = completed.filter((o) => o.order_type === 'takeaway');
  const online = completed.filter((o) => o.order_type === 'delivery');

  return {
    totalRevenue,
    cashRevenue,
    cardRevenue,
    completedOrders: completed.length,
    cancelledOrders: cancelled.length,
    avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
    dineInRevenue: dineIn.reduce((s, o) => s + (o.total_amount || 0), 0),
    takeawayRevenue: takeaway.reduce((s, o) => s + (o.total_amount || 0), 0),
    onlineRevenue: online.reduce((s, o) => s + (o.total_amount || 0), 0),
    expenses,
    netCash: cashRevenue + cashIn - cashOut - expenses,
  };
}

export function ExecutiveSummaryReport({ selectedBranch }: ExecutiveSummaryReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<SummaryMetrics | null>(null);
  const [previous, setPrevious] = useState<SummaryMetrics | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [peakHour, setPeakHour] = useState<number | undefined>();
  const [topProduct, setTopProduct] = useState<string | undefined>();

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const range = getReportDateRange(period, customStart, customEnd);
    const prevRange = getPreviousReportDateRange(range);

    const [cur, prev] = await Promise.all([
      loadMetrics(tenant.id, effectiveBranch, range.start, range.end),
      loadMetrics(tenant.id, effectiveBranch, prevRange.start, prevRange.end),
    ]);

    let itemsQ = supabase
      .from('orders')
      .select('id, created_at, order_items(quantity, products(name))')
      .eq('tenant_id', tenant.id)
      .eq('status', 'completed')
      .gte('created_at', range.start)
      .lte('created_at', range.end);
    if (effectiveBranch !== 'all') itemsQ = itemsQ.eq('branch_id', effectiveBranch);
    const { data: orderRows } = await itemsQ;

    const hourMap: Record<number, number> = {};
    const productMap: Record<string, number> = {};
    (orderRows ?? []).forEach((o: { created_at: string; order_items?: { quantity: number; products?: { name: string } | null }[] }) => {
      const h = new Date(o.created_at).getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
      (o.order_items ?? []).forEach((it) => {
        const name = (it.products as { name?: string } | null)?.name || 'Ürün';
        productMap[name] = (productMap[name] || 0) + (it.quantity || 0);
      });
    });
    const peak = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
    const top = Object.entries(productMap).sort((a, b) => b[1] - a[1])[0];

    const totalOrders = cur.completedOrders + cur.cancelledOrders;
    const prevTotal = prev.completedOrders + prev.cancelledOrders;
    const cancelRate = totalOrders > 0 ? (cur.cancelledOrders / totalOrders) * 100 : 0;
    const prevCancelRate = prevTotal > 0 ? (prev.cancelledOrders / prevTotal) * 100 : 0;
    const revSum = cur.dineInRevenue + cur.takeawayRevenue + cur.onlineRevenue || 1;

    setCurrent(cur);
    setPrevious(prev);
    setPeakHour(peak ? Number(peak[0]) : undefined);
    setTopProduct(top?.[0]);
    setInsights(
      buildReportInsights({
        totalRevenue: cur.totalRevenue,
        prevRevenue: prev.totalRevenue,
        completedOrders: cur.completedOrders,
        prevOrders: prev.completedOrders,
        cancelRate,
        prevCancelRate,
        takeawayShare: (cur.takeawayRevenue / revSum) * 100,
        onlineShare: (cur.onlineRevenue / revSum) * 100,
        topProduct: top?.[0],
        peakHour: peak ? Number(peak[0]) : undefined,
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, effectiveBranch, period]);

  const revDelta = current && previous ? pctChange(current.totalRevenue, previous.totalRevenue) : null;
  const ordDelta =
    current && previous ? pctChange(current.completedOrders, previous.completedOrders) : null;

  if (loading || !current) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const channelTotal =
    current.dineInRevenue + current.takeawayRevenue + current.onlineRevenue || 1;

  return (
    <div className="p-4 md:p-6 space-y-6" id="report-executive-summary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReportPeriodBar
          period={period}
          onPeriodChange={setPeriod}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
          onRefresh={load}
          onApply={load}
        />
        <button
          type="button"
          onClick={() => printReportSection('İşletme Özeti', 'report-executive-summary')}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
        >
          <Printer className="w-4 h-4" />
          Yazdır / PDF
        </button>
      </div>

      <ReportInsights lines={insights} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Toplam Ciro',
            value: `${fmtMoney(current.totalRevenue)} ₺`,
            delta: revDelta,
            icon: DollarSign,
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Tamamlanan',
            value: `${current.completedOrders} sipariş`,
            delta: ordDelta,
            icon: ShoppingCart,
            color: 'text-blue-700',
            bg: 'bg-blue-50',
          },
          {
            label: 'Ort. Sepet',
            value: `${fmtMoney(current.avgOrderValue)} ₺`,
            delta: null,
            icon: TrendingUp,
            color: 'text-orange-700',
            bg: 'bg-orange-50',
          },
          {
            label: 'Net Nakit',
            value: `${fmtMoney(current.netCash)} ₺`,
            delta: null,
            icon: Banknote,
            color: 'text-violet-700',
            bg: 'bg-violet-50',
          },
        ].map(({ label, value, delta, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-2xl border border-slate-100 p-4 ${bg}`}>
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">{label}</p>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className={`text-xl font-black ${color}`}>{value}</p>
            {delta !== null && (
              <p
                className={`text-xs font-semibold mt-1 flex items-center gap-1 ${
                  (delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {(delta ?? 0) >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                Önceki dönem: {formatPctDelta(delta)}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Ödeme dağılımı</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <Banknote className="w-4 h-4" /> Nakit
              </span>
              <span className="font-bold">{fmtMoney(current.cashRevenue)} ₺</span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <CreditCard className="w-4 h-4" /> Kart
              </span>
              <span className="font-bold">{fmtMoney(current.cardRevenue)} ₺</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Gider</span>
              <span className="font-bold">−{fmtMoney(current.expenses)} ₺</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Kanal payı (ciro)</h3>
          {[
            { label: 'Masa', icon: Utensils, rev: current.dineInRevenue, color: 'bg-amber-500' },
            { label: 'Paket', icon: Bike, rev: current.takeawayRevenue, color: 'bg-blue-500' },
            { label: 'Online', icon: Globe, rev: current.onlineRevenue, color: 'bg-violet-500' },
          ].map(({ label, icon: Icon, rev, color }) => {
            const pct = (rev / channelTotal) * 100;
            return (
              <div key={label} className="mb-3 last:mb-0">
                <div className="flex justify-between text-sm mb-1">
                  <span className="flex items-center gap-1 text-slate-600">
                    <Icon className="w-4 h-4" /> {label}
                  </span>
                  <span className="font-semibold">
                    {fmtMoney(rev)} ₺ ({pct.toFixed(0)}%)
                  </span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(peakHour !== undefined || topProduct) && (
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          {peakHour !== undefined && (
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-slate-500">En yoğun saat</p>
              <p className="text-lg font-bold text-slate-900">
                {String(peakHour).padStart(2, '0')}:00 –{' '}
                {String((peakHour + 1) % 24).padStart(2, '0')}:00
              </p>
            </div>
          )}
          {topProduct && (
            <div className="bg-white border border-slate-100 rounded-xl p-4">
              <p className="text-slate-500">En çok satan ürün</p>
              <p className="text-lg font-bold text-slate-900">{topProduct}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
