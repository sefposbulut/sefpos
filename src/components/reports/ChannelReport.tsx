import { useState, useEffect, useMemo } from 'react';
import { Globe, Utensils, Bike, ShoppingBag, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMoney, getReportDateRange, type ReportPeriod } from '../../lib/reportUtils';
import { ReportPeriodBar } from './shared/ReportPeriodBar';

interface ChannelRow {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  cancelled: number;
  avgBasket: number;
}

interface ChannelReportProps {
  selectedBranch: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  getir: 'Getir',
  yemeksepeti: 'Yemeksepeti',
  trendyol: 'Trendyol Yemek',
  migros: 'Migros Yemek',
  hemenyolda: 'HemenYolda',
};

export function ChannelReport({ selectedBranch }: ChannelReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ChannelRow[]>([]);

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getReportDateRange(period, customStart, customEnd);

    let ordersQ = supabase
      .from('orders')
      .select('id, status, total_amount, order_type, order_subtype')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end);
    if (effectiveBranch !== 'all') ordersQ = ordersQ.eq('branch_id', effectiveBranch);

    let onlineQ = supabase
      .from('online_orders')
      .select('id, status, total_amount, internal_order_id, online_order_platforms(platform_code, platform_name)')
      .eq('tenant_id', tenant.id)
      .gte('created_at', start)
      .lte('created_at', end);

    const [{ data: orders }, { data: onlineRaw }] = await Promise.all([ordersQ, onlineQ]);

    let online = onlineRaw ?? [];
    if (effectiveBranch !== 'all' && online.length > 0) {
      const internalIds = online
        .map((o: { internal_order_id?: string | null }) => o.internal_order_id)
        .filter(Boolean) as string[];
      if (internalIds.length > 0) {
        const { data: linked } = await supabase
          .from('orders')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('branch_id', effectiveBranch)
          .in('id', internalIds);
        const allowed = new Set((linked ?? []).map((x: { id: string }) => x.id));
        online = online.filter(
          (o: { internal_order_id?: string | null }) =>
            o.internal_order_id && allowed.has(o.internal_order_id),
        );
      } else {
        online = [];
      }
    }

    const map: Record<string, ChannelRow> = {};
    const ensure = (key: string, label: string) => {
      if (!map[key]) {
        map[key] = { key, label, orders: 0, revenue: 0, cancelled: 0, avgBasket: 0 };
      }
      return map[key];
    };

    (orders ?? []).forEach(
      (o: {
        status: string;
        total_amount: number;
        order_type: string;
        order_subtype: string | null;
      }) => {
        let key = 'dine_in';
        let label = 'Masa / Salon';
        if (o.order_type === 'takeaway') {
          if (o.order_subtype === 'gel_al') {
            key = 'gel_al';
            label = 'Gel-Al';
          } else {
            key = 'paket';
            label = 'Telefon / Paket';
          }
        } else if (o.order_type === 'delivery') {
          key = 'delivery_pos';
          label = 'Teslimat (POS)';
        }
        const row = ensure(key, label);
        if (o.status === 'cancelled') {
          row.cancelled += 1;
          return;
        }
        if (o.status !== 'completed') return;
        row.orders += 1;
        row.revenue += Number(o.total_amount) || 0;
      },
    );

    (online ?? []).forEach(
      (o: {
        status: string;
        total_amount: number;
        online_order_platforms?: { platform_code?: string; platform_name?: string } | null;
      }) => {
        const code = o.online_order_platforms?.platform_code || 'platform';
        const label =
          o.online_order_platforms?.platform_name ||
          PLATFORM_LABELS[code] ||
          code;
        const key = `platform_${code}`;
        const row = ensure(key, label);
        if (o.status === 'cancelled') {
          row.cancelled += 1;
          return;
        }
        row.orders += 1;
        row.revenue += Number(o.total_amount) || 0;
      },
    );

    const list = Object.values(map)
      .map((r) => ({
        ...r,
        avgBasket: r.orders > 0 ? r.revenue / r.orders : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, effectiveBranch, period]);

  const totals = useMemo(
    () => ({
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      orders: rows.reduce((s, r) => s + r.orders, 0),
    }),
    [rows],
  );

  const iconFor = (key: string) => {
    if (key.startsWith('platform_')) return Globe;
    if (key === 'dine_in') return Utensils;
    if (key === 'gel_al') return ShoppingBag;
    return Bike;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <ReportPeriodBar
        period={period}
        onPeriodChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        onRefresh={load}
        onApply={load}
        accent="blue"
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <p className="text-xs font-semibold text-blue-600 uppercase">Kanal cirosu</p>
          <p className="text-2xl font-black text-blue-900">{fmtMoney(totals.revenue)} ₺</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase">Tamamlanan sipariş</p>
          <p className="text-2xl font-black text-slate-900">{totals.orders}</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-3 pr-4 font-semibold">Kanal</th>
              <th className="py-3 pr-4 font-semibold text-right">Sipariş</th>
              <th className="py-3 pr-4 font-semibold text-right">Ciro</th>
              <th className="py-3 pr-4 font-semibold text-right">Pay %</th>
              <th className="py-3 pr-4 font-semibold text-right">Ort. sepet</th>
              <th className="py-3 font-semibold text-right">İptal</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  Bu dönemde kanal verisi yok
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const Icon = iconFor(r.key);
                const share = totals.revenue > 0 ? (r.revenue / totals.revenue) * 100 : 0;
                return (
                  <tr key={r.key} className="border-b border-slate-50 hover:bg-slate-50/80">
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      <span className="inline-flex items-center gap-2">
                        <Icon className="w-4 h-4 text-slate-400" />
                        {r.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right">{r.orders}</td>
                    <td className="py-3 pr-4 text-right font-semibold">{fmtMoney(r.revenue)} ₺</td>
                    <td className="py-3 pr-4 text-right text-slate-500">{share.toFixed(1)}%</td>
                    <td className="py-3 pr-4 text-right">{fmtMoney(r.avgBasket)} ₺</td>
                    <td className="py-3 text-right text-red-500">{r.cancelled}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
