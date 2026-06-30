import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const tenantId = '11111111-1111-1111-1111-111111111111';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const counters = await c.query(
  `SELECT * FROM order_daily_counters WHERE tenant_id = $1 ORDER BY business_date DESC LIMIT 5`,
  [tenantId],
);
console.log('counters', counters.rows);

const paket = await c.query(
  `SELECT order_number, created_at FROM orders WHERE tenant_id = $1 AND order_number LIKE 'PAKET-%' ORDER BY created_at DESC LIMIT 15`,
  [tenantId],
);
console.log('recent PAKET', paket.rows);

const maxPaket = await c.query(
  `SELECT COALESCE(MAX((regexp_match(order_number, '^PAKET-([0-9]+)$'))[1]::int), 0) AS m
   FROM orders WHERE tenant_id = $1 AND order_number LIKE 'PAKET-%' AND created_at > now() - interval '48 hours'`,
  [tenantId],
);
console.log('max PAKET last 48h', maxPaket.rows[0]);

await c.end();
