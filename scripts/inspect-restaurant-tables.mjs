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
const r = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='restaurant_tables'
  ORDER BY ordinal_position
`);
console.log('restaurant_tables columns:');
console.table(r.rows);

const fk = await c.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'public.restaurant_tables'::regclass AND contype = 'f'
`);
console.log('\nrestaurant_tables FKs:');
for (const row of fk.rows) console.log(' •', row.conname, '\n   ', row.def);

const r2 = await c.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema='public' AND table_name='order_items'
  ORDER BY ordinal_position
`);
console.log('\norder_items columns:');
console.table(r2.rows);

await c.end();
