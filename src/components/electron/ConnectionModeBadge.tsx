import { Cloud, HardDrive, Monitor, Server } from 'lucide-react';
import {
  getConnectionModeDisplay,
  readElectronDbMode,
  type ConnectionModeKey,
} from '../../lib/connectionMode';

const toneClass: Record<string, string> = {
  cloud: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
  sql: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700',
  local: 'bg-amber-500/10 border-amber-500/30 text-amber-700',
  terminal: 'bg-violet-500/10 border-violet-500/30 text-violet-700',
};

const toneClassElectron: Record<string, string> = {
  cloud: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  sql: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  local: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
  terminal: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
};

function ModeIcon({ tone }: { tone: string }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  if (tone === 'sql') return <Server className={cls} />;
  if (tone === 'local') return <HardDrive className={cls} />;
  if (tone === 'terminal') return <Monitor className={cls} />;
  return <Cloud className={cls} />;
}

type Props = {
  mode?: ConnectionModeKey;
  compact?: boolean;
  /** Giriş ekranı koyu arka plan */
  variant?: 'light' | 'dark';
  /** Electron turuncu üst bar */
  electronHeader?: boolean;
  className?: string;
};

export function ConnectionModeBadge({
  mode,
  compact = false,
  variant = 'light',
  electronHeader = false,
  className = '',
}: Props) {
  const effectiveMode = mode ?? readElectronDbMode() ?? 'cloud';
  const display = getConnectionModeDisplay(effectiveMode);

  if (electronHeader) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-[10px] font-bold text-white/90 ${className}`}
        title={display.description}
      >
        <ModeIcon tone={display.tone} />
        {display.shortLabel}
      </span>
    );
  }

  const palette = variant === 'dark' ? toneClassElectron : toneClass;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${palette[display.tone]} ${className}`}
      title={display.description}
    >
      <ModeIcon tone={display.tone} />
      {compact ? display.shortLabel : display.label}
    </span>
  );
}
