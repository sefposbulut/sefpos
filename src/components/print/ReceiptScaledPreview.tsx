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
 * Termal fiş HTML'ini gerçek kağıt genişliğinde (72mm) üretir,
 * dar alanda orantılı küçültür — metni sıkıştırmaz.
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

  const isThumb = variant === 'thumb';

  useLayoutEffect(() => {
    const host = hostRef.current;
    const paper = paperRef.current;
    if (!host || !paper) return;

    const measure = () => {
      const hostW = host.clientWidth;
      const pad = isThumb ? 20 : 32;
      const available = Math.max(120, hostW - pad);
      const naturalW = paper.offsetWidth || paperMm * MM_TO_PX;
      const naturalH = paper.scrollHeight || paper.offsetHeight;
      let scale = Math.min(1, available / naturalW);
      if (isThumb) scale = Math.min(scale, 0.92);
      const visualZoom = variant === 'editor' ? zoom : 1;
      const totalScale = scale * visualZoom;
      setLayout({
        scale: totalScale,
        width: naturalW * totalScale,
        height: naturalH * totalScale,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    ro.observe(paper);
    return () => ro.disconnect();
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
        className="relative shrink-0"
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
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
