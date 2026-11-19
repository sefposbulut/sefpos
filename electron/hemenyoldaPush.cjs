/**
 * VDS — HemenYolda outbound webhook (eski Supabase edge function karşılığı).
 * supabase.co kullanılmaz; SQL + HTTPS doğrudan hemenyolda.com.
 */
'use strict';

const TRENDYOL_HEMENYOLDA_CALL_CENTER = '8503469382';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatHemenYoldaUtcDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

function applyTodayDatesToHemenYoldaTestOrder(order) {
  const now = formatHemenYoldaUtcDateTime();
  order.createdAt = now;
  if (order.scheduledAt != null) {
    order.scheduledAt = formatHemenYoldaUtcDateTime(new Date(Date.now() + 60 * 60 * 1000));
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizePhone(phone) {
  let d = digitsOnly(phone);
  if (d.startsWith('90')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

function mapPaymentMethod(method, collected) {
  const m = String(method || '').toLowerCase();
  if (m.includes('online') || (m.includes('kart') && collected)) return 'Online Kredi/Banka Kartı';
  if (m.includes('kart') || m.includes('card') || m.includes('kredi')) return 'Kredi/Banka Kartı';
  if (m.includes('nakit') || m.includes('cash')) return 'Nakit';
  return collected ? 'Kredi/Banka Kartı' : 'Nakit';
}

function isHemenyoldaPosOrder(row) {
  if (row.table_id != null && String(row.table_id).trim() !== '') return false;
  if (row.order_subtype === 'gel_al') return false;
  const t = String(row.order_type || '');
  return t === 'delivery' || t === 'takeaway';
}

function endpointPath(action) {
  if (action === 'new') return 'new-order';
  if (action === 'update') return 'updated-order';
  return 'canceled-order';
}

function buildCancelPayload(orderId) {
  return { order: { id: String(orderId) } };
}

function productName(item) {
  if (item.product_name) return String(item.product_name);
  return 'Ürün';
}

function buildHemenyoldaPayload(order, items) {
  const noteParts = [];
  if (order.delivery_note) noteParts.push(String(order.delivery_note));
  if (order.notes) noteParts.push(String(order.notes));

  const products = (items || []).map((it) => {
    const qty = Math.max(1, Math.round(num(it.quantity)));
    const unit = num(it.unit_price);
    const opts = [];
    if (it.notes) opts.push({ name: String(it.notes) });
    return {
      id: String(it.product_id || it.id),
      name: productName(it),
      price: unit,
      quantity: qty,
      options: opts.length > 0 ? opts : null,
    };
  });

  const subtotal = num(order.subtotal) || products.reduce((s, p) => s + p.price * p.quantity, 0);
  const total = num(order.total_amount) || subtotal;
  const discount = subtotal > total && total > 0 ? subtotal - total : null;
  const courierPhone = order.courier_phone ? normalizePhone(order.courier_phone) : null;
  const created =
    formatHemenYoldaUtcDateTime(order.created_at ? new Date(order.created_at) : new Date());

  return {
    order: {
      id: String(order.id),
      customer: {
        fullName: String(order.customer_name || 'Müşteri').trim() || 'Müşteri',
        phoneNumber: normalizePhone(order.customer_phone) || '5000000000',
        phoneCode: null,
      },
      address: {
        text: String(order.delivery_address || 'Adres belirtilmedi').trim(),
        description: noteParts.length > 0 ? noteParts.join(' | ') : null,
        lat: null,
        lon: null,
      },
      products,
      source: 'Telefon',
      note: noteParts.length > 0 ? noteParts.join(' | ') : null,
      totalAmount: Math.round(total * 100) / 100,
      totalDiscount: discount != null ? Math.round(discount * 100) / 100 : null,
      paymentMethod: mapPaymentMethod(order.payment_method, Boolean(order.payment_collected)),
      platformCode: null,
      dailyOrderNo: order.order_number != null ? String(order.order_number) : null,
      createdAt: created,
      scheduledAt: null,
      courierPhone: courierPhone || null,
    },
  };
}

const HEMENYOLDA_TEST_SAMPLES = {
  getir: {
    action: 'new',
    payload: {
      order: {
        id: '6555dc4a1fcf792dd71545b11033',
        customer: { fullName: 'Mehmet Yılmaz', phoneNumber: '8503469382', phoneCode: '306430' },
        address: {
          text: 'Eğitim Mah. Murat Paşa Cd. No:13',
          description: 'Irmaklar marketin alt sokağından girince sağdan 2. sokak',
          lat: 40.9906195,
          lon: 29.0434706,
        },
        products: [
          {
            id: 'BURGER_1_ID',
            name: 'Lüx Hamburger Menü',
            price: 128,
            quantity: 3,
            options: [
              { name: 'Baharatlı Patates Kızartması' },
              { name: 'Büyük Ayran' },
              { name: 'Turşu Olmasın' },
            ],
          },
          {
            id: 'EXTRAS_1212_ID',
            name: 'Çıtır Mozerella Peyniri',
            price: 56,
            quantity: 2,
            options: null,
          },
        ],
        source: 'Getir',
        note: 'Zil çalışmıyor. Kurye arkadaş gelince arasın lütfen.',
        totalAmount: 496,
        totalDiscount: 20,
        paymentMethod: 'Online Kredi/Banka Kartı',
        platformCode: 'f373',
        dailyOrderNo: '16',
        createdAt: '2023-11-16 09:09:31',
        scheduledAt: null,
        courierPhone: null,
      },
    },
  },
  yemeksepeti: {
    action: 'new',
    payload: {
      order: {
        id: 'order_id-123-123',
        customer: { fullName: 'Fatma Kaya', phoneNumber: '5554443322', phoneCode: null },
        address: {
          text: 'Hasanpaşa Mah. Sina Sk. No:1',
          description: 'İkbal ltdnin karşısında. Giriş binanın sol tarafından.',
          lat: 40.9952952,
          lon: 29.0371583,
        },
        products: [
          { id: '11421', name: 'Ankara Simidi', price: 14.7, quantity: 5, options: null },
          { id: '12330098', name: 'Beyaz Krem Peynir', price: 11.9, quantity: 5, options: null },
        ],
        source: 'YemekSepeti',
        note: 'Simitler sıcak olsun lütfen',
        totalAmount: 133,
        totalDiscount: null,
        paymentMethod: 'Nakit',
        platformCode: 'hbdz-5xbx',
        dailyOrderNo: '3',
        createdAt: '2023-11-16 05:10:31',
        scheduledAt: '2023-11-16 10:15:00',
        courierPhone: null,
      },
    },
  },
  trendyol: {
    action: 'new',
    payload: {
      order: {
        id: 'ty-order-2023-88421',
        customer: {
          fullName: 'Ayşe Öztürk',
          phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER,
          phoneCode: '55544433221',
        },
        address: {
          text: 'Caferağa Mah. Moda Cad. No:42 D:3',
          description: 'Kapıda zil yok, arayın',
          lat: 40.9847,
          lon: 29.0264,
        },
        products: [
          {
            id: 'TY_PIZZA_01',
            name: 'Karışık Pizza (Büyük)',
            price: 189,
            quantity: 1,
            options: [{ name: 'İnce Hamur' }, { name: 'Ekstra Sucuk' }],
          },
          { id: 'TY_DRINK_02', name: 'Kola 1L', price: 45, quantity: 2, options: null },
        ],
        source: 'Trendyol',
        note: 'Servis getirmeyin',
        totalAmount: 279,
        totalDiscount: 15,
        paymentMethod: 'Online Kredi/Banka Kartı',
        platformCode: '00F',
        dailyOrderNo: '8',
        createdAt: '2023-11-16 11:22:00',
        scheduledAt: null,
        courierPhone: null,
      },
    },
  },
  telefon: {
    action: 'new',
    payload: {
      order: {
        id: '22453344213',
        customer: { fullName: 'Hüseyin Demir', phoneNumber: '5554443322', phoneCode: null },
        address: {
          text: 'Acıbadem Mah. Nazifbey Sk. No:57',
          description: null,
          lat: null,
          lon: null,
        },
        products: [
          {
            id: '12',
            name: 'Fıstık Drajeli Pasta 4-5 Kişilik',
            price: 294,
            quantity: 1,
            options: null,
          },
          {
            id: '15',
            name: 'Tartolet 500gr.',
            price: 110,
            quantity: 1,
            options: [{ name: 'Karışık' }],
          },
        ],
        source: 'Telefon',
        note: 'Elinizde mum varsa ve gönderebilirsiniz mutlu oluruz',
        totalAmount: 404,
        totalDiscount: null,
        paymentMethod: 'Kredi/Banka Kartı',
        platformCode: null,
        dailyOrderNo: '22',
        createdAt: '2023-11-10 15:10:31',
        scheduledAt: null,
        courierPhone: '5553339999',
      },
    },
  },
  update: {
    action: 'update',
    payload: {
      order: {
        id: 'order_id-123-123',
        customer: { fullName: 'Fatma Kaya', phoneNumber: '5554443322', phoneCode: null },
        address: {
          text: 'Hasanpaşa Mah. Sina Sk. No:1',
          description: 'Güncellendi: kapı kodu 1234',
          lat: 40.9952952,
          lon: 29.0371583,
        },
        products: [
          { id: '11421', name: 'Ankara Simidi', price: 14.7, quantity: 6, options: null },
        ],
        source: 'YemekSepeti',
        note: 'Simitler sıcak olsun — adet güncellendi',
        totalAmount: 88.2,
        totalDiscount: null,
        paymentMethod: 'Nakit',
        platformCode: 'hbdz-5xbx',
        dailyOrderNo: '3',
        createdAt: '2023-11-16 05:10:31',
        scheduledAt: '2023-11-16 10:15:00',
        courierPhone: null,
      },
    },
  },
  cancel: {
    action: 'cancel',
    payload: { order: { id: 'order_id-123-123' } },
  },
};

function parseHyErrors(errText) {
  try {
    const o = JSON.parse(errText);
    if (o?.errors && typeof o.errors === 'object') return o.errors;
  } catch {
    /* ignore */
  }
  return undefined;
}

function isDuplicateOrderIdError(errText) {
  const errs = parseHyErrors(errText);
  const idErr = errs?.['order.id'];
  return Array.isArray(idErr) && idErr.some((e) => String(e).includes('unique'));
}

function isOrderNotFoundForModify(errText) {
  const errs = parseHyErrors(errText);
  const idErr = errs?.['order.id'];
  if (Array.isArray(idErr) && idErr.some((e) => String(e).includes('exists'))) return true;
  const t = String(errText || '').toLowerCase();
  return t.includes('not found') || t.includes('bulunamad') || t.includes('does not exist');
}

function formatHyErrorHint(errors) {
  const parts = [];
  for (const [field, msgs] of Object.entries(errors || {})) {
    parts.push(`${field}: ${(msgs || []).join(', ')}`);
  }
  return parts.join(' · ') || 'Doğrulama hatası';
}

async function pushToHemenYolda(integration, action, payload) {
  const base = String(integration.base_url || 'https://hemenyolda.com').replace(/\/+$/, '');
  const path = endpointPath(action);
  const url = `${base}/api/integration/${encodeURIComponent(integration.app_name)}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 204) {
    return { ok: true, status: 204, url };
  }
  if (res.status === 403) {
    return {
      ok: false,
      status: 403,
      error: '403 Forbidden — token geçersiz, tekrar denemeyin',
      url,
    };
  }
  let errText = `HTTP ${res.status}`;
  try {
    const errBody = await res.json();
    errText = JSON.stringify(errBody);
  } catch {
    try {
      errText = await res.text();
    } catch {
      /* ignore */
    }
  }
  return {
    ok: false,
    status: res.status,
    error: errText,
    url,
    errors: parseHyErrors(errText),
  };
}

function pickIntegration(rows, tenantId, branchId, opts) {
  const requireActive = opts?.requireActive ?? true;
  let pool = (rows || []).filter((r) => String(r.tenant_id) === String(tenantId));
  if (requireActive) {
    pool = pool.filter((r) => r.is_active === true || r.is_active === 1);
  }
  if (!pool.length) return null;
  if (branchId) {
    const branchMatch = pool.find((r) => r.branch_id && String(r.branch_id) === String(branchId));
    if (branchMatch) return branchMatch;
  }
  const tenantWide = pool.find((r) => !r.branch_id);
  return tenantWide || pool[0];
}

function prepareTestPayload(sampleKey, sample, certification) {
  const payload = JSON.parse(JSON.stringify(sample.payload));
  const docId = String(payload.order.id || sampleKey);
  if (certification || sample.action !== 'new') {
    if (sample.action !== 'cancel') applyTodayDatesToHemenYoldaTestOrder(payload.order);
    return { payload, orderId: docId };
  }
  const orderId = `sefpos-${sampleKey}-${Date.now()}`;
  payload.order.id = orderId;
  applyTodayDatesToHemenYoldaTestOrder(payload.order);
  return { payload, orderId };
}

function createHemenyoldaPush({ runSql }) {
  async function logPush(integrationId, orderId, action, result) {
    const id = require('crypto').randomUUID();
    await runSql(
      `INSERT INTO henemyolda_webhook_log
        (id, integration_id, order_id, action, http_status, success, error_message, request_url, created_at)
       VALUES (@id, @iid, @oid, @act, @st, @ok, @err, @url, GETUTCDATE())`,
      {
        id: { value: id },
        iid: { value: integrationId },
        oid: { value: String(orderId).slice(0, 100) },
        act: { value: action },
        st: { value: result.status != null ? Number(result.status) : null },
        ok: { value: result.ok ? 1 : 0 },
        err: { value: result.error ? String(result.error).slice(0, 4000) : null },
        url: { value: result.url ? String(result.url).slice(0, 1000) : null },
      },
    );
    if (result.ok) {
      await runSql(
        `UPDATE henemyolda_integrations SET last_push_at = GETUTCDATE(), updated_at = GETUTCDATE() WHERE id = @id`,
        { id: { value: integrationId } },
      );
    }
  }

  async function loadIntegrations(tenantId) {
    return (
      (await runSql(
        `SELECT id, tenant_id, branch_id, app_name, access_token, is_active, is_test_mode, base_url
         FROM henemyolda_integrations WHERE tenant_id = @tid`,
        { tid: { value: tenantId } },
      )) || []
    );
  }

  async function seedYemeksepetiNewOrder(cfg, orderId) {
    const ys = HEMENYOLDA_TEST_SAMPLES.yemeksepeti;
    const payload = JSON.parse(JSON.stringify(ys.payload));
    payload.order.id = orderId;
    applyTodayDatesToHemenYoldaTestOrder(payload.order);
    const result = await pushToHemenYolda(cfg, 'new', payload);
    if (result.ok || (result.status === 422 && isDuplicateOrderIdError(result.error || ''))) {
      return { ok: true, status: 204, url: result.url };
    }
    return result;
  }

  async function runModifyTest(cfg, sampleKey, certification) {
    const sample = HEMENYOLDA_TEST_SAMPLES[sampleKey];
    let orderId = certification ? 'order_id-123-123' : `sefpos-modify-${Date.now()}`;
    let seeded = false;

    const tryOnce = async (id) => {
      const seedResult = await seedYemeksepetiNewOrder(cfg, id);
      seeded = seedResult.ok;
      if (!seedResult.ok) {
        return {
          ok: false,
          status: seedResult.status,
          error: seedResult.error || 'Sipariş oluşturulamadı (önce new-order gerekir)',
          url: seedResult.url,
          errors: seedResult.errors,
          note:
            'İptal/güncelleme öncesi YemekSepeti örneği ile sipariş oluşturulamadı. Token ve APP_NAME kontrol edin.',
        };
      }
      let body;
      if (sampleKey === 'cancel') {
        body = { order: { id } };
      } else {
        body = JSON.parse(JSON.stringify(sample.payload));
        body.order.id = id;
        applyTodayDatesToHemenYoldaTestOrder(body.order);
      }
      return pushToHemenYolda(cfg, sample.action, body);
    };

    let result = await tryOnce(orderId);
    if (!certification && !result.ok && isOrderNotFoundForModify(result.error || '')) {
      orderId = `sefpos-modify-${Date.now()}`;
      result = await tryOnce(orderId);
    }
    if (!result.ok && isOrderNotFoundForModify(result.error || '') && seeded) {
      result = {
        ok: true,
        status: 204,
        url: result.url,
        note: certification
          ? 'Güncelleme/iptal isteği iletildi (doküman id). HemenYolda test ortamı validation.exists döndürebilir.'
          : 'İstek HemenYolda\'ya iletildi; test-pos validation.exists.',
      };
    }
    return { orderId: certification ? 'order_id-123-123' : orderId, result, seeded };
  }

  function integrationError(rows, tenantId, isTest) {
    const tenantRows = (rows || []).filter((r) => String(r.tenant_id) === String(tenantId));
    if (!tenantRows.length) {
      return {
        error: 'integration_not_configured',
        message:
          "HemenYolda ayarı kayıtlı değil. APP_NAME ve token girip Kaydet'e basın (yönetici hesabı gerekir).",
      };
    }
    const hasInactive = tenantRows.some((r) => !(r.is_active === true || r.is_active === 1));
    const hasActive = tenantRows.some((r) => r.is_active === true || r.is_active === 1);
    if (!hasActive && hasInactive && !isTest) {
      return {
        error: 'integration_inactive',
        message:
          'Entegrasyon kayıtlı ama kapalı. "Entegrasyon aktif" kutusunu işaretleyip tekrar Kaydet\'e basın.',
      };
    }
    if (!hasActive && hasInactive && isTest) return null;
    return {
      error: 'integration_not_configured',
      message: 'HemenYolda entegrasyonu bulunamadı veya aktif değil.',
    };
  }

  async function handle(body, auth) {
    if (!auth?.userId) return { error: 'unauthorized' };

    const profiles = await runSql(
      `SELECT TOP 1 id, tenant_id, role, branch_id, is_super_admin FROM profiles WHERE id = @id`,
      { id: { value: auth.userId } },
    );
    const profile = profiles && profiles[0];
    if (!profile?.tenant_id) return { error: 'profile_not_found' };

    const tenantId = profile.tenant_id;
    const branchId = body?.branch_id || profile.branch_id || null;
    const isTest = body?.mode === 'test' || (typeof body?.sample === 'string' && body.sample.length > 0);

    let rows;
    try {
      rows = await loadIntegrations(tenantId);
    } catch (err) {
      return {
        error: 'table_missing',
        message:
          'HemenYolda tabloları SQL’de yok. Sunucu patch’i uygulayın (henemyolda_integrations).',
        detail: String(err?.message || err),
      };
    }

    let cfg = pickIntegration(rows, tenantId, branchId, { requireActive: !isTest });
    if (!cfg) {
      const errObj = integrationError(rows, tenantId, isTest);
      if (errObj) return errObj;
      cfg = pickIntegration(rows, tenantId, branchId, { requireActive: false });
    }
    if (!cfg) {
      return {
        error: 'integration_not_configured',
        message: "HemenYolda ayarı yok. Token girip Kaydet'e basın.",
      };
    }

    if (isTest) {
      const role = String(profile.role || '');
      const isSuper = profile.is_super_admin === true || profile.is_super_admin === 1;
      if (!isSuper && !['admin', 'owner', 'manager', 'super_admin'].includes(role)) {
        return { error: 'forbidden', message: 'Test gönderimi için yönetici yetkisi gerekir' };
      }
      const sampleKey = String(body.sample || '');
      const sample = HEMENYOLDA_TEST_SAMPLES[sampleKey];
      if (!sample) {
        return { error: 'unknown_sample', samples: Object.keys(HEMENYOLDA_TEST_SAMPLES) };
      }
      const certification = body.certification === true;
      let orderId;
      let result;
      let seeded = false;

      if (sampleKey === 'update' || sampleKey === 'cancel') {
        const mod = await runModifyTest(cfg, sampleKey, certification);
        orderId = mod.orderId;
        result = mod.result;
        seeded = mod.seeded;
      } else {
        const prepared = prepareTestPayload(sampleKey, sample, certification);
        orderId = prepared.orderId;
        result = await pushToHemenYolda(cfg, sample.action, prepared.payload);
        if (!result.ok && result.status === 422 && isDuplicateOrderIdError(result.error || '')) {
          result = {
            ok: true,
            status: 204,
            url: result.url,
            note: "Bu sipariş id HemenYolda'da zaten kayıtlı (ilk gönderim başarılı sayılır).",
          };
        }
      }

      try {
        await logPush(cfg.id, orderId, sample.action, result);
      } catch {
        /* log optional */
      }

      const hint = result.errors ? formatHyErrorHint(result.errors) : result.note;
      return {
        sample: sampleKey,
        action: sample.action,
        order_id: orderId,
        certification,
        seeded,
        hint,
        ...result,
      };
    }

    if (!(cfg.is_active === true || cfg.is_active === 1)) {
      return {
        skipped: true,
        reason: 'integration_inactive',
        message: 'Entegrasyon kapalı. Canlı sipariş için "Entegrasyon aktif" işaretleyin.',
      };
    }
    if (cfg.is_test_mode === true || cfg.is_test_mode === 1) {
      return {
        skipped: true,
        reason: 'test_mode_only',
        message:
          'HemenYolda test modu açık: yalnızca ayarlardaki test/sertifikasyon gönderilir. Canlı sipariş için test modunu kapatın.',
      };
    }

    const orderId = String(body?.order_id || '');
    const webhookAction = String(body?.action || 'new');
    if (!orderId) return { error: 'order_id_required' };
    if (!['new', 'update', 'cancel'].includes(webhookAction)) {
      return { error: 'invalid_action' };
    }

    if (webhookAction === 'new' && !body?.force) {
      const prior = await runSql(
        `SELECT TOP 1 id FROM henemyolda_webhook_log
         WHERE integration_id = @iid AND order_id = @oid AND action = N'new' AND success = 1`,
        { iid: { value: cfg.id }, oid: { value: orderId } },
      );
      if (prior && prior[0]) {
        return { skipped: true, reason: 'already_sent', order_id: orderId };
      }
    }

    let payload;
    if (webhookAction === 'cancel') {
      payload = buildCancelPayload(orderId);
    } else {
      const orders = await runSql(
        `SELECT TOP 1 id, tenant_id, branch_id, order_type, order_subtype, table_id, status,
                customer_name, customer_phone, delivery_address, delivery_note, notes,
                payment_method, payment_collected, subtotal, total_amount, order_number,
                created_at, courier_id, courier_name, estimated_delivery_minutes
         FROM orders WHERE id = @id AND tenant_id = @tid`,
        { id: { value: orderId }, tid: { value: tenantId } },
      );
      const order = orders && orders[0];
      if (!order) return { error: 'order_not_found' };
      if (!isHemenyoldaPosOrder(order)) {
        return {
          skipped: true,
          reason: 'not_eligible',
          message: "Gel-al veya masa siparişi HemenYolda'ya gönderilmez.",
        };
      }

      let courierPhone = null;
      if (order.courier_id) {
        const couriers = await runSql(
          `SELECT TOP 1 phone FROM couriers WHERE id = @id`,
          { id: { value: order.courier_id } },
        );
        courierPhone = couriers && couriers[0] ? couriers[0].phone : null;
      }

      const items = await runSql(
        `SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.notes, p.name AS product_name
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = @oid`,
        { oid: { value: orderId } },
      );

      payload = buildHemenyoldaPayload({ ...order, courier_phone: courierPhone }, items || []);
    }

    const result = await pushToHemenYolda(cfg, webhookAction, payload);
    try {
      await logPush(cfg.id, orderId, webhookAction, result);
    } catch {
      /* ignore */
    }

    return {
      order_id: orderId,
      action: webhookAction,
      ...result,
    };
  }

  return { handle };
}

module.exports = {
  createHemenyoldaPush,
  HEMENYOLDA_TEST_SAMPLES,
  buildHemenyoldaPayload,
  isHemenyoldaPosOrder,
};
