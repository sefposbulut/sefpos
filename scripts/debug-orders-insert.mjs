import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
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
}

loadEnv();
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tenantId = '11111111-1111-1111-1111-111111111111';
const branchId = '22222222-2222-2222-2222-222222222222';

const constraints = await client.query(`
  SELECT conname, pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
`);
console.log('orders constraints:', constraints.rows);

const cols = await client.query(`
  SELECT column_name, is_nullable, column_default, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders'
  ORDER BY ordinal_position
`);
const required = cols.rows.filter((r) => r.is_nullable === 'NO' && !r.column_default);
console.log('required without default:', required.map((r) => r.column_name));

try {
  const r = await client.query(
    `INSERT INTO public.orders (
      tenant_id, branch_id, order_type, status, delivery_status,
      customer_name, payment_method, payment_collected, payment_status,
      subtotal, total_amount
    ) VALUES ($1,$2,'takeaway','active','pending','Test','cash',false,'unpaid',100,100)
    RETURNING id, order_number`,
    [tenantId, branchId],
  );
  console.log('INSERT OK', r.rows[0]);
  await client.query('DELETE FROM public.order_items WHERE order_id = $1', [r.rows[0].id]);
  await client.query('DELETE FROM public.orders WHERE id = $1', [r.rows[0].id]);
} catch (e) {
  console.error('INSERT FAIL', e.message, e.detail || '');
}

try {
  await client.query(
    `INSERT INTO public.orders (
      tenant_id, branch_id, order_type, status, delivery_status,
      customer_name, payment_method, payment_collected, payment_status,
      subtotal, total_amount
    ) VALUES ($1,$2,'takeaway','active','on_the_way','Test','cash',false,'unpaid',100,100)
    RETURNING id`,
    [tenantId, branchId],
  );
  console.log('on_the_way OK');
} catch (e) {
  console.error('on_the_way FAIL', e.message);
}

await client.end();
