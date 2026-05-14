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
- Supabase weekly backup workflow: `.github/workflows/supabase-backup.yml`
- Electron auto-release workflow: `.github/workflows/electron-release.yml`
- **Web (www.sefpos.com.tr):** Cloudflare Pages projesi **`sefposadisyon`**. Üretim build **`npm run build:pages`** (köke `/assets/`). İki otomatik yol mümkün: (1) Cloudflare’de bu projeye **Git bağlantısı** (aşağıdaki adımlar), (2) GitHub Actions **`.github/workflows/cloudflare-pages-deploy.yml`** + `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`. İkisi birden **aynı projeye** tetiklenirse çift deploy olur; tercihen **birini** kullanın (CF Git açıksa Actions işini `workflow_dispatch` ile sadece elle bırakabilirsiniz).
- Yinelenen **`sefpos`** Pages projesi silindi; yerelde bir kerelik: `npm run cf:pages:delete-legacy-sefpos` (artık gerekmez).

### Cloudflare Pages `sefposadisyon` → GitHub (`sefposbulut/sefpos`)

Panelden (repo dosyası bağlamaz; Cloudflare hesabında yapılır):

1. **Cloudflare Dashboard** → **Workers & Pages** → **`sefposadisyon`** projesini açın.
2. **Git** / **Connect to Git** / **Set up builds** (arayüz metni sürüme göre değişebilir) ile GitHub bağlantısını başlatın.
3. **Cloudflare GitHub App** yetkisinde organizasyon **`sefposbulut`**, repository **`sefpos`** seçilsin (yalnızca bu repo önerilir).
4. **Production branch:** `master` (projede varsayılan ana dal buysa).
5. **Build ayarları:**
   - **Root directory:** `/` (boş veya `/`).
   - **Build command:** `npm ci && npm run build:pages`  
     (`npm run build` kullanmayın; `./assets` üretir, www kökünde yanlış çözülür.)
   - **Build output directory:** `dist`
6. İlk kayıttan sonra **Save** / **Deploy** ile bir dağıtım tetikleyin; **Deployments** sekmesinde log kırılmadan yeşil olduğunu doğrulayın.
7. (İsteğe bağlı) Cloudflare **Environment variables** içinde yerel `.env` ile aynı `VITE_*` değişkenleri tanımlanabilir; tanımlanmazsa istemci yine `src/lib/supabase.ts` içindeki birincil proje yedekleriyle açılır.

**Not:** Eski üstteki **`sefpos`** projesi silindiyse GitHub push artık oraya gitmez; tek üretim Pages projesi **`sefposadisyon`** olmalıdır.
- Dependency automation: `.github/dependabot.yml`

## Otomatik sürüm yayınlama (ZORUNLU akış)

**Her değişiklikten sonra** — düzeltme, yeni özellik, UI/UX iyileştirme,
performans, hata gidermesi farketmez — yapılan iş kullanıcının masaüstündeki
ŞefPOS'a otomatik güncelleme olarak ulaşmalı. Bu yüzden agent **her
commit'ten sonra** şu adımları **otomatik** uygular (kullanıcı tek tek
istemese bile):

1. `package.json` → `version` alanını **patch level** yükselt (ör. `1.0.7 → 1.0.8`).
   Major/minor bump'ı kullanıcı açıkça istemedikçe yapma.
2. Değişiklikleri commit et (HEREDOC veya temp dosya ile multi-line mesaj).
3. Master'a push: `git push origin master`.
4. Yeni tag oluştur: `git tag -a v<version> -m "<kisa-aciklama>"`.
5. Tag'i push et: `git push origin v<version>`.

GitHub Actions (`electron-release.yml`) tag push'unu görür görmez Windows
installer build alır, **softprops/action-gh-release@v2** ile
**`sefposbulut/sefpos-releases`** repo'sundaki Release'e
`Sefpos-Setup-<version>.exe`, `latest.yml`, `.blockmap` dosyalarını yükler.
Müşterinin masaüstündeki `electron-updater` bu repo'yu poll eder → kasada
otomatik indirir + onayla yükler.

### Önemli notlar

- **Tag formatı:** her zaman `v<MAJOR>.<MINOR>.<PATCH>` (lider `v` zorunlu;
  `vPrefixedTagName: true` zaten `package.json#build.publish`'te ayarlı).
- **artifactName sabit:** `package.json#build.win.artifactName` ve
  `build.nsis.artifactName` mutlaka `"Sefpos-Setup-${version}.${ext}"` olmalı.
  Boşluklu adlar softprops tarafından `Sefpos.Setup.X.Y.Z.exe`'ye çevrilir
  ve `latest.yml` ile uyumsuz olunca electron-updater 404 verir.
- **Anon key fallback:** `src/lib/supabase.ts` içindeki
  `DEFAULT_SUPABASE_ANON_KEY` Electron `main.cjs#FALLBACK_PRIMARY_SUPABASE_ANON_KEY`
  ile **birebir aynı** olmalı. GitHub Actions runner'da `.env` yoktur, fallback
  olmadan production build "supabaseKey is required" diye crash eder ve
  "Sistem hazırlanıyor" splash'ında takılır.
- **GitHub'a manuel kurulum yok:** Build/publish her zaman Actions üzerinden.
  Yerel `electron-builder` yalnızca tanı amaçlı çalıştırılır, asla manuel
  release oluşturulmaz.
- **Required secret:** `RELEASE_REPO_TOKEN` → `sefposbulut/sefpos-releases`
  reposuna **Contents: Read and write** yetkisi olan fine-grained PAT.
  Sadece bu repoyu kapsamalı (sefpos'u değil).
- **Sürüm bump'ı atlama:** Eğer kullanıcı sadece doc/CI değişikliği yapıyorsa
  ve onun otomatik güncellemeye gitmesini istemiyorsa, `[skip release]`
  commit mesajı kullanıp tag açma. Varsayılan: **her zaman tag aç**.

Required GitHub secrets for automation:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` (must be `xdfnozfuuzctubijbnds`)
- `SUPABASE_DB_PASSWORD`
- `BACKUP_GPG_PASSPHRASE` — yedekleri AES-256 simetrik şifrelemek için kullanılan parola. Güçlü, en az 32 karakter, sadece `1Password` / `Bitwarden` gibi parola yöneticisinde sakla. **Kaybedersen yedekler açılamaz.**
- `SUPABASE_DB_HOST` *(önerilen)* — Supabase Session Pooler tam host adı, örn. `aws-1-ap-southeast-2.pooler.supabase.com`. Studio → "Connect" → **Session pooler** sekmesindeki connection string'in `@` ile `:` arasındaki kısmıdır. Verilmezse `aws-0-<REGION>` formatıyla tahmin edilir (genelde yanlış olur, lütfen set et).
- `SUPABASE_DB_PORT` *(opsiyonel)* — Pooler portu. Varsayılan `5432` (Session pooler). Transaction pooler kullanılıyorsa `6543`.
- `SUPABASE_DB_REGION` *(opsiyonel — `SUPABASE_DB_HOST` set edildiyse gereksiz)* — Yalnızca tam host vermek istemiyorsan eski region-tahmin yolu. Varsayılan `eu-central-1`.

## Yedekleme stratejisi

Üç katman:

1. **Supabase Pro daily backup** — bedava, otomatik, son 7 gün, Studio → Database → Backups.
2. **Haftalık dış yedek** — `.github/workflows/supabase-backup.yml`. Her Pazartesi 04:00 TR (01:00 UTC). `pg_dump` → gzip → GPG (AES-256) → GitHub Releases (`backup-YYYYMMDD-HHMMSS`). 8 haftadan eski release'ler otomatik silinir. Manuel tetik: GitHub Actions → "Weekly Supabase Backup" → "Run workflow".
3. **PITR (opsiyonel, ücretli)** — Supabase Pro üzerine $100/ay. Saniye saniye geri dönüş. Bütçe izin verirse Studio → Project Settings → Add ons → Point in Time Recovery.

### Yedekten Geri Yükleme

Sadece **boş / yedek** bir Supabase projesine restore et — production veritabanına direkt restore çalıştırma. Adımlar:

```bash
# 1) GitHub Releases'ten yedeği indir
gh release download backup-YYYYMMDD-HHMMSS \
  --repo sefposbulut/sefpos \
  --pattern '*.sql.gz.gpg'

# 2) GPG ile çöz + gunzip
gpg --batch --passphrase "$BACKUP_GPG_PASSPHRASE" --decrypt sefpos-backup-*.sql.gz.gpg \
  | gunzip > restore.sql

# 3) Hedef DB'ye uygula (yedek/staging proje connection string'i)
psql "$TARGET_DATABASE_URL" -f restore.sql
```

Acil durumda doğrulanmış geri yükleme adımları için her ay **bir kez kuru tatbikat** önerilir (boş bir yedek Supabase projesine restore + SELECT count(*) ile satır sayılarını karşılaştır).

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
