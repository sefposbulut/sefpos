import { useState, useEffect } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { fmtMoney, getReportDateRange, type ReportPeriod } from '../../lib/reportUtils';
import { ReportPeriodBar } from './shared/ReportPeriodBar';

interface UserStat {
  userId: string;
  name: string;
  role: string;
  branchName: string;
  ordersHandled: number;
  completedOrders: number;
  cancelledOrders: number;
  revenue: number;
  cancelAmount: number;
  avgOrder: number;
}

interface UsersReportProps {
  selectedBranch: string;
}

const roleLabels: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  manager: 'Müdür',
  waiter: 'Garson',
  cashier: 'Kasiyer',
};

const roleColors: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-blue-100 text-blue-700',
  manager: 'bg-teal-100 text-teal-700',
  waiter: 'bg-slate-100 text-slate-600',
  cashier: 'bg-emerald-100 text-emerald-700',
};

export function UsersReport({ selectedBranch }: UsersReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [sortBy, setSortBy] = useState<'revenue' | 'orders'>('revenue');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getReportDateRange(period, customStart, customEnd);

    const [{ data: profiles }, { data: orders }, { data: cancels }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, branch_id, branches(name)')
        .eq('tenant_id', tenant.id),
      (() => {
        let q = supabase
          .from('orders')
          .select('id, status, total_amount, waiter_id, created_by, branch_id')
          .eq('tenant_id', tenant.id)
          .gte('created_at', start)
          .lte('created_at', end);
        if (effectiveBranch !== 'all') q = q.eq('branch_id', effectiveBranch);
        return q;
      })(),
      (() => {
        let q = supabase
          .from('order_cancel_logs')
          .select('cancelled_by_name, unit_price, quantity, cancelled_by')
          .eq('tenant_id', tenant.id)
          .gte('created_at', start)
          .lte('created_at', end);
        if (effectiveBranch !== 'all') q = q.eq('branch_id', effectiveBranch);
        return q;
      })(),
    ]);

    const profileMap: Record<string, { full_name: string; role: string; branchName: string }> = {};
    (profiles ?? []).forEach(
      (p: {
        id: string;
        full_name: string;
        role: string;
        branches?: { name: string } | null;
      }) => {
        profileMap[p.id] = {
          full_name: p.full_name,
          role: p.role,
          branchName: (p.branches as { name?: string } | null)?.name || '—',
        };
      },
    );

    const statsMap: Record<string, UserStat> = {};

    const touch = (uid: string) => {
      if (!statsMap[uid]) {
        const p = profileMap[uid];
        statsMap[uid] = {
          userId: uid,
          name: p?.full_name || 'Bilinmeyen',
          role: p?.role || '—',
          branchName: p?.branchName || '—',
          ordersHandled: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          revenue: 0,
          cancelAmount: 0,
          avgOrder: 0,
        };
      }
      return statsMap[uid];
    };

    (orders ?? []).forEach(
      (o: {
        status: string;
        total_amount: number;
        waiter_id?: string | null;
        created_by?: string | null;
      }) => {
        const uid = o.waiter_id || o.created_by;
        if (!uid) return;
        const row = touch(uid);
        row.ordersHandled += 1;
        if (o.status === 'completed') {
          row.completedOrders += 1;
          row.revenue += Number(o.total_amount) || 0;
        } else if (o.status === 'cancelled') {
          row.cancelledOrders += 1;
        }
      },
    );

    (cancels ?? []).forEach(
      (c: {
        cancelled_by?: string | null;
        cancelled_by_name?: string | null;
        unit_price: number;
        quantity: number;
      }) => {
        if (c.cancelled_by) {
          const row = touch(c.cancelled_by);
          row.cancelAmount += (c.unit_price || 0) * (c.quantity || 0);
        }
      },
    );

    const list = Object.values(statsMap).map((u) => ({
      ...u,
      avgOrder: u.completedOrders > 0 ? u.revenue / u.completedOrders : 0,
    }));

    setUsers(list);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, effectiveBranch, period]);

  const filtered = users
    .filter((u) => roleFilter === 'all' || u.role === roleFilter)
    .sort((a, b) =>
      sortBy === 'revenue' ? b.revenue - a.revenue : b.ordersHandled - a.ordersHandled,
    );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
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
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="all">Tüm roller</option>
          {Object.entries(roleLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'revenue' | 'orders')}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="revenue">Ciroya göre</option>
          <option value="orders">Siparişe göre</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Bu dönemde kullanıcı aktivitesi yok</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-semibold">Kullanıcı</th>
                <th className="py-3 pr-4 font-semibold">Rol</th>
                <th className="py-3 pr-4 font-semibold">Şube</th>
                <th className="py-3 pr-4 font-semibold text-right">Sipariş</th>
                <th className="py-3 pr-4 font-semibold text-right">Tamamlanan</th>
                <th className="py-3 pr-4 font-semibold text-right">Ciro</th>
                <th className="py-3 pr-4 font-semibold text-right">İptal tutarı</th>
                <th className="py-3 font-semibold text-right">Ort. sepet</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.userId} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="py-3 pr-4 font-medium text-slate-800">{u.name}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        roleColors[u.role] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {roleLabels[u.role] || u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{u.branchName}</td>
                  <td className="py-3 pr-4 text-right">{u.ordersHandled}</td>
                  <td className="py-3 pr-4 text-right text-emerald-600 font-medium">
                    {u.completedOrders}
                  </td>
                  <td className="py-3 pr-4 text-right font-bold">{fmtMoney(u.revenue)} ₺</td>
                  <td className="py-3 pr-4 text-right text-red-500">{fmtMoney(u.cancelAmount)} ₺</td>
                  <td className="py-3 text-right">{fmtMoney(u.avgOrder)} ₺</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Garson raporu yalnızca garsonları gösterir; bu sekme tüm roller (kasiyer, müdür vb.) için
        sipariş ve iptal özetini listeler.
      </p>
    </div>
  );
}
