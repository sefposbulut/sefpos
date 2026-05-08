/**
 * info@aykasoft.com.tr ayka super-admin hesabını oluşturur (varsa şifresini günceller).
 *  - auth.users'a email_confirm:true ile ekler
 *  - profiles'da is_super_admin=true, role='admin' set eder
 *  - tenant_id boş bırakılır (super_admin tenant'a bağlanmasın)
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

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`1) ${EMAIL} hesabı kontrol ediliyor...`);
const { data: existing, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (listErr) {
  console.error('listUsers HATA:', listErr.message);
  process.exit(1);
}
const found = existing.users.find(u => (u.email || '').toLowerCase() === EMAIL);

let userId = null;
if (found) {
  console.log(`   Mevcut hesap bulundu: ${found.id}. Şifre güncelleniyor...`);
  const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
    password: PASSWORD,
    email_confirm: true,
  });
  if (updErr) {
    console.error('   updateUser HATA:', updErr.message);
    process.exit(1);
  }
  userId = found.id;
} else {
  console.log('   Yeni hesap oluşturuluyor...');
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Ayka Admin' },
  });
  if (cErr) {
    console.error('   createUser HATA:', cErr.message);
    process.exit(1);
  }
  userId = created.user.id;
}

console.log(`2) profiles güncelleniyor (id=${userId})...`);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`
  INSERT INTO public.profiles (id, email, full_name, role, is_super_admin, is_active)
  VALUES ($1, $2, 'Ayka Admin', 'admin', true, true)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), 'Ayka Admin'),
        role = 'admin',
        is_super_admin = true,
        is_active = true
`, [userId, EMAIL]);
await c.end();
console.log('   profiles OK.');

console.log('\n3) signInWithPassword testi...');
const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: si, error: siErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (siErr) {
  console.error('   LOGIN HATA:', siErr.message);
  process.exit(1);
}
console.log(`   LOGIN OK. user.id=${si.user.id}`);
console.log('\nTAMAM. /ayka panelinden info@aykasoft.com.tr / 2128948++ ile giriş yapabilirsiniz.');
