/**
 * VDS — eski Supabase Edge Function karşılıkları.
 * Tarayıcı /vds-api/fn/<ad> ile çağırır; supabase.co kullanılmaz.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createHemenyoldaPush } = require('./hemenyoldaPush.cjs');

const GETIR_DEV = 'https://food-external-api-gateway.development.getirapi.com';
const GETIR_PROD = 'https://food-external-api-gateway.getirapi.com';

const PUBLIC_FNS = new Set([
  'getir-webhook',
  'yemeksepeti-webhook',
  'online-order-webhook',
  'hemenyolda-webhook',
  'send-sms-otp',
  'verify-sms-otp',
  'send-sms-welcome',
  'reset-password-sms',
]);

function generateTempPassword(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function phoneMatchSqlExpr(col) {
  // profiles.phone 05… / 5… / +90… farklarını 10 haneli cep ile eşleştir
  return `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(${col}, N''), N' ', N''), N'-', N''), N'+', N''), N'(', N''), 10)`;
}

function getirBase(env) {
  return String(env || '').toLowerCase() === 'production' ? GETIR_PROD : GETIR_DEV;
}

async function httpJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data, text };
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

function b64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8');
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecodeToString(input) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = String(input).replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function hmacSignB64url(input, secret) {
  const sig = crypto.createHmac('sha256', String(secret)).update(String(input), 'utf8').digest();
  return b64urlEncode(sig);
}

function normalizeOtpPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2);
  return '';
}

function getOztekFromCfg(cfg) {
  const o = (cfg && cfg.oztek) || {};
  return {
    endpoint: String(o.endpoint || process.env.OZTEK_SMS_ENDPOINT || 'http://www.oztekbayi.com/panel/smsgonder1Npost.php').trim(),
    kullanicino: String(o.kullanicino || process.env.OZTEK_KULLANICINO || '').trim(),
    kullaniciadi: String(o.kullaniciadi || process.env.OZTEK_KULLANICIADI || '').trim(),
    sifre: String(o.sifre || process.env.OZTEK_SIFRE || '').trim(),
    orjinator: String(o.orjinator || process.env.OZTEK_ORGINATOR || 'AYKA SOFT').trim(),
  };
}

async function postOztekSms(cfg, phone, message, contextLabel = 'SMS') {
  const c = getOztekFromCfg(cfg);
  if (!c.kullanicino || !c.kullaniciadi || !c.sifre) {
    throw new Error(
      'Oztek SMS ayarlari eksik. vds-api.json icinde oztek.kullanicino / kullaniciadi / sifre tanimlayin.',
    );
  }
  const body =
    `data=<sms><kno>${c.kullanicino}</kno><kulad>${c.kullaniciadi}</kulad><sifre>${c.sifre}</sifre>` +
    `<gonderen>${c.orjinator}</gonderen><mesaj>${message}</mesaj><numaralar>${phone}</numaralar><tur>Turkce</tur></sms>`;
  const res = await fetch(c.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body,
  });
  const text = (await res.text()).trim();
  if (!res.ok) throw new Error(`${contextLabel} HTTP: ${res.status}`);
  if (text.startsWith('1:')) return;
  if (!text) throw new Error(`${contextLabel}: SMS servis yaniti bos`);
  throw new Error(`${contextLabel}: ${text}`);
}

function createVdsFunctions({ runSql, cfg }) {
  const otpSecret = String((cfg && cfg.otpSigningSecret) || process.env.OTP_SIGNING_SECRET || 'sefpos-otp-secret');
  const hemenyoldaPush = createHemenyoldaPush({ runSql });
  async function callerProfile(userId) {
    const rows = await runSql(
      `SELECT TOP 1 id, tenant_id, branch_id, role, is_super_admin, role_id FROM profiles WHERE id = @id`,
      { id: { value: userId } },
    );
    return rows && rows[0] ? rows[0] : null;
  }

  async function upsertGetirOrder(platform, ord) {
    const platformOrderId = String(ord.id || ord._id || '');
    if (!platformOrderId) return null;
    const client = ord.client || ord.customer || {};
    const customerName = String(client.name || client.fullName || 'Getir Musteri').slice(0, 255);
    const customerPhone = String(client.clientPhoneNumber || client.phone || '').slice(0, 50);
    const total = Number(ord.totalPrice || ord.totalAmount || ord.price || 0);
    const status = mapGetirStatus(ord.status || ord.orderStatus);
    const orderNo = String(ord.confirmationId || ord.orderNumber || platformOrderId).slice(0, 100);
    const existing = await runSql(
      `SELECT TOP 1 id FROM online_orders WHERE tenant_id = @tid AND platform_id = @pid AND platform_order_id = @poid`,
      { tid: { value: platform.tenant_id }, pid: { value: platform.id }, poid: { value: platformOrderId } },
    );
    if (existing && existing[0]) {
      await runSql(
        `UPDATE online_orders SET status = @st, total_amount = @tot, customer_name = @cn,
         platform_order_number = @pno, updated_at = GETUTCDATE() WHERE id = @id`,
        {
          st: { value: status }, tot: { value: total }, cn: { value: customerName },
          pno: { value: orderNo }, id: { value: existing[0].id },
        },
      );
      return { isNew: false };
    }
    const newId = crypto.randomUUID();
    await runSql(
      `INSERT INTO online_orders (id, tenant_id, platform_id, platform_order_id, platform_order_number,
        status, customer_name, customer_phone, subtotal, total_amount, payment_status, created_at, updated_at)
       VALUES (@id, @tid, @pid, @poid, @pno, @st, @cn, @phone, @tot, @tot, N'paid', GETUTCDATE(), GETUTCDATE())`,
      {
        id: { value: newId }, tid: { value: platform.tenant_id }, pid: { value: platform.id },
        poid: { value: platformOrderId }, pno: { value: orderNo }, st: { value: status },
        cn: { value: customerName }, phone: { value: customerPhone }, tot: { value: total },
      },
    );
    return { isNew: true };
  }

  async function handleGetirApi(body) {
    const platformId = String(body.platformId || '');
    const action = String(body.action || '');
    if (!platformId || !action) return { ok: false, error: 'platformId ve action zorunlu' };
    const rows = await runSql(
      `SELECT TOP 1 id, tenant_id, getir_environment, getir_app_secret_key, getir_restaurant_secret_key,
        getir_restaurant_id, getir_token, getir_token_expires_at FROM online_order_platforms
       WHERE id = @id AND is_active = 1`,
      { id: { value: platformId } },
    );
    const platform = rows && rows[0];
    if (!platform) return { ok: false, error: 'Getir platform kaydi yok' };
    if (!platform.getir_app_secret_key || !platform.getir_restaurant_secret_key) {
      return { ok: false, error: 'Getir credential eksik' };
    }
    const pollActions = ['poll-active', 'poll-unapproved', 'poll-cancelled'];
    const base = getirBase(platform.getir_environment);
    let token = platform.getir_token;
    const exp = platform.getir_token_expires_at ? new Date(platform.getir_token_expires_at).getTime() : 0;
    if (!token || exp < Date.now() + 60_000) {
      const login = await httpJson(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appSecretKey: platform.getir_app_secret_key,
          restaurantSecretKey: platform.getir_restaurant_secret_key,
        }),
      });
      token = login.data?.token || login.data?.data?.token;
      if (!login.ok || !token) return { ok: false, error: login.data?.message || 'Getir token alinamadi' };
      const expiresAt = new Date(Date.now() + 55 * 60_000).toISOString();
      await runSql(
        `UPDATE online_order_platforms SET getir_token = @token, getir_token_expires_at = @exp WHERE id = @id`,
        { token: { value: String(token) }, exp: { value: expiresAt }, id: { value: platform.id } },
      );
    }
    if (!pollActions.includes(action)) {
      const pathMap = {
        verify: '/food-orders/verify',
        prepare: '/food-orders/prepare',
        handover: '/food-orders/handover',
        deliver: '/food-orders/deliver',
        cancel: '/food-orders/cancel',
        inquiry: '/food-orders/inquiry',
      };
      const path = pathMap[action];
      if (!path) return { ok: false, error: `Desteklenmeyen Getir aksiyonu: ${action}` };
      const res = await httpJson(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: String(token) },
        body: JSON.stringify(body.payload || { foodOrderId: body.orderId }),
      });
      return { ok: res.ok, status: res.status, data: res.data, error: res.ok ? undefined : (res.data?.message || `Getir HTTP ${res.status}`) };
    }
    const path =
      action === 'poll-active' ? '/food-orders/active'
        : action === 'poll-unapproved' ? '/food-orders/periodic/unapproved'
          : '/food-orders/periodic/cancelled';
    const res = await httpJson(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: String(token) },
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: res.data?.message || `Getir HTTP ${res.status}`, data: res.data };
    }
    const list = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.orders || [];
    let saved = 0;
    let newCount = 0;
    for (const ord of list) {
      const r = await upsertGetirOrder(platform, ord);
      if (r) {
        saved++;
        if (r.isNew) newCount++;
      }
    }
    return { ok: true, fetched: list.length, saved, newCount, data: { saved, newCount } };
  }

  async function handleCreateUser(body, auth) {
    const caller = await callerProfile(auth.userId);
    if (!caller) return { success: false, error: 'Yetkili profil bulunamadı' };
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim();
    const roleId = body.role_id || null;
    const tenantId = body.tenant_id || caller.tenant_id;
    let branchId = body.branch_id || null;
    const username = String(body.username || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '') || null;
    const phone = String(body.phone || '').replace(/\D/g, '') || null;
    if (!email || !password || !fullName || !roleId || !tenantId) {
      return { success: false, error: 'Eksik alanlar' };
    }
    if (String(caller.tenant_id) !== String(tenantId) && !(caller.is_super_admin === true || caller.is_super_admin === 1)) {
      return { success: false, error: 'Farklı işletmeye kullanıcı eklenemez' };
    }
    if (String(caller.role || '') === 'manager') {
      if (!caller.branch_id) return { success: false, error: 'Şube müdürü bir şubeye atanmış olmalı' };
      branchId = caller.branch_id;
    }
    const exists = await runSql(`SELECT TOP 1 id FROM app_users WHERE LOWER(email) = @em`, { em: { value: email } });
    if (exists && exists[0]) return { success: false, error: 'Bu e-posta zaten kayıtlı' };
    const id = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    await runSql(
      `INSERT INTO app_users (id, email, password_hash, created_at) VALUES (@id, @em, @hash, GETUTCDATE())`,
      { id: { value: id }, em: { value: email }, hash: { value: hash } },
    );
    await runSql(
      `INSERT INTO profiles (id, tenant_id, branch_id, role_id, email, full_name, username, phone, is_active, created_at)
       VALUES (@id, @tid, @bid, @rid, @em, @fn, @un, @ph, 1, GETUTCDATE())`,
      {
        id: { value: id }, tid: { value: tenantId }, bid: { value: branchId },
        rid: { value: roleId }, em: { value: email }, fn: { value: fullName },
        un: { value: username }, ph: { value: phone },
      },
    );
    return { success: true, user: { id, email, username, phone } };
  }

  async function handleUpdateUser(body, auth) {
    if (!auth?.userId) return { success: false, error: 'Oturum gerekli' };
    const caller = await callerProfile(auth.userId);
    if (!caller) return { success: false, error: 'Yetkili profil bulunamadı' };
    const isSuper = caller.is_super_admin === true || caller.is_super_admin === 1;
    const callerRole = String(caller.role || '');
    const canManage =
      isSuper ||
      ['owner', 'admin', 'manager', 'super_admin'].includes(callerRole);

    const targetId = String(body.target_user_id || '');
    if (!targetId) return { success: false, error: 'target_user_id zorunlu' };

    const targets = await runSql(
      `SELECT TOP 1 id, tenant_id, branch_id, phone, full_name, email FROM profiles WHERE id = @id`,
      { id: { value: targetId } },
    );
    const target = targets && targets[0];
    if (!target && body.delete_user !== true) {
      return { success: false, error: 'Kullanıcı bulunamadı' };
    }
    if (target && !isSuper && String(caller.tenant_id) !== String(target.tenant_id)) {
      return { success: false, error: 'Farklı işletmenin kullanıcısı güncellenemez' };
    }
    if (target && callerRole === 'manager') {
      if (!caller.branch_id || String(caller.branch_id) !== String(target.branch_id || '')) {
        return { success: false, error: 'Şube müdürü sadece kendi şubesindeki kullanıcıları güncelleyebilir' };
      }
    }
    if (!canManage) return { success: false, error: 'Bu işlem için yetkiniz yok' };

    if (body.delete_user === true) {
      if (targetId === auth.userId) return { success: false, error: 'Kendi hesabınızı silemezsiniz' };
      await runSql(`DELETE FROM waiters WHERE auth_user_id = @id OR id = @id`, { id: { value: targetId } });
      await runSql(`DELETE FROM profiles WHERE id = @id`, { id: { value: targetId } });
      await runSql(`DELETE FROM app_users WHERE id = @id`, { id: { value: targetId } });
      return { success: true };
    }
    if (body.new_password) {
      const pw = String(body.new_password);
      if (pw.length < 6) return { success: false, error: 'Şifre en az 6 karakter olmalı' };
      const hash = await bcrypt.hash(pw, 10);
      await runSql(`UPDATE app_users SET password_hash = @h WHERE id = @id`, { h: { value: hash }, id: { value: targetId } });
      if (body.notify_sms === true) {
        const phone = normalizeOtpPhone(target?.phone || body.phone || '');
        if (phone) {
          try {
            await postOztekSms(
              cfg,
              phone,
              `SefPOS sifreniz yenilendi: ${pw}. Guvenliginiz icin giris sonrasi degistirin.`,
              'SMS password reset admin',
            );
          } catch (e) {
            console.error('[vds-fn] admin password sms:', e.message || e);
            return {
              success: true,
              password_updated: true,
              sms_sent: false,
              sms_error: e.message || String(e),
            };
          }
          return { success: true, password_updated: true, sms_sent: true };
        }
        return { success: true, password_updated: true, sms_sent: false, sms_error: 'Kayıtlı telefon yok' };
      }
    }
    if (body.allowed_ips !== undefined) {
      await runSql(`UPDATE profiles SET allowed_ips = @ips WHERE id = @id`, {
        ips: { value: body.allowed_ips }, id: { value: targetId },
      });
    }
    return { success: true };
  }

  async function verifyOtpPayload(body, expectedPurpose) {
    const purpose = body?.purpose || expectedPurpose || 'signup';
    const phone = normalizeOtpPhone(body?.phone || '');
    const code = String(body?.code || '').replace(/\D/g, '');
    if (!phone || !code) return { ok: false, error: 'Telefon ve kod zorunludur' };
    const otpToken = String(body?.otpToken || '');
    if (!otpToken.includes('.')) return { ok: false, error: 'OTP token eksik' };
    const [payloadB64, sig] = otpToken.split('.');
    const expectedSig = hmacSignB64url(payloadB64, otpSecret);
    if (sig !== expectedSig) return { ok: false, error: 'OTP token gecersiz' };
    let payload;
    try {
      payload = JSON.parse(b64urlDecodeToString(payloadB64));
    } catch {
      return { ok: false, error: 'OTP token bozuk' };
    }
    if (!payload?.phone || !payload?.purpose || !payload?.codeHash || !payload?.exp) {
      return { ok: false, error: 'OTP token bozuk' };
    }
    if (payload.phone !== phone || payload.purpose !== purpose) {
      return { ok: false, error: 'OTP token telefon ile eslesmiyor' };
    }
    if (Date.now() > Number(payload.exp)) return { ok: false, error: 'Kodun suresi doldu' };
    if (sha256Hex(code) !== payload.codeHash) return { ok: false, error: 'OTP kodu gecersiz' };
    return { ok: true, phone, purpose };
  }

  async function handleResetPasswordSms(body) {
    const verified = await verifyOtpPayload(body, 'reset');
    if (!verified.ok) return { success: false, error: verified.error };
    const phone = verified.phone;
    const rows = await runSql(
      `SELECT TOP 1 p.id, p.full_name, p.email, p.phone
       FROM profiles p
       INNER JOIN app_users u ON u.id = p.id
       WHERE ${phoneMatchSqlExpr('p.phone')} = @ph
       ORDER BY p.created_at DESC`,
      { ph: { value: phone } },
    );
    const profile = rows && rows[0];
    if (!profile) {
      return { success: false, error: 'Bu telefona kayıtlı hesap bulunamadı' };
    }
    const newPassword = generateTempPassword(8);
    const hash = await bcrypt.hash(newPassword, 10);
    await runSql(`UPDATE app_users SET password_hash = @h WHERE id = @id`, {
      h: { value: hash },
      id: { value: profile.id },
    });
    await postOztekSms(
      cfg,
      phone,
      `SefPOS yeni sifreniz: ${newPassword}. Guvenliginiz icin giris yaptiktan sonra degistirin.`,
      'SMS password reset',
    );
    return {
      success: true,
      message: 'Yeni şifreniz SMS ile gönderildi',
      masked_phone: `0${phone.slice(0, 3)}***${phone.slice(-2)}`,
    };
  }

  async function handleCreateWaiter(body, auth) {
    const caller = await callerProfile(auth.userId);
    if (!caller) return { success: false, error: 'Oturum geçersiz' };
    const phone = String(body.phone || '').replace(/\D/g, '');
    const pin = String(body.pin || '').replace(/\D/g, '');
    const name = String(body.name || body.full_name || 'Garson').trim();
    if (phone.length < 10 || pin.length !== 4) return { success: false, error: 'Telefon ve 4 haneli PIN gerekli' };
    const email = `m${phone}@sefpos.com.tr`;
    const password = `sefp_${(pin + pin + pin + pin).slice(0, 8)}`;
    const created = await handleCreateUser({
      email,
      password,
      full_name: name,
      role_id: body.role_id || caller.role_id,
      tenant_id: caller.tenant_id,
      branch_id: caller.branch_id,
      phone,
    }, auth);
    if (!created.success) return created;
    const wid = crypto.randomUUID();
    try {
      await runSql(
        `INSERT INTO waiters (id, tenant_id, phone, pin, name, status, created_at)
         VALUES (@id, @tid, @ph, @pin, @nm, N'active', GETUTCDATE())`,
        {
          id: { value: wid }, tid: { value: caller.tenant_id }, ph: { value: phone },
          pin: { value: pin }, nm: { value: name },
        },
      );
    } catch (e) {
      /* waiters satırı opsiyonel — profil oluşturuldu */
    }
    return { success: true, user: created.user, waiter_id: wid };
  }

  async function handleYsCallback(body) {
    const orderId = String(body.orderId || '');
    const action = String(body.action || '');
    if (!orderId) return { error: 'orderId zorunlu' };
    const orders = await runSql(`SELECT TOP 1 * FROM online_orders WHERE id = @id`, { id: { value: orderId } });
    const order = orders && orders[0];
    if (!order) return { error: 'Sipariş bulunamadı' };
    const plats = await runSql(`SELECT TOP 1 * FROM online_order_platforms WHERE id = @id`, { id: { value: order.platform_id } });
    const platform = plats && plats[0];
    const statusMap = { accept: 'accepted', reject: 'cancelled', prepared: 'ready', picked_up: 'delivered' };
    const status = statusMap[action] || order.status;
    const now = new Date().toISOString();
    const extra = action === 'accept' ? 'accepted_at' : action === 'prepared' ? 'ready_at' : action === 'reject' ? 'cancelled_at' : null;
    if (platform && platform.middleware_url && platform.middleware_username) {
      const login = await httpJson(`${String(platform.middleware_url).replace(/\/$/, '')}/v2/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: platform.middleware_username,
          password: platform.middleware_password,
          grant_type: 'client_credentials',
        }),
      });
      const token = login.data?.access_token || login.data?.token;
      if (!login.ok || !token) {
        return { error: 'Platform middleware login failed', details: login.text || login.data };
      }
    }
    if (extra) {
      await runSql(
        `UPDATE online_orders SET status = @st, ${extra} = @ts, updated_at = GETUTCDATE() WHERE id = @id`,
        { st: { value: status }, ts: { value: now }, id: { value: orderId } },
      );
    } else {
      await runSql(
        `UPDATE online_orders SET status = @st, updated_at = GETUTCDATE() WHERE id = @id`,
        { st: { value: status }, id: { value: orderId } },
      );
    }
    return { ok: true, status };
  }

  async function handleReprint(body) {
    const id = String(body.onlineOrderId || body.orderId || '');
    if (!id) return { ok: false, error: 'onlineOrderId zorunlu' };
    const rows = await runSql(`SELECT TOP 1 * FROM online_orders WHERE id = @id`, { id: { value: id } });
    const o = rows && rows[0];
    if (!o) return { ok: false, error: 'Sipariş yok' };
    const html = `<html><body style="font-family:sans-serif;font-size:13px">
      <h3>ŞefPOS Online Fiş</h3>
      <p>${o.platform_order_number || o.id}</p>
      <p>${o.customer_name || ''} ${o.customer_phone || ''}</p>
      <p>Toplam: ${o.total_amount || 0} TL</p>
      <p>Durum: ${o.status || ''}</p>
    </body></html>`;
    return { ok: true, html };
  }

  async function handleIncomingWebhook(body) {
    const ord = body.foodOrder || body.order || body.data || body;
    const platformOrderId = String(ord.id || ord.orderId || ord.token || '');
    if (!platformOrderId) return { ok: false, error: 'sipariş id yok' };
    const plats = await runSql(
      `SELECT TOP 1 id, tenant_id FROM online_order_platforms WHERE is_active = 1 ORDER BY created_at`,
      {},
    );
    const platform = plats && plats[0];
    if (!platform) return { ok: false, error: 'aktif platform yok' };
    await upsertGetirOrder(platform, ord);
    return { ok: true };
  }

  async function handleFn(name, body, auth) {
    const n = String(name || '').toLowerCase();
    if (n === 'getir-api') return handleGetirApi(body || {});
    if (n === 'create-user') return handleCreateUser(body || {}, auth);
    if (n === 'update-user') return handleUpdateUser(body || {}, auth);
    if (n === 'create-waiter-auth') return handleCreateWaiter(body || {}, auth);
    if (n === 'yemeksepeti-callback') return handleYsCallback(body || {});
    if (n === 'online-order-reprint') return handleReprint(body || {});
    if (n === 'sync-online-orders') return { ok: true, newOrders: 0, message: 'Senkron VDS webhook/poll ile' };
    if (n === 'hemenyolda-webhook-push') return hemenyoldaPush.handle(body || {}, auth);
    if (n === 'send-sms-otp') {
      const purpose = body?.purpose || 'signup';
      const phone = normalizeOtpPhone(body?.phone || '');
      if (!phone || phone.length !== 10 || !phone.startsWith('5')) {
        return { success: false, error: 'Geçerli telefon numarası girin' };
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const exp = Date.now() + 4 * 60 * 1000;
      const payload = JSON.stringify({ phone, purpose, codeHash: sha256Hex(code), exp });
      const payloadB64 = b64urlEncode(payload);
      const sig = hmacSignB64url(payloadB64, otpSecret);
      const otpToken = `${payloadB64}.${sig}`;
      const message = `SefPOS dogrulama kodunuz: ${code}. Kod 4 dakika gecerlidir.`;
      await postOztekSms(cfg, phone, message, 'SMS OTP');
      return { success: true, otpToken };
    }
    if (n === 'verify-sms-otp') {
      const verified = await verifyOtpPayload(body || {}, body?.purpose || 'signup');
      if (!verified.ok) return { success: false, error: verified.error };
      return { success: true };
    }
    if (n === 'reset-password-sms') {
      return handleResetPasswordSms(body || {});
    }
    if (n === 'send-sms-welcome') {
      const phone = normalizeOtpPhone(body?.phone || '');
      if (!phone) return { success: false, error: 'Telefon zorunlu' };
      try {
        await postOztekSms(
          cfg,
          phone,
          'SefPOS hesabiniz olusturuldu. Hos geldiniz!',
          'SMS welcome',
        );
      } catch (e) {
        // Kayit basarili olsun; welcome SMS ikincil
        console.error('[vds-fn] welcome sms:', e.message || e);
      }
      return { success: true };
    }
    if (n === 'send-sms-custom') {
      if (!auth) return { success: false, error: 'Oturum gerekli' };
      const phone = normalizeOtpPhone(body?.phone || '');
      const message = String(body?.message || '').trim();
      if (!phone || !message) return { success: false, error: 'Telefon ve mesaj zorunlu' };
      await postOztekSms(cfg, phone, message, 'SMS custom');
      return { success: true };
    }
    if (n === 'admin-manage-notifications') return { success: true, skipped: true };
    if (n === 'partner-orders-api') {
      return {
        success: true,
        vds: true,
        message: 'Partner API artık /vds-api/integrations/partner altındadır.',
        base: '/vds-api/integrations/partner',
      };
    }
    if (PUBLIC_FNS.has(n)) return handleIncomingWebhook(body || {});
    return { success: false, error: `Bilinmeyen fonksiyon: ${n}` };
  }

  async function handlePublicMenu(branchId) {
    if (!branchId) return { error: 'branchId zorunlu' };
    const branches = await runSql(
      `SELECT TOP 1 id, tenant_id, name, address, phone FROM branches WHERE id = @id`,
      { id: { value: branchId } },
    );
    const branch = branches && branches[0];
    if (!branch) return { error: 'Şube bulunamadı' };
    const tenants = await runSql(
      `SELECT TOP 1 id, name, logo_url, phone, address FROM tenants WHERE id = @id`,
      { id: { value: branch.tenant_id } },
    );
    const tenant = tenants && tenants[0];
    const categories = await runSql(
      `SELECT id, name, color, display_order, sort_order, image_url FROM categories WHERE tenant_id = @tid ORDER BY sort_order, name`,
      { tid: { value: branch.tenant_id } },
    );
    const products = await runSql(
      `SELECT id, category_id, name, description, price, image_url FROM products WHERE tenant_id = @tid AND is_active = 1 ORDER BY name`,
      { tid: { value: branch.tenant_id } },
    );
    return { tenant: tenant || null, branch, categories: categories || [], products: products || [], menu_theme: null };
  }

  async function handlePublicWaiterCall(body) {
    const id = crypto.randomUUID();
    await runSql(
      `INSERT INTO waiter_calls (id, tenant_id, branch_id, table_label, call_type, message, status, created_at)
       VALUES (@id, @tid, @bid, @lab, @ct, @msg, N'pending', GETUTCDATE())`,
      {
        id: { value: id },
        tid: { value: body.tenantId },
        bid: { value: body.branchId },
        lab: { value: String(body.tableLabel || '-').slice(0, 60) },
        ct: { value: body.callType || 'service' },
        msg: { value: body.message || null },
      },
    );
    return { ok: true };
  }

  return { handleFn, handlePublicMenu, handlePublicWaiterCall, PUBLIC_FNS };
}

module.exports = { createVdsFunctions, PUBLIC_FNS };
