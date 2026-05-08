/**
 * 1) Yetim auth.users (profile'i olmayan) kayıtları temizle
 * 2) turgutlu221 sifresini bilinen bir degere sifirla (sefp_22112211)
 * 3) Anon istemciyle resolveLoginIdentifier + signInWithPassword akisini dogrula
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('Eksik env: VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const pgClient = new pg.Client({ connectionString: DATABASE_URL });
await pgClient.connect();

console.log('=== 1) Yetim auth.users temizligi ===');
const orphans = await pgClient.query(`
  SELECT u.id, u.email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL
`);
if (orphans.rows.length === 0) {
  console.log('Yetim yok.');
} else {
  for (const row of orphans.rows) {
    console.log(' • Sil:', row.id, row.email);
    const { error } = await admin.auth.admin.deleteUser(row.id);
    if (error) console.error('   HATA:', error.message);
    else console.log('   OK');
  }
}

console.log('\n=== 2) turgutlu221 sifresini sifirla ===');
const { data: prof, error: pErr } = await admin
  .from('profiles')
  .select('id, email, username, role')
  .eq('username', 'turgutlu221')
  .maybeSingle();
if (pErr || !prof) {
  console.error('turgutlu221 bulunamadi:', pErr?.message || 'profile yok');
} else {
  console.log('Profile:', prof);
  // PIN=2211 -> sefp_22112211
  const newPwd = 'sefp_22112211';
  const { error: pwErr } = await admin.auth.admin.updateUserById(prof.id, { password: newPwd });
  if (pwErr) console.error('Sifre sifirlama HATA:', pwErr.message);
  else console.log('Yeni sifre OK:', newPwd);

  console.log('\n=== 3a) Anon ile profiles lookup (username=turgutlu221) ===');
  const { data: lookup, error: lErr } = await anon
    .from('profiles')
    .select('email, username, role')
    .eq('username', 'turgutlu221')
    .limit(2);
  console.log(' lookup error:', lErr?.message || 'yok');
  console.log(' lookup data:', lookup);

  console.log('\n=== 3b) Anon signInWithPassword ===');
  const { data: signIn, error: siErr } = await anon.auth.signInWithPassword({
    email: prof.email,
    password: newPwd,
  });
  if (siErr) {
    console.error('SIGNIN HATA:', siErr.message, '(status:', siErr.status, ')');
  } else {
    console.log('SIGNIN OK. user.id:', signIn.user?.id);
  }

  // Yanlis sifre testi
  console.log('\n=== 3c) Anon signInWithPassword (yanlis sifre) ===');
  const { error: siErr2 } = await anon.auth.signInWithPassword({
    email: prof.email,
    password: 'yanlis123',
  });
  console.log('Yanlis sifre sonucu (beklenen 400):', siErr2?.message);
}

console.log('\n=== 4) Final auth.users / profiles sayim ===');
const cnt = await pgClient.query(`
  SELECT
    (SELECT count(*) FROM auth.users) AS auth_users,
    (SELECT count(*) FROM public.profiles) AS profiles,
    (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL) AS orphans_auth,
    (SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.id WHERE u.id IS NULL) AS orphans_prof
`);
console.table(cnt.rows);

await pgClient.end();
console.log('\nBitti.');
