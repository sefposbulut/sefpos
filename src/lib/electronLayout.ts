/** Electron ust bar — ana sayfa ile masalar Header ayni yukseklik (gecis ziplamasi olmasin). */
export const ELECTRON_HEADER_BAR_CLASS =
  'flex-shrink-0 bg-gradient-to-br from-orange-600 via-orange-600 to-orange-700 text-white shadow-md border-b border-black/10';

/** Turuncu barda tum aksiyonlar ayni yukseklik (40px). */
export const ELECTRON_HEADER_TOOL_H = 'h-10 min-h-10';

/** Turuncu barda ikincil buton / chip (cam efekti). */
export const ELECTRON_HEADER_CHIP_CLASS =
  `inline-flex items-center justify-center gap-2 ${ELECTRON_HEADER_TOOL_H} px-3 rounded-lg bg-white/10 hover:bg-white/18 border border-white/20 text-white transition active:scale-[0.98]`;

export const ELECTRON_HEADER_ICON_BTN_CLASS =
  `inline-flex items-center justify-center ${ELECTRON_HEADER_TOOL_H} w-10 rounded-lg text-white hover:text-white hover:bg-white/12 transition active:scale-95`;

export const ELECTRON_HEADER_PADDING = 'px-3 md:px-6';

export const ELECTRON_HEADER_ROW_CLASS =
  'flex items-center justify-between gap-4 h-14 md:h-20 w-full';

export const ELECTRON_HEADER_LOGO_CLASS =
  'h-12 w-12 md:h-14 md:w-14 rounded-full object-cover bg-white ring-2 ring-white/40 shadow-md shrink-0 select-none';

export const ELECTRON_HEADER_SLOGAN_CLASS =
  'hidden sm:flex flex-col justify-center border-l border-white/25 pl-3 ml-0.5 min-w-0';
