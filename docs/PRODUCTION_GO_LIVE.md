# ŞefPOS — Canlı satış öncesi kontrol listesi

Bu belge gerçek müşteri trafiği öncesi operasyon ve teknik ekip için hazırlanmıştır.

## 1. Supabase (zorunlu)

- [ ] **Migration’lar uygulandı** — GitHub Actions `supabase-migrations.yml` yeşil veya `npm run db:migrate-remote`
- [ ] Özellikle: `20260520130000_fix_payment_lock_admin_and_session.sql` (ödeme kilidi / admin kilidi aç)
- [ ] Studio → Database → **RLS** tüm `public` tablolarda açık
- [ ] Edge Functions güncel: `npx supabase functions deploy` (kritik: webhook, getir, partner-orders)

## 2. Masaüstü (Electron / kasa)

- [ ] Kasalarda **1.0.154+** kurulu (`Ayarlar → Sürüm` veya otomatik güncelleme)
- [ ] `sefpos-releases` üzerinde `latest.yml` = son sürüm
- [ ] Yazıcı / Print Agent test edildi (mutfak + adisyon)
- [ ] Şube seçimi doğru — ana sayfa özetleri **aktif şubeye** göre

## 3. Performans (sıcak yol)

- [ ] Masalar ekranı: ilk açılış &lt; 3 sn (şube başına makul masa sayısı)
- [ ] Online sipariş realtime + Getir poll çalışıyor
- [ ] Gereksiz sekme: Electron’da tek menü (ana sayfa), POS’ta header

## 4. Güvenlik

- [ ] **Service role** yalnız Edge Functions / sunucu; istemcide yok
- [ ] `VITE_*` anon key — RLS ile korunuyor; tenant/şube izolasyonu test
- [ ] Partner API anahtarları tenant bazlı; webhook imzaları (Getir/Yemeksepeti) aktif
- [ ] Süper-admin / Ayka yolu yalnızca yetkili hesaplar

## 5. Yedek ve geri dönüş

- [ ] Supabase Pro günlük yedek açık
- [ ] Haftalık GPG yedek (`supabase-backup.yml`) çalışıyor
- [ ] `BACKUP_GPG_PASSPHRASE` parola yöneticisinde

## 6. Destek

- [ ] `destek@sefpos.com.tr` / 0544 244 90 80 güncel
- [ ] İlk gün yoğun saatlerde uzaktan izleme planı

## Bilinen sınırlar

- **TypeScript `npm run typecheck`**: Bazı Supabase generated tipleri uyarı verir; **CI `npm run build` geçiyorsa** üretim build etkilenmez.
- **Yerel Electron build**: Visual Studio yoksa `package.json` → `build.npmRebuild: false` kullanın.
- **Garson mobil**: Ayrı uygulama (`com.sefpos.waiter`); tam POS Electron’dadır.

## Hızlı doğrulama (5 dk)

1. Giriş → Ana sayfa (Electron) veya Masalar
2. Masa aç → ürün ekle → ödeme → fiş
3. Online sipariş test (veya sandbox platform)
4. Ayarlar → Kilidi aç (admin) çalışıyor mu
5. Şube değiştir → özet sayıları değişiyor mu
