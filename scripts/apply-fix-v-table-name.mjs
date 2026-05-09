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

const sqlPath = path.join(root, 'supabase', 'migrations', '20260509200000_fix_v_table_name_in_trigger.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
console.log('migration applied:', path.basename(sqlPath));

const r = await c.query(`
  SELECT routine_name FROM information_schema.routines
  WHERE routine_schema='public' AND routine_name='log_payment_to_cash_register'
`);
console.table(r.rows);

await c.end();
