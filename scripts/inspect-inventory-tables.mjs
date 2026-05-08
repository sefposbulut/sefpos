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
const tables = ['ingredients','recipes','suppliers','purchase_invoices','purchase_invoice_items','stock_movements','branch_product_stocks'];
for (const t of tables) {
  const ex = await c.query(`SELECT to_regclass('public.${t}') AS oid`);
  const exists = !!ex.rows[0]?.oid;
  console.log(`${t}: ${exists ? 'VAR' : 'YOK'}`);
  if (exists) {
    const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [t]);
    console.table(cols.rows);
  }
}
await c.end();
