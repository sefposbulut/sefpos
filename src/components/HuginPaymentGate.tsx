import { Loader2, CreditCard, Banknote, RefreshCw, XCircle, AlertTriangle } from 'lucide-react';
import type { HuginFailureKind } from '../lib/huginTps';

export type HuginGatePhase = 'waiting' | 'failed' | 'success';

export interface HuginPaymentGateProps {
  phase: HuginGatePhase;
  message: string;
  detail?: string;
  failureKind?: HuginFailureKind;
  hasCardPayment?: boolean;
  busy?: boolean;
  onRetry?: () => void;
  onSwitchToCash?: () => void;
  onCancelFiscal?: () => void;
  onAbortPayment?: () => void;
}

function failureHint(kind?: HuginFailureKind): string {
  if (kind === 'card_declined') {
    return 'Kart geçmedi veya müşteri işlemi iptal etti. Nakit deneyebilir veya fişi iptal edip ödemeyi geri alabilirsiniz.';
  }
  if (kind === 'timeout') {
    return 'Yazarkasa yanıt vermedi. Cihazda işlem sürüyor olabilir; fiş iptal edip tekrar deneyin.';
  }
  if (kind === 'cancelled') {
    return 'Belge yazarkasada iptal edildi veya kapatıldı.';
  }
  if (kind === 'device_busy') {
    return 'Yazarkasa meşgul. Önce cihazdaki işlemi bitirin veya fişi iptal edin.';
  }
  return 'İşlem tamamlanamadı. Fiş iptal edilmeden masa kapanmaz.';
}

export function HuginPaymentGate({
  phase,
  message,
  detail,
  failureKind,
  hasCardPayment,
  busy,
  onRetry,
  onSwitchToCash,
  onCancelFiscal,
  onAbortPayment,
}: HuginPaymentGateProps) {
  if (phase === 'success') {
    return (
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-bold text-emerald-800">{message}</p>
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5 text-center space-y-3">
        <Loader2 className="w-10 h-10 text-amber-600 animate-spin mx-auto" />
        <p className="text-base font-black text-amber-900">{message}</p>
        <p className="text-xs text-amber-800 leading-relaxed">
          {hasCardPayment
            ? 'Müşteri kartı okutsun. Fiş yazarkasadan çıkana kadar bu ekran açık kalır.'
            : 'Nakit fiş yazdırılıyor. Lütfen bekleyin.'}
        </p>
        <p className="text-[11px] text-amber-700">Yazarkasada işlemi elle iptal etmeyin — ŞefPOS üzerinden yönetin.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0 text-left">
          <p className="text-sm font-black text-red-900">{message}</p>
          {detail ? <p className="text-xs text-red-800 mt-1 break-words">{detail}</p> : null}
          <p className="text-[11px] text-red-700 mt-2">{failureHint(failureKind)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {onRetry && (
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border-2 border-red-200 text-red-800 font-bold text-sm hover:bg-red-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Tekrar dene
          </button>
        )}
        {hasCardPayment && onSwitchToCash && (
          <button
            type="button"
            disabled={busy}
            onClick={onSwitchToCash}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Banknote className="w-4 h-4" />
            Nakit dene
          </button>
        )}
        {onCancelFiscal && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancelFiscal}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-100 border-2 border-amber-300 text-amber-900 font-bold text-sm hover:bg-amber-200 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Fiş iptal (yazarkasa)
          </button>
        )}
        {onAbortPayment && (
          <button
            type="button"
            disabled={busy}
            onClick={onAbortPayment}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 sm:col-span-2"
          >
            <CreditCard className="w-4 h-4" />
            Ödemeyi geri al
          </button>
        )}
      </div>
    </div>
  );
}
