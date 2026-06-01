import { useState, useEffect, useMemo } from 'react';
import { Clock, CalendarDays, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMoney, fmtInt, getReportDateRange, type ReportPeriod } from '../../lib/reportUtils';
import { ReportPeriodBar } from './shared/ReportPeriodBar';

interface TimeReportProps {
  selectedBranch: string;
}

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function TimeReport({ selectedBranch }: TimeReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [hourly, setHourly] = useState<{ hour: number; orders: number; revenue: number }[]>([]);
  const [weekday, setWeekday] = useState<{ day: number; label: string; orders: number; revenue: number }[]>([]);

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getReportDateRange(period, customStart, customEnd);

    let q = supabase
      .from('orders')
      .select('created_at, total_amount')
      .eq('tenant_id', tenant.id)
      .eq('status', 'completed')
      .gte('created_at', start)
      .lte('created_at', end);
    if (effectiveBranch !== 'all') q = q.eq('branch_id', effectiveBranch);

    const { data } = await q;
    const hourMap: Record<number, { orders: number; revenue: number }> = {};
    const dayMap: Record<number, { orders: number; revenue: number }> = {};

    for (let h = 0; h < 24; h++) hourMap[h] = { orders: 0, revenue: 0 };
    for (let d = 0; d < 7; d++) dayMap[d] = { orders: 0, revenue: 0 };

    (data ?? []).forEach((o: { created_at: string; total_amount: number }) => {
      const dt = new Date(o.created_at);
      const h = dt.getHours();
      const dow = dt.getDay();
      hourMap[h].orders += 1;
      hourMap[h].revenue += Number(o.total_amount) || 0;
      dayMap[dow].orders += 1;
      dayMap[dow].revenue += Number(o.total_amount) || 0;
    });

    setHourly(
      Object.entries(hourMap).map(([hour, v]) => ({
        hour: Number(hour),
        ...v,
      })),
    );
    setWeekday(
      Object.entries(dayMap).map(([day, v]) => ({
        day: Number(day),
        label: DAY_NAMES[Number(day)],
        ...v,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, effectiveBranch, period]);

  const maxHourOrders = useMemo(() => Math.max(1, ...hourly.map((h) => h.orders)), [hourly]);
  const maxDayOrders = useMemo(() => Math.max(1, ...weekday.map((d) => d.orders)), [weekday]);
  const peakHour = useMemo(
    () => hourly.slice().sort((a, b) => b.orders - a.orders)[0],
    [hourly],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-8">
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

      {peakHour && peakHour.orders > 0 && (
        <div className="flex items-center gap-3 bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <Clock className="w-8 h-8 text-violet-600" />
          <div>
            <p className="text-sm text-violet-700 font-semibold">En yoğun saat</p>
            <p className="text-lg font-black text-violet-900">
              {String(peakHour.hour).padStart(2, '0')}:00 — {peakHour.orders} sipariş,{' '}
              {fmtMoney(peakHour.revenue)} ₺
            </p>
          </div>
        </div>
      )}

      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" /> Saatlik yoğunluk
        </h3>
        <div className="space-y-1">
          {hourly.map((h) => (
            <div key={h.hour} className="flex items-center gap-3 text-xs">
              <span className="w-12 text-slate-500 font-mono">
                {String(h.hour).padStart(2, '0')}:00
              </span>
              <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden relative">
                <div
                  className="h-full bg-violet-500 rounded transition-all"
                  style={{ width: `${(h.orders / maxHourOrders) * 100}%` }}
                />
                {h.orders > 0 && (
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white mix-blend-difference">
                    {h.orders} sip. · {fmtMoney(h.revenue)} ₺
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" /> Haftanın günü
        </h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {weekday.map((d) => (
            <div
              key={d.day}
              className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-700">{d.label}</p>
              <p className="text-xl font-black text-slate-900 mt-1">{fmtInt(d.orders)} sipariş</p>
              <p className="text-sm text-slate-500">{fmtMoney(d.revenue)} ₺</p>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${(d.orders / maxDayOrders) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
