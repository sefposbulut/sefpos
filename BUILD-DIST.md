# ŞefPOS — Üretim (dist) build rehberi

Çalışma kökü: `C:\sefpos`

## Ön hazırlık

```powershell
cd C:\sefpos
npm install
```

İsteğe bağlı kontroller:

```powershell
npm run typecheck
npm run lint
```

### Ortam değişkenleri (`.env`)

- `VITE_SUPABASE_URL` — örn. `https://xdfnozfuuzctubijbnds.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — Supabase anon / publishable key
- İsteğe bağlı: `VITE_PHONE_AUTH_EMAIL_DOMAIN` — telefon kayıtlarında sentetik e-posta domain’i (MX kaydı olmalı; ayrıntı `.env.example`)

`.env` repoda yok; `.env.example` referans alın.

---

## 1) Sadece web (Vite) — **Cloudflare Pages / www kökü**

**`npm run build` kullanmayın** (çıktı `./assets/` üretir; www’de eski/bozuk yükleme riski).

```powershell
npm run build:pages
```

Çıktı: `dist/` (kök URL için `/assets/…`, `<base href="/">`)

Doğrulama:

```powershell
node scripts/assert-web-pages-dist.mjs
```

Yerel önizleme:

```powershell
npm run preview
```

---

## 2) Windows masaüstü (Electron + NSIS kurulum)

```powershell
npm run electron:build:win
```

- Önce `vite build` → `dist/`
- Sonra `electron-builder --win`

Çıktı: `release/` altında `Sefpos Setup … .exe`

---

## 3) Electron (mevcut işletim sistemine göre)

```powershell
npm run electron:build
```

- macOS: DMG
- Linux: AppImage

---

## 4) Android

```powershell
npm run android:apk
```

Ön koşul: Android Studio, SDK, `JAVA_HOME` / `ANDROID_SDK_ROOT`.

---

## 5) iOS (yalnızca macOS)

```powershell
npm run ios:build
npm run ios:open
```

Xcode ile imzalama ve dağıtım.

---

## Üretim kontrol listesi

1. Uzak veritabanında migration’lar uygulandı mı? (`npm run db:migrate-remote` — AGENTS.md’deki proje ref ile)
2. SMS Edge Functions gerekiyorsa: `npm run edge:deploy:sms`
3. Sürüm: `package.json` içindeki `version` alanını artırın (otomatik güncelleme kullanılıyorsa önemli)
4. Electron auto-update: `package.json` → `build.publish` hedef GitHub repo’su ile uyumlu olmalı

---

## Uygulama ikonu (favicon + Electron)

Tek bir kare PNG kaynağından (önerilen 1024×1024, şeffaf arka plan) tüm hedef
ikonları üretmek için:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate-app-icons.ps1 -Source .\public\SEFPOS-source.png
```

Üretilen dosyalar (hepsi `public/` altında):

- `logo.png` (256) — `index.html` favicon ve uygulama içi logo
- `logo256.png` (256) — PWA manifest
- `SEFPOS.png` (512) — Electron pencere/macOS/Linux ikonu
- `SEFPOS.ico` — Windows .exe / NSIS kurulum (16,24,32,48,64,128,256 çoklu çözünürlük)

Yeni kaynak vermek isterseniz `public/SEFPOS-source.png` dosyasını değiştirip
yukarıdaki komutu yeniden çalıştırın.

---

## İlgili dosyalar

- `package.json` — `scripts` ve `build` (electron-builder) ayarları
- `electron/main.cjs` — Electron ana süreç
- `vite.config.ts` — Vite derleme
- `AGENTS.md` — proje / Supabase özeti
