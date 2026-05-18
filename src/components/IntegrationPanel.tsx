import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

export type IntegrationBadgeTone = 'ok' | 'muted' | 'warn';

interface Props {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  badge?: { text: string; tone: IntegrationBadgeTone };
  accent?: 'emerald' | 'indigo' | 'slate';
  children: ReactNode;
}

const accentRing: Record<NonNullable<Props['accent']>, string> = {
  emerald: 'border-emerald-200 focus-within:ring-emerald-500/30',
  indigo: 'border-indigo-200 focus-within:ring-indigo-500/30',
  slate: 'border-slate-200 focus-within:ring-slate-500/20',
};

const accentIcon: Record<NonNullable<Props['accent']>, string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  slate: 'bg-slate-100 text-slate-700',
};

const badgeClass: Record<IntegrationBadgeTone, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  muted: 'bg-slate-100 text-slate-600',
  warn: 'bg-amber-100 text-amber-800',
};

export default function IntegrationPanel({
  title,
  subtitle,
  icon: Icon,
  open,
  onToggle,
  badge,
  accent = 'slate',
  children,
}: Props) {
  return (
    <section
      className={`rounded-xl border bg-white overflow-hidden shadow-sm focus-within:ring-2 ${accentRing[accent]}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 transition-colors"
        aria-expanded={open}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentIcon[accent]}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-bold text-slate-900 block">{title}</span>
          <span className="text-xs text-slate-500 block truncate">{subtitle}</span>
        </span>
        {badge && (
          <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeClass[badge.tone]}`}>
            {badge.text}
          </span>
        )}
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-4 space-y-4">{children}</div>}
    </section>
  );
}
