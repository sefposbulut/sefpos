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

const sqlPath = path.join(root, 'supabase', 'migrations', '20260509190000_shifts_per_user_parallel.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
console.log('migration applied:', path.basename(sqlPath));

const r1 = await c.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='tenants' AND column_name='shifts_enabled'
`);
console.table(r1.rows);

const r2 = await c.query(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='public' AND tablename='shifts'
  ORDER BY indexname
`);
console.table(r2.rows);

const r3 = await c.query(`
  SELECT routine_name FROM information_schema.routines
  WHERE routine_schema='public' AND routine_name IN ('start_shift','my_active_shift','close_shift','close_business_day','log_payment_to_cash_register')
  ORDER BY routine_name
`);
console.table(r3.rows);

await c.end();
