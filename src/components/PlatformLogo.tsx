/**
 * Online sipariş platform logoları — paylaşılan bileşen.
 *
 * Getir: yerel SVG asset (resmi sarı + mor wordmark).
 * Diğer platformlar: kurumsal renkli tipografik badge (asset yoksa).
 * Boyut: 'sm' / 'md' (varsayılan). 'sm' bildirim toast için, 'md' OnlineOrders
 * tablosunda kullanılır.
 */

interface PlatformLogoProps {
  code: string;
  name?: string;
  size?: 'sm' | 'md';
}

export function PlatformLogo({ code, name, size = 'md' }: PlatformLogoProps) {
  const c = (code || '').toLowerCase();
  const display = (name || code || '').toLowerCase();

  const isSm = size === 'sm';
  const minWidth = isSm ? 60 : 78;
  const py = isSm ? 'py-1' : 'py-1.5';
  const px = isSm ? 'px-2' : 'px-2.5';

  if (c.includes('getir')) {
    return (
      <img
        src="/platforms/getir.svg"
        alt="Getir"
        className={isSm ? 'h-7 w-auto' : 'h-9 w-auto'}
        draggable={false}
        loading="eager"
      />
    );
  }
  if (c.includes('yemeksepeti')) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-red-600 text-white ${px} ${py} rounded-md leading-none shadow-sm italic`}
        style={{ minWidth }}
      >
        <span className={isSm ? 'text-[9px] font-black' : 'text-[10px] font-black'}>yemek</span>
        <span className={isSm ? 'text-[10px] font-extrabold ml-0.5' : 'text-[11px] font-extrabold ml-0.5'}>sepeti</span>
      </div>
    );
  }
  if (c.includes('trendyol')) {
    return (
      <div
        className={`inline-flex flex-col items-center justify-center bg-orange-500 text-white ${px} ${py} rounded-md leading-none shadow-sm`}
        style={{ minWidth }}
      >
        <span className={isSm ? 'text-[10px] font-black tracking-tight' : 'text-[11px] font-black tracking-tight'}>trendyol</span>
        <span className="text-[8px] font-bold opacity-90 -mt-0.5">YEMEK</span>
      </div>
    );
  }
  if (c.includes('migros')) {
    return (
      <div
        className={`inline-flex flex-col items-center justify-center bg-amber-400 text-orange-900 ${px} ${py} rounded-md leading-none shadow-sm`}
        style={{ minWidth }}
      >
        <span className={isSm ? 'text-[10px] font-black tracking-tight' : 'text-[11px] font-black tracking-tight'}>migros</span>
        <span className="text-[8px] font-bold opacity-90 -mt-0.5">YEMEK</span>
      </div>
    );
  }
  if (c.includes('fody')) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-teal-500 text-white ${px} ${py} rounded-md leading-none shadow-sm italic`}
        style={{ minWidth }}
      >
        <span className="text-[12px] font-black tracking-wide">Fody</span>
      </div>
    );
  }
  if (c.includes('fuudy')) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-cyan-600 text-white ${px} ${py} rounded-md leading-none shadow-sm`}
        style={{ minWidth }}
      >
        <span className="text-[12px] font-black tracking-wide">Fuudy</span>
      </div>
    );
  }
  return (
    <div
      className={`inline-flex items-center justify-center bg-slate-700 text-white ${px} ${py} rounded-md leading-none shadow-sm`}
      style={{ minWidth }}
    >
      <span className={isSm ? 'text-[10px] font-black tracking-wide' : 'text-[11px] font-black tracking-wide'}>
        {display.slice(0, 10).toUpperCase()}
      </span>
    </div>
  );
}
