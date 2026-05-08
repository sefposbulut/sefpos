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

for (const table of ['customers','customer_transactions','credit_transactions']) {
  console.log(`\n=== ${table} ===`);
  const r = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position
  `, [table]);
  if (r.rows.length === 0) console.log(' (yok)');
  else console.table(r.rows);
}

console.log('\n=== orders FK to customers ===');
const fk = await c.query(`
  SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND contype='f'
    AND pg_get_constraintdef(oid) ILIKE '%customer%'
`);
console.table(fk.rows);

await c.end();
