# ŞefPOS — Dış Partner Sipariş API

**Kurumsal görünüm (tarayıcı):** [partner-orders-api.html](./partner-orders-api.html) · OpenAPI: [partner-orders-api.openapi.yaml](./partner-orders-api.openapi.yaml)

---

**Belge sürümü:** 1.1  
**API sürümü:** 1.0.0  
**Protokol:** HTTPS, JSON (UTF-8)  
**Son güncelleme:** 2026-05-15  

Bu belge, üçüncü taraf firmaların (kurye platformu, lojistik entegrasyonu vb.) ŞefPOS’taki **masasız paket servis ve teslimat siparişlerini** kurumsal bir REST API üzerinden **çekmesi** (pull model) için hazırlanmıştır. Ürün adı: **ŞefPOS** · Teknik ad: **SEFPOS**.

---

## 1. Genel bakış

### 1.1 Entegrasyon modeli

- Partner, **kendi sisteminden** belirli aralıklarla API’yi çağırır (**polling**).
- ŞefPOS tarafında her partner (veya restoran/şube) için **ayrı API anahtarı** tanımlanır.
- Sipariş işlendikten sonra `ack` ile işaretlenerek listede tekrar görünmesi engellenebilir.

### 1.2 Kapsam

| Dahil | Hariç |
|--------|--------|
| POS’ta oluşturulan **teslimat** (`delivery`) ve **paket / adresli takeaway** siparişleri | Masa üzerinden (`table_id` dolu) siparişler |
| ŞefPOS içi kurye ataması ve teslimat alanları (API yanıtında) | Getir, Yemeksepeti vb. **online platform** siparişleri (`online_orders`) |

Sipariş tipi filtreleme mantığı özetle: `order_type = delivery` veya (`takeaway` ve `order_subtype ≠ gel_al`).

### 1.3 Ortamlar ve taban URL’ler

**Üretim (önerilen, www üzerinden proxy):**

```
https://www.sefpos.com.tr/api/integrations/partner
```

Tüm yollar bu tabanın sonuna eklenir. Örnek:  
`GET …/partner/v1/orders`

**Doğrudan Edge (yedek / test, destek ve güvenlik duvarı kurallarına tabi):**

```
https://xdfnozfuuzctubijbnds.supabase.co/functions/v1/partner-orders-api
```

Üretim entegrasyonunda **www tabanı** kullanılması önerilir.

---

## 2. Kimlik doğrulama ve güvenlik

### 2.1 API anahtarı

Anahtar, ŞefPOS uygulamasında **Ayarlar → Dış Partner API** ekranında, partner firma adı ile oluşturulur. Format: `sp_live_` ile başlayan gizli dizedir.

Anahtar **HTTPS** üzerinden iletilmeli; e-postada düz metin paylaşımından kaçınılmalıdır (şifreli kanal, vault veya tek kullanımlık güvenli paylaşım tercih edilir).

### 2.2 HTTP başlıkları (zorunlu — kök `/` hariç)

Aşağıdakilerden **biri**:

```http
Authorization: Bearer <api_key>
```

```http
X-Api-Key: <api_key>
```

### 2.3 İsteğe bağlı korelasyon

```http
X-Request-Id: <uuid>
```

Yanıtta aynı değer `X-Request-Id` ve gövdede `request_id` olarak dönebilir; destek ve log eşleştirmesi için kullanılır.

### 2.4 CORS

Tarayıcıdan çağrı için `Access-Control-Allow-Origin: *` tanımlıdır. Üretim entegrasyonu genelde sunucu-taraflı (backend-to-backend) olduğundan bu ayrıntı sıklıkla kullanılmaz.

---

## 3. Endpoint özeti

| HTTP | Göreli yol | Kimlik doğrulama | Açıklama |
|------|------------|------------------|----------|
| GET | `/` | Hayır | API tanıtımı ve sürüm |
| GET | `/v1/orders` | Evet | Sipariş listesi |
| GET | `/v1/orders/{order_id}` | Evet | Tek sipariş detayı |
| POST | `/v1/orders/{order_id}/ack` | Evet | Siparişin partner tarafından alındığını kaydet |
| PATCH | `/v1/orders/{order_id}/delivery` | Evet | Teslimat durumu / kurye bilgisi güncelle |

`order_id`: UUID (RFC 4122).

---

## 4. Endpoint ayrıntıları

### 4.1 GET /

Sağlık ve meta bilgi. Kimlik doğrulama gerekmez.

**Örnek yanıt (özet):**

```json
{
  "service": "sefpos-partner-orders-api",
  "provider": "ŞefPOS / SEFPOS",
  "api_version": "1.0.0",
  "documentation_path": "/docs/integrations/partner-orders-api.md",
  "endpoints": ["GET /v1/orders", "GET /v1/orders/{id}", "POST /v1/orders/{id}/ack", "PATCH /v1/orders/{id}/delivery"],
  "auth": "Authorization: Bearer <api_key> veya X-Api-Key",
  "scope": "POS delivery/takeaway orders only (not online platform orders)"
}
```

---

### 4.2 GET /v1/orders

Masasız paket kapsamındaki siparişleri listeler.

**Sorgu parametreleri:**

| Parametre | Zorunlu | Varsayılan | Açıklama |
|-----------|---------|------------|----------|
| `since` | Hayır | — | ISO-8601 (`2026-05-15T12:00:00Z`). Bu zaman **dahil** olacak şekilde `created_at` üzerinden filtre uygulanır. |
| `hours` | Hayır | 24 | `since` yokken son kaç saat (1–168). |
| `limit` | Hayır | 50 | En fazla **100**. |
| `include_acked` | Hayır | `false` | `true` ise daha önce `ack` verilmiş siparişler de gelebilir. |
| `status` | Hayır | — | `active`: `completed` / `cancelled` dışı; `open`: yalnızca `status=active`. |

**Davranış notları:**

- Sonuçlar oluşturulma zamanına göre **eskiden yeniye** sıralanır.
- Liste, dahili olarak paket kuralına uyan kayıtlarla sınırlandırıldıktan sonra `limit` kadar kesilir.
- `next_since`: Dönen listenin **son** siparişinin `created_at` değeri; bir sonraki poll’da `since` olarak verilebilir (boş liste için `null`).

**Örnek istek:**

```http
GET /v1/orders?since=2026-05-15T10:00:00.000Z&limit=50
Authorization: Bearer sp_live_...
```

**Örnek yanıt gövdesi (özet):**

```json
{
  "api_version": "1.0.0",
  "request_id": "…",
  "partner": "HemenYolda",
  "count": 2,
  "orders": [ … ],
  "next_since": "2026-05-15T11:30:00.000Z",
  "polling_hint_seconds": 30
}
```

**Önerilen entegrasyon:** Yaklaşık **30 saniyede bir** `GET /v1/orders`; mümkünse `since` veya `next_since` ile artımlı çekim.

---

### 4.3 GET /v1/orders/{order_id}

Tek siparişin tam içeriğini döner. Sipariş kapsam dışındaysa veya tenant/şube eşleşmiyorsa `404`.

---

### 4.4 POST /v1/orders/{order_id}/ack

Partner, siparişi kendi sistemine başarıyla aldığında çağırır. Kayıt idempotent şekilde güncellenir (aynı anahtarla tekrar çağrı güvenli kabul edilir).

**Örnek yanıt:**

```json
{
  "api_version": "1.0.0",
  "request_id": "…",
  "ok": true,
  "order_id": "uuid",
  "acked_at": "2026-05-15T12:00:00.000Z"
}
```

Varsayılan listelemede (`include_acked=false`) onaylanmış siparişler **dönmez**.

---

### 4.5 PATCH /v1/orders/{order_id}/delivery

ŞefPOS siparişinde teslimat alanlarını günceller (partner’ın kurye ataması vb.).

**İstek gövdesi (JSON):**

| Alan | Zorunlu | Açıklama |
|------|---------|----------|
| `delivery_status` | Evet | İzin verilen değerlerden biri (aşağıda). |
| `courier_name` | Hayır | Metin |
| `courier_id` | Hayır | ŞefPOS tarafı UUID (varsa) |

**İzin verilen `delivery_status` değerleri:**  
`pending`, `preparing`, `ready`, `assigned`, `on_the_way`, `picked_up`, `delivered`, `failed`, `cancelled`

**Not:** `delivered` seçildiğinde sunucu `delivered_at` zamanlar ve sipariş `status` alanını `completed` yapabilir.

**Örnek:**

```json
{
  "delivery_status": "on_the_way",
  "courier_name": "Ahmet Y."
}
```

---

## 5. Sipariş nesnesi (Order)

Listeleme ve tekil getirmede dönen `orders[]` / `order` nesnesi aşağıdaki yapıya uyar (Özet alan adları İngilizcedir).

| Alan | Tip | Açıklama |
|------|-----|----------|
| `id` | string (UUID) | Sipariş kimliği |
| `order_number` | string \| null | Görünen sipariş numarası |
| `type` | string | `delivery`, `takeaway` vb. |
| `subtype` | string \| null | Örn. `gel_al` (varsa) |
| `status` | string | Örn. `active`, `completed`, `cancelled` |
| `delivery_status` | string \| null | Teslimat aşaması |
| `created_at` | string (ISO-8601) | Oluşturulma |
| `customer` | object | `name`, `phone`, `address`, `note` |
| `payment` | object | `method`, `collected`, `status`, `subtotal`, `total` |
| `delivery` | object | Tahmini süre, kurye, zaman damgaları |
| `branch` | object | `id`, `name` |
| `restaurant` | object | `tenant_id`, `partner_reference` (panelde girilen opsiyonel kod) |
| `partner` | object | `name` — kayıtlı partner firma adı |
| `items` | array | Satır kalemleri (ürün adı, miktar, fiyat, vergi, not) |
| `synced` | object | `acked`, `acked_at` |

Satır örneği (`items[]`):

```json
{
  "id": "uuid",
  "product_id": "uuid",
  "name": "Lahmacun",
  "sku": null,
  "quantity": 2,
  "unit_price": 80,
  "line_total": 160,
  "tax_rate": 20,
  "notes": null
}
```

---

## 6. Hata modeli

HTTP durum kodu anlamlı seçilir. Gövde örneği:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Geçersiz veya pasif API anahtarı.",
    "details": {}
  },
  "request_id": "uuid"
}
```

**Sık kullanılan `error.code` değerleri:**

| Kod | HTTP | Açıklama |
|-----|------|----------|
| `UNAUTHORIZED` | 401 | Anahtar eksik, hatalı veya devre dışı |
| `INVALID_SINCE` | 400 | `since` geçersiz tarih |
| `INVALID_BODY` | 400 | Örn. `delivery_status` geçersiz |
| `NOT_FOUND` | 404 | Kayıt yok veya kapsam/şube dışı |
| `INTERNAL` | 500 | Sunucu veya veritabanı hatası |

---

## 7. SLA ve destek

- API, bulut altyapısı üzerinde çalışır; hedef kullanılabilirlik operasyonel sözleşmeye tabidir.
- Sorun bildiriminde **`request_id`** ve mümkünse zaman damgası, endpoint ve ham yanıt (Kişisel veriyi maskeleyerek) eklenmesi önerilir.
- Teknik iletişim: ŞefPOS / SEFPOS ürün ekibi ile kanallanmış kurumsal irtibat.

---

## 8. Sürüm notları

| Belge | API | Not |
|-------|-----|-----|
| 1.1 | 1.0.0 | Kurumsal belge yapısı, hata kodları, şema özeti |
| 1.0 | 1.0.0 | İlk yayın |

---

## 9. Ek: Makine okunur şema

Otomasyon ve kontrat testleri için aynı dizinde **OpenAPI 3.0** tanımı bulunur:

`partner-orders-api.openapi.yaml`

Postman “Import” → OpenAPI ile içe aktarılabilir.
