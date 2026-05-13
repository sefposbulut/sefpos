import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { loadPrintSettings } from '../lib/printService';
import { useActiveShift } from '../lib/useActiveShift';
import { computeBusinessDate, formatBusinessDateTR, getBusinessDayRange as getBusinessDayRangeLib } from '../lib/businessDay';
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Clock, Calendar, Printer, RefreshCw,
  Banknote, CreditCard, FileText, CheckCircle, XCircle,
  ChevronDown, ChevronUp, Building2, Lock, AlertTriangle, X
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
  cancelledRevenue: number;
  itemCancelCount: number;
  itemCancelRevenue: number;
  avgOrderValue: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  hourlyRevenue: { hour: number; revenue: number; orders: number }[];
  expenses: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  openTables: number;
  totalCovers: number;
  /** Kasa ekranından iptal (void) edilen hareket sayısı — cirodan düşmüş, kayıt silinmemiştir. */
  voidedCashRegisterCount: number;
}

interface EndOfDayProps {
  onClose?: () => void;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toLocalDT(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


export function EndOfDay({ onClose }: EndOfDayProps) {
  const { tenant, activeBranch, branches, isOwnerOrAdmin, isManager, permissions, profile, user, businessDayStartHour, businessDayMode, currentBusinessDate, businessDayHoursOpen } = useAuth();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranch?.id || 'all');
  const [expandedSection, setExpandedSection] = useState<string | null>('summary');
  const [startDT, setStartDT] = useState<string>(() => {
    return toLocalDT(getBusinessDayRangeLib(new Date(), businessDayStartHour).start);
  });
  const [endDT, setEndDT] = useState<string>(() => {
    return toLocalDT(getBusinessDayRangeLib(new Date(), businessDayStartHour).end);
  });
  const [closingDay, setClosingDay] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [openTables, setOpenTables] = useState<Array<{ id: string; table_number: string }>>([]);
  const [pendingOrders, setPendingOrders] = useState<Array<{ id: string; order_number: string | null; total: number | null; order_type: string; status: string; table_id: string | null; created_at?: string }>>([]);
  const [showPendingList, setShowPendingList] = useState(false);
  const [completingPending, setCompletingPending] = useState(false);
  const [reopening, setReopening] = useState(false);

  // Bekleyen siparis tipi etiketi
  const orderTypeLabel = (t: string): string => {
    if (t === 'dine_in') return 'Masa';
    if (t === 'takeaway') return 'Paket';
    if (t === 'delivery') return 'Online';
    return t || 'Diğer';
  };

  // Tum bekleyen siparisleri (kapatilacak sube icin) "completed" olarak isaretle.
  // Yalnizca tipik orphan kayitlari icin: tamamlanmamis paket/online/eski siparisler.
  const completeAllPending = async () => {
    if (!effectiveBranchForShift || pendingOrders.length === 0) return;
    if (!confirm(`${pendingOrders.length} bekleyen sipariş "tamamlandı" olarak işaretlenecek.\n\nBunu yalnızca bu siparişlerin gerçekten tamamlandığından eminseniz yapın.\nDevam edilsin mi?`)) return;
    setCompletingPending(true);
    setCloseError(null);
    try {
      const ids = pendingOrders.map(o => o.id);
      const { error } = await (supabase as any)
        .from('orders')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      setCloseSuccess(`${ids.length} sipariş tamamlandı olarak işaretlendi.`);
      await loadStats();
    } catch (e: any) {
      setCloseError(e?.message || 'Siparişler güncellenemedi');
    } finally {
      setCompletingPending(false);
    }
  };

  // Sadece "orphan" (masasi kapali ya da silinmis) bekleyenleri otomatik temizler.
  // Gercek bekleyen masalar / paket / online dokunulmaz.
  const autoCleanupOrphans = async () => {
    if (!tenant || !effectiveBranchForShift) return;
    setCompletingPending(true);
    setCloseError(null);
    setCloseSuccess(null);
    try {
      const { data, error } = await (supabase as any).rpc('cleanup_orphan_pending_orders', {
        p_tenant_id: tenant.id,
        p_branch_id: effectiveBranchForShift,
      });
      if (error) throw error;
      const n = Number(data || 0);
      if (n > 0) {
        setCloseSuccess(`${n} orphan (masası kapalı) sipariş otomatik tamamlandı olarak işaretlendi.`);
      } else {
        setCloseSuccess('Otomatik temizlenecek orphan sipariş bulunamadı.');
      }
      await loadStats();
    } catch (e: any) {
      setCloseError(e?.message || 'Otomatik temizlik başarısız');
    } finally {
      setCompletingPending(false);
    }
  };

  const handleReopenDay = async () => {
    if (!todayClosure) return;
    if (!confirm('Bu kapatılmış günü yeniden açmak istiyor musunuz?\n\nGünü yeniden açtığınızda yeni vardiya açılabilir, satışlar bu güne işlenir. Bu işlem audit kaydı bırakır.')) return;
    setReopening(true);
    setCloseError(null);
    try {
      const { error } = await (supabase as any).rpc('reopen_business_day', { p_id: (todayClosure as any).id });
      if (error) throw error;
      setCloseSuccess('Gün yeniden açıldı.');
      await refreshShift();
      await loadStats();
    } catch (e: any) {
      setCloseError(e?.message || 'Gün yeniden açılamadı');
    } finally {
      setReopening(false);
    }
  };

  const effectiveBranchForShift = isOwnerOrAdmin ? (selectedBranch !== 'all' ? selectedBranch : null) : (activeBranch?.id || null);
  const { activeShift, todayClosure, refresh: refreshShift } = useActiveShift({
    tenantId: tenant?.id || null,
    branchId: effectiveBranchForShift,
    enabled: !!tenant,
    cutoffHour: businessDayStartHour,
  });
  // Manuel modda: AuthContext'ten gelen RPC sonucunu kullan; cutoff modunda lokal hesap.
  const businessDate = useMemo(() => {
    if (businessDayMode === 'manual' && currentBusinessDate) return currentBusinessDate;
    return computeBusinessDate(new Date(), businessDayStartHour);
  }, [businessDayMode, currentBusinessDate, businessDayStartHour]);

  const requestCloseDay = () => {
    setCloseError(null);
    setCloseSuccess(null);
    if (!effectiveBranchForShift) {
      setCloseError('Şube seçimi gerekli (Tüm Şubeler ile gün kapatılamaz).');
      return;
    }
    setShowCloseConfirm(true);
  };

  const confirmCloseDay = async () => {
    if (!effectiveBranchForShift) return;
    if (activeShift) {
      setCloseError('Önce açık vardiyayı kapatın.');
      setShowCloseConfirm(false);
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
      setShowCloseConfirm(false);
      await refreshShift();
      await loadStats();
    } catch (e: any) {
      setCloseError(e?.message || 'Gün kapatılamadı');
    } finally {
      setClosingDay(false);
    }
  };

  // activeBranch ilk render'da null olabilir; sonra geldiginde
  // selectedBranch hala 'all' kalmasin, kullanicinin bulundugu subeye senkronize et.
  useEffect(() => {
    if (activeBranch?.id && selectedBranch === 'all') {
      setSelectedBranch(activeBranch.id);
    }
  }, [activeBranch?.id]);

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

    let cancelLogsQuery = (supabase as any)
      .from('order_cancel_logs')
      .select('quantity, unit_price, branch_id')
      .eq('tenant_id', tenant.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    if (effectiveBranch !== 'all') {
      cancelLogsQuery = cancelLogsQuery.eq('branch_id', effectiveBranch);
    }

    const [{ data: orders }, { data: transactions }, { data: cancelLogs }] = await Promise.all([
      ordersQuery,
      txQuery,
      cancelLogsQuery,
    ]);

    const ordersData = orders || [];
    const txData = transactions || [];
    const txActive = txData.filter((t: any) => !t.voided_at);
    const voidedCashCount = txData.filter((t: any) => t.voided_at).length;
    const cancelLogsData = (cancelLogs || []) as Array<{ quantity: number; unit_price: number }>;

    const completed = ordersData.filter(o => o.status === 'completed');
    const cancelled = ordersData.filter(o => o.status === 'cancelled');
    const cancelledRevenue = cancelled.reduce((s, o: any) => s + Number(o.total || o.total_amount || 0), 0);
    const itemCancelCount = cancelLogsData.reduce((s, l) => s + Number(l.quantity || 0), 0);
    const itemCancelRevenue = cancelLogsData.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);

    const cashRevenue = txActive
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'cash')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cardRevenue = txActive
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'credit_card')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const openAccRevenue = txActive
      .filter(t => t.transaction_type === 'order_payment' && t.payment_method === 'open_account')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const totalRevenue = cashRevenue + cardRevenue + openAccRevenue;

    const expenses = txActive
      .filter(t => t.transaction_type === 'expense')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashIn = txActive
      .filter(t => t.transaction_type === 'cash_in')
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const cashOut = txActive
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

    // Acik masa + bekleyen siparis sayilari (KAPANIS kontrolu icin)
    // Onemli: gun sonu kapanisi her zaman TEK bir sube icin yapilir.
    // Admin "Tum Subeler" gorunumunde olsa bile bu uyarilar yalnizca
    // kapatilacak subeye (effectiveBranchForShift) ait olmalidir.
    const closeBranchId = effectiveBranchForShift;
    if (closeBranchId) {
      const tablesQuery = (supabase as any)
        .from('restaurant_tables')
        .select('id, table_number, status, current_order_id, branch_id')
        .eq('tenant_id', tenant.id)
        .eq('branch_id', closeBranchId)
        .neq('status', 'available');

      const pendingQuery = (supabase as any)
        .from('orders')
        .select('id, order_number, total, status, order_type, table_id, branch_id, created_at')
        .eq('tenant_id', tenant.id)
        .eq('branch_id', closeBranchId)
        .in('status', ['pending', 'preparing', 'ready', 'served', 'in_progress', 'open'])
        .order('created_at', { ascending: false });

      const [{ data: openTbls }, { data: pendingOrds }] = await Promise.all([tablesQuery, pendingQuery]);
      setOpenTables(((openTbls || []) as Array<{ id: string; table_number: string }>));
      setPendingOrders(((pendingOrds || []) as any));
    } else {
      setOpenTables([]);
      setPendingOrders([]);
    }

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
      cancelledRevenue,
      itemCancelCount,
      itemCancelRevenue,
      avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      topProducts,
      hourlyRevenue,
      expenses,
      cashIn,
      cashOut,
      netCash,
      openTables: 0, // setOpenTables zaten ayrica state'i guncelliyor
      totalCovers: 0,
      voidedCashRegisterCount: voidedCashCount,
    });
    setLoading(false);
  };

  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const dtOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  const periodLabel = `${new Date(startDT).toLocaleString('tr-TR', dtOpts)} – ${new Date(endDT).toLocaleString('tr-TR', dtOpts)}`;

  /**
   * Gun sonu raporunu tarayicinin yerel yazdirma dialogu ile bastirir.
   * 80 mm fis genisliginde sayfa acilir; kullanici yazici ve seceneklerini
   * kendi secer (Chrome / Edge / Firefox PDF / fiziksel termal yazici).
   */
  const printEndOfDayReport = () => {
    if (!stats || !tenant) return;
    const printSettings = loadPrintSettings();
    const branchLabel = selectedBranch === 'all' ? 'Tüm Şubeler' : (branches.find(b => b.id === selectedBranch)?.name || '');
    const timeNow = new Date().toLocaleString('tr-TR');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>Gün Sonu Raporu — ${formatBusinessDateTR(businessDate)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #000;
    width: 74mm;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  * { color: #000; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 700; }
  .xlarge { font-size: 17px; font-weight: 700; letter-spacing: 0.5px; }
  .large { font-size: 14px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
  .section { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 6px; }
  .small { font-size: 11px; font-weight: 500; }
  .muted { font-weight: 500; }
  .line { border-top: 1px solid #000; margin: 5px 0; }
  .double { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
  .row .l { flex: 1; font-weight: 500; }
  .row .r { white-space: nowrap; font-weight: 700; font-variant-numeric: tabular-nums; }
  .row.bold .l, .row.bold .r { font-weight: 700; }
  .row.neg .r { color: #000; }
  .totalbox {
    background: #000;
    color: #fff;
    padding: 8px 12px;
    margin: 8px 0;
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .totalbox * { color: #fff; }
  .meta { font-size: 11px; font-weight: 500; line-height: 1.5; }
  .meta b { font-weight: 700; }
  .signature {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 2px solid #000;
    font-size: 12px;
    line-height: 1.55;
    color: #000;
  }
  .signature * { color: #000; }
  .signature .lbl { font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; font-size: 11px; margin-bottom: 2px; }
  .signature .name { font-weight: 700; font-size: 13px; }
  .signature .info { font-weight: 600; font-size: 11px; }
  .footer { margin-top: 8px; text-align: center; font-size: 10px; font-weight: 500; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="center xlarge">${printSettings.restaurantName || tenant.name || 'ŞefPOS'}</div>
  <div class="center small">${branchLabel || ''}</div>
  <div class="line"></div>
  <div class="center large">Gün Sonu Raporu</div>
  <div class="center small"><b>${formatBusinessDateTR(businessDate)}</b></div>
  <div class="center small muted">${timeNow}</div>
  <div class="center small muted">Aralık: ${periodLabel}</div>
  <div class="double"></div>

  <div class="section">Ödeme Yöntemleri</div>
  <div class="line"></div>
  <div class="row"><span class="l">Nakit</span><span class="r">${fmt(stats.cashRevenue)} ₺</span></div>
  <div class="row"><span class="l">Kredi Kartı</span><span class="r">${fmt(stats.cardRevenue)} ₺</span></div>
  <div class="row"><span class="l">Cari Hesap</span><span class="r">${fmt(stats.openAccountRevenue)} ₺</span></div>
  <div class="totalbox"><span>Toplam Ciro</span><span>${fmt(stats.totalRevenue)} ₺</span></div>

  <div class="section">Kasa Özeti</div>
  <div class="line"></div>
  <div class="row"><span class="l">Nakit Satış</span><span class="r">+${fmt(stats.cashRevenue)} ₺</span></div>
  <div class="row"><span class="l">Nakit Giriş</span><span class="r">+${fmt(stats.cashIn)} ₺</span></div>
  <div class="row"><span class="l">Nakit Çıkış</span><span class="r">-${fmt(stats.cashOut)} ₺</span></div>
  <div class="row"><span class="l">Giderler</span><span class="r">-${fmt(stats.expenses)} ₺</span></div>
  <div class="line"></div>
  <div class="row bold"><span class="l">Net Kasa</span><span class="r">${fmt(stats.netCash)} ₺</span></div>
  ${stats.voidedCashRegisterCount > 0 ? `<div class="row small muted"><span class="l">Kasa satırı iptali (void)</span><span class="r">${stats.voidedCashRegisterCount} kayıt — cirodan düşülmüştür, satır silinmemiştir</span></div>` : ''}
  <div class="double"></div>

  <div class="section">Sipariş Özeti</div>
  <div class="line"></div>
  <div class="row"><span class="l">Toplam Sipariş</span><span class="r">${stats.totalOrders}</span></div>
  <div class="row"><span class="l">Tamamlanan</span><span class="r">${stats.completedOrders}</span></div>
  <div class="row"><span class="l">Masa Siparişi</span><span class="r">${stats.dineInOrders}</span></div>
  <div class="row"><span class="l">Paket Servis</span><span class="r">${stats.takeawayOrders}</span></div>
  <div class="row"><span class="l">Online Sipariş</span><span class="r">${stats.onlineOrders}</span></div>
  <div class="line"></div>
  <div class="row"><span class="l">Ort. Sipariş Tutarı</span><span class="r">${fmt(stats.avgOrderValue)} ₺</span></div>
  <div class="double"></div>

  <div class="section">İptaller</div>
  <div class="line"></div>
  <div class="row"><span class="l">İptal Edilen Sipariş</span><span class="r">${stats.cancelledOrders} ad</span></div>
  <div class="row"><span class="l">İptal Sipariş Tutarı</span><span class="r">${fmt(stats.cancelledRevenue)} ₺</span></div>
  <div class="row"><span class="l">İptal Edilen Ürün</span><span class="r">${stats.itemCancelCount} ad</span></div>
  <div class="row"><span class="l">İptal Ürün Tutarı</span><span class="r">${fmt(stats.itemCancelRevenue)} ₺</span></div>
  <div class="line"></div>
  <div class="row bold"><span class="l">TOPLAM İPTAL</span><span class="r">${fmt(stats.cancelledRevenue + stats.itemCancelRevenue)} ₺</span></div>

  ${stats.topProducts.length > 0 ? `
  <div class="double"></div>
  <div class="section">En Çok Satanlar</div>
  <div class="line"></div>
  ${stats.topProducts.slice(0, 8).map((p, i) => `<div class="row"><span class="l">${i + 1}. ${p.name}</span><span class="r">${p.quantity} ad / ${fmt(p.revenue)} ₺</span></div>`).join('')}
  ` : ''}
  ${(openTables.length > 0 || pendingOrders.length > 0) ? `
  <div class="double"></div>
  <div class="section">Uyarı</div>
  <div class="line"></div>
  ${openTables.length > 0 ? `<div class="row"><span class="l">Açık Masa</span><span class="r">${openTables.length}</span></div>` : ''}
  ${pendingOrders.length > 0 ? `<div class="row"><span class="l">Bekleyen Sipariş</span><span class="r">${pendingOrders.length}</span></div>` : ''}
  ` : ''}

  <div class="signature">
    <div class="lbl">Raporu Alan / Günü Kapatan</div>
    <div class="name">${(profile?.full_name || profile?.email || user?.email || '-')}</div>
    ${profile?.role ? `<div class="info">Yetki: ${profile.role}</div>` : ''}
    <div class="info">Tarih/Saat: ${timeNow}</div>
  </div>
  <div class="footer">Bu rapor ŞefPOS tarafından otomatik oluşturulmuştur.</div>
  <br/><br/>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.focus(); window.print(); }, 200);
    });
  </script>
</body>
</html>`;

    const w = window.open('', 'sefpos-end-of-day', 'width=420,height=900');
    if (!w) {
      setCloseError('Pop-up engelleyici yazdırma penceresini bloke etti. Tarayıcı pop-up izni verip tekrar deneyin.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
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
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-start gap-3 flex-wrap">
              <Lock className="w-6 h-6 text-amber-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-black text-amber-900">Bu iş günü kapatıldı</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  <b>{formatBusinessDateTR(todayClosure.business_date)}</b> • Kapatma: {new Date(todayClosure.closed_at).toLocaleString('tr-TR')}
                </p>
                <p className="text-xs text-amber-800 mt-1.5 leading-relaxed">
                  Yeni satışlar yarın <b>06:00</b>'da otomatik başlayacak yeni iş gününe yazılır.
                  Yeni vardiya açmak için yeni günün başlamasını bekleyin.
                  {isOwnerOrAdmin && ' Hatalı bir kapanış ise yan taraftaki "Günü Yeniden Aç" butonunu kullanabilirsiniz.'}
                </p>
              </div>
              {isOwnerOrAdmin && (
                <button
                  onClick={handleReopenDay}
                  disabled={reopening}
                  className="bg-white hover:bg-amber-100 border-2 border-amber-300 text-amber-800 font-black px-4 py-2 rounded-lg shadow-sm text-sm flex items-center gap-2 disabled:opacity-50"
                  title="Bu günü yeniden açar — sadece yönetici"
                >
                  {reopening ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Günü Yeniden Aç
                </button>
              )}
            </div>
          ) : (
            permissions.can_end_of_day && effectiveBranchForShift && (
              <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 p-4 flex items-start md:items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow shrink-0">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-800">
                    Gün Sonu Kapatma
                    {effectiveBranchForShift && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full align-middle">
                        <Building2 className="w-3 h-3" />
                        {branches.find(b => b.id === effectiveBranchForShift)?.name || 'Şube'}
                      </span>
                    )}
                    <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full align-middle ${
                      businessDayMode === 'manual'
                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        : 'bg-sky-100 text-sky-800 border border-sky-200'
                    }`}>
                      {businessDayMode === 'manual'
                        ? 'MANUEL MOD (24/7)'
                        : `OTOMATİK · ${String(businessDayStartHour).padStart(2,'0')}:00 başlangıç`}
                    </span>
                  </p>
                  <p className="text-xs text-slate-600">
                    Bütün vardiyalar kapatıldıktan sonra {formatBusinessDateTR(businessDate)} işgününü kilitleyin.
                    {activeShift && <span className="ml-1 text-rose-700 font-bold">Şu an açık vardiya var: {activeShift.shift_name}</span>}
                  </p>
                  {businessDayMode === 'manual' && businessDayHoursOpen !== null && businessDayHoursOpen >= 20 && (
                    <p className="text-[11px] text-amber-700 mt-1 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Bu iş günü <b>{Math.round(businessDayHoursOpen)} saattir</b> açık. Kapatmayı düşünebilirsiniz.
                    </p>
                  )}
                  {(openTables.length > 0 || pendingOrders.length > 0) && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {openTables.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> {openTables.length} açık masa
                        </span>
                      )}
                      {pendingOrders.length > 0 && (
                        <>
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> {pendingOrders.length} bekleyen sipariş
                          </span>
                          {(() => {
                            const grp: Record<string, number> = {};
                            pendingOrders.forEach(o => { const k = orderTypeLabel(o.order_type); grp[k] = (grp[k] || 0) + 1; });
                            return Object.entries(grp).map(([k, n]) => (
                              <span key={k} className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                {n} × {k}
                              </span>
                            ));
                          })()}
                          <button
                            onClick={() => setShowPendingList(s => !s)}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline"
                          >
                            {showPendingList ? 'Listeyi Kapat' : 'Listele'}
                          </button>
                          {isOwnerOrAdmin && (
                            <button
                              onClick={autoCleanupOrphans}
                              disabled={completingPending}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full disabled:opacity-50 inline-flex items-center gap-1"
                              title="Masası kapalı / silinmiş orphan siparişleri otomatik temizle"
                            >
                              {completingPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Otomatik Temizle
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {showPendingList && pendingOrders.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2 max-h-44 overflow-y-auto text-[11px] space-y-1">
                      {pendingOrders.map(o => (
                        <div key={o.id} className="flex items-center justify-between gap-2 bg-white border border-amber-100 rounded px-2 py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-700 truncate">#{o.order_number || o.id.slice(0, 8)}</span>
                            <span className="text-slate-500">{orderTypeLabel(o.order_type)}</span>
                            <span className="text-slate-400 italic">{o.status}</span>
                          </div>
                          <span className="text-slate-700 font-bold whitespace-nowrap">{fmt(Number(o.total || 0))} ₺</span>
                        </div>
                      ))}
                      <div className="pt-1.5 flex items-center justify-end">
                        <button
                          onClick={completeAllPending}
                          disabled={completingPending}
                          className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1"
                          title="Bu siparişleri tamamlandı olarak işaretle"
                        >
                          {completingPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Tümünü Tamamlandı İşaretle
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={requestCloseDay}
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
                  label: `Bugünün İşgünü (${String(businessDayStartHour).padStart(2,'0')}:00 başlangıçlı)`,
                  action: () => { const r = getBusinessDayRangeLib(new Date(), businessDayStartHour); setStartDT(toLocalDT(r.start)); setEndDT(toLocalDT(r.end)); }
                },
                {
                  label: 'Dünün İşgünü',
                  action: () => {
                    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
                    const r = getBusinessDayRangeLib(yesterday, businessDayStartHour);
                    setStartDT(toLocalDT(r.start)); setEndDT(toLocalDT(r.end));
                  }
                },
                {
                  label: 'Bu Hafta',
                  action: () => {
                    const cutoff = businessDayStartHour;
                    const s = new Date(); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); s.setHours(cutoff, 0, 0, 0);
                    const endHour = cutoff - 2 < 0 ? cutoff - 2 + 24 : cutoff - 2;
                    const e = new Date(); e.setDate(e.getDate() + 1); e.setHours(endHour, 0, 0, 0);
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
              {stats.voidedCashRegisterCount > 0 && (
                <p className="text-xs text-amber-200/95 mt-4 text-center leading-relaxed">
                  Kasa ekranından iptal edilen hareket: <b>{stats.voidedCashRegisterCount}</b> satır
                  (gerekçe ile kayıt altında; tutarlar yukarıdaki özette düşülmüştür).
                </p>
              )}
            </div>

          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
            <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">Bu tarih için veri bulunamadı</p>
          </div>
        )}
      </div>

      {/* Gun sonu kapatma onay modal'i */}
      {showCloseConfirm && stats && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-3" onClick={() => !closingDay && setShowCloseConfirm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 text-white flex items-start gap-3 ${(activeShift || openTables.length > 0 || pendingOrders.length > 0) ? 'bg-gradient-to-r from-rose-600 to-orange-600' : 'bg-gradient-to-r from-slate-800 to-slate-900'}`}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest opacity-90">Gün Sonu Kapatma</p>
                <h3 className="text-lg font-black truncate">{formatBusinessDateTR(businessDate)}</h3>
                <p className="text-xs opacity-90 mt-0.5 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {effectiveBranchForShift
                    ? (branches.find(b => b.id === effectiveBranchForShift)?.name || 'Şube')
                    : 'Şube seçilmedi'}
                </p>
              </div>
              <button onClick={() => !closingDay && setShowCloseConfirm(false)} disabled={closingDay} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              {/* Uyarilar */}
              {(activeShift || openTables.length > 0 || pendingOrders.length > 0) && (
                <div className="rounded-xl bg-rose-50 border-2 border-rose-200 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-black text-sm">
                    <AlertTriangle className="w-4 h-4" /> Dikkat — kapatmadan önce kontrol edin
                  </div>
                  <div className="space-y-1.5">
                    {activeShift && (
                      <div className="flex items-start gap-2 text-sm text-rose-800">
                        <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span><b>Açık vardiya:</b> {activeShift.shift_name} — gün kapatmak için önce vardiyayı bitirin.</span>
                      </div>
                    )}
                    {openTables.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-rose-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          <b>{openTables.length} açık masa</b> var:{' '}
                          <span className="text-xs">
                            {openTables.slice(0, 8).map(t => t.table_number).join(', ')}
                            {openTables.length > 8 ? ` … +${openTables.length - 8}` : ''}
                          </span>
                        </span>
                      </div>
                    )}
                    {pendingOrders.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-rose-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span><b>{pendingOrders.length} bekleyen sipariş</b> var (henüz tamamlanmamış / iptal edilmemiş).</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-rose-700 mt-2">
                    Yine de kapatırsanız bu kayıtlar geçersiz duruma düşmez; ertesi gün de görünmeye devam eder ama gün <b>kilitli</b> sayılır ve yeni vardiya açılamaz.
                  </p>
                </div>
              )}

              {/* Ozet */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Toplam Ciro</span>
                  <span className="font-black text-slate-800">{fmt(stats.totalRevenue)} ₺</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Net Kasa</span>
                  <span className={`font-black ${stats.netCash >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(stats.netCash)} ₺</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Sipariş</span>
                  <span className="font-black text-slate-800">{stats.completedOrders} / {stats.totalOrders}</span>
                </div>
              </div>

              {/* Kapanis sonrasi davranis aciklamasi (TR/dunya standardi) */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-900 font-black text-sm">
                  <Lock className="w-4 h-4" /> Kapatınca ne olur?
                </div>
                <ul className="text-xs text-blue-900 space-y-1 list-disc pl-5">
                  <li>Bu gün için <b>yeni vardiya açılamaz</b> ve fişler yeni günün hesabına geçer.</li>
                  <li>Yeni iş günü otomatik olarak <b>yarın 06:00</b>'da başlar.</li>
                  <li>Z raporu <b>kalıcıdır</b>; ileride raporlarda her zaman görüntülenebilir.</li>
                  <li>Hatalı kapanışta yalnızca <b>yönetici</b> "Günü Yeniden Aç" yapabilir.</li>
                </ul>
              </div>

              {closeError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span className="flex-1 whitespace-pre-line">{closeError}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2 justify-end flex-wrap">
              <button
                onClick={printEndOfDayReport}
                disabled={closingDay}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-sm flex items-center gap-2"
                title="Gün sonu raporunu yazdır"
              >
                <Printer className="w-4 h-4" /> Raporu Yazdır
              </button>
              <button
                onClick={() => !closingDay && setShowCloseConfirm(false)}
                disabled={closingDay}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100"
              >
                Vazgeç
              </button>
              <button
                onClick={confirmCloseDay}
                disabled={closingDay || !!activeShift}
                className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black text-sm shadow disabled:opacity-50 flex items-center gap-2"
                title={activeShift ? 'Önce açık vardiyayı kapatın' : 'Günü kilitle'}
              >
                {closingDay ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {(openTables.length > 0 || pendingOrders.length > 0) ? 'Yine de Kapat' : 'Günü Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
