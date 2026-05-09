import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveShift } from '../lib/useActiveShift';
import { supabase } from '../lib/supabase';
import { loadPrintSettings } from '../lib/printService';
import { shiftDurationLabel, shiftIcon } from '../lib/businessDay';
import { printShiftReport, loadShiftPrintFormat, saveShiftPrintFormat, type ShiftPrintFormat } from '../lib/shiftReportPrint';
import {
  StopCircle, X, RefreshCw, AlertTriangle, CheckCircle,
  Banknote, CreditCard, FileText, ShoppingCart, Printer, Clock, Receipt, FileText as FileText2,
} from 'lucide-react';

function fmt(n: number | null | undefined): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n || 0));
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Header rozetine tiklayinca acilir: kullanicinin acik vardiyasinin canli
 * ozeti + "Vardiyami Bitir" akisi. Bitirince kisisel Z raporu modal'i.
 */
export function ShiftQuickClose({ open, onClose }: Props) {
  const { tenant, user, profile, activeBranch, branches, businessDayStartHour } = useAuth();
  const { activeShift, refresh } = useActiveShift({
    tenantId: tenant?.id || null,
    branchId: activeBranch?.id || null,
    userId: user?.id || null,
    enabled: !!tenant && open,
    cutoffHour: businessDayStartHour,
  });

  const [stats, setStats] = useState<{ cash: number; card: number; openAcc: number; expense: number; cashIn: number; cashOut: number; orders: number } | null>(null);

  useEffect(() => {
    if (!open || !activeShift || !tenant) return;
    let cancelled = false;
    const compute = async () => {
      let q = (supabase as any)
        .from('cash_register_transactions')
        .select('transaction_type,payment_method,amount')
        .eq('tenant_id', tenant.id)
        .gte('created_at', activeShift.opened_at);
      if (activeShift.branch_id) q = q.or(`branch_id.eq.${activeShift.branch_id},branch_id.is.null`);
      // sadece bu kullanicinin
      if (user?.id) q = q.eq('created_by', user.id);
      const { data: tx } = await q;

      let oq = (supabase as any)
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('created_at', activeShift.opened_at);
      if (activeShift.branch_id) oq = oq.eq('branch_id', activeShift.branch_id);
      if (user?.id) oq = oq.eq('created_by', user.id);
      const { count: orderCnt } = await oq;

      const s = { cash: 0, card: 0, openAcc: 0, expense: 0, cashIn: 0, cashOut: 0, orders: orderCnt || 0 };
      (tx || []).forEach((t: any) => {
        const a = Math.abs(Number(t.amount) || 0);
        if (t.transaction_type === 'order_payment') {
          if (t.payment_method === 'cash') s.cash += a;
          else if (t.payment_method === 'credit_card') s.card += a;
          else if (t.payment_method === 'open_account') s.openAcc += a;
        } else if (t.transaction_type === 'expense') s.expense += a;
        else if (t.transaction_type === 'cash_in') s.cashIn += a;
        else if (t.transaction_type === 'cash_out') s.cashOut += a;
      });
      if (!cancelled) setStats(s);
    };
    compute();
    const id = window.setInterval(compute, 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [open, activeShift, tenant, user]);

  const expectedCash = useMemo(() => {
    if (!activeShift || !stats) return Number(activeShift?.opening_cash || 0);
    return Number(activeShift.opening_cash || 0) + stats.cash + stats.cashIn - stats.cashOut - stats.expense;
  }, [activeShift, stats]);

  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closedShift, setClosedShift] = useState<any | null>(null);
  const [counted, setCounted] = useState<string>('');
  const [printFormat, setPrintFormat] = useState<ShiftPrintFormat>(loadShiftPrintFormat());

  useEffect(() => {
    saveShiftPrintFormat(printFormat);
  }, [printFormat]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setCounted('');
      setClosedShift(null);
      setCloseError(null);
    }
  }, [open]);

  useEffect(() => {
    if (confirming && activeShift) {
      setCounted(expectedCash.toFixed(2));
    }
  }, [confirming, activeShift, expectedCash]);

  const handleClose = async () => {
    if (!activeShift) return;
    setClosing(true);
    setCloseError(null);
    try {
      const { data, error } = await (supabase as any).rpc('close_shift', {
        p_shift_id: activeShift.id,
        p_closing_cash: Number(counted) || 0,
        p_breakdown: null,
        p_notes: null,
      });
      if (error) throw error;
      setClosedShift(data);
      printPersonalZ(data);
      await refresh();
    } catch (e: any) {
      setCloseError(e?.message || 'Vardiya kapatılamadı');
    } finally {
      setClosing(false);
    }
  };

  const printPersonalZ = (shift: any, formatOverride?: ShiftPrintFormat) => {
    const ps = loadPrintSettings();
    const branchLabel = branches.find((b) => b.id === shift.branch_id)?.name || '';
    void printShiftReport(
      shift,
      {
        title: 'KİŞİSEL Z RAPORU',
        restaurantName: ps.restaurantName || tenant?.name || 'ŞefPOS',
        branchName: branchLabel,
        userName: profile?.full_name || '',
        footer: `Teşekkürler ${profile?.full_name || ''}`,
      },
      formatOverride || printFormat,
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-end md:items-center justify-center p-3" onClick={() => !closing && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {closedShift ? (
          <ClosedSummary
            shift={closedShift}
            profileName={profile?.full_name || ''}
            printFormat={printFormat}
            onChangeFormat={setPrintFormat}
            onPrint={(f) => printPersonalZ(closedShift, f)}
            onClose={onClose}
          />
        ) : !activeShift ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-600">Açık vardiyanız yok.</p>
            <button onClick={onClose} className="mt-3 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">Kapat</button>
          </div>
        ) : (
          <>
            <div className={`px-5 py-4 text-white ${confirming ? 'bg-gradient-to-r from-rose-500 to-orange-600' : 'bg-gradient-to-r from-emerald-500 to-green-600'} flex items-center gap-3`}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur">
                {(() => { const I = shiftIcon(activeShift.shift_no); return <I className="w-6 h-6" />; })()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase font-black tracking-widest opacity-90">{confirming ? 'Vardiyamı Bitir' : 'Vardiyam Açık'}</p>
                <h3 className="text-lg font-black truncate">{activeShift.shift_name}</h3>
                <p className="text-[11px] opacity-90 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(activeShift.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} • {shiftDurationLabel(activeShift.opened_at)}
                </p>
              </div>
              <button onClick={onClose} disabled={closing} className="p-2 rounded-lg hover:bg-white/10">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Nakit" value={`${fmt(stats?.cash || 0)} ₺`} icon={Banknote} color="text-emerald-600" />
                <Mini label="Kart" value={`${fmt(stats?.card || 0)} ₺`} icon={CreditCard} color="text-blue-600" />
                <Mini label="Cari" value={`${fmt(stats?.openAcc || 0)} ₺`} icon={FileText} color="text-amber-600" />
                <Mini label="Sipariş" value={`${stats?.orders ?? 0}`} icon={ShoppingCart} color="text-slate-700" />
              </div>

              <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Beklenen Kasa</span>
                <span className="text-xl font-black">{fmt(expectedCash)} ₺</span>
              </div>

              {confirming && (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Sayılan Kapanış Nakit (₺)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-3 text-2xl font-black text-slate-800 rounded-xl border-2 border-slate-200 focus:border-rose-400 focus:ring-4 focus:ring-rose-100 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Kasada saydığınız toplam nakit. Fark beklenen ile farkınızdır.</p>
                </div>
              )}

              {confirming && (
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Z Raporu Yazdırma Formatı</label>
                  <FormatSegment value={printFormat} onChange={setPrintFormat} />
                </div>
              )}

              {closeError && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span className="flex-1 whitespace-pre-line">{closeError}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2 justify-end">
              {!confirming ? (
                <>
                  <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">Kapat</button>
                  <button onClick={() => setConfirming(true)} className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-rose-500 to-orange-600 text-white font-black text-sm shadow flex items-center gap-2">
                    <StopCircle className="w-4 h-4" /> Vardiyamı Bitir
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setConfirming(false)} disabled={closing} className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100">Geri</button>
                  <button onClick={handleClose} disabled={closing} className="px-5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-black text-sm shadow disabled:opacity-50 flex items-center gap-2">
                    {closing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Onayla & Kapat
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <p className={`text-base font-black mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function ClosedSummary({ shift, profileName, printFormat, onChangeFormat, onPrint, onClose }: { shift: any; profileName: string; printFormat: ShiftPrintFormat; onChangeFormat: (f: ShiftPrintFormat) => void; onPrint: (f: ShiftPrintFormat) => void; onClose: () => void }) {
  const diffColor = shift.cash_difference === 0
    ? 'text-emerald-600'
    : shift.cash_difference > 0
      ? 'text-blue-600'
      : 'text-rose-600';
  return (
    <>
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-5 py-5 text-center">
        <CheckCircle className="w-12 h-12 mx-auto mb-2" />
        <h3 className="text-xl font-black">Vardiyanız kapatıldı</h3>
        <p className="text-sm opacity-90 mt-1">{profileName} • {shift.shift_name}</p>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-xs text-slate-500">İşte kişisel Z raporunuzun özeti:</p>
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Nakit" value={`${fmt(shift.cash_revenue)} ₺`} icon={Banknote} color="text-emerald-600" />
          <Mini label="Kart" value={`${fmt(shift.card_revenue)} ₺`} icon={CreditCard} color="text-blue-600" />
          <Mini label="Cari" value={`${fmt(shift.open_account_revenue)} ₺`} icon={FileText} color="text-amber-600" />
          <Mini label="Sipariş" value={`${shift.order_count}`} icon={ShoppingCart} color="text-slate-700" />
        </div>
        <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">Toplam Ciro</span>
          <span className="text-xl font-black">{fmt(shift.total_revenue)} ₺</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Mini label="Açılış" value={`${fmt(shift.opening_cash)} ₺`} icon={Banknote} color="text-slate-600" />
          <Mini label="Sayılan" value={`${fmt(shift.closing_cash || 0)} ₺`} icon={Banknote} color="text-slate-700" />
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Fark</div>
            <p className={`text-base font-black mt-0.5 ${diffColor}`}>{shift.cash_difference >= 0 ? '+' : ''}{fmt(shift.cash_difference)} ₺</p>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Yazdırma Formatı</label>
          <FormatSegment value={printFormat} onChange={onChangeFormat} />
        </div>
      </div>
      <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2 justify-end">
        <button onClick={() => onPrint(printFormat)} className="px-4 py-2.5 rounded-lg text-sm font-bold text-slate-700 border border-slate-200 hover:bg-white flex items-center gap-2">
          <Printer className="w-4 h-4" /> Yazdır
        </button>
        <button onClick={onClose} className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow">
          Tamam
        </button>
      </div>
    </>
  );
}

function FormatSegment({ value, onChange }: { value: ShiftPrintFormat; onChange: (f: ShiftPrintFormat) => void }) {
  return (
    <div className="inline-flex w-full p-1 bg-slate-100 rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => onChange('80mm')}
        className={`flex-1 px-3 py-2 rounded-md text-xs font-black inline-flex items-center justify-center gap-1.5 transition ${
          value === '80mm' ? 'bg-white shadow text-orange-700' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <Receipt className="w-3.5 h-3.5" /> 80 mm Fiş
      </button>
      <button
        type="button"
        onClick={() => onChange('a4')}
        className={`flex-1 px-3 py-2 rounded-md text-xs font-black inline-flex items-center justify-center gap-1.5 transition ${
          value === 'a4' ? 'bg-white shadow text-orange-700' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <FileText2 className="w-3.5 h-3.5" /> A4 Sayfa
      </button>
    </div>
  );
}
