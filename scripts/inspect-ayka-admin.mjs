/**
 * info@aykasoft.com.tr ayka super-admin durumunu kontrol et:
 *  - auth.users'da var mı?
 *  - profiles.is_super_admin doğru mu?
 *  - 2128948++ ile signInWithPassword çalışıyor mu?
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i <= 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const EMAIL = 'info@aykasoft.com.tr';
const PASSWORD = '2128948++';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log('=== auth.users ===');
const u = await c.query(`SELECT id, email, email_confirmed_at, last_sign_in_at, banned_until, deleted_at FROM auth.users WHERE lower(email)=lower($1)`, [EMAIL]);
console.table(u.rows);

console.log('\n=== profiles ===');
const p = await c.query(`SELECT id, email, role, is_super_admin, tenant_id, is_active FROM public.profiles WHERE lower(email)=lower($1) OR id IN (SELECT id FROM auth.users WHERE lower(email)=lower($1))`, [EMAIL]);
console.table(p.rows);

await c.end();

console.log('\n=== signInWithPassword test ===');
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (error) {
  console.log('LOGIN HATA:', error.message, '| status:', error.status);
} else {
  console.log('LOGIN OK, user.id:', data.user.id, '| email:', data.user.email);
}
