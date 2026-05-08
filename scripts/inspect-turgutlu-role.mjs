/**
 * turgutlu221'in role/role_id durumunu ve mevcut roller (tenant_id altinda) listesini cikarir.
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: prof } = await admin
  .from('profiles')
  .select('id, email, username, role, role_id, full_name, tenant_id, branch_id')
  .eq('username', 'turgutlu221')
  .maybeSingle();

console.log('Profile:', prof);

if (prof?.role_id) {
  const { data: r } = await admin.from('roles').select('id, name, permissions').eq('id', prof.role_id).maybeSingle();
  console.log('\nLinked role:', r);
}

if (prof?.tenant_id) {
  const { data: roles } = await admin
    .from('roles')
    .select('id, name')
    .eq('tenant_id', prof.tenant_id)
    .order('name');
  console.log('\nTenant roles:');
  console.table(roles);
}
