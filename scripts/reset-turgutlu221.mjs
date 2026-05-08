/**
 * turgutlu221 sifresini bilinen basit bir degere sifirla + giris dogrula.
 * Bu script service role key ile auth.admin.updateUserById kullanir; CORS yok.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
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

const NEW_PASSWORD = process.argv[2] || 'Test1234';

const URL = process.env.VITE_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !SVC || !ANON) {
  console.error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY eksik');
  process.exit(1);
}

const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: prof, error } = await admin
  .from('profiles')
  .select('id, email, username, full_name, role')
  .eq('username', 'turgutlu221')
  .maybeSingle();

if (error || !prof) {
  console.error('turgutlu221 profili bulunamadi:', error?.message || 'yok');
  process.exit(1);
}

console.log('Hedef:', prof);
const { error: e1 } = await admin.auth.admin.updateUserById(prof.id, {
  password: NEW_PASSWORD,
  email_confirm: true,
});
if (e1) {
  console.error('Sifre degistirme HATA:', e1.message);
  process.exit(1);
}
console.log('Yeni sifre yazildi:', NEW_PASSWORD);

console.log('\n--- Anon ile signInWithPassword denemesi ---');
const { data: signIn, error: e2 } = await anon.auth.signInWithPassword({
  email: prof.email,
  password: NEW_PASSWORD,
});
if (e2) {
  console.error('SIGNIN HATA:', e2.message);
  process.exit(1);
}
console.log('SIGNIN OK. user.id =', signIn.user?.id);

console.log('\nGiris bilgileri:');
console.log('  Kullanici adi: turgutlu221');
console.log('  Sifre: ' + NEW_PASSWORD);
