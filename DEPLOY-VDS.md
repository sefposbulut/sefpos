# ŞefPOS — VDS kurulum (Supabase yok)

Üretim tek backend: Windows VDS üzerindeki Node API (`electron/vdsApi.cjs`, `127.0.0.1:8787`) ve SQL Server `sefpos45`. Web arayüzü `https://sefpos.com.tr`. Electron kasa bu adresi HTTPS ile açar. Supabase çalışma anında kullanılmaz.

Bu dağıtımdan sonra **tüm kasalar yeniden giriş** ister. Eski jeton biçimi kapatıldı.

## 1. Sırları döndürün (hepsini sızmış sayın)

Repoda ve eski paketlerde düz metin duruyordu. Gerçek değerleri buraya yazmayın. Maskeli liste:

| Sır | Nerede duruyordu | Ne yapın |
| --- | --- | --- |
| Süper admin / demo şifresi `2128***` | Auth ekranı, migration, script | SQL’de `app_users.password_hash` değiştirin. Aynı şifreyi bir daha kullanmayın. |
| SQL kullanıcısı `sefpos` şifresi `SefP***` | `scripts/import-dump-to-sefpos45.mjs` | SQL şifresini değiştirin. `vds-api.json` içine yazın, repoya koymayın. |
| VDS API `secret` (JWT HMAC) | `vds-api.json` | Yeni uzun rastgele değer. Tüm oturumlar düşer. |
| OTP pepper `sefp***` (eski varsayılan) | kod içi yedek | `vds-api.json` → `otpSigningSecret` en az 16 karakter. Boşsa SMS doğrulama açılmaz. |
| Oztek SMS şifresi | `vds-api.json` `oztek.sifre` | Panelden yenileyin. |
| Getir / Yemeksepeti / webhook sırları | platform satırları | Her restoran için yeni `webhook_secret` veya `getir_x_api_key`. |
| Partner API anahtarları | `partner_api_clients.api_key` | Yenileyin. |
| Windows Administrator | sunucu | Güçlü parola, internete RDP/WinRM kapalı. |
| Plesk | `:8443` | Parola + panele yalnız ofis IP. |
| Supabase service role `sb_s***` ve DB parolası `Alpe***` | eski `.env` | Supabase projesini kapatmadan önce anahtarları iptal edin. |
| GitHub `RELEASE_REPO_TOKEN` | Actions secret | Şüphe varsa PAT’i yenileyin, 2FA açık kalsın. |

Git geçmişini `git filter-repo` ile temizlemek ayrı bir işlem. Bu PR geçmişi silmez. Eski commit’lerde şifre duruyor olabilir.

## 2. Güvenlik duvarı

İnternete kapatın (yalnızca VPN veya ofis IP):

- **1433** SQL Server
- **5985 / 5986** WinRM
- **8443** Plesk
- **8787** Node API (yalnızca `127.0.0.1` dinlemeli; dışarı açmayın)

Açık kalacaklar: **443** (site + `/vds-api`) ve gerekirse **80 → 443**. Yazıcı ajanı kasada **7878** yalnızca `127.0.0.1`.

IIS / PHP proxy `X-Forwarded-For` değerini istemcinin gönderdiği başlıktan değil, gerçek bağlantıdan yazsın.

## 3. SQL yamaları (sırayla, SSMS)

1. `shefpos_sqlserver.sql` (yalnızca boş veritabanı)
2. `shefpos_sqlserver_patches.sql`
3. `shefpos_sqlserver_patches_vds_security.sql` (oturum tablosu, webhook kolonları, indeksler)

`vds-api.json` örneği (`C:\sefpos-deploy\vds-api.json`, repoda durmasın):

```json
{
  "host": "127.0.0.1",
  "port": 1433,
  "database": "sefpos45",
  "user": "sefpos_app",
  "password": "ORTAM-SIFRESI",
  "secret": "EN-AZ-32-KARAKTER",
  "otpSigningSecret": "EN-AZ-16-KARAKTER",
  "encrypt": true,
  "trustServerCertificate": true,
  "poolMax": 40,
  "tokenTtlSec": 14400,
  "listenHost": "127.0.0.1",
  "listen": 8787,
  "uploadDir": "C:\\sefpos-deploy\\uploads",
  "oztek": {
    "kullanicino": "",
    "kullaniciadi": "",
    "sifre": "",
    "orjinator": "SEFPOS"
  }
}
```

`sa` kullanmayın. Uygulama kullanıcısına yalnız `sefpos45` üzerinde okuma/yazma verin.

## 4. API ve web

1. Sunucuda Node 20, `npm ci --omit=dev` gerekmez; API `electron/vdsApi.cjs` + `mssql` + `bcryptjs` ile çalışır. `SEFPOS_VDS_API_CONFIG` bu json’u göstersin.
2. Servis: `electron/install-vds-api-service.ps1` (NSSM). Yeniden başlatınca logda `127.0.0.1:8787` görünmeli.
3. IIS sitesi `https://sefpos.com.tr` statik `dist` (veya Cloudflare Pages) + `/vds-api` ters proxy → `http://127.0.0.1:8787`.
4. Web build: `npm run build:pages` (Cloudflare, kök `/assets`) veya kasa paketi için `npm run build`.
5. Cloudflare `functions/` ve `public/_worker.js` artık `https://sefpos.com.tr/vds-api/fn/...` adresine gider. `SEFPOS_SUPABASE_URL` kullanmayın.

Webhook adresleri (imza zorunlu, ilk aktif restorana düşmez):

- Getir: `POST /vds-api/fn/getir-webhook` başlık `x-api-key` = o restoranın `getir_x_api_key` veya `webhook_secret`
- Yemeksepeti: `POST /vds-api/fn/yemeksepeti-webhook?remoteId=...` ve HS512 JWT (`webhook_secret`) ya da `x-webhook-token`
- Diğer: `?platformId=<uuid>&token=<webhook_secret>`

Sır eşleşmezse sipariş yazılmaz.

## 5. Yedek

SQL Server Agent veya Görev Zamanlayıcı:

- Her gece tam yedek (`BACKUP DATABASE sefpos45 TO DISK = ... WITH COMPRESSION, CHECKSUM`)
- Gün içi en az bir diferansiyel veya işlem günlüğü yedeği (tam kurtarma modeli)
- Dosyayı VDS dışına kopyalayın (başka disk / başka sağlayıcı)
- Ayda bir boş bir SQL örneğine geri yükleyip `SELECT COUNT(*)` ile deneyin

`scripts/migrate-supabase-to-mssql.mjs` yalnız Supabase’te kalan veriyi MSSQL’e taşır. Bağlantı dizeleri ortam değişkenidir.

## 6. Electron kurulumu ve imza

1. Sertifika: Authenticode (tercihen EV) satın alın. Yayımcı adı ŞefPOS şirketiyle aynı olsun.
2. GitHub Actions secret: `CSC_LINK` (pfx base64) ve `CSC_KEY_PASSWORD`. Workflow `electron-release.yml` bu sırları görünce `electron-builder` imzalar.
3. İmzadan sonra `package.json` içinde `build.win.signAndEditExecutable` değerini `true` yapın. İmzasızken `true` yapmak güncellemeyi bozar; bu PR’da bilinçli olarak `false` bırakıldı.
4. `electron-updater` imzalı pakette sertifika zincirini doğrular. İmzasız güncellemeyi müşteriye göndermeyin.
5. Tag `v1.0.319` biçimindedir ve `sefposbulut/sefpos-releases` deposuna yüklenir. Her commit’i etiketlemeyin; önce bu PR birleşsin, kademeli yayın (birkaç kasa, sonra hepsi) kullanın.
6. Kasa varsayılan adresi `https://sefpos.com.tr`. Kayıtlı `vdsWebUrl` düz HTTP veya çıplak IP ise paket içindeki `dist/index.html` açılır.

## 7. Yazıcı ajanı

`127.0.0.1:7878`. Eşlemeden sonra `/status` bir ajan jetonu verir; `/print` bu jetonu ister. `vds` parametresi yalnız `sefpos.com.tr` veya localhost olabilir. Kuyruk boşken 4 sn, iş varken 0,4 sn aralıkla bakar.

## 8. Kontrol

- `https://sefpos.com.tr/vds-api/health` → `{ "ok": true, "vds": true }` (veritabanı adı yok)
- Başka restoranın `tenant_id` filtresiyle sipariş sorgusu yalnız kendi kiracınızı döner
- `profiles` güncellemesinde `is_super_admin` yok sayılır
- SMS OTP yanıtında kod veya kod özeti yoktur
