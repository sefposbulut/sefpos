import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { loadPrintSettings, printHtml } from '../lib/printService';
import { useActiveShift } from '../lib/useActiveShift';
import { computeBusinessDate, formatBusinessDateTR } from '../lib/businessDay';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Clock, Calendar, Printer, RefreshCw,
  Banknote, CreditCard, FileText, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Building2, Lock, AlertTriangle
} from 'lucide-react';

interface DayStats {
  totalRevenue: number;
  cashRevenue: number;
  cardRevenue: number;
  openAccountRevenue: number;
  totalOrders: number;
  dineInOrders: number;
  takeawayOrders: number;
  onlineOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgOrderValue: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  hourlyRevenue: { hour: number; revenue: number; orders: number }[];
  expenses: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  openTables: number;
  totalCovers: number;
}

interface EndOfDayProps {
  onClose?: () => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toLocalDT(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getBusinessDayRange(): { start: Date; end: Date } {
  const now = new Date();
  const hour = now.getHours();
  const start = new Date(now);
  const end = new Date(now);
  if (hour < 6) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(6, 0, 0, 0);
  if (hour >= 6) {
    end.setDate(end.getDate() + 1);
  }
  end.setHours(4, 0, 0, 0);
  return { start, end };
}

export function EndOfDay({ onClose }: EndOfDayProps) {
  const { tenant, activeBranch, branches, isOwnerOrAdmin, isManager, permissions } = useAuth();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranch?.id || 'all');
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');
  const [startDT, setStartDT] = useState<string>(() => {
    return toLocalDT(getBusinessDayRange().start);
  });
  const [endDT, setEndDT] = useState<string>(() => {
    return toLocalDT(getBusinessDayRange().end);
  });
  const [closingDay, setClosingDay] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);

  const effectiveBranchForShift = isOwnerOrAdmin ? (selectedBranch !== 'all' ? selectedBranch : null) : (activeBranch?.id || null);
  const { activeShift, todayClosure, refresh: refreshShift } = useActiveShift({
    tenantId: tenant?.id || null,
    branchId: effectiveBranchForShift,
    enabled: !!tenant,
  });
  const businessDate = useMemo(() => computeBusinessDate(), []);

  const handleCloseDay = async () => {
    if (!effectiveBranchForShift) {
      setCloseError('Şube seçimi gerekli (Tüm Şubeler ile gün kapatılamaz).');
      return;
    }
    if (activeShift) {
      setCloseError('Önce açık vardiyayı kapatın.');
      return;
    }
    setClosingDay(true);
    setCloseError(null);
    setCloseSuccess(null);
    try {
      const { error } = await (supabase as any).rpc('close_business_day', {
        p_branch_id: effectiveBranchForShift,
        p_business_date: businessDate,
        p_notes: null,
      });
      if (error) throw error;
      setCloseSuccess('Gün başarıyla kapatıldı.');
      await refreshShift();
      await loadStats();
    } catch (e: any) {
      setCloseError(e?.message || 'Gün kapatılamadı');
    } finally {
      setClosingDay(false);
    }
  };

  useEffect(() => {
    if (tenant) loadStats();
  }, [tenant, startDT, endDT, selectedBranch]);

  const loadStats = async () => {
    if (!tenant) return;
    setLoading(true);

    const startDate = new Date(startDT);
    const endDate = new Date(endDT);

    let ordersQuery = supabase
      .from('orders')
      .select('*, order_items(*, products(name))')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    const effectiveBranch = !isOwnerOrAdmin && activeBranch ? activeBranch.id : selectedBranch;
    if (effectiveBranch !== 'all') {
      ordersQuery = ordersQuery.eq('branch_id', effectiveBranch);
    }

    let txQuery = supabase
      .from('cash_register_transactions')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (effectiveBranch !== 'all') {
      txQuery = txQuery.eq('branch_id', effectiveBranch);
    }

    const [{ data: orders }, { data: transactions }] = await Promise.all([
      ordersQuery,
      txQuery,
    ]);

    const ordersData = orders || [];
    const txData = transactions || [];

    const completed = ordersData.filter(o => o.status === 'completed');
    const cancelled = ordersData.filter(o => o.status === 'cancelled');

    const cashRevenue = txData
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'cash')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cardRevenue = txData
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'credit_card')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const openAccRevenue = txData
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'open_account')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalRevenue = cashRevenue + cardRevenue + openAccRevenue;

    const expenses = txData
      .filter(t => t.transaction_type === 'expense')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashIn = txData
      .filter(t => t.transaction_type === 'cash_in')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashOut = txData
      .filter(t => t.transaction_type === 'cash_out')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const netCash = cashRevenue + cashIn - cashOut - expenses;

    const productMap: Record<string, { quantity: number; revenue: number }> = {};
    completed.forEach(order => {
      (order.order_items || []).forEach((item: any) => {
        const name = item.products?.name || 'Bilinmeyen';
        if (!productMap[name]) productMap[name] = { quantity: 0, revenue: 0 };
        productMap[name].quantity += item.quantity;
        productMap[name].revenue += item.total_amount;
      });
    });
    const topProducts = Object.entries(productMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const hourlyMap: Record<number, { revenue: number; orders: number }> = {};
    for (let h = 0; h < 24; h++) hourlyMap[h] = { revenue: 0, orders: 0 };
    completed.forEach(order => {
      const h = new Date(order.created_at).getHours();
      hourlyMap[h].revenue += order.total || 0;
      hourlyMap[h].orders += 1;
    });
    const hourlyRevenue = Object.entries(hourlyMap)
      .map(([hour, v]) => ({ hour: parseInt(hour), ...v }))
      .filter(h => h.orders > 0 || h.revenue > 0);

    setStats({
      totalRevenue,
      cashRevenue,
      cardRevenue,
      openAccountRevenue: openAccRevenue,
      totalOrders: ordersData.length,
      dineInOrders: ordersData.filter(o => o.order_type === 'dine_in').length,
      takeawayOrders: ordersData.filter(o => o.order_type === 'takeaway').length,
      onlineOrders: ordersData.filter(o => o.order_type === 'delivery').length,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      topProducts,
      hourlyRevenue,
      expenses,
      cashIn,
      cashOut,
      netCash,
      openTables: 0,
      totalCovers: 0,
    });
    setLoading(false);
  };

  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const dtOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const periodLabel = `${new Date(startDT).toLocaleString('tr-TR', dtOpts)} – ${new Date(endDT).toLocaleString('tr-TR', dtOpts)}`;

  const printEndOfDayReport = () => {
    if (!stats || !tenant) return;
    const printSettings = loadPrintSettings();
    const branchLabel = selectedBranch === 'all' ? 'Tüm Şubeler' : (branches.find(b => b.id === selectedBranch)?.name || '');
    const timeNow = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const html = `
      <div class="center bold xlarge">${printSettings.restaurantName || tenant.name || 'ŞefPOS'}</div>
      <div class="line"></div>
      <div class="center bold large">GÜN SONU RAPORU</div>
      <div class="center">${periodLabel}</div>
      <div class="center">${timeNow}</div>
      ${branchLabel ? `<div class="center">${branchLabel}</div>` : ''}
      <div class="line"></div>
      <div class="row bold"><span>ÖDEME YÖNTEMLERİ</span><span></span></div>
      <div class="line"></div>
      <div class="row"><span>Nakit</span><span>${fmt(stats.cashRevenue)} ₺</span></div>
      <div class="row"><span>Kredi Kartı</span><span>${fmt(stats.cardRevenue)} ₺</span></div>
      <div class="row"><span>Cari Hesap</span><span>${fmt(stats.openAccountRevenue)} ₺</span></div>
      <div class="line"></div>
      <div class="row bold"><span>TOPLAM CİRO</span><span>${fmt(stats.totalRevenue)} ₺</span></div>
      <div class="line"></div>
      <div class="row bold"><span>KASA ÖZETİ</span><span></span></div>
      <div class="line"></div>
      <div class="row"><span>Nakit Satış</span><span>+${fmt(stats.cashRevenue)} ₺</span></div>
      <div class="row"><span>Nakit Giriş</span><span>+${fmt(stats.cashIn)} ₺</span></div>
      <div class="row"><span>Nakit Çıkış</span><span>-${fmt(stats.cashOut)} ₺</span></div>
      <div class="row"><span>Giderler</span><span>-${fmt(stats.expenses)} ₺</span></div>
      <div class="line"></div>
      <div class="row bold"><span>NET KASA</span><span>${fmt(stats.netCash)} ₺</span></div>
      <div class="line"></div>
      <div class="row bold"><span>SİPARİŞ ÖZETİ</span><span></span></div>
      <div class="line"></div>
      <div class="row"><span>Toplam Sipariş</span><span>${stats.totalOrders}</span></div>
      <div class="row"><span>Tamamlanan</span><span>${stats.completedOrders}</span></div>
      <div class="row"><span>İptal Edilen</span><span>${stats.cancelledOrders}</span></div>
      <div class="row"><span>Ort. Sipariş Tutarı</span><span>${fmt(stats.avgOrderValue)} ₺</span></div>
      <div class="line"></div>
      ${stats.topProducts.length > 0 ? `
      <div class="row bold"><span>EN ÇOK SATANLAR</span><span></span></div>
      <div class="line"></div>
      ${stats.topProducts.slice(0, 5).map((p, i) => `<div class="row"><span>${i + 1}. ${p.name}</span><span>${p.quantity} adet</span></div>`).join('')}
      <div class="line"></div>
      ` : ''}
      <div class="footer">Sistem tarafından oluşturuldu</div>
      <br><br><br>
    `;

    printHtml(html, printSettings.defaultReceiptPrinter || '');
  };

  const toggleSection = (s: string) => setExpandedSection(prev => prev === s ? null : s);

  const SectionHeader = ({ id, title, icon: Icon, color }: { id: string; title: string; icon: any; color: string }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-slate-800">{title}</span>
      </div>
      {expandedSection === id ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
    </button>
  );

  const maxHourlyRevenue = stats ? Math.max(...stats.hourlyRevenue.map(h => h.revenue), 1) : 1;

  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800">Gün Sonu Raporu</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {periodLabel}
                {isManager && activeBranch && (
                  <span className="ml-2 text-orange-600 font-semibold">— {activeBranch.name}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isOwnerOrAdmin && branches.length > 1 && (
                <select
                  value={selectedBranch}
                  onChange={e => setSelectedBranch(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white"
                >
                  <option value="all">Tüm Şubeler</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
              {stats && (
                <button
                  onClick={printEndOfDayReport}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition text-sm font-semibold text-slate-600"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">Fiş Yazdır</span>
                </button>
              )}
              <button
                onClick={loadStats}
                disabled={loading}
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Day status / close-day banner */}
          {todayClosure ? (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-center gap-3">
              <Lock className="w-6 h-6 text-amber-700" />
              <div className="flex-1">
                <p className="font-black text-amber-900">Bu gün kapatıldı</p>
                <p className="text-xs text-amber-800">{formatBusinessDateTR(todayClosure.business_date)} • {new Date(todayClosure.closed_at).toLocaleString('tr-TR')}</p>
              </div>
            </div>
          ) : (
            permissions.can_end_of_day && effectiveBranchForShift && (
              <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 p-4 flex items-start md:items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800">Gün Sonu Kapatma</p>
                  <p className="text-xs text-slate-600">
                    Bütün vardiyalar kapatıldıktan sonra {formatBusinessDateTR(businessDate)} işgününü kilitleyin.
                    {activeShift && <span className="ml-1 text-rose-700 font-bold">Şu an açık vardiya var: {activeShift.shift_name}</span>}
                  </p>
                </div>
                <button
                  onClick={handleCloseDay}
                  disabled={closingDay || !!activeShift}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-black px-4 py-2.5 rounded-lg shadow disabled:opacity-50 flex items-center gap-2"
                >
                  {closingDay ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Günü Kapat
                </button>
              </div>
            )
          )}
          {closeError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span className="flex-1 whitespace-pre-line">{closeError}</span>
            </div>
          )}
          {closeSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm p-3 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5" />
              <span className="flex-1">{closeSuccess}</span>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-orange-500" />
              <span className="font-bold text-slate-700 text-sm">Tarih & Saat Aralığı</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Başlangıç
                </label>
                <input
                  type="datetime-local"
                  value={startDT}
                  onChange={e => setStartDT(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Bitiş
                </label>
                <input
                  type="datetime-local"
                  value={endDT}
                  onChange={e => setEndDT(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white"
                />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                {
                  label: 'Bugünün İşgünü (06:00–04:00)',
                  action: () => { const r = getBusinessDayRange(); setStartDT(toLocalDT(r.start)); setEndDT(toLocalDT(r.end)); }
                },
                {
                  label: 'Dünün İşgünü',
                  action: () => {
                    const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(6, 0, 0, 0);
                    const e = new Date(); e.setHours(4, 0, 0, 0);
                    setStartDT(toLocalDT(s)); setEndDT(toLocalDT(e));
                  }
                },
                {
                  label: 'Bu Hafta',
                  action: () => {
                    const s = new Date(); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); s.setHours(6, 0, 0, 0);
                    const e = new Date(); e.setDate(e.getDate() + 1); e.setHours(4, 0, 0, 0);
                    setStartDT(toLocalDT(s)); setEndDT(toLocalDT(e));
                  }
                },
                {
                  label: 'Bu Ay',
                  action: () => {
                    const s = new Date(); s.setDate(1); s.setHours(6, 0, 0, 0);
                    const e = new Date(); e.setDate(e.getDate() + 1); e.setHours(4, 0, 0, 0);
                    setStartDT(toLocalDT(s)); setEndDT(toLocalDT(e));
                  }
                },
              ].map(p => (
                <button key={p.label} onClick={p.action}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-all">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : stats ? (
          <div className="space-y-4">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Toplam Ciro', value: `${fmt(stats.totalRevenue)} ₺`, icon: DollarSign, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
                { label: 'Toplam Sipariş', value: stats.totalOrders, icon: ShoppingCart, color: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
                { label: 'Tamamlanan', value: stats.completedOrders, icon: CheckCircle, color: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-700' },
                { label: 'Ort. Sipariş', value: `${fmt(stats.avgOrderValue)} ₺`, icon: BarChart3, color: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
              ].map(({ label, value, icon: Icon, color, bg, text }) => (
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

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader id="payments" title="Ödeme Yöntemleri" icon={CreditCard} color="bg-blue-500" />
              {expandedSection === 'payments' && (
                <div className="px-6 pb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Nakit', value: stats.cashRevenue, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
                      { label: 'Kredi Kartı', value: stats.cardRevenue, icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500' },
                      { label: 'Cari Hesap', value: stats.openAccountRevenue, icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' },
                    ].map(({ label, value, icon: Icon, color, bg, bar }) => {
                      const pct = stats.totalRevenue > 0 ? (value / stats.totalRevenue) * 100 : 0;
                      return (
                        <div key={label} className={`${bg} rounded-xl p-4`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className={`text-sm font-bold ${color}`}>{label}</span>
                          </div>
                          <p className={`text-2xl font-black ${color}`}>{fmt(value)} ₺</p>
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-slate-500 mb-1">
                              <span>Oran</span>
                              <span>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                              <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader id="orders" title="Sipariş Dağılımı" icon={ShoppingCart} color="bg-orange-500" />
              {expandedSection === 'orders' && (
                <div className="px-6 pb-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Masa Siparişi', value: stats.dineInOrders, color: 'text-slate-700', bg: 'bg-slate-50' },
                      { label: 'Paket Servis', value: stats.takeawayOrders, color: 'text-orange-700', bg: 'bg-orange-50' },
                      { label: 'Online Sipariş', value: stats.onlineOrders, color: 'text-blue-700', bg: 'bg-blue-50' },
                      { label: 'İptal Edilen', value: stats.cancelledOrders, color: 'text-red-700', bg: 'bg-red-50' },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} className={`${bg} rounded-xl p-4 text-center`}>
                        <p className={`text-3xl font-black ${color}`}>{value}</p>
                        <p className="text-xs font-semibold text-slate-500 mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <SectionHeader id="cash" title="Kasa Özeti" icon={Banknote} color="bg-emerald-500" />
              {expandedSection === 'cash' && (
                <div className="px-6 pb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      {[
                        { label: 'Nakit Satış', value: stats.cashRevenue, icon: TrendingUp, color: 'text-emerald-600' },
                        { label: 'Nakit Giriş', value: stats.cashIn, icon: TrendingUp, color: 'text-emerald-600' },
                        { label: 'Nakit Çıkış', value: -stats.cashOut, icon: TrendingDown, color: 'text-red-600' },
                        { label: 'Giderler', value: -stats.expenses, icon: TrendingDown, color: 'text-red-600' },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className="text-sm text-slate-600">{label}</span>
                          </div>
                          <span className={`font-bold text-sm ${color}`}>
                            {value >= 0 ? '+' : ''}{fmt(value)} ₺
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={`rounded-xl p-5 flex flex-col items-center justify-center ${stats.netCash >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <p className="text-xs font-bold uppercase text-slate-500 tracking-wide mb-2">Net Kasa</p>
                      <p className={`text-4xl font-black ${stats.netCash >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmt(stats.netCash)} ₺
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {stats.hourlyRevenue.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <SectionHeader id="hourly" title="Saatlik Ciro" icon={Clock} color="bg-slate-600" />
                {expandedSection === 'hourly' && (
                  <div className="px-6 pb-6">
                    <div className="flex items-end gap-2 h-40 overflow-x-auto pb-2">
                      {Array.from({ length: 24 }, (_, h) => {
                        const data = stats.hourlyRevenue.find(x => x.hour === h) || { revenue: 0, orders: 0 };
                        const height = maxHourlyRevenue > 0 ? (data.revenue / maxHourlyRevenue) * 100 : 0;
                        return (
                          <div key={h} className="flex flex-col items-center gap-1 min-w-[28px] flex-1">
                            <div className="w-full relative flex justify-center" style={{ height: '120px' }}>
                              {data.revenue > 0 && (
                                <div className="absolute bottom-0 w-full group relative">
                                  <div
                                    className="w-full bg-orange-400 rounded-t-sm hover:bg-orange-500 transition cursor-default"
                                    style={{ height: `${height}%`, minHeight: data.revenue > 0 ? '4px' : '0' }}
                                  />
                                  {data.revenue > 0 && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-10 pointer-events-none">
                                      {fmt(data.revenue)} ₺<br />{data.orders} sipariş
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">{h.toString().padStart(2, '0')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {stats.topProducts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <SectionHeader id="products" title="En Çok Satan Ürünler" icon={BarChart3} color="bg-blue-500" />
                {expandedSection === 'products' && (
                  <div className="px-6 pb-6">
                    <div className="space-y-3">
                      {stats.topProducts.map((p, i) => {
                        const maxRev = stats.topProducts[0]?.revenue || 1;
                        const pct = (p.revenue / maxRev) * 100;
                        return (
                          <div key={p.name} className="flex items-center gap-4">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-slate-300'}`}>
                              {i + 1}
                            </span>
                            <div className="flex-1">
                              <div className="flex justify-between mb-1">
                                <span className="text-sm font-semibold text-slate-700">{p.name}</span>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                  <span>{p.quantity} adet</span>
                                  <span className="font-bold text-slate-700">{fmt(p.revenue)} ₺</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3 mb-4">
                <FileText className="w-5 h-5 text-orange-400" />
                <h3 className="font-bold text-lg">Gün Sonu Özeti</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {[
                  { label: 'Toplam Ciro', value: `${fmt(stats.totalRevenue)} ₺`, color: 'text-emerald-400' },
                  { label: 'Net Kasa', value: `${fmt(stats.netCash)} ₺`, color: stats.netCash >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Sipariş', value: `${stats.completedOrders} / ${stats.totalOrders}`, color: 'text-blue-400' },
                  { label: 'Ort. Sipariş', value: `${fmt(stats.avgOrderValue)} ₺`, color: 'text-orange-400' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <p className={`text-xl font-black ${color}`}>{value}</p>
                    <p className="text-xs text-slate-400 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
            <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">Bu tarih için veri bulunamadı</p>
          </div>
        )}
      </div>
    </div>
  );
}
