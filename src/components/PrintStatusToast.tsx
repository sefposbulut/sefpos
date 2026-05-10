import { useEffect, useRef, useState, type ComponentType } from 'react';
import { CheckCircle2, AlertTriangle, Inbox, X } from 'lucide-react';
import { PRINT_TOAST_EVENT, type PrintToastDetail } from '../lib/printToasts';

interface ToastEntry extends PrintToastDetail {
  id: number;
  /** İçeride tutulan, milisaniye cinsinden hesaplanmış otomatik kapanma süresi. */
  ttlMs: number;
}

const DEFAULT_TTL: Record<PrintToastDetail['kind'], number> = {
  success: 1800,
  queued: 2400,
  error: 4500,
};

const ICONS: Record<PrintToastDetail['kind'], ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  queued: Inbox,
  error: AlertTriangle,
};

const STYLES: Record<PrintToastDetail['kind'], { wrap: string; icon: string; bar: string }> = {
  success: {
    wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: 'text-emerald-600',
    bar: 'bg-emerald-500',
  },
  queued: {
    wrap: 'bg-sky-50 border-sky-200 text-sky-900',
    icon: 'text-sky-600',
    bar: 'bg-sky-500',
  },
  error: {
    wrap: 'bg-red-50 border-red-200 text-red-900',
    icon: 'text-red-600',
    bar: 'bg-red-500',
  },
};

let nextId = 1;

/**
 * Viewport mobil mi? `matchMedia` ile tek seferde belirler ve değişimi dinler.
 * Mobilde toast altyapısını hiç kurmayız — listener bile bağlanmaz, böylece
 * mobil cihazlarda gereksiz state / timeout / animasyon yükü olmaz.
 */
function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } else {
      mq.addListener(onChange);
      return () => mq.removeListener(onChange);
    }
  }, []);
  return isDesktop;
}

/**
 * `dispatchPrintToast` ile gönderilen tüm yazdırma bildirimlerini sağ-alt köşede
 * gösterir. Aynı anda en fazla 3 toast tutulur, otomatik kapanma için her
 * toast'ın kendi TTL'si vardır.
 *
 * Mobil viewport'ta (md altı) toast UI tamamen devre dışıdır — print akışı yine
 * çalışır (sipariş Supabase queue'ya yazılır, kasadaki Print Agent basar) ama
 * sağ alt köşede ek bir toast çıkmaz. Garson mobilden sipariş geçerken ekran
 * temiz kalır.
 */
export function PrintStatusToast() {
  const isDesktop = useIsDesktopViewport();
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!isDesktop) return;
    const handler = (evt: Event) => {
      const e = evt as CustomEvent<PrintToastDetail>;
      if (!e.detail) return;
      const ttl = e.detail.durationMs ?? DEFAULT_TTL[e.detail.kind] ?? 2500;
      const entry: ToastEntry = { ...e.detail, id: nextId++, ttlMs: ttl };
      setToasts((prev) => {
        const next = [...prev, entry];
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
      timersRef.current[entry.id] = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== entry.id));
        delete timersRef.current[entry.id];
      }, ttl);
    };
    window.addEventListener(PRINT_TOAST_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(PRINT_TOAST_EVENT, handler as EventListener);
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, [isDesktop]);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  };

  if (!isDesktop) return null;
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[10050] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        const style = STYLES[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto relative w-72 sm:w-80 rounded-xl border shadow-lg overflow-hidden ${style.wrap}`}
            style={{ animation: 'sefposPrintToastIn 180ms ease-out' }}
          >
            <div className="flex items-start gap-3 p-3 pr-8">
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${style.icon}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-tight">{t.message}</div>
                {t.target && (
                  <div className="text-xs opacity-80 mt-0.5 truncate">Yazıcı: {t.target}</div>
                )}
                {t.detail && (
                  <div className="text-xs opacity-80 mt-0.5 break-words line-clamp-2">{t.detail}</div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="absolute top-1.5 right-1.5 p-1 rounded-md hover:bg-black/5"
                aria-label="Kapat"
              >
                <X className="w-3.5 h-3.5 opacity-60" />
              </button>
            </div>
            <div
              className={`h-1 ${style.bar}`}
              style={{ animation: `sefposPrintToastBar ${t.ttlMs}ms linear forwards` }}
            />
          </div>
        );
      })}
      <style>{`
        @keyframes sefposPrintToastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sefposPrintToastBar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
