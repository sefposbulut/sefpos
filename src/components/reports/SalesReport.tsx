import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, CreditCard,
  Banknote, FileText, RefreshCw, Calendar, ChevronDown, Ban, User, ChevronRight, ChevronUp as ChevronUpIcon
} from 'lucide-react';

interface CancelLog {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  cancel_reason: string | null;
  cancelled_by_name: string | null;
  order_number: string | null;
  created_at: string;
}

interface CancelStats {
  totalAmount: number;
  totalItems: number;
  byReason: { reason: string; count: number; amount: number }[];
  byStaff: { name: string; count: number; amount: number }[];
  byProduct: { name: string; count: number; amount: number }[];
  logs: CancelLog[];
}

interface SalesData {
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  openAccountRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  dineInRevenue: number;
  takeawayRevenue: number;
  onlineRevenue: number;
  dineInOrders: number;
  takeawayOrders: number;
  onlineOrders: number;
  dailyBreakdown: { date: string; revenue: number; orders: number }[];
  expenses: number;
  netCash: number;
  cashIn: number;
  cashOut: number;
  cancelStats: CancelStats;
}

interface SalesReportProps {
  selectedBranch: string;
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export function SalesReport({ selectedBranch }: SalesReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [cancelTab, setCancelTab] = useState<'reason' | 'staff' | 'product' | 'list'>('reason');
  const [showCancelSection, setShowCancelSection] = useState(true);

  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (period === 'today') {
      return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
    }
    if (period === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ys = y.toISOString().split('T')[0];
      return { start: ys + 'T00:00:00', end: ys + 'T23:59:59' };
    }
    if (period === 'week') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      return { start: w.toISOString().split('T')[0] + 'T00:00:00', end: today + 'T23:59:59' };
    }
    if (period === 'month') {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: m.toISOString().split('T')[0] + 'T00:00:00', end: today + 'T23:59:59' };
    }
    if (period === 'custom' && customStart && customEnd) {
      return { start: customStart + 'T00:00:00', end: customEnd + 'T23:59:59' };
    }
    return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
  };

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getDateRange();

    let ordersQ = supabase
      .from('orders')
      .select('id, status, total_amount, order_type, created_at, branch_id')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end);

    if (effectiveBranch !== 'all') {
      ordersQ = ordersQ.eq('branch_id', effectiveBranch);
    }

    let txQ = supabase
      .from('cash_register_transactions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end);

    if (effectiveBranch !== 'all') {
      txQ = txQ.eq('branch_id', effectiveBranch);
    }

    let cancelQ = supabase
      .from('order_cancel_logs')
      .select('id, product_name, quantity, unit_price, cancel_reason, cancelled_by_name, order_number, created_at')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (effectiveBranch !== 'all') {
      cancelQ = cancelQ.eq('branch_id', effectiveBranch);
    }

    const [{ data: orders }, { data: txs }, { data: cancelLogs }] = await Promise.all([ordersQ, txQ, cancelQ]);

    const ordersData = (orders ?? []) as any[];
    const txData = (txs ?? []).filter((t: any) => !t.voided_at);
    const completed = ordersData.filter(o => o.status === 'completed');
    const cancelled = ordersData.filter(o => o.status === 'cancelled');

    const cashRevenue = txData.filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'cash').reduce((s, t) => s + Math.abs(t.amount), 0);
    const cardRevenue = txData.filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'credit_card').reduce((s, t) => s + Math.abs(t.amount), 0);
    const openAccRevenue = txData.filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'open_account').reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalRevenue = cashRevenue + cardRevenue + openAccRevenue;
    const expenses = txData.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashIn = txData.filter(t => t.transaction_type === 'cash_in').reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashOut = txData.filter(t => t.transaction_type === 'cash_out').reduce((s, t) => s + Math.abs(t.amount), 0);

    const dineIn = completed.filter(o => o.order_type === 'dine_in');
    const takeaway = completed.filter(o => o.order_type === 'takeaway');
    const online = completed.filter(o => o.order_type === 'delivery');

    const dailyMap: Record<string, { revenue: number; orders: number }> = {};
    completed.forEach(o => {
      const d = o.created_at.split('T')[0];
      if (!dailyMap[d]) dailyMap[d] = { revenue: 0, orders: 0 };
      dailyMap[d].revenue += o.total_amount || 0;
      dailyMap[d].orders += 1;
    });
    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const cancelData = (cancelLogs || []) as CancelLog[];
    const byReasonMap: Record<string, { count: number; amount: number }> = {};
    const byStaffMap: Record<string, { count: number; amount: number }> = {};
    const byProductMap: Record<string, { count: number; amount: number }> = {};
    let cancelTotalAmount = 0;
    let cancelTotalItems = 0;

    cancelData.forEach(log => {
      const amount = log.unit_price * log.quantity;
      cancelTotalAmount += amount;
      cancelTotalItems += log.quantity;

      const reason = log.cancel_reason || 'Belirtilmedi';
      if (!byReasonMap[reason]) byReasonMap[reason] = { count: 0, amount: 0 };
      byReasonMap[reason].count += log.quantity;
      byReasonMap[reason].amount += amount;

      const staff = log.cancelled_by_name || 'Bilinmiyor';
      if (!byStaffMap[staff]) byStaffMap[staff] = { count: 0, amount: 0 };
      byStaffMap[staff].count += log.quantity;
      byStaffMap[staff].amount += amount;

      if (!byProductMap[log.product_name]) byProductMap[log.product_name] = { count: 0, amount: 0 };
      byProductMap[log.product_name].count += log.quantity;
      byProductMap[log.product_name].amount += amount;
    });

    const cancelStats: CancelStats = {
      totalAmount: cancelTotalAmount,
      totalItems: cancelTotalItems,
      byReason: Object.entries(byReasonMap).map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.count - a.count),
      byStaff: Object.entries(byStaffMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
      byProduct: Object.entries(byProductMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count),
      logs: cancelData,
    };

    setData({
      totalRevenue,
      cashRevenue,
      cardRevenue,
      openAccountRevenue: openAccRevenue,
      totalOrders: ordersData.length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      dineInRevenue: dineIn.reduce((s, o) => s + (o.total_amount || 0), 0),
      takeawayRevenue: takeaway.reduce((s, o) => s + (o.total_amount || 0), 0),
      onlineRevenue: online.reduce((s, o) => s + (o.total_amount || 0), 0),
      dineInOrders: dineIn.length,
      takeawayOrders: takeaway.length,
      onlineOrders: online.length,
      dailyBreakdown,
      expenses,
      cashIn,
      cashOut,
      netCash: cashRevenue + cashIn - cashOut - expenses,
      cancelStats,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
  }, [tenant, effectiveBranch, period]);

  const periodLabels: Record<Period, string> = {
    today: 'Bugün',
    yesterday: 'Dün',
    week: 'Son 7 Gün',
    month: 'Bu Ay',
    custom: 'Özel Aralık',
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {(['today', 'yesterday', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-2 text-xs font-semibold transition-all ${period === p ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <span className="text-slate-400">—</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <button onClick={load} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition">Uygula</button>
          </div>
        )}
        <button onClick={load} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition ml-auto">
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {!data ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
          <TrendingUp className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500">Bu dönem için veri bulunamadı</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Toplam Ciro', value: `${fmt(data.totalRevenue)} ₺`, icon: DollarSign, color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Tamamlanan', value: `${data.completedOrders} sipariş`, icon: ShoppingCart, color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Ort. Sipariş', value: `${fmt(data.avgOrderValue)} ₺`, icon: TrendingUp, color: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
              { label: 'İptal', value: `${data.cancelledOrders} sipariş`, icon: TrendingDown, color: 'bg-red-400', text: 'text-red-700', bg: 'bg-red-50' },
            ].map(({ label, value, icon: Icon, color, text, bg }) => (
              <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className={`text-xl md:text-2xl font-black ${text}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-500" /> Ödeme Yöntemleri
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Nakit', value: data.cashRevenue, color: 'bg-emerald-500', text: 'text-emerald-700' },
                  { label: 'Kredi Kartı', value: data.cardRevenue, color: 'bg-blue-500', text: 'text-blue-700' },
                  { label: 'Cari Hesap', value: data.openAccountRevenue, color: 'bg-amber-500', text: 'text-amber-700' },
                ].map(({ label, value, color, text }) => {
                  const pct = data.totalRevenue > 0 ? (value / data.totalRevenue) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 font-medium">{label}</span>
                        <span className={`font-bold ${text}`}>{fmt(value)} ₺ <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-orange-500" /> Sipariş Tipi Dağılımı
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'Masa Servisi', orders: data.dineInOrders, revenue: data.dineInRevenue, color: 'bg-slate-500', text: 'text-slate-700' },
                  { label: 'Paket Servis', orders: data.takeawayOrders, revenue: data.takeawayRevenue, color: 'bg-orange-500', text: 'text-orange-700' },
                  { label: 'Online Sipariş', orders: data.onlineOrders, revenue: data.onlineRevenue, color: 'bg-blue-500', text: 'text-blue-700' },
                ].map(({ label, orders, revenue, color, text }) => {
                  const pct = data.totalRevenue > 0 ? (revenue / data.totalRevenue) * 100 : 0;
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600 font-medium">{label} <span className="text-slate-400">({orders} sipariş)</span></span>
                        <span className={`font-bold ${text}`}>{fmt(revenue)} ₺</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-500" /> Kasa Özeti
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Nakit Satış', value: data.cashRevenue, positive: true },
                { label: 'Nakit Giriş', value: data.cashIn, positive: true },
                { label: 'Nakit Çıkış', value: data.cashOut, positive: false },
                { label: 'Giderler', value: data.expenses, positive: false },
              ].map(({ label, value, positive }) => (
                <div key={label} className={`rounded-xl p-3 ${positive ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                  <p className={`text-lg font-black ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {positive ? '+' : '-'}{fmt(value)} ₺
                  </p>
                </div>
              ))}
            </div>
            <div className={`mt-4 rounded-xl p-4 text-center ${data.netCash >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Net Kasa</p>
              <p className={`text-3xl font-black ${data.netCash >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(data.netCash)} ₺</p>
            </div>
          </div>

          {data.dailyBreakdown.length > 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" /> Günlük Dağılım
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-slate-500 font-semibold">Tarih</th>
                      <th className="text-right py-2 text-slate-500 font-semibold">Sipariş</th>
                      <th className="text-right py-2 text-slate-500 font-semibold">Ciro</th>
                      <th className="text-right py-2 text-slate-500 font-semibold">Ort.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dailyBreakdown.map(d => (
                      <tr key={d.date} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-2.5 text-slate-700 font-medium">{new Date(d.date).toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                        <td className="py-2.5 text-right text-slate-600">{d.orders}</td>
                        <td className="py-2.5 text-right font-bold text-emerald-700">{fmt(d.revenue)} ₺</td>
                        <td className="py-2.5 text-right text-slate-500">{fmt(d.orders > 0 ? d.revenue / d.orders : 0)} ₺</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td className="py-2.5 text-slate-700">Toplam</td>
                      <td className="py-2.5 text-right text-slate-700">{data.dailyBreakdown.reduce((s, d) => s + d.orders, 0)}</td>
                      <td className="py-2.5 text-right text-emerald-700">{fmt(data.dailyBreakdown.reduce((s, d) => s + d.revenue, 0))} ₺</td>
                      <td className="py-2.5 text-right text-slate-500">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <button
              onClick={() => setShowCancelSection(s => !s)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-red-50/50 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                  <Ban className="w-4 h-4 text-red-600" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-800">İptal Kayıtları</h3>
                  <p className="text-xs text-slate-400">
                    {data.cancelStats.totalItems} kalem · {fmt(data.cancelStats.totalAmount)} ₺ iptal edildi
                  </p>
                </div>
                {data.cancelStats.totalItems > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-black px-2.5 py-1 rounded-full ml-2">
                    {data.cancelStats.totalItems} ürün
                  </span>
                )}
              </div>
              {showCancelSection ? <ChevronUpIcon className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>

            {showCancelSection && (
              <div className="border-t border-red-100">
                {data.cancelStats.totalItems === 0 ? (
                  <div className="p-8 text-center">
                    <Ban className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">Bu dönemde iptal kaydı yok</p>
                  </div>
                ) : (
                  <>
                    <div className="px-5 pt-4 pb-3 grid grid-cols-3 gap-3">
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-xs font-bold text-red-500 uppercase mb-1">İptal Tutarı</p>
                        <p className="text-xl font-black text-red-700">{fmt(data.cancelStats.totalAmount)} ₺</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl p-3 text-center">
                        <p className="text-xs font-bold text-orange-500 uppercase mb-1">İptal Edilen Kalem</p>
                        <p className="text-xl font-black text-orange-700">{data.cancelStats.totalItems}</p>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 text-center">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Farklı Ürün</p>
                        <p className="text-xl font-black text-slate-700">{data.cancelStats.byProduct.length}</p>
                      </div>
                    </div>

                    <div className="px-5 pb-2 flex gap-1">
                      {([
                        { key: 'reason', label: 'Neden' },
                        { key: 'staff', label: 'Personel' },
                        { key: 'product', label: 'Ürün' },
                        { key: 'list', label: 'Tüm Kayıtlar' },
                      ] as { key: typeof cancelTab; label: string }[]).map(t => (
                        <button
                          key={t.key}
                          onClick={() => setCancelTab(t.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            cancelTab === t.key
                              ? 'bg-red-500 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="px-5 pb-5">
                      {cancelTab === 'reason' && (
                        <div className="space-y-2 mt-3">
                          {data.cancelStats.byReason.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-4">Neden belirtilmemiş</p>
                          ) : data.cancelStats.byReason.map(r => (
                            <div key={r.reason} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">{r.reason}</p>
                                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-red-400 rounded-full"
                                    style={{ width: `${data.cancelStats.totalItems > 0 ? (r.count / data.cancelStats.totalItems) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-red-600">{fmt(r.amount)} ₺</p>
                                <p className="text-xs text-slate-400">{r.count} kalem</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {cancelTab === 'staff' && (
                        <div className="space-y-2 mt-3">
                          {data.cancelStats.byStaff.map(s => (
                            <div key={s.name} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                                <span className="text-xs font-black text-orange-700">{s.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700">{s.name}</p>
                                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-orange-400 rounded-full"
                                    style={{ width: `${data.cancelStats.totalItems > 0 ? (s.count / data.cancelStats.totalItems) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-red-600">{fmt(s.amount)} ₺</p>
                                <p className="text-xs text-slate-400">{s.count} kalem</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {cancelTab === 'product' && (
                        <div className="space-y-2 mt-3">
                          {data.cancelStats.byProduct.map(p => (
                            <div key={p.name} className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">{p.name}</p>
                                <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-slate-400 rounded-full"
                                    style={{ width: `${data.cancelStats.byProduct[0]?.count > 0 ? (p.count / data.cancelStats.byProduct[0].count) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-red-600">{fmt(p.amount)} ₺</p>
                                <p className="text-xs text-slate-400">{p.count} adet</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {cancelTab === 'list' && (
                        <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                          {data.cancelStats.logs.map(log => (
                            <div key={log.id} className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-slate-800">{log.product_name}</span>
                                  <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">x{log.quantity}</span>
                                  {log.order_number && (
                                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">#{log.order_number}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  {log.cancel_reason && (
                                    <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg">{log.cancel_reason}</span>
                                  )}
                                  {log.cancelled_by_name && (
                                    <span className="text-xs text-slate-500">{log.cancelled_by_name}</span>
                                  )}
                                  <span className="text-xs text-slate-400">
                                    {new Date(log.created_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-black text-red-600">{fmt(log.unit_price * log.quantity)} ₺</p>
                                <p className="text-xs text-slate-400">{fmt(log.unit_price)} ₺/ad</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
