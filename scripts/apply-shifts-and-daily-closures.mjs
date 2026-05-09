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

const sqlPath = path.join(root, 'supabase', 'migrations', '20260509180000_shifts_and_daily_closures.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
console.log('migration applied:', path.basename(sqlPath));

const t1 = await c.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('shifts','shift_definitions','daily_closures')
  ORDER BY table_name
`);
console.table(t1.rows);

const t2 = await c.query(`
  SELECT shift_no, name, start_time, end_time
  FROM public.shift_definitions
  ORDER BY branch_id, shift_no
  LIMIT 12
`);
console.table(t2.rows);

const t3 = await c.query(`
  SELECT routine_name FROM information_schema.routines
  WHERE routine_schema='public' AND routine_name IN ('start_shift','close_shift','close_business_day','reopen_business_day','compute_business_date')
  ORDER BY routine_name
`);
console.table(t3.rows);

await c.end();
