import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useActiveShift } from '../lib/useActiveShift';
import { computeBusinessDate, formatBusinessDateTR, shiftDurationLabel, suggestShiftNo, shiftIcon } from '../lib/businessDay';
import { loadPrintSettings } from '../lib/printService';
import { printShiftReport, loadShiftPrintFormat, saveShiftPrintFormat, type ShiftPrintFormat } from '../lib/shiftReportPrint';
import {
  Clock, PlayCircle, StopCircle, Banknote, AlertTriangle, CheckCircle,
  XCircle, RefreshCw, History, TrendingUp, TrendingDown, User, Lock,
  Layers, Plus, Minus, Calculator, Printer, Building2, Sun, Moon, Sunset,
  ShieldAlert, FileCheck2, Receipt, FileText as FileText2,
} from 'lucide-react';

interface ShiftDefinition {
  id: string;
  shift_no: number;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  branch_id: string | null;
}

interface ShiftRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  shift_no: number;
  shift_name: string;
  business_date: string;
  opened_by: string | null;
  opened_at: string;
  opening_cash: number;
  opening_cash_breakdown: Record<string, number> | null;
  closed_by: string | null;
  closed_at: string | null;
  closing_cash: number | null;
  closing_cash_breakdown: Record<string, number> | null;
  cash_revenue: number;
  card_revenue: number;
  open_account_revenue: number;
  total_revenue: number;
  expense_total: number;
  cash_in_total: number;
  cash_out_total: number;
  expected_cash: number;
  cash_difference: number;
  order_count: number;
  status: 'open' | 'closed';
  closing_notes?: string | null;
  opening_notes?: string | null;
  opener_name?: string | null;
  closer_name?: string | null;
}

interface DailyClosureRow {
  id: string;
  business_date: string;
  closed_at: string;
  total_revenue: number;
  cash_revenue: number;
  card_revenue: number;
  open_account_revenue: number;
  expense_total: number;
  cash_in_total: number;
  cash_out_total: number;
  expected_cash: number;
  closing_cash_total: number;
  cash_difference: number;
  shift_count: number;
  order_count: number;
  status: 'closed' | 'reopened';
  notes?: string | null;
}

const DENOMS: { value: number; label: string; type: 'banknote' | 'coin' }[] = [
  { value: 200, label: '200 TL', type: 'banknote' },
  { value: 100, label: '100 TL', type: 'banknote' },
  { value: 50, label: '50 TL', type: 'banknote' },
  { value: 20, label: '20 TL', type: 'banknote' },
  { value: 10, label: '10 TL', type: 'banknote' },
  { value: 5, label: '5 TL', type: 'banknote' },
  { value: 1, label: '1 TL', type: 'coin' },
  { value: 0.5, label: '50 kr', type: 'coin' },
  { value: 0.25, label: '25 kr', type: 'coin' },
];

function fmt(n: number | null | undefined): string {
  const v = Number(n || 0);
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}


interface CountInputProps {
  mode: 'total' | 'denom';
  setMode: (m: 'total' | 'denom') => void;
  total: string;
  setTotal: (s: string) => void;
  breakdown: Record<string, number>;
  setBreakdown: (b: Record<string, number>) => void;
  helperLabel?: string;
  expected?: number;
}
function CountInput({ mode, setMode, total, setTotal, breakdown, setBreakdown, helperLabel, expected }: CountInputProps) {
  const breakdownTotal = useMemo(() => {
    return DENOMS.reduce((s, d) => s + (breakdown[String(d.value)] || 0) * d.value, 0);
  }, [breakdown]);

  useEffect(() => {
    if (mode === 'denom') {
      setTotal(breakdownTotal.toFixed(2));
    }
  }, [mode, breakdownTotal, setTotal]);

  const totalNum = Number(total) || 0;
  const diff = expected != null ? totalNum - expected : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode('total')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition ${
            mode === 'total'
              ? 'bg-orange-500 text-white border-orange-500 shadow'
              : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
          }`}
        >
          <Calculator className="inline w-4 h-4 mr-1" /> Tek Tutar
        </button>
        <button
          type="button"
          onClick={() => setMode('denom')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold border transition ${
            mode === 'denom'
              ? 'bg-orange-500 text-white border-orange-500 shadow'
              : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
          }`}
        >
          <Layers className="inline w-4 h-4 mr-1" /> Kupür Sayım
        </button>
      </div>

      {mode === 'total' ? (
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">{helperLabel || 'Sayım (TL)'}</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="0,00"
            className="w-full px-4 py-3 text-2xl font-black text-slate-800 rounded-xl border-2 border-slate-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 outline-none"
          />
        </div>
      ) : (
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DENOMS.map((d) => {
              const k = String(d.value);
              const cnt = breakdown[k] || 0;
              const sub = cnt * d.value;
              return (
                <div key={k} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-2 py-1.5">
                  <span className={`w-14 text-xs font-bold ${d.type === 'banknote' ? 'text-emerald-700' : 'text-amber-700'}`}>{d.label}</span>
                  <button
                    type="button"
                    onClick={() => setBreakdown({ ...breakdown, [k]: Math.max(0, cnt - 1) })}
                    className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cnt || ''}
                    onChange={(e) => setBreakdown({ ...breakdown, [k]: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
                    placeholder="0"
                    className="w-12 text-center text-sm font-bold rounded-md border border-slate-200 px-1 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => setBreakdown({ ...breakdown, [k]: cnt + 1 })}
                    className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <span className="ml-auto text-xs font-bold text-slate-500">{fmt(sub)} ₺</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between bg-slate-900 text-white rounded-lg px-3 py-2">
            <span className="text-xs font-bold uppercase">Sayım Toplamı</span>
            <span className="text-xl font-black">{fmt(breakdownTotal)} ₺</span>
          </div>
        </div>
      )}

      {expected != null && (
        <div className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between border ${
          diff! === 0
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : (diff! > 0
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-rose-50 border-rose-200 text-rose-700')
        }`}>
          <span className="font-bold">Beklenen: {fmt(expected)} ₺</span>
          <span className="font-black">
            Fark: {diff! >= 0 ? '+' : ''}{fmt(diff!)} ₺
          </span>
        </div>
      )}
    </div>
  );
}

export function ShiftManager() {
  const { tenant, user, profile, activeBranch, branches, isOwnerOrAdmin, permissions, businessDayStartHour } = useAuth();
  const tenantId = tenant?.id || null;

  const [selectedBranch, setSelectedBranch] = useState<string>(activeBranch?.id || (branches[0]?.id || ''));
  const effectiveBranchId = isOwnerOrAdmin ? (selectedBranch || null) : (activeBranch?.id || null);

  // Header'daki rozet zaten kisisel; bu sayfada da kendi vardiyamizi gosterelim.
  // Admin tum acik vardiyalari liste icinde gorur (asagida tum_acik karti).
  const { activeShift, todayClosure, loading: shiftLoading, refresh } = useActiveShift({
    tenantId,
    branchId: effectiveBranchId,
    userId: user?.id || null,
    enabled: !!tenantId,
    cutoffHour: businessDayStartHour,
  });
  const [allOpenShifts, setAllOpenShifts] = useState<ShiftRow[]>([]);

  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [history, setHistory] = useState<ShiftRow[]>([]);
  const [todayClosures, setTodayClosures] = useState<DailyClosureRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Live stats for the open shift
  const [liveStats, setLiveStats] = useState<{ cash: number; card: number; openAcc: number; expense: number; cashIn: number; cashOut: number; orders: number } | null>(null);

  // Open / Close modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openShiftNo, setOpenShiftNo] = useState<number>(suggestShiftNo(new Date(), businessDayStartHour));
  const [openMode, setOpenMode] = useState<'total' | 'denom'>('total');
  const [openTotal, setOpenTotal] = useState<string>('');
  const [openBreakdown, setOpenBreakdown] = useState<Record<string, number>>({});
  const [openNotes, setOpenNotes] = useState<string>('');
  const [openTerminal, setOpenTerminal] = useState<string>('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeMode, setCloseMode] = useState<'total' | 'denom'>('total');
  const [closeTotal, setCloseTotal] = useState<string>('');
  const [closeBreakdown, setCloseBreakdown] = useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Day close
  const [closingDay, setClosingDay] = useState(false);
  const [dayCloseError, setDayCloseError] = useState<string | null>(null);

  const [printFormat, setPrintFormat] = useState<ShiftPrintFormat>(loadShiftPrintFormat());
  useEffect(() => { saveShiftPrintFormat(printFormat); }, [printFormat]);

  const businessDate = computeBusinessDate(new Date(), businessDayStartHour);

  // Load definitions
  useEffect(() => {
    (async () => {
      if (!tenantId) return;
      let q = (supabase as any)
        .from('shift_definitions')
        .select('id,shift_no,name,start_time,end_time,color,branch_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('shift_no');
      if (effectiveBranchId) q = q.eq('branch_id', effectiveBranchId);
      const { data } = await q;
      setDefinitions(data || []);
    })();
  }, [tenantId, effectiveBranchId]);

  // Load history (today's shifts + last 7 days closures)
  const loadHistory = useCallback(async () => {
    if (!tenantId) return;
    setLoadingHistory(true);
    try {
      let q = (supabase as any)
        .from('shifts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('opened_at', { ascending: false })
        .limit(30);
      if (effectiveBranchId) q = q.eq('branch_id', effectiveBranchId);
      // Normal kullanici sadece kendi gecmisini gorur
      if (!isOwnerOrAdmin && user?.id) q = q.eq('opened_by', user.id);
      const { data: rows } = await q;
      // attach opener / closer names
      const userIds = new Set<string>();
      (rows || []).forEach((r: any) => {
        if (r.opened_by) userIds.add(r.opened_by);
        if (r.closed_by) userIds.add(r.closed_by);
      });
      let nameMap: Record<string, string> = {};
      if (userIds.size > 0) {
        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id,full_name')
          .in('id', Array.from(userIds));
        (profs || []).forEach((p: any) => { nameMap[p.id] = p.full_name; });
      }
      const enriched = (rows || []).map((r: any) => ({
        ...r,
        opener_name: r.opened_by ? nameMap[r.opened_by] : null,
        closer_name: r.closed_by ? nameMap[r.closed_by] : null,
      }));
      setHistory(enriched);

      let dq = (supabase as any)
        .from('daily_closures')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('business_date', { ascending: false })
        .limit(14);
      if (effectiveBranchId) dq = dq.eq('branch_id', effectiveBranchId);
      const { data: cl } = await dq;
      setTodayClosures(cl || []);

      // Admin: tum acik vardiyalar (paralel mod gorunumu)
      if (isOwnerOrAdmin) {
        let oq = (supabase as any)
          .from('shifts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('status', 'open')
          .order('opened_at', { ascending: false });
        if (effectiveBranchId) oq = oq.eq('branch_id', effectiveBranchId);
        const { data: opens } = await oq;
        const oUserIds = new Set<string>();
        (opens || []).forEach((r: any) => { if (r.opened_by) oUserIds.add(r.opened_by); });
        let openMap: Record<string, string> = {};
        if (oUserIds.size > 0) {
          const { data: profs2 } = await (supabase as any)
            .from('profiles')
            .select('id,full_name')
            .in('id', Array.from(oUserIds));
          (profs2 || []).forEach((p: any) => { openMap[p.id] = p.full_name; });
        }
        setAllOpenShifts((opens || []).map((r: any) => ({
          ...r,
          opener_name: r.opened_by ? openMap[r.opened_by] : null,
        })));
      } else {
        setAllOpenShifts([]);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [tenantId, effectiveBranchId, isOwnerOrAdmin, user?.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, activeShift?.id, todayClosure?.id]);

  // Live aggregate stats while a shift is open
  useEffect(() => {
    if (!activeShift) {
      setLiveStats(null);
      return;
    }
    let cancelled = false;
    const compute = async () => {
      let q = (supabase as any)
        .from('cash_register_transactions')
        .select('transaction_type,payment_method,amount')
        .eq('tenant_id', tenantId)
        .gte('created_at', activeShift.opened_at);
      if (activeShift.branch_id) q = q.or(`branch_id.eq.${activeShift.branch_id},branch_id.is.null`);
      const { data: tx } = await q;

      let oq = (supabase as any)
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', activeShift.opened_at);
      if (activeShift.branch_id) oq = oq.eq('branch_id', activeShift.branch_id);
      const { count: orderCnt } = await oq;

      const stats = {
        cash: 0, card: 0, openAcc: 0, expense: 0, cashIn: 0, cashOut: 0, orders: orderCnt || 0,
      };
      (tx || []).forEach((t: any) => {
        const a = Math.abs(Number(t.amount) || 0);
        if (t.transaction_type === 'order_payment') {
          if (t.payment_method === 'cash') stats.cash += a;
          else if (t.payment_method === 'credit_card') stats.card += a;
          else if (t.payment_method === 'open_account') stats.openAcc += a;
        } else if (t.transaction_type === 'expense') stats.expense += a;
        else if (t.transaction_type === 'cash_in') stats.cashIn += a;
        else if (t.transaction_type === 'cash_out') stats.cashOut += a;
      });
      if (!cancelled) setLiveStats(stats);
    };
    compute();
    const id = window.setInterval(compute, 20_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeShift, tenantId]);

  const expectedCashOpen = useMemo(() => {
    if (!activeShift || !liveStats) return Number(activeShift?.opening_cash || 0);
    return Number(activeShift.opening_cash || 0) + liveStats.cash + liveStats.cashIn - liveStats.cashOut - liveStats.expense;
  }, [activeShift, liveStats]);

  const usedShiftNos = useMemo(() => {
    return new Set(
      history
        .filter((h) => h.business_date === businessDate)
        .map((h) => h.shift_no),
    );
  }, [history, businessDate]);

  const suggestedNo = useMemo(() => {
    const def = definitions.find((d) => !usedShiftNos.has(d.shift_no));
    return def?.shift_no || suggestShiftNo(new Date(), businessDayStartHour);
  }, [definitions, usedShiftNos, businessDayStartHour]);

  useEffect(() => {
    if (showOpenModal) {
      setOpenShiftNo(suggestedNo);
    }
  }, [showOpenModal, suggestedNo]);

  // ---- Actions ----
  const handleStartShift = async () => {
    if (!tenantId || !effectiveBranchId) {
      setOpenError('Sube secimi gerekli');
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      const selectedDef = definitions.find((d) => d.shift_no === openShiftNo);
      const { data, error } = await (supabase as any).rpc('start_shift', {
        p_branch_id: effectiveBranchId,
        p_shift_no: openShiftNo,
        p_opening_cash: Number(openTotal) || 0,
        p_breakdown: openMode === 'denom' && Object.keys(openBreakdown).length > 0 ? openBreakdown : null,
        p_terminal_id: openTerminal || null,
        p_terminal_name: openTerminal || null,
        p_notes: openNotes || null,
        p_shift_definition_id: selectedDef?.id || null,
      });
      if (error) throw error;
      setShowOpenModal(false);
      setOpenTotal('');
      setOpenBreakdown({});
      setOpenNotes('');
      setOpenTerminal('');
      await refresh();
      await loadHistory();
    } catch (e: any) {
      setOpenError(e?.message || 'Vardiya acilamadi');
    } finally {
      setOpening(false);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift) return;
    setClosing(true);
    setCloseError(null);
    try {
      const closingCash = Number(closeTotal) || 0;
      const { data, error } = await (supabase as any).rpc('close_shift', {
        p_shift_id: activeShift.id,
        p_closing_cash: closingCash,
        p_breakdown: closeMode === 'denom' && Object.keys(closeBreakdown).length > 0 ? closeBreakdown : null,
        p_notes: closeNotes || null,
      });
      if (error) throw error;
      printZReport(data);
      setShowCloseModal(false);
      setCloseTotal('');
      setCloseBreakdown({});
      setCloseNotes('');
      await refresh();
      await loadHistory();
    } catch (e: any) {
      setCloseError(e?.message || 'Vardiya kapatilamadi');
    } finally {
      setClosing(false);
    }
  };

  const handleCloseDay = async () => {
    if (!effectiveBranchId) {
      setDayCloseError('Sube secimi gerekli');
      return;
    }
    setClosingDay(true);
    setDayCloseError(null);
    try {
      const { data, error } = await (supabase as any).rpc('close_business_day', {
        p_branch_id: effectiveBranchId,
        p_business_date: businessDate,
        p_notes: null,
      });
      if (error) throw error;
      await refresh();
      await loadHistory();
    } catch (e: any) {
      setDayCloseError(e?.message || 'Gun kapatilamadi');
    } finally {
      setClosingDay(false);
    }
  };

  const printZReport = (shift: ShiftRow, formatOverride?: ShiftPrintFormat) => {
    const ps = loadPrintSettings();
    const branchLabel = branches.find((b) => b.id === shift.branch_id)?.name || '';
    void printShiftReport(
      shift,
      {
        title: 'VARDİYA Z RAPORU',
        restaurantName: ps.restaurantName || tenant?.name || 'ŞefPOS',
        branchName: branchLabel,
        userName: shift.opener_name || '',
      },
      formatOverride || printFormat,
    );
  };

  // Computed: bugünün vardiyaları
  const todaysShifts = useMemo(() => history.filter((h) => h.business_date === businessDate), [history, businessDate]);
  const allTodayClosed = todaysShifts.length > 0 && todaysShifts.every((s) => s.status === 'closed');
  const dayLocked = !!todayClosure;

  // ---- Render ----
  return (
    <div className="fixed inset-0 top-14 md:top-20 bg-gradient-to-br from-slate-50 to-slate-100 overflow-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
              <Clock className="w-7 h-7 text-orange-500" /> Vardiyalar
            </h1>
            <p className="text-slate-500 text-sm mt-1">İşgünü: <b>{formatBusinessDateTR(businessDate)}</b> • Vardiyaları aç / kapat, gün sonunu kilitle</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isOwnerOrAdmin && branches.length > 1 && (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold focus:ring-2 focus:ring-orange-300 outline-none"
              >
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <button
              onClick={() => { refresh(); loadHistory(); }}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${shiftLoading || loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Day status banner */}
        {dayLocked ? (
          <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex items-center gap-3">
            <Lock className="w-6 h-6 text-amber-700" />
            <div className="flex-1">
              <p className="font-black text-amber-900">Bu gün kapatıldı</p>
              <p className="text-xs text-amber-800">{formatBusinessDateTR(todayClosure!.business_date)} kapatma tarihi: {new Date(todayClosure!.closed_at).toLocaleString('tr-TR')}</p>
            </div>
          </div>
        ) : null}

        {/* Active shift card */}
        {activeShift ? (
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white p-5 md:p-6 shadow-xl mb-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-wide">
                  <PlayCircle className="w-4 h-4" /> AÇIK VARDİYA
                </div>
                <h2 className="text-2xl md:text-3xl font-black mt-1">{activeShift.shift_name}</h2>
                <div className="flex items-center gap-3 text-sm mt-2 flex-wrap">
                  <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {activeShift.opener_full_name || profile?.full_name || 'Kullanıcı'}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {new Date(activeShift.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} • {shiftDurationLabel(activeShift.opened_at)}</span>
                  {activeShift.terminal_name && (
                    <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {activeShift.terminal_name}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setCloseTotal(expectedCashOpen.toFixed(2));
                  setCloseBreakdown({});
                  setCloseMode('total');
                  setCloseNotes('');
                  setCloseError(null);
                  setShowCloseModal(true);
                }}
                className="bg-white text-emerald-700 hover:bg-emerald-50 px-5 py-3 rounded-xl font-black shadow-lg flex items-center gap-2"
              >
                <StopCircle className="w-5 h-5" /> Vardiyayı Kapat
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <Stat label="Açılış Nakit" value={`${fmt(activeShift.opening_cash)} ₺`} />
              <Stat label="Nakit Satış" value={`${fmt(liveStats?.cash || 0)} ₺`} />
              <Stat label="Kart Satış" value={`${fmt(liveStats?.card || 0)} ₺`} />
              <Stat label="Beklenen Kasa" value={`${fmt(expectedCashOpen)} ₺`} highlight />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <Stat label="Cari" value={`${fmt(liveStats?.openAcc || 0)} ₺`} dim />
              <Stat label="Nakit Giriş" value={`+${fmt(liveStats?.cashIn || 0)} ₺`} dim />
              <Stat label="Nakit Çıkış" value={`-${fmt(liveStats?.cashOut || 0)} ₺`} dim />
              <Stat label="Sipariş" value={`${liveStats?.orders ?? 0}`} dim />
            </div>
          </div>
        ) : (
          !dayLocked && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 mb-5">
              <div className="flex items-center gap-3 mb-3">
                <ShieldAlert className="w-6 h-6 text-orange-500" />
                <div>
                  <p className="font-black text-slate-800">Açık vardiya yok</p>
                  <p className="text-xs text-slate-500">Sipariş ve ödeme alabilmek için bir vardiya açın.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setOpenError(null);
                  setOpenTotal('');
                  setOpenBreakdown({});
                  setOpenNotes('');
                  setOpenTerminal('');
                  setOpenMode('total');
                  setShowOpenModal(true);
                }}
                disabled={!effectiveBranchId}
                className="w-full md:w-auto bg-gradient-to-r from-orange-500 to-red-600 text-white px-6 py-3 rounded-xl font-black shadow-lg hover:shadow-xl flex items-center gap-2 disabled:opacity-50"
              >
                <PlayCircle className="w-5 h-5" /> Yeni Vardiya Aç
              </button>
            </div>
          )
        )}

        {/* Shift definitions / today progress */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-500" />
              <h3 className="font-black text-slate-800">Bugünün Vardiyaları</h3>
            </div>
            <span className="text-xs font-bold text-slate-500">{todaysShifts.filter((s) => s.status === 'closed').length} / {definitions.length} kapatıldı</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {definitions.map((d) => {
              const Icon = shiftIcon(d.shift_no);
              const open = todaysShifts.find((s) => s.shift_no === d.shift_no && s.status === 'open');
              const closed = todaysShifts.find((s) => s.shift_no === d.shift_no && s.status === 'closed');
              const state = open ? 'open' : (closed ? 'closed' : 'idle');
              const stateColor = state === 'open'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : state === 'closed'
                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200';
              return (
                <div key={d.id} className="p-4 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow" style={{ background: d.color }}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-sm">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.start_time.slice(0, 5)} – {d.end_time.slice(0, 5)}</p>
                    <span className={`inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${stateColor}`}>
                      {state === 'open' ? 'AÇIK' : state === 'closed' ? 'KAPATILDI' : 'BEKLİYOR'}
                    </span>
                    {closed && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Fark: <b className={closed.cash_difference === 0 ? 'text-emerald-600' : (closed.cash_difference > 0 ? 'text-blue-600' : 'text-rose-600')}>
                          {closed.cash_difference >= 0 ? '+' : ''}{fmt(closed.cash_difference)} ₺
                        </b>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {definitions.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500 col-span-3">Bu şube için vardiya tanımı yok.</div>
            )}
          </div>
        </div>

        {/* Day close panel */}
        {!dayLocked && permissions.can_end_of_day && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow">
                <FileCheck2 className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-slate-800">Gün Sonu Kapatma</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bütün vardiyalar kapatıldıktan sonra günü kilitleyebilirsiniz. Kilit sonrası bu güne yeni vardiya açılamaz.
                </p>
              </div>
              <button
                onClick={handleCloseDay}
                disabled={closingDay || !!activeShift || todaysShifts.length === 0 || !allTodayClosed}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-3 rounded-xl shadow disabled:opacity-50 flex items-center gap-2"
                title={
                  activeShift
                    ? 'Önce açık vardiyayı kapatın'
                    : todaysShifts.length === 0
                      ? 'Bugün vardiya açılmadı'
                      : !allTodayClosed
                        ? 'Tüm vardiyalar kapanmadan gün kapatılamaz'
                        : 'Günü kapat'
                }
              >
                <Lock className="w-4 h-4" /> Günü Kapat
              </button>
            </div>
            {dayCloseError && (
              <div className="mt-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span className="flex-1 whitespace-pre-line">{dayCloseError}</span>
              </div>
            )}
          </div>
        )}

        {/* Admin: paralel acik vardiyalar */}
        {isOwnerOrAdmin && allOpenShifts.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-500" />
              <h3 className="font-black text-slate-800">Şu An Çalışan Vardiyalar ({allOpenShifts.length})</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {allOpenShifts.map((s) => {
                const Icon = shiftIcon(s.shift_no);
                const isMine = s.opened_by === user?.id;
                return (
                  <div key={s.id} className={`p-4 flex items-center gap-3 ${isMine ? 'bg-emerald-50/50' : ''}`}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 text-sm">{s.opener_name || 'Kullanıcı'}</span>
                        {isMine && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-200 text-emerald-800">SİZ</span>}
                        <span className="text-xs font-bold text-slate-500">{s.shift_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(s.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'den beri • {shiftDurationLabel(s.opened_at)}
                        {s.terminal_name && ` • ${s.terminal_name}`}
                      </p>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">AÇIK</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* History */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-black text-slate-800 flex-1">Vardiya Geçmişi</h3>
            <div className="hidden sm:flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200" title="Z raporu yazdırma formatı">
              <button
                type="button"
                onClick={() => setPrintFormat('80mm')}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-black inline-flex items-center gap-1 transition ${printFormat === '80mm' ? 'bg-white shadow text-orange-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Receipt className="w-3 h-3" /> 80 mm
              </button>
              <button
                type="button"
                onClick={() => setPrintFormat('a4')}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-black inline-flex items-center gap-1 transition ${printFormat === 'a4' ? 'bg-white shadow text-orange-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <FileText2 className="w-3 h-3" /> A4
              </button>
            </div>
          </div>
          {history.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Geçmiş kayıt yok.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((s) => {
                const Icon = shiftIcon(s.shift_no);
                const diffColor = s.cash_difference === 0 ? 'text-emerald-600' : (s.cash_difference > 0 ? 'text-blue-600' : 'text-rose-600');
                return (
                  <div key={s.id} className="p-4 flex items-start gap-3 hover:bg-slate-50 transition">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shadow ${s.status === 'open' ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-800 text-sm">{s.shift_name}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${s.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {s.status === 'open' ? 'AÇIK' : 'KAPALI'}
                        </span>
                        <span className="text-xs text-slate-500">{formatBusinessDateTR(s.business_date)}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {s.opener_name || 'Kullanıcı'} • {new Date(s.opened_at).toLocaleString('tr-TR')}
                        {s.closed_at && ` → ${new Date(s.closed_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} • ${shiftDurationLabel(s.opened_at, s.closed_at)}`}
                      </p>
                      {s.status === 'closed' && (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2">
                          <Mini label="Ciro" value={`${fmt(s.total_revenue)} ₺`} />
                          <Mini label="Nakit" value={`${fmt(s.cash_revenue)} ₺`} />
                          <Mini label="Kart" value={`${fmt(s.card_revenue)} ₺`} />
                          <Mini label="Beklenen" value={`${fmt(s.expected_cash)} ₺`} />
                          <Mini label="Fark" value={`${s.cash_difference >= 0 ? '+' : ''}${fmt(s.cash_difference)} ₺`} valueClass={diffColor} />
                        </div>
                      )}
                    </div>
                    {s.status === 'closed' && (
                      <button
                        onClick={() => printZReport(s)}
                        title="Z Raporu yazdır"
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent day closures */}
        {todayClosures.length > 0 && (
          <div className="mt-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-amber-500" />
              <h3 className="font-black text-slate-800">Son Kapatılan Günler</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {todayClosures.map((c) => (
                <div key={c.id} className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800 text-sm">{formatBusinessDateTR(c.business_date)}</p>
                    <p className="text-xs text-slate-500">
                      {c.shift_count} vardiya • Ciro <b>{fmt(c.total_revenue)} ₺</b> • Fark <b className={c.cash_difference === 0 ? 'text-emerald-600' : (c.cash_difference > 0 ? 'text-blue-600' : 'text-rose-600')}>{c.cash_difference >= 0 ? '+' : ''}{fmt(c.cash_difference)} ₺</b>
                    </p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${c.status === 'closed' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {c.status === 'closed' ? 'KAPALI' : 'YENİDEN AÇILDI'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPEN MODAL */}
        {showOpenModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-3" onClick={() => !opening && setShowOpenModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">Vardiya Aç</h3>
                  <p className="text-xs text-slate-500">{formatBusinessDateTR(businessDate)}</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Vardiya</label>
                  <div className="grid grid-cols-3 gap-2">
                    {definitions.map((d) => {
                      const Icon = shiftIcon(d.shift_no);
                      const used = usedShiftNos.has(d.shift_no);
                      const selected = openShiftNo === d.shift_no;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          disabled={used}
                          onClick={() => setOpenShiftNo(d.shift_no)}
                          className={`p-3 rounded-xl border-2 text-left transition ${
                            selected ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-300'
                          } ${used ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-4 h-4 text-slate-700" />
                            <span className="text-xs font-black text-slate-800">{d.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-500">{d.start_time.slice(0, 5)} – {d.end_time.slice(0, 5)}</p>
                          {used && <span className="text-[9px] font-black text-slate-500">BUGÜN AÇILDI</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Açılış Nakit</label>
                  <CountInput
                    mode={openMode}
                    setMode={setOpenMode}
                    total={openTotal}
                    setTotal={setOpenTotal}
                    breakdown={openBreakdown}
                    setBreakdown={setOpenBreakdown}
                    helperLabel="Kasada bulunan nakit"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Terminal (opsiyonel)</label>
                    <input
                      value={openTerminal}
                      onChange={(e) => setOpenTerminal(e.target.value)}
                      placeholder="Kasa-1"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-300 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Notlar (opsiyonel)</label>
                    <input
                      value={openNotes}
                      onChange={(e) => setOpenNotes(e.target.value)}
                      placeholder="..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-300 outline-none text-sm"
                    />
                  </div>
                </div>

                {openError && (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span className="flex-1 whitespace-pre-line">{openError}</span>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 flex items-center gap-2 justify-end">
                <button onClick={() => setShowOpenModal(false)} disabled={opening} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">İptal</button>
                <button
                  onClick={handleStartShift}
                  disabled={opening}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-600 text-white font-black text-sm shadow disabled:opacity-50 flex items-center gap-2"
                >
                  {opening ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                  Vardiyayı Aç
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CLOSE MODAL */}
        {showCloseModal && activeShift && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-3" onClick={() => !closing && setShowCloseModal(false)}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 text-white flex items-center justify-center">
                  <StopCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800">Vardiyayı Kapat</h3>
                  <p className="text-xs text-slate-500">{activeShift.shift_name} • Beklenen: {fmt(expectedCashOpen)} ₺</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-slate-50 rounded-xl p-3 text-xs grid grid-cols-2 md:grid-cols-3 gap-2">
                  <Mini label="Açılış" value={`${fmt(activeShift.opening_cash)} ₺`} />
                  <Mini label="Nakit Satış" value={`${fmt(liveStats?.cash || 0)} ₺`} />
                  <Mini label="Nakit Giriş" value={`+${fmt(liveStats?.cashIn || 0)} ₺`} />
                  <Mini label="Nakit Çıkış" value={`-${fmt(liveStats?.cashOut || 0)} ₺`} />
                  <Mini label="Gider" value={`-${fmt(liveStats?.expense || 0)} ₺`} />
                  <Mini label="Beklenen" value={`${fmt(expectedCashOpen)} ₺`} valueClass="text-emerald-600" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Sayılan Nakit (Kapanış)</label>
                  <CountInput
                    mode={closeMode}
                    setMode={setCloseMode}
                    total={closeTotal}
                    setTotal={setCloseTotal}
                    breakdown={closeBreakdown}
                    setBreakdown={setCloseBreakdown}
                    helperLabel="Kasadaki nakit"
                    expected={expectedCashOpen}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Notlar (opsiyonel)</label>
                  <textarea
                    rows={2}
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Açıklama, fark nedeni vb."
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-300 outline-none text-sm"
                  />
                </div>

                {closeError && (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <span className="flex-1 whitespace-pre-line">{closeError}</span>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-slate-100 flex items-center gap-2 justify-end">
                <button onClick={() => setShowCloseModal(false)} disabled={closing} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50">İptal</button>
                <button
                  onClick={handleCloseShift}
                  disabled={closing}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-orange-600 text-white font-black text-sm shadow disabled:opacity-50 flex items-center gap-2"
                >
                  {closing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Kapat & Z Raporu Yazdır
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight, dim }: { label: string; value: string; highlight?: boolean; dim?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? 'bg-white/20 ring-2 ring-white/30' : 'bg-white/10'} ${dim ? 'opacity-90' : ''}`}>
      <p className="text-[10px] uppercase font-bold tracking-wide text-emerald-50">{label}</p>
      <p className="text-lg md:text-xl font-black mt-0.5">{value}</p>
    </div>
  );
}

function Mini({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 px-2 py-1.5">
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-black ${valueClass || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}
