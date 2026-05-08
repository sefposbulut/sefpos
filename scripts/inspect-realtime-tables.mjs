import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i <= 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log('=== supabase_realtime publication\'da olan tablolar ===');
const r = await c.query(`
  SELECT pubname, schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
  ORDER BY tablename
`);
console.table(r.rows);

console.log('\n=== order_items kolonlari ===');
const oi = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_items'
  ORDER BY ordinal_position
`);
console.log(oi.rows.map(r => r.column_name).join(', '));

console.log('\n=== payment_transactions kolonlari ===');
const pt = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='payment_transactions'
  ORDER BY ordinal_position
`);
console.log(pt.rows.map(r => r.column_name).join(', '));

console.log('\n=== orders kolonlari (branch_id var mi) ===');
const od = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders'
  ORDER BY ordinal_position
`);
console.log(od.rows.map(r => r.column_name).join(', '));

console.log('\n=== REPLICA IDENTITY (FULL/DEFAULT) ===');
const ri = await c.query(`
  SELECT c.relname,
    CASE c.relreplident WHEN 'd' THEN 'default'
                        WHEN 'n' THEN 'nothing'
                        WHEN 'f' THEN 'full'
                        WHEN 'i' THEN 'index'
    END as replica_identity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN ('restaurant_tables','orders','order_items','payment_transactions','table_groups','products','categories')
  ORDER BY c.relname
`);
console.table(ri.rows);

await c.end();
