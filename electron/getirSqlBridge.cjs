/**
 * SQL Server modunda Getir sipariş çekme — Supabase Edge olmadan doğrudan Getir API + SQL yazma.
 */
const GETIR_DEV = 'https://food-external-api-gateway.development.getirapi.com';
const GETIR_PROD = 'https://food-external-api-gateway.getirapi.com';

function getirBase(env) {
  return String(env || '').toLowerCase() === 'production' ? GETIR_PROD : GETIR_DEV;
}

async function getirFetch(baseUrl, path, token, method = 'POST', body) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      token: String(token || ''),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

async function ensureToken(runSql, tedious, platform) {
  const exp = platform.getir_token_expires_at ? new Date(platform.getir_token_expires_at).getTime() : 0;
  if (platform.getir_token && exp > Date.now() + 60_000) {
    return { ok: true, token: platform.getir_token };
  }
  const base = getirBase(platform.getir_environment);
  const login = await getirFetch(base, '/auth/login', null, 'POST', {
    appSecretKey: platform.getir_app_secret_key,
    restaurantSecretKey: platform.getir_restaurant_secret_key,
  });
  if (!login.ok) return { ok: false, error: login.data?.message || `Getir login HTTP ${login.status}` };
  const token = login.data?.token || login.data?.data?.token;
  if (!token) return { ok: false, error: 'Getir token alinamadi' };
  const expiresAt = new Date(Date.now() + 55 * 60_000).toISOString();
  await runSql(
    `UPDATE online_order_platforms SET getir_token = @token, getir_token_expires_at = @exp WHERE id = @id`,
    {
      token: { type: tedious.TYPES.NVarChar, value: String(token) },
      exp: { type: tedious.TYPES.DateTime2, value: expiresAt },
      id: { type: tedious.TYPES.NVarChar, value: platform.id },
    },
  );
  return { ok: true, token: String(token) };
}

function mapGetirStatus(code) {
  const n = Number(code);
  if (n === 325 || n === 350) return 'new';
  if (n === 400) return 'verified';
  if (n === 500) return 'preparing';
  if (n === 600) return 'ready';
  if (n >= 700 && n < 800) return 'handed_over';
  if (n >= 800) return 'delivered';
  if (n === 1600 || n === 1700) return 'cancelled';
  return 'new';
}

async function upsertOrder(runSql, tedious, platform, ord) {
  const platformOrderId = String(ord.id || ord._id || '');
  if (!platformOrderId) return null;
  const client = ord.client || ord.customer || {};
  const customerName = String(client.name || client.fullName || 'Getir Musteri').slice(0, 255);
  const customerPhone = String(client.clientPhoneNumber || client.phone || '').slice(0, 50);
  const total = Number(ord.totalPrice || ord.totalAmount || ord.price || 0);
  const status = mapGetirStatus(ord.status || ord.orderStatus);
  const orderNo = String(ord.confirmationId || ord.orderNumber || platformOrderId).slice(0, 100);

  const existing = await runSql(
    `SELECT id FROM online_orders WHERE tenant_id = @tid AND platform_id = @pid AND platform_order_id = @poid`,
    {
      tid: { type: tedious.TYPES.NVarChar, value: platform.tenant_id },
      pid: { type: tedious.TYPES.NVarChar, value: platform.id },
      poid: { type: tedious.TYPES.NVarChar, value: platformOrderId },
    },
  );
  const isNew = !existing?.length;
  if (existing?.length) {
    await runSql(
      `UPDATE online_orders SET status = @st, total_amount = @tot, customer_name = @cn,
       platform_order_number = @pno, updated_at = GETUTCDATE() WHERE id = @id`,
      {
        st: { type: tedious.TYPES.NVarChar, value: status },
        tot: { type: tedious.TYPES.Decimal, value: total },
        cn: { type: tedious.TYPES.NVarChar, value: customerName },
        pno: { type: tedious.TYPES.NVarChar, value: orderNo },
        id: { type: tedious.TYPES.NVarChar, value: existing[0].id },
      },
    );
    return { isNew: false };
  }

  const newId = require('crypto').randomUUID();
  await runSql(
    `INSERT INTO online_orders (id, tenant_id, platform_id, platform_order_id, platform_order_number,
      status, customer_name, customer_phone, subtotal, total_amount, payment_status, created_at, updated_at)
     VALUES (@id, @tid, @pid, @poid, @pno, @st, @cn, @phone, @tot, @tot, 'paid', GETUTCDATE(), GETUTCDATE())`,
    {
      id: { type: tedious.TYPES.NVarChar, value: newId },
      tid: { type: tedious.TYPES.NVarChar, value: platform.tenant_id },
      pid: { type: tedious.TYPES.NVarChar, value: platform.id },
      poid: { type: tedious.TYPES.NVarChar, value: platformOrderId },
      pno: { type: tedious.TYPES.NVarChar, value: orderNo },
      st: { type: tedious.TYPES.NVarChar, value: status },
      cn: { type: tedious.TYPES.NVarChar, value: customerName },
      phone: { type: tedious.TYPES.NVarChar, value: customerPhone },
      tot: { type: tedious.TYPES.Decimal, value: total },
    },
  );
  return { isNew: true };
}

async function handleSqlGetirCall(runSql, getTedious, payload) {
  const tedious = getTedious();
  if (!tedious) return { ok: false, error: 'tedious yuklenemedi' };
  const platformId = String(payload?.platformId || '');
  const action = String(payload?.action || '');
  if (!platformId || !action) return { ok: false, error: 'platformId ve action zorunlu' };

  const rows = await runSql(
    `SELECT TOP 1 id, tenant_id, getir_environment, getir_app_secret_key, getir_restaurant_secret_key,
      getir_restaurant_id, getir_token, getir_token_expires_at, getir_pos_status, getir_restaurant_open
     FROM online_order_platforms WHERE id = @id AND is_active = 1`,
    { id: { type: tedious.TYPES.NVarChar, value: platformId } },
  );
  const platform = rows?.[0];
  if (!platform) return { ok: false, error: 'Getir platform kaydi yok' };
  if (!platform.getir_app_secret_key || !platform.getir_restaurant_secret_key) {
    return { ok: false, error: 'Getir credential eksik' };
  }

  const pollActions = ['poll-active', 'poll-unapproved', 'poll-cancelled'];
  if (!pollActions.includes(action)) {
    return { ok: false, error: `SQL modunda henuz desteklenmeyen aksiyon: ${action}` };
  }

  const tr = await ensureToken(runSql, tedious, platform);
  if (!tr.ok) return { ok: false, error: tr.error };
  const base = getirBase(platform.getir_environment);
  const path =
    action === 'poll-active'
      ? '/food-orders/active'
      : action === 'poll-unapproved'
        ? '/food-orders/periodic/unapproved'
        : '/food-orders/periodic/cancelled';

  const res = await getirFetch(base, path, tr.token, 'POST');
  if (!res.ok) {
    return { ok: false, status: res.status, error: res.data?.message || `Getir HTTP ${res.status}`, data: res.data };
  }

  const list = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.orders || [];
  let saved = 0;
  let newCount = 0;
  for (const ord of list) {
    const r = await upsertOrder(runSql, tedious, platform, ord);
    if (r) {
      saved++;
      if (r.isNew) newCount++;
    }
  }
  return { ok: true, fetched: list.length, saved, newCount, data: { saved, newCount } };
}

module.exports = { handleSqlGetirCall };
