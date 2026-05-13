import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Building2, RefreshCw, ShoppingCart, DollarSign } from 'lucide-react';

interface BranchStat {
  branchId: string;
  branchName: string;
  isMain: boolean;
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  dineInOrders: number;
  takeawayOrders: number;
  onlineOrders: number;
}

type Period = 'today' | 'week' | 'month' | 'custom';

export function BranchReport() {
  const { tenant, branches } = useAuth();
  const [data, setData] = useState<BranchStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (period === 'today') return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
    if (period === 'week') {
      const w = new Date(now); w.setDate(w.getDate() - 6);
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

    const [{ data: orders }, { data: txs }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, status, total_amount, order_type, branch_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', start)
        .lte('created_at', end),
      supabase
        .from('cash_register_transactions')
        .select('*')
        .eq('tenant_id', tenant.id)
        .eq('transaction_type', 'order_payment')
        .gte('created_at', start)
        .lte('created_at', end),
    ]);

    const branchMap: Record<string, BranchStat> = {};

    branches.forEach(b => {
      branchMap[b.id] = {
        branchId: b.id,
        branchName: b.name,
        isMain: b.is_main,
        totalRevenue: 0,
        cashRevenue: 0,
        cardRevenue: 0,
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        avgOrderValue: 0,
        dineInOrders: 0,
        takeawayOrders: 0,
        onlineOrders: 0,
      };
    });

    (orders || []).forEach((order: any) => {
      const bid = order.branch_id;
      if (!bid || !branchMap[bid]) return;
      const b = branchMap[bid];
      b.totalOrders += 1;
      if (order.status === 'completed') {
        b.completedOrders += 1;
        if (order.order_type === 'dine_in') b.dineInOrders += 1;
        if (order.order_type === 'takeaway') b.takeawayOrders += 1;
        if (order.order_type === 'delivery') b.onlineOrders += 1;
      }
      if (order.status === 'cancelled') b.cancelledOrders += 1;
    });

    (txs || []).forEach((tx: any) => {
      if (tx.voided_at) return;
      const bid = tx.branch_id;
      if (!bid || !branchMap[bid]) return;
      const b = branchMap[bid];
      const amt = Math.abs(tx.amount);
      b.totalRevenue += amt;
      if (tx.payment_method === 'cash') b.cashRevenue += amt;
      if (tx.payment_method === 'credit_card') b.cardRevenue += amt;
    });

    const result = Object.values(branchMap).map(b => ({
      ...b,
      avgOrderValue: b.completedOrders > 0 ? b.totalRevenue / b.completedOrders : 0,
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
  }, [tenant, branches, period]);

  const periodLabels: Record<Period, string> = { today: 'Bugün', week: 'Son 7 Gün', month: 'Bu Ay', custom: 'Özel' };
  const grandTotal = data.reduce((s, b) => s + b.totalRevenue, 0);
  const grandOrders = data.reduce((s, b) => s + b.completedOrders, 0);

  if (branches.length <= 1) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
        <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-1">Tek Şube</p>
        <p className="text-slate-500 text-sm">Şube karşılaştırma raporu birden fazla şube olduğunda aktif olur.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-2 text-xs font-semibold transition-all ${period === p ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <span className="text-slate-400">—</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
            <button onClick={load} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold">Uygula</button>
          </div>
        )}
        <button onClick={load} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition ml-auto">
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Toplam Ciro (Tüm Şubeler)', value: fmt(grandTotal) + ' ₺', icon: DollarSign, color: 'bg-emerald-500', text: 'text-emerald-700' },
              { label: 'Toplam Sipariş', value: grandOrders + ' tamamlanan', icon: ShoppingCart, color: 'bg-blue-500', text: 'text-blue-700' },
              { label: 'Aktif Şube', value: branches.length + ' şube', icon: Building2, color: 'bg-orange-500', text: 'text-orange-700' },
            ].map(({ label, value, icon: Icon, color, text }) => (
              <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 md:p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className={`text-xl md:text-2xl font-black ${text}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4">
            {data.map((b, i) => {
              const revPct = grandTotal > 0 ? (b.totalRevenue / grandTotal) * 100 : 0;
              const orderPct = grandOrders > 0 ? (b.completedOrders / grandOrders) * 100 : 0;
              const colors = ['bg-orange-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-teal-500'];
              const color = colors[i % colors.length];
              return (
                <div key={b.branchId} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className={`h-1.5 ${color}`} style={{ width: `${revPct}%`, minWidth: b.totalRevenue > 0 ? '8px' : '0' }} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white font-black`}>
                          {i + 1}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 text-lg">{b.branchName}</h3>
                          {b.isMain && <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full">Ana Şube</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-emerald-700">{fmt(b.totalRevenue)} ₺</p>
                        <p className="text-xs text-slate-400">Toplam cirodaki pay: %{revPct.toFixed(1)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Tamamlanan', value: b.completedOrders, sub: `%${orderPct.toFixed(0)} pay` },
                        { label: 'İptal', value: b.cancelledOrders, sub: '' },
                        { label: 'Ort. Sipariş', value: fmt(b.avgOrderValue) + ' ₺', sub: '' },
                        { label: 'Nakit / Kart', value: `${fmt(b.cashRevenue)} / ${fmt(b.cardRevenue)}`, sub: '' },
                      ].map(({ label, value, sub }) => (
                        <div key={label} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-xs text-slate-500 font-semibold mb-1">{label}</p>
                          <p className="font-bold text-slate-800">{value}</p>
                          {sub && <p className="text-xs text-slate-400">{sub}</p>}
                        </div>
                      ))}
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Sipariş Dağılımı</span>
                        <span>Masa: {b.dineInOrders} | Paket: {b.takeawayOrders} | Online: {b.onlineOrders}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full flex overflow-hidden">
                        {b.completedOrders > 0 && (
                          <>
                            <div className="bg-slate-500 h-full" style={{ width: `${(b.dineInOrders / b.completedOrders) * 100}%` }} />
                            <div className="bg-orange-400 h-full" style={{ width: `${(b.takeawayOrders / b.completedOrders) * 100}%` }} />
                            <div className="bg-blue-400 h-full" style={{ width: `${(b.onlineOrders / b.completedOrders) * 100}%` }} />
                          </>
                        )}
                      </div>
                      <div className="flex gap-4 mt-1">
                        {[{ label: 'Masa', color: 'bg-slate-500' }, { label: 'Paket', color: 'bg-orange-400' }, { label: 'Online', color: 'bg-blue-400' }].map(({ label, color }) => (
                          <div key={label} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${color}`} />
                            <span className="text-xs text-slate-400">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-700">Karşılaştırmalı Tablo</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left py-3 px-5 text-slate-500 font-semibold">Şube</th>
                    <th className="text-right py-3 px-5 text-slate-500 font-semibold">Sipariş</th>
                    <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Ort. Sipariş</th>
                    <th className="text-right py-3 px-5 text-slate-500 font-semibold">Ciro</th>
                    <th className="text-right py-3 px-5 text-slate-500 font-semibold">Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(b => {
                    const pct = grandTotal > 0 ? (b.totalRevenue / grandTotal) * 100 : 0;
                    return (
                      <tr key={b.branchId} className="border-t border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-3 px-5">
                          <span className="font-semibold text-slate-800">{b.branchName}</span>
                          {b.isMain && <span className="ml-2 text-xs bg-orange-100 text-orange-600 font-medium px-1.5 py-0.5 rounded">Ana</span>}
                        </td>
                        <td className="py-3 px-5 text-right text-slate-700">{b.completedOrders}</td>
                        <td className="py-3 px-5 text-right text-slate-500 hidden md:table-cell">{fmt(b.avgOrderValue)} ₺</td>
                        <td className="py-3 px-5 text-right font-bold text-emerald-700">{fmt(b.totalRevenue)} ₺</td>
                        <td className="py-3 px-5 text-right">
                          <span className="text-xs font-semibold text-slate-500">%{pct.toFixed(1)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <td className="py-3 px-5 text-slate-700">Toplam</td>
                    <td className="py-3 px-5 text-right text-slate-700">{grandOrders}</td>
                    <td className="py-3 px-5 text-right text-slate-500 hidden md:table-cell">{fmt(grandOrders > 0 ? grandTotal / grandOrders : 0)} ₺</td>
                    <td className="py-3 px-5 text-right text-emerald-700">{fmt(grandTotal)} ₺</td>
                    <td className="py-3 px-5 text-right text-slate-500">%100</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
