import { Eye, Printer, ZoomIn } from 'lucide-react';
import { ReceiptScaledPreview } from './ReceiptScaledPreview';

export type ReceiptPreviewSize = 'editor';

type Props = {
  html: string;
  size?: ReceiptPreviewSize;
  offsetMm?: number;
  className?: string;
};

/** 80 mm termal fiş — canlı önizleme (yazıcı çıktısına yakın boyut) */
export function ReceiptThermalPreview({
  html,
  size = 'editor',
  offsetMm = 0,
  className = '',
}: Props) {
  const zoom = 1.12;

  return (
    <div
      className={`relative rounded-2xl border-2 border-slate-400 bg-slate-900 shadow-xl overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-600 bg-slate-950/80">
        <div className="flex items-center gap-2 text-slate-200">
          <Printer className="w-5 h-5 text-orange-400" />
          <span className="text-sm font-bold">Canlı fiş önizleme</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
          <span className="flex items-center gap-1">
            <ZoomIn className="w-3.5 h-3.5" />
            {Math.round(zoom * 100)}%
          </span>
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            80 mm
          </span>
          {offsetMm !== 0 && (
            <span className="text-orange-300">
              kayma {offsetMm > 0 ? '+' : ''}
              {offsetMm} mm
            </span>
          )}
        </div>
      </div>

      <div
        className="flex items-stretch justify-center gap-1 px-2 py-5 md:px-4 md:py-8 overflow-auto"
        style={{ minHeight: 'min(75vh, 640px)' }}
      >
        <div className="hidden md:flex w-6 shrink-0 items-center justify-center">
          <span className="text-[9px] font-bold text-slate-500 -rotate-90 whitespace-nowrap tracking-widest">
            SOL KENAR
          </span>
        </div>

        <div className="flex-1 flex justify-center items-start min-w-0">
          <ReceiptScaledPreview
            html={html}
            variant="editor"
            zoom={zoom}
            className="!py-2"
          />
        </div>

        <div className="hidden md:flex w-6 shrink-0 items-center justify-center">
          <span className="text-[9px] font-bold text-slate-500 rotate-90 whitespace-nowrap tracking-widest">
            SAĞ KENAR
          </span>
        </div>
      </div>
    </div>
  );
}
