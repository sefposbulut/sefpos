/**
 * Sube izolasyonu testi:
 *  - turgutlu221 (manager, branch=eb1d656d...) ile login
 *  - profiles listesini cek
 *  - Sadece kendi sube ekibini gormeli, owner/baska sube degil
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service role ile tum kullanicilarin durumu
const admin = createClient(URL, SVC, { auth: { autoRefreshToken: false, persistSession: false } });
const all = await admin
  .from('profiles')
  .select('id, email, username, role, branch_id')
  .eq('tenant_id', '11111111-1111-1111-1111-111111111111');
console.log('Service role gorur (tum tenant):');
console.table(all.data);

// Manager turgutlu221 olarak login + sorgu
console.log('\n=== Manager turgutlu221 olarak signin ===');
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: si, error: siErr } = await anon.auth.signInWithPassword({
  email: 'turgutlu221@11111111.shefpos.local',
  password: 'Test1234',
});
if (siErr) {
  console.error('Login HATA:', siErr.message);
  process.exit(1);
}
console.log('Login OK, user.id:', si.user.id);

// Authed client ile profiles sorgu
const authed = createClient(URL, ANON, {
  global: { headers: { Authorization: `Bearer ${si.session.access_token}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: visible, error: vErr } = await authed
  .from('profiles')
  .select('id, email, username, role, branch_id')
  .eq('tenant_id', '11111111-1111-1111-1111-111111111111')
  .order('created_at', { ascending: false });
console.log('\nturgutlu221 (manager) gorur:');
console.log('  hata:', vErr?.message || 'yok');
console.table(visible);

// Owner gorunurlugu icin demo owner uzerinden test
console.log('\n=== Owner (info@sefpos.com.tr) olarak signin ===');
const ownerSi = await anon.auth.signInWithPassword({
  email: 'info@sefpos.com.tr',
  password: '2128948++',
});
if (ownerSi.error) {
  console.error('Owner login HATA (sifre yanlis olabilir):', ownerSi.error.message);
} else {
  console.log('Owner login OK, user.id:', ownerSi.data.user.id);
  const ownerAuthed = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${ownerSi.data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: ov } = await ownerAuthed
    .from('profiles')
    .select('id, email, username, role, branch_id')
    .eq('tenant_id', '11111111-1111-1111-1111-111111111111');
  console.log('Owner gorur:');
  console.table(ov);
}
