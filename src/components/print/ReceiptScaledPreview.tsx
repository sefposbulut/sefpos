import { useLayoutEffect, useRef, useState } from 'react';

type Props = {
  html: string;
  /** Hub kartı küçük önizleme; editor tam boy */
  variant?: 'thumb' | 'editor';
  className?: string;
  paperMm?: number;
  /** Sadece editor — ek büyütme (1 = yok) */
  zoom?: number;
};

const MM_TO_PX = 96 / 25.4;

/**
 * Termal fiş HTML'ini sabit kağıt genişliğinde üretir, kartta orantılı küçültür.
 * ResizeObserver yalnızca host'u izler; scrollbar / scale geri beslemesi titreme yapmasın.
 */
export function ReceiptScaledPreview({
  html,
  variant = 'thumb',
  className = '',
  paperMm = 72,
  zoom = 1,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, width: 0, height: 0 });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const isThumb = variant === 'thumb';

  useLayoutEffect(() => {
    const host = hostRef.current;
    const paper = paperRef.current;
    if (!host || !paper) return;

    let raf = 0;
    const measure = () => {
      raf = 0;
      const hostW = host.clientWidth;
      const pad = isThumb ? 24 : 32;
      const available = Math.max(120, hostW - pad);
      const naturalW = paperMm * MM_TO_PX;
      // transform ölçeği scrollHeight'i bozmasın diye geçici olarak scale=1 ölç
      const prev = paper.style.transform;
      paper.style.transform = 'scale(1)';
      const naturalH = Math.max(paper.scrollHeight || paper.offsetHeight || 1, 1);
      paper.style.transform = prev;

      let scale = Math.min(1, available / naturalW);
      if (isThumb) scale = Math.min(scale, 0.95);
      const totalScale = scale * (variant === 'editor' ? zoom : 1);
      const next = {
        scale: totalScale,
        width: naturalW * totalScale,
        height: naturalH * totalScale,
      };
      const prevL = layoutRef.current;
      if (
        Math.abs(prevL.scale - next.scale) < 0.002 &&
        Math.abs(prevL.width - next.width) < 0.5 &&
        Math.abs(prevL.height - next.height) < 0.5
      ) {
        return;
      }
      setLayout(next);
    };

    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    // paper'ı gözlemleme — scale/height geri beslemesi titreme yapar
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [html, paperMm, zoom, isThumb, variant]);

  const paperClass =
    variant === 'editor'
      ? 'receipt-preview-paper receipt-preview-paper--editor'
      : 'receipt-preview-paper receipt-preview-paper--thumb';

  return (
    <div
      ref={hostRef}
      className={`flex justify-center w-full min-w-0 ${isThumb ? 'py-3 px-2' : 'py-4 px-3'} ${className}`}
    >
      <div
        className="relative shrink-0 overflow-hidden"
        style={{
          width: layout.width > 0 ? layout.width : undefined,
          height: layout.height > 0 ? layout.height : undefined,
        }}
      >
        <div
          ref={paperRef}
          className={`${paperClass} shadow-lg ring-1 ring-slate-200/90 rounded-sm`}
          style={{
            width: `${paperMm}mm`,
            transform: `scale(${layout.scale || 1})`,
            transformOrigin: 'top left',
            willChange: 'transform',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
