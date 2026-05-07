# ŞEFPOS API KEY SORUNU ÇÖZÜMÜ

## 🔴 SORUN: 401 Unauthorized Hatası

### 📊 Durum Analizi:
- **URL:** `https://xdfnozfuuzctubijbnds.supabase.co` ✅ Doğru
- **API Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` ❌ Geçersiz
- **Hata:** `401 Unauthorized` sürekli devam ediyor

### 🛠️ ÇÖZÜM ADIMLARI:

#### 1. 📋 Supabase Dashboard'a Git:
```
https://supabase.com/dashboard
```

#### 2. 🎯 Proje Seç:
- **Proje:** `xdfnozfuuzctubijbnds`
- **Giriş:** Supabase hesabınızla

#### 3. 🔑 API Key Al:
- **Settings** → **API**
- **Project URL:** `https://xdfnozfuuzctubijbnds.supabase.co`
- **Anon Public Key:** Kopyala (genellikle `eyJhbGciOiJIUzI1NiIs...` ile başlar)

#### 4. 📝 .env Dosyasını Güncelle:
```bash
cd c:/sefpos
# .env dosyasını aç ve güncelle:
VITE_SUPABASE_URL=https://xdfnozfuuzctubijbnds.supabase.co
VITE_SUPABASE_ANON_KEY=GERÇEK_API_KEY_BURAYA
```

#### 5. 🔄 Sunucuyu Yeniden Başlat:
```bash
taskkill /F /IM node.exe
./node_modules/.bin/vite.cmd --host 0.0.0.0 --port 5180
```

### ❌ Yanlış Key'ler:
- `placeholder-key`
- `demo_key`
- JWT içindeki `ref` alanı `xdfnozfuuzctubijbnds` dışında ise (başka Supabase projesine ait anahtar)

### 🎯 Test Sonrası:
- ✅ Giriş başarılı olmalı
- ✅ Masa listesi görünmeli
- ✅ Demo veriler yüklenmeli

### 📞 Destek:
Eğer hala sorun yaşarsanız:
1. Supabase projesinin aktif olduğunu kontrol edin
2. API key'in doğru kopyalandığından emin olun
3. Proje ayarlarında "anon" rolünün açık olduğunu kontrol edin

---

**⚠️ ÖNEMLİ:** Gerçek Supabase API key'i olmadan sistem çalışmaz!
