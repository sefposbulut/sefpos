'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const authz = require('../electron/vdsAuthz.cjs');

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function actor(over) {
  return {
    userId: 'user-1',
    profileId: 'user-1',
    tenantId: tenantA,
    isSuperAdmin: false,
    role: 'cashier',
    inactive: false,
    ...over,
  };
}

test('deneme kullanıcısı başka restoranın siparişini okuyamaz', () => {
  const prepared = authz.prepareQuery(actor(), {
    table: 'orders',
    operation: 'select',
    filters: [{ col: 'tenant_id', op: 'eq', val: tenantB }],
    select: '*',
  });
  assert.equal(prepared.error, undefined);
  const tenantFilter = prepared.body.filters.find((f) => f.col === 'tenant_id');
  assert.equal(tenantFilter.val, tenantA);
  assert.equal(prepared.body.filters.some((f) => f.val === tenantB), false);
});

test('is_super_admin istemciden yazılamaz', () => {
  const prepared = authz.prepareQuery(actor({ role: 'owner' }), {
    table: 'profiles',
    operation: 'update',
    filters: [{ col: 'id', op: 'eq', val: 'user-1' }],
    data: { is_super_admin: true, full_name: 'Ali' },
  });
  assert.equal(prepared.error, undefined);
  assert.equal(prepared.body.data.is_super_admin, undefined);
  assert.equal(prepared.body.data.full_name, 'Ali');
  assert.equal(prepared.body.data.tenant_id, tenantA);
});

test('abonelik alanları normal kullanıcıda silinir, süper admin yazabilir', () => {
  const trial = authz.prepareQuery(actor({ role: 'owner' }), {
    table: 'tenants',
    operation: 'update',
    filters: [{ col: 'id', op: 'eq', val: tenantB }],
    data: { subscription_status: 'active', subscription_expires_at: '2099-01-01', name: 'X' },
  });
  assert.equal(trial.body.data.subscription_status, undefined);
  assert.equal(trial.body.data.subscription_expires_at, undefined);
  assert.equal(trial.body.data.name, 'X');
  const forced = trial.body.filters.find((f) => f.col === 'id');
  assert.equal(forced.val, tenantA);

  const admin = authz.prepareQuery(actor({ isSuperAdmin: true, role: 'owner' }), {
    table: 'tenants',
    operation: 'update',
    filters: [{ col: 'id', op: 'eq', val: tenantB }],
    data: { subscription_plan: 'pro', subscription_status: 'active' },
  });
  assert.equal(admin.body.data.subscription_plan, 'pro');
  assert.equal(admin.body.filters.some((f) => f.val === tenantB), true);
});

test('app_users kapalı — parola hash sızmaz', () => {
  const prepared = authz.prepareQuery(actor({ role: 'owner' }), {
    table: 'app_users',
    operation: 'select',
    filters: [],
    select: 'id,password_hash',
  });
  assert.match(prepared.error, /kapalı/);
});

test('RPC istemcinin tenant id değerini yok sayar', () => {
  const guarded = authz.guardRpc(actor(), 'start_shift', { p_tenant_id: tenantB, p_branch_id: 'br' });
  assert.equal(guarded.params.p_tenant_id, tenantA);
});

test('süresi dolmuş ve eski biçimli token reddedilir', () => {
  const secret = 'unit-test-secret-value';
  const tok = authz.signAccessToken({
    userId: 'u1',
    sid: 's1',
    secret,
    ttlSec: 60,
    nowSec: 1_000,
  });
  const ok = authz.readAccessToken(`Bearer ${tok}`, secret, 1_030);
  assert.equal(ok.userId, 'u1');
  assert.equal(ok.sid, 's1');
  assert.equal(authz.readAccessToken(tok, secret, 2_000), null);
  const legacy = Buffer.from('u1|9999999999|deadbeef').toString('base64url');
  assert.equal(authz.readAccessToken(legacy, secret, 1_000), null);
});

test('login hız sınırı', () => {
  const lim = authz.createRateLimiter();
  for (let i = 0; i < 5; i++) assert.equal(lim.hit('ip', 5, 10_000, 1000).ok, true);
  assert.equal(lim.hit('ip', 5, 10_000, 1000).ok, false);
  assert.equal(lim.hit('ip', 5, 10_000, 12_000).ok, true);
});

test('OTP kodu istemciye hash olarak dönmez ve 5 denemede kilitlenir', () => {
  let clock = 1_000_000;
  const store = authz.createOtpStore({ pepper: '0123456789abcdef-otp', now: () => clock });
  const issued = store.issue('5321112233', 'signup');
  const pub = authz.publicOtpResponse(issued);
  assert.equal(pub.otpToken, issued.id);
  assert.equal(pub.codeHash, undefined);
  assert.equal(JSON.stringify(pub).includes(issued.code), false);
  for (let i = 0; i < 5; i++) {
    const bad = store.verify(issued.id, '5321112233', 'signup', '000000');
    assert.equal(bad.ok, false);
  }
  const locked = store.verify(issued.id, '5321112233', 'signup', issued.code);
  assert.match(locked.error, /fazla deneme/);
});

test('OTP doğru kodu bir kez kabul eder', () => {
  const store = authz.createOtpStore({ pepper: '0123456789abcdef-otp' });
  const issued = store.issue('5321112233', 'reset');
  assert.equal(store.verify(issued.id, '5321112233', 'reset', issued.code).ok, true);
  assert.equal(store.verify(issued.id, '5321112233', 'reset', issued.code).ok, false);
  assert.equal(store.recentlyVerified('5321112233'), true);
});

test('webhook imzasız ve belirsiz platform reddedilir', () => {
  assert.equal(authz.verifyWebhookRequest({ presentedToken: 'x', secret: '' }), false);
  assert.equal(
    authz.verifyWebhookRequest({ presentedToken: 'secret-one', rawBody: '{}', secret: 'secret-one' }),
    true,
  );
  assert.equal(authz.pickPlatform([{ id: '1' }, { id: '2' }], {}), null);
  const only = authz.pickPlatform(
    [
      { id: '1', remote_id: 'a' },
      { id: '2', remote_id: 'b' },
    ],
    { remoteId: 'b' },
  );
  assert.equal(only.id, '2');
  assert.equal(
    authz.pickPlatform(
      [
        { id: '1', remote_id: 'a' },
        { id: '2', remote_id: 'a' },
      ],
      { remoteId: 'a' },
    ),
    null,
  );
});

test('Yemeksepeti HS512 JWT sırrı doğrulanır', () => {
  const secret = 'dh-webhook-secret';
  const header = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: 9 })).toString('base64url');
  const sig = crypto.createHmac('sha512', secret).update(`${header}.${payload}`).digest('base64url');
  const jwt = `${header}.${payload}.${sig}`;
  assert.equal(authz.verifyHs512Jwt(`Bearer ${jwt}`, secret), true);
  assert.equal(authz.verifyHs512Jwt(jwt, 'wrong'), false);
  assert.equal(authz.verifyHs512Jwt(jwt, ''), false);
});

test('hata metni veritabanı ayrıntısı sızdırmaz', () => {
  assert.equal(authz.clientErrorMessage().includes('SELECT'), false);
  assert.equal(authz.loginFailureMessage().includes('@'), false);
});
