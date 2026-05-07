/**
 * Supabase Admin API ile demo kullanıcının şifresini günceller (GoTrue üzerinden, doğru hash derivation).
 * Gerekli ortam:
 *   SUPABASE_URL veya VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Dashboard → Project Settings → API → "service_role secret")
 *
 * Çalıştırma:
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ... ; node scripts/admin-set-demo-password.mjs
 *   veya .env içine ekleyin (REPOYA COMMITLEMEYIN!).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] = v;
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) {
  console.error('SUPABASE_URL/VITE_SUPABASE_URL gerekli (.env)');
  process.exit(1);
}
if (!serviceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY gerekli (.env veya ortam).');
  console.error('Dashboard → Project Settings → API → service_role secret key.');
  process.exit(1);
}

const email = process.env.DEMO_EMAIL || 'info@sefpos.com.tr';
const password = process.env.DEMO_PASSWORD || '2128948++';

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const list = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (list.error) {
  console.error('listUsers hata:', list.error);
  process.exit(1);
}
const found = list.data?.users?.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());

if (found) {
  const upd = await sb.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  });
  if (upd.error) {
    console.error('updateUser hata:', upd.error);
    process.exit(1);
  }
  console.log('OK: Şifre güncellendi.', found.id, email);
} else {
  const cre = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cre.error) {
    console.error('createUser hata:', cre.error);
    process.exit(1);
  }
  console.log('OK: Kullanıcı oluşturuldu.', cre.data.user?.id, email);
}

const test = createClient(url, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const r = await test.auth.signInWithPassword({ email, password });
console.log('signin sonucu:', r.error ? r.error : 'OK', r.data?.user?.id || '');
