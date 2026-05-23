# ŞefPOS müşteri kurulumu — ne nereye yazılır?

## Kısa cevap

Müşterinin bilgisayarına **sizin Supabase veritabanınız kopyalanmaz**.  
AppData yalnızca **o kasanın** oturum ve ayar dosyalarıdır (Windows / Electron standardı).

## Kurulum klasörleri

| Konum | İçerik |
|--------|--------|
| `C:\Program Files\Sefpos\` (veya seçilen klasör) | Uygulama (EXE), arayüz, sürücü DLL’leri |
| `%APPDATA%\Sefpos\` | Oturum, yazıcı ayarı, yakınlaştırma, güncelleme önbelleği |
| `%LOCALAPPDATA%\Sefpos-updater\` | Otomatik güncelleme indirme (electron-updater) |

## AppData’da olanlar (örnek)

- **Giriş oturumu** — Supabase Auth (Chromium `persist:shefpos` partition)
- `settings.json` — yazıcı, zoom; SQL modunda **müşterinin kendi** sunucu bağlantısı (varsa şifreli)
- `localdb.json` — yalnızca «yerel mod» kullanılıyorsa
- Güncelleme dosyaları — yeni EXE indirme

## AppData’da olmayanlar

- Tüm restoranların siparişleri / merkezi Postgres dump
- `service_role` anahtarı
- Veritabanı yönetici parolası

Bulut veri **Supabase sunucusunda**; erişim **RLS** + kullanıcı oturumu ile sınırlı.

## `resources` içindeki `.sql` dosyaları

`shefpos_sqlserver.sql` yalnızca müşteri **kendi SQL Server** kuracaksa şema şablonudur; canlı bulut verisi değildir.

## Güvenlik özeti

- EXE içinde **anon (publishable) key** vardır — web sitesiyle aynı mantık; RLS korur.
- Üretim build’de **F12 / DevTools** kapalı (destek: ortam değişkeni veya gizli kısayol).
- Hassas yerel oturum dosyaları mümkünse **Windows DPAPI** ile şifrelenir.
