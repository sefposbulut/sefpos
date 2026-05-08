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

const sqlPath = path.join(root, 'supabase', 'migrations', '20260509010000_inventory_module.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try {
  await c.query(sql);
  console.log('✅ inventory module migration applied:', sqlPath);
} catch (e) {
  console.error('❌ migration failed:', e.message);
  process.exit(1);
}
const tablesQ = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('suppliers','ingredients','recipes','purchase_invoices','purchase_invoice_items','ingredient_movements') ORDER BY table_name`;
const r = await c.query(tablesQ);
console.log('inventory tables:');
console.table(r.rows);
await c.end();
