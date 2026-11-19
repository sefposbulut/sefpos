/**
 * ŞefPOS VDS — kiracı izolasyonu ve yetki kararları.
 * Saf fonksiyonlar: veritabanı yok, birim test burada çalışır.
 */
'use strict';

const crypto = require('crypto');

/** İstemci sorgusuna tamamen kapalı tablolar (parola hash'i vb.). */
const BLOCKED_TABLES = new Set(['app_users', 'license_admin_credentials', 'sms_otp_codes', 'api_sessions']);

/**
 * Süper admin lisans paneli bu tabloları kiracı filtresi olmadan okuyabilir.
 * Operasyonel tablolar (sipariş, müşteri, kasa) her zaman etkin kiracıya kilitlenir.
 */
const ADMIN_UNSCOPED = new Set([
  'tenants',
  'profiles',
  'tenant_licenses',
  'licenses',
  'support_tickets',
  'support_notifications',
  'resellers',
  'reseller_applications',
  'feature_requests',
  'platform_release_policy',
  'device_registrations',
]);

/** tenant_id kolonu yok; süper admin dışında kapalı. */
const NO_TENANT_COLUMN = new Set([
  'partner_api_order_acks',
  'henemyolda_webhook_log',
  'platform_release_policy',
  'admin_tenant_impersonation',
]);

/** Hiçbir istemci yazamaz. */
const NEVER_CLIENT_WRITE = {
  profiles: ['is_super_admin'],
  app_users: ['password_hash', 'is_super_admin'],
};

/** Yalnızca süper admin yazabilir; normal kiracıdan silinir. */
const SUPER_ONLY_WRITE = {
  tenants: ['subscription_status', 'subscription_plan', 'subscription_expires_at', 'max_branches'],
};

const SELECT_REDACT = new Set(['password_hash']);

const ROLE_ADMIN_WRITES = new Set(['roles']);

function timingEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function tenantColumn(table) {
  if (table === 'tenants') return 'id';
  if (NO_TENANT_COLUMN.has(table)) return null;
  return 'tenant_id';
}

function scopeFilters(actor, table, filters) {
  if (!actor || actor.inactive || !actor.tenantId) {
    return { error: 'Oturum geçersiz' };
  }
  if (BLOCKED_TABLES.has(table)) {
    return { error: 'Bu tabloya erişim kapalı' };
  }
  const list = Array.isArray(filters) ? filters.filter((f) => f && f.col) : [];

  if (table === 'admin_tenant_impersonation') {
    if (!actor.isSuperAdmin) return { error: 'Yetkisiz' };
    const rest = list.filter((f) => f.col !== 'user_id');
    rest.push({ col: 'user_id', op: 'eq', val: actor.profileId || actor.userId });
    return { filters: rest };
  }

  if (actor.isSuperAdmin && ADMIN_UNSCOPED.has(table)) {
    return { filters: list };
  }

  if (NO_TENANT_COLUMN.has(table)) {
    if (!actor.isSuperAdmin) return { error: 'Bu tabloya erişim kapalı' };
    return { filters: list };
  }

  const col = tenantColumn(table);
  const rest = list.filter((f) => f.col !== col && f.col !== 'tenant_id');
  rest.push({ col, op: 'eq', val: actor.tenantId });
  return { filters: rest };
}

function canWriteRoles(actor) {
  if (!actor) return false;
  if (actor.isSuperAdmin) return true;
  const role = String(actor.role || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

function stripWriteRow(actor, table, row) {
  if (!actor || actor.inactive || !actor.tenantId) return { error: 'Oturum geçersiz' };
  if (BLOCKED_TABLES.has(table)) return { error: 'Bu tabloya erişim kapalı' };
  if (ROLE_ADMIN_WRITES.has(table) && !canWriteRoles(actor)) {
    return { error: 'Rol değiştirme yetkisi yok' };
  }
  const src = row && typeof row === 'object' ? { ...row } : {};
  const blocked = new Set(NEVER_CLIENT_WRITE[table] || []);
  const superOnly = SUPER_ONLY_WRITE[table] || [];
  if (!actor.isSuperAdmin) {
    for (const c of superOnly) blocked.add(c);
  }
  if (table === 'profiles' && !canWriteRoles(actor)) {
    blocked.add('is_active');
    blocked.add('role');
    blocked.add('role_id');
    blocked.add('tenant_id');
  }
  for (const c of blocked) delete src[c];

  if (table === 'tenants') {
    if (!actor.isSuperAdmin) src.id = actor.tenantId;
  } else if (!NO_TENANT_COLUMN.has(table) && table !== 'platform_release_policy') {
    src.tenant_id = actor.tenantId;
  }
  if (table === 'admin_tenant_impersonation') {
    if (!actor.isSuperAdmin) return { error: 'Yetkisiz' };
    src.user_id = actor.profileId || actor.userId;
  }
  return { row: src };
}

function redactRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (SELECT_REDACT.has(key)) delete out[key];
  }
  return out;
}

function redactRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(redactRow);
}

function capLimit(limitVal) {
  const n = parseInt(limitVal, 10);
  if (!Number.isFinite(n) || n <= 0) return 20000;
  return Math.min(n, 50000);
}

function prepareQuery(actor, body) {
  const table = String((body && body.table) || '').replace(/[^a-zA-Z0-9_]/g, '');
  const operation = String((body && body.operation) || '');
  if (!table) return { error: 'tablo gerekli' };
  if (BLOCKED_TABLES.has(table)) return { error: 'Bu tabloya erişim kapalı' };

  if (operation === 'select') {
    const scoped = scopeFilters(actor, table, body.filters);
    if (scoped.error) return scoped;
    return {
      body: {
        ...body,
        table,
        filters: scoped.filters,
        limitVal: body.countOnly ? body.limitVal : capLimit(body.limitVal),
      },
    };
  }

  if (operation === 'insert' || operation === 'upsert') {
    const rows = Array.isArray(body.data) ? body.data : [body.data];
    const next = [];
    for (const row of rows) {
      const stripped = stripWriteRow(actor, table, row);
      if (stripped.error) return stripped;
      next.push(stripped.row);
    }
    const scoped = scopeFilters(actor, table, body.filters);
    if (scoped.error && operation === 'upsert') return scoped;
    return {
      body: {
        ...body,
        table,
        data: Array.isArray(body.data) ? next : next[0],
        filters: scoped.filters || body.filters,
      },
    };
  }

  if (operation === 'update' || operation === 'delete') {
    const scoped = scopeFilters(actor, table, body.filters);
    if (scoped.error) return scoped;
    if (!scoped.filters || scoped.filters.length === 0) {
      return { error: 'Filtresiz yazma kapalı' };
    }
    let data = body.data;
    if (operation === 'update') {
      const stripped = stripWriteRow(actor, table, data);
      if (stripped.error) return stripped;
      data = stripped.row;
    }
    return { body: { ...body, table, filters: scoped.filters, data } };
  }

  return { error: 'Bilinmeyen operasyon' };
}

function guardRpc(actor, fn, params) {
  if (!actor || actor.inactive || !actor.tenantId) return { error: 'Oturum geçersiz' };
  const p = { ...(params || {}) };
  p.p_tenant_id = actor.tenantId;
  if (fn === 'start_shift' || fn === 'close_shift' || fn === 'close_business_day' || fn === 'unlock_table_payment' || fn === 'unlock_stale_payment_locks' || fn === 'get_current_business_date') {
    return { params: p };
  }
  return { params: p };
}

function signAccessToken({ userId, sid, secret, ttlSec, nowSec }) {
  const exp = Number(nowSec) + Number(ttlSec);
  const payload = `v2|${userId}|${exp}|${sid}`;
  const sig = crypto.createHmac('sha256', String(secret)).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function readAccessToken(header, secret, nowSec) {
  const raw = String(header || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw || !secret) return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const parts = decoded.split('|');
  if (parts.length !== 5 || parts[0] !== 'v2') return null;
  const [, userId, expStr, sid, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !sid || !Number.isFinite(exp) || exp < Number(nowSec)) return null;
  const expected = crypto.createHmac('sha256', String(secret)).update(`v2|${userId}|${expStr}|${sid}`).digest('hex');
  if (!timingEqualStr(sig, expected)) return null;
  return { userId, sid, exp };
}

function createRateLimiter() {
  const buckets = new Map();
  return {
    hit(key, limit, windowMs, now = Date.now()) {
      const prev = buckets.get(key) || [];
      const fresh = prev.filter((t) => now - t < windowMs);
      if (fresh.length >= limit) {
        buckets.set(key, fresh);
        return { ok: false, retryAfterMs: Math.max(0, windowMs - (now - fresh[0])) };
      }
      fresh.push(now);
      buckets.set(key, fresh);
      return { ok: true };
    },
  };
}

function createOtpStore({ pepper, now = () => Date.now(), ttlMs = 4 * 60 * 1000, maxAttempts = 5 }) {
  if (!pepper || String(pepper).length < 16) {
    throw new Error('OTP pepper eksik');
  }
  const rows = new Map();
  const verified = new Map();
  function hash(phone, purpose, code) {
    return crypto.createHmac('sha256', String(pepper)).update(`${phone}|${purpose}|${code}`).digest('hex');
  }
  return {
    issue(phone, purpose) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const id = crypto.randomUUID();
      rows.set(id, {
        phone,
        purpose: purpose || 'signup',
        codeHash: hash(phone, purpose || 'signup', code),
        exp: now() + ttlMs,
        attempts: 0,
        consumed: false,
      });
      return { id, code };
    },
    verify(id, phone, purpose, code) {
      const row = rows.get(String(id || ''));
      const fail = { ok: false, error: 'Kod geçersiz veya süresi doldu' };
      if (!row || row.consumed) return fail;
      if (now() > row.exp) return { ok: false, error: 'Kodun süresi doldu' };
      if (row.phone !== phone || row.purpose !== (purpose || 'signup')) return fail;
      row.attempts += 1;
      if (row.attempts > maxAttempts) return { ok: false, error: 'Çok fazla deneme. Yeni kod isteyin.' };
      const codeHash = hash(phone, row.purpose, String(code || '').replace(/\D/g, ''));
      if (!timingEqualStr(codeHash, row.codeHash)) return { ok: false, error: 'Kod hatalı' };
      row.consumed = true;
      verified.set(phone, now());
      return { ok: true, phone, purpose: row.purpose };
    },
    recentlyVerified(phone, withinMs = 30 * 60 * 1000) {
      const t = verified.get(phone);
      return typeof t === 'number' && now() - t <= withinMs;
    },
  };
}

function publicOtpResponse(issued) {
  return { success: true, otpToken: issued.id };
}

function verifyHmacSha256(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const mac = crypto.createHmac('sha256', String(secret)).update(String(rawBody || '')).digest('hex');
  const presented = String(signature).replace(/^sha256=/i, '').trim();
  return timingEqualStr(presented, mac);
}

function verifyHs512Jwt(token, secret) {
  if (!secret) return false;
  const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) return false;
  const expected = crypto.createHmac('sha512', String(secret)).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  return timingEqualStr(parts[2], expected);
}

function verifyWebhookRequest({ presentedToken, signature, authorization, rawBody, secret }) {
  if (!secret) return false;
  if (presentedToken && timingEqualStr(presentedToken, secret)) return true;
  if (signature && verifyHmacSha256(rawBody, signature, secret)) return true;
  if (authorization && verifyHs512Jwt(authorization, secret)) return true;
  return false;
}

/** Eşleşme yoksa veya birden fazlaysa null — asla "ilk aktif platform" değil. */
function pickPlatform(rows, hint) {
  const list = Array.isArray(rows) ? rows : [];
  const h = hint || {};
  let hit = list;
  if (h.platformId) hit = list.filter((r) => String(r.id) === String(h.platformId));
  else if (h.remoteId) hit = list.filter((r) => r.remote_id != null && String(r.remote_id) === String(h.remoteId));
  else if (h.restaurantId) {
    hit = list.filter((r) => r.getir_restaurant_id != null && String(r.getir_restaurant_id) === String(h.restaurantId));
  } else if (h.apiKey) {
    hit = list.filter((r) => r.getir_x_api_key && timingEqualStr(r.getir_x_api_key, h.apiKey));
  } else {
    return null;
  }
  return hit.length === 1 ? hit[0] : null;
}

function clientErrorMessage() {
  return 'İşlem tamamlanamadı';
}

function loginFailureMessage() {
  return 'E-posta veya şifre hatalı';
}

module.exports = {
  BLOCKED_TABLES,
  ADMIN_UNSCOPED,
  scopeFilters,
  stripWriteRow,
  redactRow,
  redactRows,
  capLimit,
  prepareQuery,
  guardRpc,
  signAccessToken,
  readAccessToken,
  createRateLimiter,
  createOtpStore,
  publicOtpResponse,
  verifyWebhookRequest,
  verifyHs512Jwt,
  pickPlatform,
  timingEqualStr,
  clientErrorMessage,
  loginFailureMessage,
};
