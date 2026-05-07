# SEFPOS Project Memory (Permanent)

This file is the permanent project memory for this repository.

## Project Identity

- **Ürün / ekran adı (Türkçe):** ŞefPOS — kullanıcı arayüzü, yazılım adı ve pazarlama metinlerinde bu isim kullanılır; kaybolmaması için tüm oturumlarda bu kimlik geçerlidir.
- **Teknik / repo adı:** `SEFPOS` (büyük harf, kısaltma). Paket klasörü tarihsel olarak `shefpos` olabilir; yeni kodda mümkünse `SEFPOS` / `sefpos` ile tutarlı kal.
- Primary workspace path: `C:\sefpos`
- Primary Supabase URL: `https://xdfnozfuuzctubijbnds.supabase.co`
- Primary Supabase project ref: `xdfnozfuuzctubijbnds`

## Non-Negotiable Rules

- Always stay on this project context unless the user explicitly asks to switch.
- Never run Supabase operations against any project ref other than the primary listed above (unless an explicit, documented env override is used for diagnostics).
- Do not change the primary Supabase URL/ref in this file without an intentional repo update; avoid suggesting unrelated Supabase projects.
- Keep performance-first behavior for POS flows (tables, order panel, payments).
- When changing waiter/device logic, preserve hard-disable behavior for inactive/deleted users.

## Deployment / Automation Defaults

- CI workflow: `.github/workflows/ci.yml`
- Supabase migration workflow: `.github/workflows/supabase-migrations.yml`
- Dependency automation: `.github/dependabot.yml`

Required GitHub secrets for automation:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (must be `xdfnozfuuzctubijbnds`)
- `SUPABASE_DB_PASSWORD`

## Local Environment Contract

Expected keys in `.env`:

- `VITE_SUPABASE_URL=https://xdfnozfuuzctubijbnds.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<present>`

## Operator Note

- **Cursor Supabase MCP:** Proje kökünde `.cursor/mcp.json` — uzaktaki MCP `project_ref=xdfnozfuuzctubijbnds` ile kapsanır ([Supabase MCP yapılandırması](https://supabase.com/docs/guides/getting-started/mcp)). Cursor’u yeniden yükleyin veya **Settings → Tools & MCP** altında sunucunun bağlı olduğunu doğrulayın; gerekirse tarayıcı OAuth ile yeniden giriş yapın.
- If Supabase MCP access fails with permission errors, reconnect/authenticate the Supabase integration with the account that owns project ref `xdfnozfuuzctubijbnds`, then continue.

## Teknik yığın ve mimari (özet — sahip bilgisi)

**Ön uç (UI):** React 18 + TypeScript. Derleyici ve dev sunucu: **Vite**. Giriş noktası: `src/main.tsx`, ana kabuk: `src/App.tsx`. Bileşenler `src/components/`, ortak durum `src/contexts/` (ör. `AuthContext.tsx`), yardımcılar `src/lib/`.

**Masaüstü:** **Electron** (`electron/main.cjs`, `electron/preload.cjs`). Windows kurulumu `electron-builder` ile; yerel donanım/yazıcı/terazi ve yerel veritabanı bağlantıları bu katmanda. Script: `npm run electron:dev` (geliştirme), `npm run electron:build:win` (Windows paket).

**Bulut veri:** **Supabase** = PostgreSQL + Auth + (Realtime). Üretim şeması `supabase/migrations/` SQL dosyalarıyla sürümlenir. Sunucu tarafı işler `supabase/functions/` (Edge Functions). İstemci: `@supabase/supabase-js`; proje kökünde `src/lib/supabase.ts` tek giriş noktası.

**Hibrit / çevrimdışı (Electron):** `localStorage` içindeki `dbMode` ile mod seçilir (`sqlserver`, `postgres`, `local` vb.). Bu modlarda `supabase` nesnesi bir **Proxy** ile gerçek API yerine `src/lib/sqlDb.ts` (SQL Server sorguları) veya yerel sarmalayıcıya gider; böylece aynı React kodu bulut veya şube sunucusunda çalışabilir. Şema referansı SQL Server için repoda `shefpos_sqlserver.sql`.

**Performans:** POS sıcak yollarında (masalar, sipariş, ödeme) gereksiz yeniden render ve ağ çağrısı azaltılır; menü/ürün için `src/lib/queryCache.ts` kullanılır.

**Yerel geliştirme:** Web için `npm run dev`; port **yalnızca** repo kökündeki `sefpos-dev-port.json` → `port` alanından okunur (Vite, Electron `electron:dev` aynı dosyayı kullanır). Varsayılan 5180; değiştirmek için sadece bu JSON’u düzenle. Ortam değişkenleri `.env` içinde `VITE_*` (yukarıda).

**Özet cümle:** ŞefPOS = **React + TypeScript + Vite** arayüz, **Supabase (Postgres)** merkezi veri, isteğe bağlı **Electron + SQL Server / yerel** şube kurulumu; iş kuralları çoğunlukla Postgres tarafında (RLS, migration), uygulama mantığı `src/` altında.
