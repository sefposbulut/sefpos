import { memo, useEffect, useState } from 'react';
import { subscribeLiveTick } from '../lib/liveTick';

interface LiveDurationProps {
  /** ISO timestamp; siparişin masaya açıldığı an */
  startTime: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}

function formatMinutes(diffMs: number): string {
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`;
}

/**
 * 30 sn'de bir paylaşımlı interval ile yenilenir; üst grid yeniden
 * render edilmez. `React.memo` ile aynı startTime için reuse edilir.
 */
function LiveDurationInner({ startTime, className, style }: LiveDurationProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeLiveTick(setNow), []);
  if (!startTime) return null;
  const diff = now - new Date(startTime).getTime();
  return <span className={className} style={style}>{formatMinutes(diff)}</span>;
}

export const LiveDuration = memo(LiveDurationInner);
