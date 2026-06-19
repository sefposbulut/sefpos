import { memo, useEffect, useState } from 'react';
import { subscribeLiveTick } from '../lib/liveTick';

/** Masa grid footer saati — parent TableGrid her dk re-render olmasin. */
function FooterClockInner({ active }: { active: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    return subscribeLiveTick(() => setNow(new Date()));
  }, [active]);

  const dateStr = now.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      <span className="tabular-nums">{dateStr}</span>
      <span className="opacity-45 shrink-0 select-none">|</span>
      <span className="tabular-nums">{timeStr}</span>
    </>
  );
}

export const FooterClock = memo(FooterClockInner);
