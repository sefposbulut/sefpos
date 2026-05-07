import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

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
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const cols = await c.query(`
  SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
  WHERE table_schema='auth' AND table_name='users'
  ORDER BY ordinal_position
`);
console.log('auth.users columns:');
for (const r of cols.rows) console.log(' ', r.column_name, r.data_type, r.is_nullable);

const u = await c.query(`SELECT * FROM auth.users WHERE email = 'info@sefpos.com.tr'`);
console.log('\nrow info@sefpos.com.tr:');
const row = u.rows[0];
if (row) {
  for (const k of Object.keys(row)) {
    const v = row[k];
    const out = v === null ? 'NULL' : (typeof v === 'string' ? JSON.stringify(v.slice(0, 60)) : String(v));
    console.log(' ', k, '=', out);
  }
} else {
  console.log(' (no row)');
}

const ids = await c.query(`SELECT id, user_id, provider, identity_data, last_sign_in_at FROM auth.identities`);
console.log('\nauth.identities count:', ids.rows.length);
for (const r of ids.rows) console.log(' ', r);

await c.end();
