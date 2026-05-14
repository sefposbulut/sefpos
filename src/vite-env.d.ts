/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DB_MODE?: string;
  readonly VITE_PHONE_AUTH_EMAIL_DOMAIN?: string;
  /** `true` iken sayım belgesi RPC (SAYIM-00001); yoksa SYM- (POST/404 yok). */
  readonly VITE_STOCK_COUNT_BATCH_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Vite `define` — yalnızca `vite` dev/build sırasında doldurulur (bkz. vite.config.ts). */
declare const __SEFPOS_DEV_SUPABASE_URL__: string;
declare const __SEFPOS_DEV_SUPABASE_ANON_KEY__: string;
/** `sefpos-dev-port.json` → devPortJsonOverridesEnv: .env / localStorage öncesi zorunlu URL (boş string = kapalı). */
declare const __SEFPOS_DEV_PORT_OVERRIDE_URL__: string;
declare const __SEFPOS_DEV_PORT_OVERRIDE_ANON__: string;
