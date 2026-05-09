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

const sqlPath = path.join(root, 'supabase', 'migrations', '20260509150000_compress_existing_trials_to_3days.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(sql);
console.log('updated rows:', r.rowCount ?? '(unknown)');
const r2 = await c.query(`
  SELECT id, name, subscription_plan, subscription_status, subscription_expires_at,
         created_at,
         (subscription_expires_at - now()) AS remaining
  FROM public.tenants
  WHERE subscription_plan = 'trial'
  ORDER BY created_at DESC
  LIMIT 10
`);
console.table(r2.rows);
await c.end();
