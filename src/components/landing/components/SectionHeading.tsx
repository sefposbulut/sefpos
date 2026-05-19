interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
  light?: boolean;
}

export function SectionHeading({ eyebrow, title, subtitle, align = 'center', light }: SectionHeadingProps) {
  const alignClass = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <div className={`max-w-3xl mb-12 md:mb-16 ${alignClass}`}>
      {eyebrow && (
        <p className={`text-xs font-bold uppercase tracking-[0.2em] mb-3 ${light ? 'text-orange-300' : 'text-orange-600'}`}>
          {eyebrow}
        </p>
      )}
      <h2 className={`text-3xl md:text-4xl lg:text-5xl font-black tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-4 text-lg md:text-xl leading-relaxed ${light ? 'text-slate-300' : 'text-slate-600'}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
