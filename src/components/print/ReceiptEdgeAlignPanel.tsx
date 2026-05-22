import { AlignHorizontalJustifyCenter, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PrintSettings, PrintStyleSettings } from '../../lib/printService';

type Props = {
  settings: PrintSettings;
  patchPrintStyle: (partial: Partial<PrintStyleSettings>) => void;
  /** Paket fişinde ek −1 mm sol düzeltme uygulanır */
  paketExtraMm?: number;
  accent?: 'orange' | 'emerald' | 'amber';
  /** Ana menü «details» içinde — çift çerçeve olmasın */
  embedded?: boolean;
};

const ACCENT = {
  orange: 'border-orange-200 bg-orange-50/60',
  emerald: 'border-emerald-200 bg-emerald-50/60',
  amber: 'border-amber-200 bg-amber-50/60',
};

const PRESETS = [-3, -2, -1, 0, 1, 2, 3] as const;

function clampOffset(v: number) {
  return Math.min(15, Math.max(-15, v));
}

export function ReceiptEdgeAlignPanel({
  settings,
  patchPrintStyle,
  paketExtraMm = 0,
  accent = 'orange',
  embedded = false,
}: Props) {
  const base = settings.printStyle.paperOffsetMm;
  const effective = base + paketExtraMm;

  const nudge = (delta: number) => {
    patchPrintStyle({ paperOffsetMm: clampOffset(base + delta) });
  };

  return (
    <div
      className={
        embedded
          ? 'space-y-4 pt-2'
          : `rounded-xl border-2 p-4 md:p-5 space-y-4 ${ACCENT[accent]}`
      }
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm">
          <AlignHorizontalJustifyCenter className="w-5 h-5 text-slate-700" />
        </div>
        <div>
          <h5 className="text-sm font-bold text-slate-900">Kenar hizalama (yatay kayma)</h5>
          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
            Fiş yazıcıda sağa veya sola kayıyorsa mm cinsinden düzeltin. Önizleme anında güncellenir.
            {paketExtraMm !== 0 && (
              <span className="block mt-1 text-amber-800 font-medium">
                Paket fişinde yazdırmada ek {paketExtraMm} mm sol düzeltme uygulanır (toplam: {effective} mm).
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => nudge(-0.5)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-sm font-bold text-slate-700"
          title="0.5 mm sola"
        >
          <ChevronLeft className="w-4 h-4" />
          İnce sola
        </button>
        {PRESETS.map((mm) => (
          <button
            key={mm}
            type="button"
            onClick={() => patchPrintStyle({ paperOffsetMm: mm })}
            className={`min-w-[2.5rem] px-2.5 py-2 rounded-lg text-sm font-bold border transition ${
              base === mm
                ? 'bg-orange-500 border-orange-600 text-white shadow-md'
                : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300'
            }`}
          >
            {mm > 0 ? `+${mm}` : mm}
          </button>
        ))}
        <button
          type="button"
          onClick={() => nudge(0.5)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-sm font-bold text-slate-700"
          title="0.5 mm sağa"
        >
          İnce sağa
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-center">
        <input
          type="range"
          min={-15}
          max={15}
          step={0.5}
          value={base}
          onChange={(e) => patchPrintStyle({ paperOffsetMm: clampOffset(Number(e.target.value)) })}
          className="w-full h-2 accent-orange-500"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={-15}
            max={15}
            step={0.5}
            value={base}
            onChange={(e) => patchPrintStyle({ paperOffsetMm: clampOffset(Number(e.target.value) || 0) })}
            className="w-20 px-2 py-2 rounded-lg border border-slate-300 text-sm font-bold text-center bg-white"
          />
          <span className="text-xs font-bold text-slate-500">mm</span>
        </div>
        <button
          type="button"
          onClick={() => patchPrintStyle({ paperOffsetMm: 0 })}
          className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Sıfırla (0)
        </button>
      </div>

      <p className="text-[11px] text-slate-500">
        <strong className="text-slate-700">Negatif (−)</strong> içeriği sola kaydırır ·{' '}
        <strong className="text-slate-700">Pozitif (+)</strong> sağa kaydırır.
      </p>
    </div>
  );
}
