import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { mapTakeawayPaymentMethod } from '../../lib/takeawayPayment';
import {
  Bike, Building2, RefreshCw, ShoppingBag, Home, Banknote, CreditCard, Smartphone,
  Package, DollarSign,
} from 'lucide-react';

interface TakeawayOrderRow {
  id: string;
  branch_id: string | null;
  order_type: string;
  order_subtype: string | null;
  status: string;
  delivery_status: string;
  courier_id: string | null;
  courier_name: string | null;
  payment_method: string | null;
  payment_collected: boolean;
  payment_status: string | null;
  total_amount: number;
  created_at: string;
  order_number: string;
}

interface BranchPaketStat {
  branchId: string;
  branchName: string;
  paketCount: number;
  gelAlCount: number;
  kuryeDeliveryCount: number;
  cancelledCount: number;
  totalCiro: number;
  tahsilEdilen: number;
  bekleyenTahsilat: number;
  nakit: number;
  kart: number;
  online: number;
}

interface CourierStat {
  courierId: string;
  courierName: string;
  branchId: string | null;
  branchName: string;
  teslimCount: number;
  yoldaCount: number;
  toplamTutar: number;
  nakit: number;
  kart: number;
}

interface TakeawayReportProps {
  selectedBranch: string;
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

function isPaketOrder(o: TakeawayOrderRow): boolean {
  return o.order_type === 'takeaway' && o.order_subtype !== 'gel_al';
}

function isGelAl(o: TakeawayOrderRow): boolean {
  return o.order_subtype === 'gel_al';
}

function isKuryeOrder(o: TakeawayOrderRow): boolean {
  return o.order_type === 'delivery' || !!o.courier_id;
}

function orderAmount(o: TakeawayOrderRow): number {
  return Number(o.total_amount) || 0;
}

function isPaid(o: TakeawayOrderRow): boolean {
  return o.payment_collected === true || o.payment_status === 'paid';
}

export function TakeawayReport({ selectedBranch }: TakeawayReportProps) {
  const { tenant, isOwnerOrAdmin, activeBranch, branches } = useAuth();
  const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
  const [orders, setOrders] = useState<TakeawayOrderRow[]>([]);
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

  const branchNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    branches.forEach((b) => { m[b.id] = b.name; });
    return m;
  }, [branches]);

  const load = async () => {
    if (!tenant) return;
    setLoading(true);
    const { start, end } = getDateRange();

    let q = supabase
      .from('orders')
      .select(
        'id, branch_id, order_type, order_subtype, status, delivery_status, courier_id, courier_name, payment_method, payment_collected, payment_status, total_amount, created_at, order_number',
      )
      .eq('tenant_id', tenant.id)
      .in('order_type', ['takeaway', 'delivery'])
      .gte('created_at', start)
      .lte('created_at', end);

    if (effectiveBranch !== 'all') {
      q = q.eq('branch_id', effectiveBranch);
    }

    const { data, error } = await q;
    if (error) console.warn('[TakeawayReport]', error.message);
    setOrders((data || []) as TakeawayOrderRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [tenant, effectiveBranch, period, customStart, customEnd]);

  const activeOrders = orders.filter((o) => o.status !== 'cancelled' && o.delivery_status !== 'cancelled');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled' || o.delivery_status === 'cancelled');

  const branchStats = useMemo(() => {
    const map: Record<string, BranchPaketStat> = {};

    const ensure = (bid: string) => {
      if (!map[bid]) {
        map[bid] = {
          branchId: bid,
          branchName: branchNameMap[bid] || 'Şube',
          paketCount: 0,
          gelAlCount: 0,
          kuryeDeliveryCount: 0,
          cancelledCount: 0,
          totalCiro: 0,
          tahsilEdilen: 0,
          bekleyenTahsilat: 0,
          nakit: 0,
          kart: 0,
          online: 0,
        };
      }
      return map[bid];
    };

    branches.forEach((b) => ensure(b.id));
    const unknownId = '__unknown__';

    activeOrders.forEach((o) => {
      const bid = o.branch_id || unknownId;
      const b = ensure(bid);
      const amt = orderAmount(o);
      b.totalCiro += amt;

      if (isPaketOrder(o)) b.paketCount += 1;
      if (isGelAl(o)) b.gelAlCount += 1;
      if (isKuryeOrder(o) && (o.delivery_status === 'delivered' || o.courier_id)) {
        b.kuryeDeliveryCount += 1;
      }

      if (isPaid(o)) {
        b.tahsilEdilen += amt;
        const m = o.payment_method || 'cash';
        if (m === 'cash') b.nakit += amt;
        else if (m === 'card') b.kart += amt;
        else if (m === 'online') b.online += amt;
        else b.nakit += amt;
      } else {
        b.bekleyenTahsilat += amt;
      }
    });

    cancelledOrders.forEach((o) => {
      const bid = o.branch_id || unknownId;
      ensure(bid).cancelledCount += 1;
    });

    return Object.values(map)
      .filter((b) => {
        if (effectiveBranch !== 'all' && b.branchId !== effectiveBranch) return false;
        return b.branchId !== unknownId || b.paketCount + b.gelAlCount + b.kuryeDeliveryCount > 0;
      })
      .sort((a, b) => b.totalCiro - a.totalCiro);
  }, [activeOrders, cancelledOrders, branches, branchNameMap, effectiveBranch]);

  const courierStats = useMemo(() => {
    const map: Record<string, CourierStat> = {};

    activeOrders.forEach((o) => {
      if (!o.courier_id) return;
      const key = o.courier_id;
      if (!map[key]) {
        map[key] = {
          courierId: key,
          courierName: o.courier_name || 'Kurye',
          branchId: o.branch_id,
          branchName: o.branch_id ? branchNameMap[o.branch_id] || '—' : '—',
          teslimCount: 0,
          yoldaCount: 0,
          toplamTutar: 0,
          nakit: 0,
          kart: 0,
        };
      }
      const c = map[key];
      const amt = orderAmount(o);
      c.toplamTutar += amt;
      if (o.delivery_status === 'delivered') c.teslimCount += 1;
      else if (o.delivery_status === 'on_the_way') c.yoldaCount += 1;

      if (isPaid(o)) {
        const dbm = mapTakeawayPaymentMethod(o.payment_method);
        if (dbm === 'cash') c.nakit += amt;
        else c.kart += amt;
      }
    });

    return Object.values(map).sort((a, b) => b.teslimCount - a.teslimCount || b.toplamTutar - a.toplamTutar);
  }, [activeOrders, branchNameMap]);

  const totals = useMemo(() => {
    const paket = activeOrders.filter(isPaketOrder).length;
    const gelAl = activeOrders.filter(isGelAl).length;
    const kurye = activeOrders.filter((o) => isKuryeOrder(o) && o.courier_id).length;
    const ciro = activeOrders.reduce((s, o) => s + orderAmount(o), 0);
    const tahsil = activeOrders.filter(isPaid).reduce((s, o) => s + orderAmount(o), 0);
    return { paket, gelAl, kurye, ciro, tahsil, iptal: cancelledOrders.length };
  }, [activeOrders, cancelledOrders]);

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'yesterday', label: 'Dün' },
    { key: 'week', label: '7 Gün' },
    { key: 'month', label: 'Bu Ay' },
    { key: 'custom', label: 'Özel' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5 bg-slate-100 rounded-xl p-1">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                period === p.key ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg"
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg"
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Paket', value: totals.paket, icon: ShoppingBag, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: 'Gel-Al', value: totals.gelAl, icon: Home, color: 'text-teal-600', bg: 'bg-teal-50' },
              { label: 'Kuryeli', value: totals.kurye, icon: Bike, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Ciro', value: `${fmt(totals.ciro)}₺`, icon: DollarSign, color: 'text-slate-700', bg: 'bg-slate-50', raw: true },
              { label: 'Tahsil', value: `${fmt(totals.tahsil)}₺`, icon: Banknote, color: 'text-green-600', bg: 'bg-green-50', raw: true },
              { label: 'İptal', value: totals.iptal, icon: Package, color: 'text-red-600', bg: 'bg-red-50' },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className={`${card.bg} rounded-xl p-3 border border-slate-100`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`w-4 h-4 ${card.color}`} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{card.label}</span>
                  </div>
                  <p className={`text-lg font-black ${card.color}`}>
                    {card.raw ? card.value : card.value}
                  </p>
                </div>
              );
            })}
          </div>

          <section>
            <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              Şube bazlı paket özeti
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-bold text-slate-600">Şube</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Paket</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Gel-Al</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Kurye</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Ciro</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Tahsil</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Bekleyen</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Nakit</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Kart</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Online</th>
                  </tr>
                </thead>
                <tbody>
                  {branchStats.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                        Bu dönemde kayıt yok
                      </td>
                    </tr>
                  ) : (
                    branchStats.map((b) => (
                      <tr key={b.branchId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{b.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-orange-600">{b.paketCount}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-teal-600">{b.gelAlCount}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-blue-600">{b.kuryeDeliveryCount}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(b.totalCiro)}₺</td>
                        <td className="px-3 py-2.5 text-right text-green-700 font-semibold">{fmt(b.tahsilEdilen)}₺</td>
                        <td className="px-3 py-2.5 text-right text-amber-600">{fmt(b.bekleyenTahsilat)}₺</td>
                        <td className="px-3 py-2.5 text-right">{fmt(b.nakit)}₺</td>
                        <td className="px-3 py-2.5 text-right">{fmt(b.kart)}₺</td>
                        <td className="px-3 py-2.5 text-right">{fmt(b.online)}₺</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
              <Bike className="w-4 h-4 text-blue-500" />
              Kurye performansı
            </h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-bold text-slate-600">Kurye</th>
                    <th className="px-3 py-2 font-bold text-slate-600">Şube</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Teslim</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Yolda</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Toplam tutar</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Nakit tahsil</th>
                    <th className="px-3 py-2 font-bold text-slate-600 text-right">Kart tahsil</th>
                  </tr>
                </thead>
                <tbody>
                  {courierStats.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        Kurye ataması yok
                      </td>
                    </tr>
                  ) : (
                    courierStats.map((c) => (
                      <tr key={c.courierId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{c.courierName}</td>
                        <td className="px-3 py-2.5 text-slate-500">{c.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-black text-green-600">{c.teslimCount}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-orange-600">{c.yoldaCount}</td>
                        <td className="px-3 py-2.5 text-right font-black">{fmt(c.toplamTutar)}₺</td>
                        <td className="px-3 py-2.5 text-right">{fmt(c.nakit)}₺</td>
                        <td className="px-3 py-2.5 text-right">{fmt(c.kart)}₺</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Banknote className="w-3 h-3" /> Nakit</span>
              <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> Kart / online</span>
              <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> Ödeme «Ödendi» veya teslim sonrası «paid»</span>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
