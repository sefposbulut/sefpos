/** Electron ust bar — acik kurumsal tema (masaustu ana sayfa ile ayni yukseklik). */
export const ELECTRON_HEADER_BAR_CLASS =
  'flex-shrink-0 bg-white text-slate-800 shadow-[0_1px_3px_rgba(15,23,42,0.06)] border-b border-slate-200 border-t-[3px] border-t-orange-500';

/** Ust barda tum aksiyonlar ayni yukseklik (40px). */
export const ELECTRON_HEADER_TOOL_H = 'h-10 min-h-10';

/** Nötr chip — sube, kullanici, geri donus vb. */
export const ELECTRON_HEADER_CHIP_CLASS =
  `inline-flex items-center justify-center gap-2 ${ELECTRON_HEADER_TOOL_H} px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition active:scale-[0.98]`;

/** Marka vurgulu chip — kurulum, sube secici */
export const ELECTRON_HEADER_ACCENT_CHIP_CLASS =
  `inline-flex items-center justify-center gap-2 ${ELECTRON_HEADER_TOOL_H} px-3 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 transition active:scale-[0.98]`;

export const ELECTRON_HEADER_ICON_BTN_CLASS =
  `inline-flex items-center justify-center ${ELECTRON_HEADER_TOOL_H} w-10 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition active:scale-95`;

/** Cikis butonu */
export const ELECTRON_HEADER_LOGOUT_CLASS =
  `inline-flex items-center justify-center gap-2 ${ELECTRON_HEADER_TOOL_H} px-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 transition active:scale-95`;

export const ELECTRON_HEADER_PADDING = 'px-3 md:px-6';

export const ELECTRON_HEADER_ROW_CLASS =
  'flex items-center justify-between gap-4 h-14 md:h-20 w-full';

export const ELECTRON_HEADER_LOGO_CLASS =
  'h-12 w-12 md:h-14 md:w-14 rounded-full object-cover bg-white ring-2 ring-orange-100 shadow-sm shrink-0 select-none';

export const ELECTRON_HEADER_SLOGAN_CLASS =
  'hidden sm:flex flex-col justify-center border-l border-slate-200 pl-3 ml-0.5 min-w-0';
