import { useEffect, useRef, useState } from 'react';
import { provinceDisplayName } from '../../../lib/resellerProvince';
import { slugFromPlate } from '../../../lib/turkeyMapPlates';

const MAP_SRC = '/landing/turkiye-provinces.svg';

type Props = {
  coveredSlugs: Set<string>;
  selectedSlug: string | null;
  onSelectSlug: (slug: string | null) => void;
};

function groupBBox(g: SVGGElement) {
  const paths = g.querySelectorAll('path');
  if (!paths.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach((p) => {
    const b = p.getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  const w = maxX - minX;
  const h = maxY - minY;
  return { x: minX + w / 2, y: minY + h / 2, w, h };
}

function labelForSlug(slug: string, boxW: number): string {
  const full = provinceDisplayName(slug);
  if (boxW < 22) return full.length > 6 ? full.slice(0, 5) : full;
  if (boxW < 40) {
    const short: Record<string, string> = {
      afyonkarahisar: 'Afyon',
      kahramanmaras: 'Maraş',
      gaziantep: 'Antep',
      sanliurfa: 'Urfa',
      istanbul: 'İstanbul',
    };
    return short[slug] ?? (full.length > 9 ? full.slice(0, 8) : full);
  }
  return full;
}

function labelFontSize(boxW: number, text: string): number {
  let size = Math.min(17, Math.max(11, boxW * 0.26));
  if (text.length > 9) size = Math.min(size, boxW * 0.2);
  return Math.round(size * 10) / 10;
}

function mountProvinceLabels(svg: SVGSVGElement) {
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('id', 'province-labels');
  layer.setAttribute('class', 'landing-map-labels');

  const bySlug = new Map<string, SVGGElement[]>();
  svg.querySelectorAll<SVGGElement>('g[data-plakakodu]').forEach((g) => {
    const plate = Number.parseInt(g.getAttribute('data-plakakodu') || '', 10);
    const slug = slugFromPlate(plate);
    if (!slug) return;
    const list = bySlug.get(slug) ?? [];
    list.push(g);
    bySlug.set(slug, list);
  });

  bySlug.forEach((groups, slug) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    groups.forEach((g) => {
      const b = groupBBox(g);
      if (!b) return;
      minX = Math.min(minX, b.x - b.w / 2);
      minY = Math.min(minY, b.y - b.h / 2);
      maxX = Math.max(maxX, b.x + b.w / 2);
      maxY = Math.max(maxY, b.y + b.h / 2);
    });
    if (!Number.isFinite(minX)) return;

    const w = maxX - minX;
    const cx = minX + w / 2;
    const cy = minY + (maxY - minY) / 2;
    const text = labelForSlug(slug, w);
    const fontSize = labelFontSize(w, text);

    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', String(cx));
    el.setAttribute('y', String(cy));
    el.setAttribute('text-anchor', 'middle');
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-size', String(fontSize));
    el.setAttribute('class', 'landing-map-label');
    el.dataset.slug = slug;
    el.textContent = text;
    layer.appendChild(el);
  });

  svg.appendChild(layer);
}

function labelShouldShow(slug: string, covered: Set<string>, hover: string | null, selected: string | null) {
  if (covered.has(slug)) return true;
  if (hover === slug) return true;
  if (selected === slug) return true;
  return false;
}

/** MIT — ramazansancar/turkiye-haritasi-svg tabanlı 81 il SVG */
export function TurkeySvgMap({ coveredSlugs, selectedSlug, onSelectSlug }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectSlug);
  onSelectRef.current = onSelectSlug;

  const [hoverSlug, setHoverSlug] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(MAP_SRC);
        if (!res.ok) throw new Error(String(res.status));
        const markup = await res.text();
        if (cancelled) return;

        host.innerHTML = markup;
        const svg = host.querySelector('svg');
        if (!svg) return;

        svg.setAttribute('class', 'landing-turkey-svg');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.removeAttribute('width');
        svg.removeAttribute('height');

        svg.querySelectorAll<SVGGElement>('g[data-plakakodu]').forEach((g) => {
          const plate = Number.parseInt(g.getAttribute('data-plakakodu') || '', 10);
          const slug = slugFromPlate(plate);
          if (!slug) return;

          g.classList.add('landing-map-province');
          g.dataset.slug = slug;

          const name = provinceDisplayName(slug);
          g.setAttribute('role', 'button');
          g.setAttribute('tabindex', '0');
          g.setAttribute('aria-label', name);

          const activate = () => {
            setHoverSlug(slug);
            const current = host.querySelector<SVGGElement>('.landing-map-province.is-selected');
            const isSelf = current === g;
            onSelectRef.current(isSelf ? null : slug);
          };

          g.addEventListener('click', activate);
          g.addEventListener('mouseenter', () => setHoverSlug(slug));
          g.addEventListener('mouseleave', () => setHoverSlug((s) => (s === slug ? null : s)));
          g.addEventListener('touchstart', () => setHoverSlug(slug), { passive: true });
          g.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              activate();
            }
          });
        });

        mountProvinceLabels(svg);
      } catch {
        if (!cancelled) {
          host.innerHTML =
            '<p class="text-sm text-slate-500 p-8 text-center">Harita yüklenemedi. Sayfayı yenileyin.</p>';
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = '';
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.querySelectorAll<SVGGElement>('.landing-map-province').forEach((g) => {
      const slug = g.dataset.slug || '';
      g.classList.toggle('has-dealer', coveredSlugs.has(slug));
      g.classList.toggle('is-selected', selectedSlug === slug);
      g.classList.toggle('is-hovered', hoverSlug === slug);
    });

    host.querySelectorAll<SVGTextElement>('.landing-map-label').forEach((t) => {
      const slug = t.dataset.slug || '';
      const show = labelShouldShow(slug, coveredSlugs, hoverSlug, selectedSlug);
      const onOrange = coveredSlugs.has(slug) || selectedSlug === slug;
      t.classList.toggle('is-visible', show);
      t.classList.toggle('on-orange', onOrange && show);
      t.classList.toggle('on-light', show && !onOrange);
    });
  }, [coveredSlugs, selectedSlug, hoverSlug]);

  return (
    <div
      ref={hostRef}
      className="landing-turkey-svg-host"
      aria-label="Türkiye ili haritası — ile tıklayarak bayileri görün"
    />
  );
}
