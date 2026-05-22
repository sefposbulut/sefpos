import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type Accent = 'orange' | 'emerald' | 'amber';

const ACCENT_STYLES: Record<
  Accent,
  { border: string; header: string; ring: string; cta: string; iconBg: string }
> = {
  orange: {
    border: 'border-orange-200 hover:border-orange-400',
    header: 'bg-gradient-to-r from-orange-500 to-orange-600 text-white',
    ring: 'hover:ring-orange-200',
    cta: 'text-orange-600 group-hover:text-orange-700',
    iconBg: 'bg-orange-400/30',
  },
  emerald: {
    border: 'border-emerald-200 hover:border-emerald-400',
    header: 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white',
    ring: 'hover:ring-emerald-200',
    cta: 'text-emerald-600 group-hover:text-emerald-700',
    iconBg: 'bg-emerald-400/30',
  },
  amber: {
    border: 'border-amber-200 hover:border-amber-400',
    header: 'bg-gradient-to-r from-amber-500 to-amber-600 text-white',
    ring: 'hover:ring-amber-200',
    cta: 'text-amber-700 group-hover:text-amber-800',
    iconBg: 'bg-amber-400/30',
  },
};

type Props = {
  title: string;
  subtitle: string;
  icon: ReactNode;
  accent: Accent;
  html: string;
  onClick: () => void;
};

/** Ana menü — kareye yakın kart, fiş tam ve okunaklı önizleme */
export function ReceiptHubCard({ title, subtitle, icon, accent, html, onClick }: Props) {
  const s = ACCENT_STYLES[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col text-left rounded-2xl border-2 bg-white shadow-sm hover:shadow-xl transition-all duration-200 hover:ring-4 ${s.border} ${s.ring} overflow-hidden min-h-0 h-full`}
    >
      <div className={`flex items-center gap-3 px-4 py-3.5 ${s.header}`}>
        <span className={`flex items-center justify-center w-10 h-10 rounded-xl ${s.iconBg}`}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-base leading-tight truncate">{title}</div>
          <div className="text-xs text-white/85 mt-0.5">{subtitle}</div>
        </div>
      </div>

      {/* Önizleme alanı: geniş, kaydırılabilir, sıkıştırma yok */}
      <div className="flex-1 min-h-[360px] max-h-[min(52vh,520px)] bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 p-5 sm:p-6 overflow-y-auto overflow-x-hidden">
        <div className="flex justify-center">
          <div
            className="bg-white text-black shadow-lg ring-1 ring-slate-200/90 rounded-sm"
            style={{
              width: '72mm',
              maxWidth: '100%',
              minHeight: '80mm',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-t border-slate-100 bg-white">
        <span className="text-xs text-slate-500">Tıklayın: büyük önizleme + canlı ayar</span>
        <span
          className={`inline-flex items-center gap-1 text-sm font-bold shrink-0 ${s.cta}`}
        >
          Düzenle
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}
