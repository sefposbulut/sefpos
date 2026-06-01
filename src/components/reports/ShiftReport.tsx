import { useState, useEffect } from 'react';
import { Clock, RefreshCw, Lock, Unlock, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMoney, getReportDateRange, type ReportPeriod } from '../../lib/reportUtils';
import { ReportPeriodBar } from './shared/ReportPeriodBar';

interface ShiftRow {
  id: string;
  shift_name: string;
  shift_no: number;
  business_date: string;
  branch_name: string;
  opener_name: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  total_revenue: number;
  cash_revenue: number;
  card_revenue: number;
  expected_cash: number;
  cash_difference: number;
  order_count: number;
  expense_total: number;
}

interface ShiftReportProps {
  selectedBranch: string;
}

export function ShiftReport({ selectedBranch }: ShiftReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [shiftsEnabled, setShiftsEnabled] = useState<boolean | null>(null);

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const range = getReportDateRange(period, customStart, customEnd);

    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('shifts_enabled')
      .eq('id', tenant.id)
      .maybeSingle();
    setShiftsEnabled((tenantRow as { shifts_enabled?: boolean } | null)?.shifts_enabled ?? false);

    let q = supabase
      .from('shifts')
      .select(
        `id, shift_name, shift_no, business_date, status, opened_at, closed_at,
        opening_cash, total_revenue, cash_revenue, card_revenue, expected_cash, cash_difference,
        order_count, expense_total, opened_by, closed_by, branch_id,
        branches(name)`,
      )
      .eq('tenant_id', tenant.id)
      .gte('business_date', range.startDate)
      .lte('business_date', range.endDate)
      .order('business_date', { ascending: false })
      .order('opened_at', { ascending: false });

    if (effectiveBranch !== 'all') q = q.eq('branch_id', effectiveBranch);

    const { data: shifts } = await q;

    const userIds = new Set<string>();
    (shifts ?? []).forEach((s: { opened_by?: string; closed_by?: string }) => {
      if (s.opened_by) userIds.add(s.opened_by);
      if (s.closed_by) userIds.add(s.closed_by);
    });

    const profileMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('tenant_id', tenant.id)
        .in('id', [...userIds]);
      (profiles ?? []).forEach((p: { id: string; full_name: string }) => {
        profileMap[p.id] = p.full_name;
      });
    }

    const list: ShiftRow[] = (shifts ?? []).map(
      (s: {
        id: string;
        shift_name: string;
        shift_no: number;
        business_date: string;
        status: string;
        opened_at: string;
        closed_at: string | null;
        opening_cash: number;
        total_revenue: number;
        cash_revenue: number;
        card_revenue: number;
        expected_cash: number;
        cash_difference: number;
        order_count: number;
        expense_total: number;
        opened_by?: string;
        branches?: { name: string } | null;
      }) => ({
        id: s.id,
        shift_name: s.shift_name,
        shift_no: s.shift_no,
        business_date: s.business_date,
        branch_name: (s.branches as { name?: string } | null)?.name || '—',
        opener_name: (s.opened_by && profileMap[s.opened_by]) || '—',
        status: s.status,
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opening_cash: Number(s.opening_cash) || 0,
        total_revenue: Number(s.total_revenue) || 0,
        cash_revenue: Number(s.cash_revenue) || 0,
        card_revenue: Number(s.card_revenue) || 0,
        expected_cash: Number(s.expected_cash) || 0,
        cash_difference: Number(s.cash_difference) || 0,
        order_count: s.order_count || 0,
        expense_total: Number(s.expense_total) || 0,
      }),
    );

    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, effectiveBranch, period]);

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.total_revenue,
      orders: acc.orders + r.order_count,
      diff: acc.diff + r.cash_difference,
    }),
    { revenue: 0, orders: 0, diff: 0 },
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-teal-500 animate-spin" />
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

      {shiftsEnabled === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          Vardiya modu ayarlarda kapalı. Geçmiş kayıtlar görünür; yeni vardiya açmak için Ayarlar →
          Vardiya'yı etkinleştirin.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-teal-50 rounded-2xl p-4 border border-teal-100">
          <p className="text-xs font-semibold text-teal-600 uppercase">Vardiya cirosu</p>
          <p className="text-2xl font-black text-teal-900">{fmtMoney(totals.revenue)} ₺</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
          <p className="text-xs font-semibold text-slate-500 uppercase">Sipariş (vardiya)</p>
          <p className="text-2xl font-black text-slate-900">{totals.orders}</p>
        </div>
        <div
          className={`rounded-2xl p-4 border ${
            Math.abs(totals.diff) > 50
              ? 'bg-red-50 border-red-100'
              : 'bg-emerald-50 border-emerald-100'
          }`}
        >
          <p className="text-xs font-semibold uppercase text-slate-500">Toplam kasa farkı</p>
          <p
            className={`text-2xl font-black ${
              totals.diff < 0 ? 'text-red-700' : totals.diff > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {fmtMoney(totals.diff)} ₺
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-3 pr-3 font-semibold">Tarih</th>
              <th className="py-3 pr-3 font-semibold">Vardiya</th>
              <th className="py-3 pr-3 font-semibold">Şube</th>
              <th className="py-3 pr-3 font-semibold">Açan</th>
              <th className="py-3 pr-3 font-semibold">Durum</th>
              <th className="py-3 pr-3 font-semibold text-right">Ciro</th>
              <th className="py-3 pr-3 font-semibold text-right">Sip.</th>
              <th className="py-3 pr-3 font-semibold text-right">Kasa farkı</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  Bu dönemde vardiya kaydı yok
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="py-3 pr-3 whitespace-nowrap">{r.business_date}</td>
                  <td className="py-3 pr-3 font-medium">
                    {r.shift_name}
                    <span className="text-slate-400 text-xs ml-1">#{r.shift_no}</span>
                  </td>
                  <td className="py-3 pr-3">{r.branch_name}</td>
                  <td className="py-3 pr-3">{r.opener_name}</td>
                  <td className="py-3 pr-3">
                    {r.status === 'open' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs">
                        <Unlock className="w-3 h-3" /> Açık
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500 font-semibold text-xs">
                        <Lock className="w-3 h-3" /> Kapalı
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right font-semibold">{fmtMoney(r.total_revenue)} ₺</td>
                  <td className="py-3 pr-3 text-right">{r.order_count}</td>
                  <td className="py-3 pr-3 text-right">
                    {Math.abs(r.cash_difference) > 20 ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {fmtMoney(r.cash_difference)} ₺
                      </span>
                    ) : (
                      <span className="text-slate-500">{fmtMoney(r.cash_difference)} ₺</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Vardiyalar iş günü tarihine göre listelenir (gün sonu ayarıyla uyumlu).
      </p>
    </div>
  );
}
