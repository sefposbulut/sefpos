import { Eye } from 'lucide-react';

type Props = {
  html: string;
  compact?: boolean;
  className?: string;
};

/** 80 mm termal fiş — ekranda küçültülmüş canlı önizleme */
export function ReceiptThermalPreview({ html, compact, className = '' }: Props) {
  const scale = compact ? 0.42 : 0.58;
  const maxH = compact ? 200 : 360;

  return (
    <div
      className={`relative rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 overflow-hidden ${className}`}
    >
      <div className="absolute top-2 left-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
        <Eye className="w-3 h-3" />
        80 mm önizleme
      </div>
      <div
        className="flex justify-center overflow-y-auto overflow-x-hidden py-3 px-2"
        style={{ maxHeight: maxH }}
      >
        <div
          style={{
            width: '72mm',
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            marginBottom: compact ? -80 : -120,
          }}
        >
          <div
            className="bg-white shadow-md border border-slate-200 text-black"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
