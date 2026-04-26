import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Users, RefreshCw, TrendingUp, ShoppingCart, Clock } from 'lucide-react';

interface StaffStat {
  userId: string;
  name: string;
  role: string;
  branchName: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  firstOrder: string | null;
  lastOrder: string | null;
}

interface StaffReportProps {
  selectedBranch: string;
}

type Period = 'today' | 'week' | 'month' | 'custom';

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

export function StaffReport({ selectedBranch }: StaffReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [staff, setStaff] = useState<StaffStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'orders'>('revenue');

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

    const [{ data: profiles }, { data: orders }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role, branch_id, branches(name)')
        .eq('tenant_id', tenant.id),
      (() => {
        let q = supabase
          .from('orders')
          .select('id, status, total_amount, created_at, branch_id, waiter_id')
          .eq('tenant_id', tenant.id)
          .gte('created_at', start)
          .lte('created_at', end);
        if (effectiveBranch !== 'all') {
          q = q.eq('branch_id', effectiveBranch);
        }
        return q;
      })(),
    ]);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    const staffMap: Record<string, StaffStat> = {};

    (orders || []).forEach((order: any) => {
      const uid = order.waiter_id || '__unknown__';
      const profile = profileMap[uid];
      if (!staffMap[uid]) {
        staffMap[uid] = {
          userId: uid,
          name: profile?.full_name || 'Bilinmeyen',
          role: profile?.role || 'waiter',
          branchName: (profile?.branches as any)?.name || '—',
          totalOrders: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          totalRevenue: 0,
          avgOrderValue: 0,
          firstOrder: null,
          lastOrder: null,
        };
      }
      const s = staffMap[uid];
      s.totalOrders += 1;
      if (order.status === 'completed') {
        s.completedOrders += 1;
        s.totalRevenue += order.total_amount || 0;
      }
      if (order.status === 'cancelled') s.cancelledOrders += 1;
      if (!s.firstOrder || order.created_at < s.firstOrder) s.firstOrder = order.created_at;
      if (!s.lastOrder || order.created_at > s.lastOrder) s.lastOrder = order.created_at;
    });

    const staffList = Object.values(staffMap).map(s => ({
      ...s,
      avgOrderValue: s.completedOrders > 0 ? s.totalRevenue / s.completedOrders : 0,
    })).sort((a, b) => sortBy === 'revenue' ? b.totalRevenue - a.totalRevenue : b.totalOrders - a.totalOrders);

    setStaff(staffList);
    setLoading(false);
  };

  useEffect(() => {
    if (period !== 'custom') load();
  }, [tenant, effectiveBranch, period, sortBy]);

  const periodLabels: Record<Period, string> = { today: 'Bugün', week: 'Son 7 Gün', month: 'Bu Ay', custom: 'Özel' };
  const totalRevenue = staff.reduce((s, x) => s + x.totalRevenue, 0);
  const totalOrders = staff.reduce((s, x) => s + x.totalOrders, 0);

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
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm ml-auto">
          <button onClick={() => setSortBy('revenue')} className={`px-3 py-2 text-xs font-semibold transition-all ${sortBy === 'revenue' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Ciroya Göre</button>
          <button onClick={() => setSortBy('orders')} className={`px-3 py-2 text-xs font-semibold transition-all ${sortBy === 'orders' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>Siparişe Göre</button>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition">
          <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Aktif Personel', value: staff.length, icon: Users, color: 'bg-blue-500', text: 'text-blue-700' },
              { label: 'Toplam Sipariş', value: totalOrders, icon: ShoppingCart, color: 'bg-orange-500', text: 'text-orange-700' },
              { label: 'Toplam Ciro', value: fmt(totalRevenue) + ' ₺', icon: TrendingUp, color: 'bg-emerald-500', text: 'text-emerald-700' },
              { label: 'En Yüksek', value: staff[0]?.name || '—', icon: Clock, color: 'bg-amber-500', text: 'text-amber-700' },
            ].map(({ label, value, icon: Icon, color, text }) => (
              <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <div className={`w-7 h-7 ${color} rounded-lg flex items-center justify-center`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
                <p className={`text-lg font-black ${text} truncate`}>{value}</p>
              </div>
            ))}
          </div>

          {staff.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500">Bu dönem için personel verisi bulunamadı</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-700">Personel Performansı</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-5 text-slate-500 font-semibold">#</th>
                      <th className="text-left py-3 px-5 text-slate-500 font-semibold">Personel</th>
                      <th className="text-left py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Şube</th>
                      <th className="text-right py-3 px-5 text-slate-500 font-semibold">Sipariş</th>
                      <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Tamamlanan</th>
                      <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">İptal</th>
                      <th className="text-right py-3 px-5 text-slate-500 font-semibold hidden md:table-cell">Ort. Sipariş</th>
                      <th className="text-right py-3 px-5 text-slate-500 font-semibold">Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s, i) => (
                      <tr key={s.userId} className="border-t border-slate-50 hover:bg-slate-50 transition">
                        <td className="py-3 px-5">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
                        </td>
                        <td className="py-3 px-5">
                          <div>
                            <p className="font-semibold text-slate-800">{s.name}</p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[s.role] || 'bg-slate-100 text-slate-600'}`}>
                              {roleLabels[s.role] || s.role}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-5 text-slate-500 hidden md:table-cell">{s.branchName}</td>
                        <td className="py-3 px-5 text-right font-semibold text-slate-700">{s.totalOrders}</td>
                        <td className="py-3 px-5 text-right text-emerald-600 font-semibold hidden md:table-cell">{s.completedOrders}</td>
                        <td className="py-3 px-5 text-right text-red-500 hidden md:table-cell">{s.cancelledOrders}</td>
                        <td className="py-3 px-5 text-right text-slate-500 hidden md:table-cell">{fmt(s.avgOrderValue)} ₺</td>
                        <td className="py-3 px-5 text-right font-black text-emerald-700">{fmt(s.totalRevenue)} ₺</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-5 py-4 bg-slate-50 border-t border-slate-100">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {staff.length > 0 && [
                    { label: 'En Çok Sipariş', person: [...staff].sort((a, b) => b.totalOrders - a.totalOrders)[0] },
                    { label: 'En Yüksek Ciro', person: [...staff].sort((a, b) => b.totalRevenue - a.totalRevenue)[0] },
                    { label: 'En Yüksek Ort. Sipariş', person: [...staff].filter(s => s.completedOrders >= 3).sort((a, b) => b.avgOrderValue - a.avgOrderValue)[0] },
                  ].filter(x => x.person).map(({ label, person }) => (
                    <div key={label} className="bg-white rounded-xl p-3 flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-medium">{label}</p>
                        <p className="font-bold text-slate-800 text-sm">{person.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
