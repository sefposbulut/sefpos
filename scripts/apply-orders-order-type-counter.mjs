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
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260509010000_orders_order_type_counter.sql'), 'utf8');
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
const r = await c.query(`SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname='orders' AND conname='orders_order_type_check'`);
console.log('new constraint:', r.rows[0]?.def);
await c.end();
