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
const fnSrc = await c.query(`SELECT proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname='deduct_recipe_stock_on_order_complete'`);
console.log(fnSrc.rows[0]?.def || 'Function not found');
console.log('\n--- All triggers in DB referencing this function ---');
const trg = await c.query(`SELECT event_object_schema, event_object_table, trigger_name, event_manipulation, action_timing, action_statement FROM information_schema.triggers WHERE action_statement ILIKE '%deduct_recipe_stock%' ORDER BY event_object_table`);
console.table(trg.rows);
console.log('\n--- recipes constraints ---');
const cons = await c.query(`SELECT conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname='recipes' ORDER BY conname`);
console.table(cons.rows);
await c.end();
