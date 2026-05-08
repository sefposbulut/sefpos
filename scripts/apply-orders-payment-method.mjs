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

const sql = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orders' AND column_name='payment_method'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_method text;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(payment_method);
NOTIFY pgrst, 'reload schema';
`;

await c.query(sql);
const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='payment_method'`);
console.log('payment_method present:', r.rows.length > 0);
await c.end();
