import { ArrowRight } from 'lucide-react';

interface CTABandProps {
  title: string;
  subtitle: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
}

export function CTABand({
  title,
  subtitle,
  onPrimary,
  onSecondary,
  primaryLabel = 'Ücretsiz Dene',
  secondaryLabel = 'Bizi Arayın',
}: CTABandProps) {
  const trialPrimary = /ücretsiz/i.test(primaryLabel);
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-600 via-orange-500 to-red-800" />
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]" />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-black text-white mb-4">{title}</h2>
        <p className="text-lg text-orange-50 mb-8 max-w-2xl mx-auto">{subtitle}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={onPrimary}
            className={
              trialPrimary
                ? 'inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl transition shadow-lg shadow-orange-900/25'
                : 'inline-flex items-center justify-center gap-2 bg-white text-orange-700 font-bold px-8 py-4 rounded-xl hover:bg-orange-50 transition shadow-lg'
            }
          >
            {primaryLabel}
            <ArrowRight className="w-5 h-5" />
          </button>
          {onSecondary && (
            <button type="button" onClick={onSecondary} className="inline-flex items-center justify-center gap-2 border-2 border-white/80 text-white font-bold px-8 py-4 rounded-xl hover:bg-white/10 transition">
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
