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
const tables = ['ingredients','recipes','suppliers','purchase_invoices','purchase_invoice_items'];
for (const t of tables) {
  const r = await c.query(`
    SELECT trigger_name, event_manipulation, action_timing, action_statement
    FROM information_schema.triggers
    WHERE event_object_schema='public' AND event_object_table=$1
    ORDER BY trigger_name
  `, [t]);
  console.log(`\n=== ${t} triggers ===`);
  console.table(r.rows);
}
const fns = await c.query(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (proname ILIKE '%purchase%' OR proname ILIKE '%ingredient%' OR proname ILIKE '%recipe%' OR proname ILIKE '%stock%')
  ORDER BY proname
`);
console.log('\n=== related functions ===');
console.table(fns.rows);
await c.end();
