/** Yuvarlak ŞefPOS rozeti (sef.zip) */
const ROUND_LOGO_SRC = './sefpos-round.png';

const SIZE_MAP = {
  xs: { box: 'h-8 w-8', ring: 'ring-1' },
  sm: { box: 'h-10 w-10', ring: 'ring-2' },
  md: { box: 'h-12 w-12', ring: 'ring-2' },
  lg: { box: 'h-14 w-14 md:h-16 md:w-16', ring: 'ring-2' },
  xl: { box: 'h-16 w-16 md:h-[4.5rem] md:w-[4.5rem]', ring: 'ring-[3px]' },
} as const;

type BrandLogoSize = keyof typeof SIZE_MAP;

type BrandLogoProps = {
  className?: string;
  size?: BrandLogoSize;
  /** Koyu hero / mockup üst çubuğu */
  onDark?: boolean;
};

export function BrandLogo({
  className = '',
  size = 'md',
  onDark = false,
}: BrandLogoProps) {
  const dim = SIZE_MAP[size];
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-white',
        dim.box,
        dim.ring,
        onDark
          ? 'shadow-lg shadow-black/40 ring-white/25'
          : 'shadow-md shadow-slate-900/10 ring-orange-100/90',
        'transition-transform duration-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={ROUND_LOGO_SRC}
        alt="ŞefPOS"
        className="h-full w-full object-cover scale-[1.03]"
        draggable={false}
        width={128}
        height={128}
      />
    </span>
  );
}

export { ROUND_LOGO_SRC };
