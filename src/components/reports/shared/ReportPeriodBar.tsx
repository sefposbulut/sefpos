import { RefreshCw } from 'lucide-react';
import {
  DEFAULT_REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  type ReportPeriod,
} from '../../../lib/reportUtils';

interface ReportPeriodBarProps {
  period: ReportPeriod;
  onPeriodChange: (p: ReportPeriod) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  onApply?: () => void;
  onRefresh: () => void;
  periods?: ReportPeriod[];
  accent?: 'orange' | 'blue';
}

export function ReportPeriodBar({
  period,
  onPeriodChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onApply,
  onRefresh,
  periods = DEFAULT_REPORT_PERIODS,
  accent = 'orange',
}: ReportPeriodBarProps) {
  const activeCls =
    accent === 'blue' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white';
  const applyCls =
    accent === 'blue'
      ? 'bg-blue-600 hover:bg-blue-700'
      : 'bg-orange-500 hover:bg-orange-600';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {periods.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className={`px-3 py-2 text-xs font-semibold transition-all ${
              period === p ? activeCls : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {REPORT_PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          />
          <button
            type="button"
            onClick={onApply ?? onRefresh}
            className={`px-4 py-2 text-white rounded-lg text-sm font-semibold transition ${applyCls}`}
          >
            Uygula
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onRefresh}
        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition ml-auto"
        title="Yenile"
      >
        <RefreshCw className="w-4 h-4 text-slate-500" />
      </button>
    </div>
  );
}
