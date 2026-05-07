import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
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

const TEST_EMAIL = 'sefposdebug@aykasoft.com.tr';
const TEST_PWD = 'Test12345!';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

await c.query(`DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM auth.users WHERE email = $1)`, [TEST_EMAIL]);
await c.query(`DELETE FROM auth.users WHERE email = $1`, [TEST_EMAIL]);

const hash = bcrypt.hashSync(TEST_PWD, 10);
const inst = (await c.query(`SELECT id FROM auth.instances LIMIT 1`)).rows[0]?.id;
const uid = (await c.query(`SELECT gen_random_uuid() AS u`)).rows[0].u;

await c.query(
  `INSERT INTO auth.users
   (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token,
    is_super_admin, is_sso_user, is_anonymous, email_change_confirm_status)
   VALUES ($1,$2,'authenticated','authenticated',$3,$4, now(),
           jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
           '{}'::jsonb, now(), now(),
           '', '', '', '', '', '',
           false, false, false, 0)`,
  [inst, uid, TEST_EMAIL, hash],
);

await c.query(
  `INSERT INTO auth.identities
   (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
   VALUES (gen_random_uuid(), $1::uuid, 'email', $2::text,
           jsonb_build_object('sub', $2::text, 'email', $3::text),
           now(), now(), now())`,
  [uid, String(uid), TEST_EMAIL],
);

console.log('Test user oluşturuldu:', TEST_EMAIL, uid);
await c.end();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const r = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PWD });
console.log('Sign-in sonuç:', JSON.stringify(r, null, 2));
