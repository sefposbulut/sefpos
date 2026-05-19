import { PlatformLogo } from '../../PlatformLogo';
import { INTEGRATIONS } from '../content/siteContent';

/** Platform logoları — sürekli yatay kaydırma */
export function IntegrationMarquee() {
  const items = INTEGRATIONS;
  const loop = [...items, ...items];

  return (
    <div className="relative overflow-hidden py-2">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 md:w-24 bg-gradient-to-r from-slate-100 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 md:w-24 bg-gradient-to-l from-slate-100 to-transparent"
        aria-hidden
      />
      <div className="landing-marquee-track flex items-center gap-5 md:gap-8">
        {loop.map((item, i) => (
          <div
            key={`${item.code}-${i}`}
            className="flex shrink-0 items-center justify-center rounded-2xl border border-slate-200/90 bg-white px-8 py-5 shadow-sm min-h-[72px] min-w-[150px]"
          >
            <PlatformLogo code={item.code} name={item.name} size="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
