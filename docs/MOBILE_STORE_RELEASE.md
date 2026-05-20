# ŞefPOS Garson — Play Store & App Store

Mobil paket: **Sefpos Garson** (`com.sefpos.waiter`). Tam POS **Electron masaüstü**; mağazaya yalnızca garson uygulaması gider.

## Sürüm senkronu

```powershell
cd C:\sefpos
node scripts/sync-mobile-version.mjs
npm run build
npx cap sync android
```

`package.json` `version` → Android `versionName` + `versionCode` (ör. 1.0.154 → **10154**; formül: major×10000 + minor×100 + patch).

## Android (Google Play)

### Ön koşullar

- [ ] [Google Play Console](https://play.google.com/console) geliştirici hesabı
- [ ] Uygulama oluşturuldu: paket adı **`com.sefpos.waiter`** (değiştirmeyin)
- [ ] Gizlilik politikası URL: `https://www.sefpos.com.tr` (gizlilik sayfası linki)
- [ ] Ekran görüntüleri (telefon + tablet önerilir)
- [ ] İkon: `android/app/src/main/res/mipmap-*` veya `public/logo256.png` kaynak

### Release APK/AAB

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

Çıktı: `android/app/build/outputs/bundle/release/app-release.aab` → Play Console **Production** yükleme.

İç test için:

```powershell
npm run android:apk
```

→ `android/app/build/outputs/apk/debug/app-debug.apk`

### Play Console alanları (özet)

| Alan | Öneri |
|------|--------|
| Uygulama adı | ŞefPOS Garson |
| Kısa açıklama | Restoran garson sipariş ve masa yönetimi |
| Kategori | İş |
| İçerik derecelendirme | Anket doldurun |
| Veri güvenliği | Supabase, sipariş verisi, hesap bilgisi |

## iOS (App Store)

### İlk kurulum (Mac gerekir)

Windows’ta `ios/` klasörü yoksa Mac’te:

```bash
npm ci
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

Xcode → Signing & Capabilities → Team seçin → Archive → App Store Connect.

### App Store Connect

- [ ] Bundle ID: **`com.sefpos.waiter`**
- [ ] Gizlilik politikası URL
- [ ] App Review notu: garson girişi, restoran tenant hesabı gerekir

## Ortam

Mobil build `dist/` kullanır; Supabase anahtarları `src/lib/supabase.ts` fallback ile gelir. İsteğe bağlı build öncesi:

```env
VITE_SUPABASE_URL=https://xdfnozfuuzctubijbnds.supabase.co
VITE_SUPABASE_ANON_KEY=<anon>
```

## Test checklist (mağaza öncesi)

- [ ] Garson PIN / kullanıcı girişi
- [ ] Masa listesi ve sipariş (yetkili garson)
- [ ] Çevrimdışı: uygulama açılış hatası kullanıcı dostu mu
- [ ] Farklı Android sürümleri (min SDK 21)

## Not

Mağaza incelemesinde **tam POS** değil **garson** uygulaması sunulduğunu belirtin; masaüstü kurulum ayrı dağıtılır (`Sefpos-Setup-x.y.z.exe`).
