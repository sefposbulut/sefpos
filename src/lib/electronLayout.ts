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

export const ELECTRON_HEADER_PADDING = 'px-4 md:px-5';

/** Masaustu POS — tek satir, marka blogu sigacak yukseklik */
export const ELECTRON_HEADER_ROW_CLASS =
  'flex items-center justify-between gap-2 md:gap-3 h-14 w-full min-h-14 max-h-14 overflow-hidden';

export const ELECTRON_HEADER_LOGO_CLASS =
  'h-9 w-9 md:h-10 md:w-10 rounded-full object-cover bg-white ring-2 ring-orange-200 shadow-sm shrink-0 select-none';

/** Logo + slogan — header icine sigan marka alani */
export const ELECTRON_HEADER_BRAND_BLOCK =
  'flex items-center gap-2 h-10 md:h-11 max-h-11 shrink-0 pl-1 pr-2.5 md:pr-3 rounded-lg bg-gradient-to-r from-orange-50/90 via-white to-orange-50/50 border border-orange-100';

export const ELECTRON_HEADER_BRAND_NAME =
  'text-sm md:text-[15px] font-extrabold tracking-tight leading-none bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent';

export const ELECTRON_HEADER_SLOGAN_LINE =
  'text-[9px] md:text-[10px] font-semibold text-slate-600 tracking-wide leading-tight mt-0.5';

export const ELECTRON_HEADER_SLOGAN_BLOCK =
  'flex flex-col justify-center min-w-0 pr-0.5 leading-none';

/** Masalar vb. — ana sayfaya donus */
export const ELECTRON_HEADER_HOME_BTN_CLASS =
  `inline-flex items-center justify-center gap-1.5 ${ELECTRON_HEADER_TOOL_H} px-2.5 md:px-3 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 transition active:scale-[0.98] shrink-0`;

/** Logo ile baslik arasi */
export const ELECTRON_HEADER_DIVIDER = 'hidden sm:block w-px h-8 bg-slate-200 shrink-0';

/** Sayfa basligi (Masalar, Raporlar…) — slogan yerine */
export const ELECTRON_HEADER_TITLE_BLOCK =
  'hidden sm:flex flex-col justify-center min-w-0 max-w-[9rem] md:max-w-[14rem] lg:max-w-none';

export const ELECTRON_HEADER_TITLE =
  'text-sm md:text-[15px] font-bold text-slate-900 truncate leading-tight';

export const ELECTRON_HEADER_SUBTITLE =
  'text-[10px] md:text-[11px] text-slate-500 truncate leading-tight mt-0.5';

/** Sag ikon grubu — bildirim, ayar, zoom */
export const ELECTRON_HEADER_TOOLBAR_GROUP =
  'hidden sm:flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/90 p-0.5 shrink-0';

/** @deprecated ELECTRON_HEADER_SLOGAN_BLOCK kullanin */
export const ELECTRON_HEADER_SLOGAN_CLASS = ELECTRON_HEADER_SLOGAN_BLOCK;
