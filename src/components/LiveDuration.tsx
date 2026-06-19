import { memo, useEffect, useState } from 'react';
import { subscribeLiveTick } from '../lib/liveTick';

interface LiveDurationProps {
  /** ISO timestamp; siparişin masaya açıldığı an */
  startTime: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
  /** false iken tick abonesi yok (gizli/warm TableGrid kasmasin). */
  active?: boolean;
}

function formatMinutes(diffMs: number): string {
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`;
}

/**
 * Paylaşımlı 60 sn tick. `active={false}` iken abone olmaz — onlarca masa = onlarca setState önlenir.
 */
function LiveDurationInner({ startTime, className, style, active = true }: LiveDurationProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    return subscribeLiveTick(setNow);
  }, [active]);
  if (!startTime || !active) return null;
  const diff = now - new Date(startTime).getTime();
  return <span className={className} style={style}>{formatMinutes(diff)}</span>;
}

export const LiveDuration = memo(LiveDurationInner);
