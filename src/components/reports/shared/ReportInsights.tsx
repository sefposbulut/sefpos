import { Sparkles } from 'lucide-react';

interface ReportInsightsProps {
  lines: string[];
}

export function ReportInsights({ lines }: ReportInsightsProps) {
  if (!lines.length) return null;
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Akıllı özet</h3>
      </div>
      <ul className="space-y-2">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-slate-700 flex gap-2">
            <span className="text-indigo-400 font-bold">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400 mt-3">Kural tabanlı yorum — rakamlar veritabanından hesaplanır.</p>
    </div>
  );
}
