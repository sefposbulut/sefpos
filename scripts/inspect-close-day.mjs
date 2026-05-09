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
const r = await c.query(`
  SELECT proname, pg_get_function_arguments(oid) AS args, pg_get_functiondef(oid) AS def
  FROM pg_proc
  WHERE proname IN ('close_business_day', 'reopen_business_day') AND pronamespace='public'::regnamespace
`);
for (const row of r.rows) {
  console.log('==========', row.proname, '(', row.args, ') ==========');
  console.log(row.def);
}

const t = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='restaurant_tables'
  ORDER BY ordinal_position
`);
console.log('\n----- restaurant_tables columns -----');
console.table(t.rows);

const o = await c.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders' AND column_name IN ('status', 'order_type', 'table_id', 'branch_id', 'created_at')
  ORDER BY ordinal_position
`);
console.log('\n----- orders relevant columns -----');
console.table(o.rows);

await c.end();
