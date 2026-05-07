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
const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log('URL:', url);
console.log('service key prefix:', sk?.slice(0, 10), 'len:', sk?.length);

const sb = createClient(url, sk, { auth: { persistSession: false } });
const r = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
console.log('listUsers error:', r.error);
console.log('listUsers count:', r.data?.users?.length);
for (const u of r.data?.users || []) {
  console.log(' -', u.id, u.email);
}

// Try direct REST call
const resp = await fetch(`${url}/auth/v1/admin/users`, {
  headers: { apikey: sk, Authorization: `Bearer ${sk}` },
});
console.log('REST status:', resp.status);
const txt = await resp.text();
console.log('REST body:', txt.slice(0, 1500));
