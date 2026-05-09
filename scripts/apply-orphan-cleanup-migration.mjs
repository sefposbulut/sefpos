// One-shot: apply cleanup_orphan_pending_orders RPC + reload PostgREST schema.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const url = env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }

const SQL = `
DROP FUNCTION IF EXISTS public.cleanup_orphan_pending_orders(uuid, uuid);

CREATE OR REPLACE FUNCTION public.cleanup_orphan_pending_orders(
  p_tenant_id uuid,
  p_branch_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_id zorunlu'; END IF;
  WITH orphans AS (
    SELECT o.id FROM public.orders o
    LEFT JOIN public.restaurant_tables t ON t.id = o.table_id
    WHERE o.tenant_id = p_tenant_id
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND o.status IN ('pending','preparing','ready','served','in_progress','open')
      AND o.order_type = 'dine_in'
      AND (
        (t.id IS NOT NULL AND t.status IN ('available','cleaning','closed'))
        OR o.table_id IS NULL
        OR (t.current_order_id IS NOT NULL AND o.id <> t.current_order_id)
      )
  )
  UPDATE public.orders o
  SET status = 'completed',
      completed_at = COALESCE(o.completed_at, now()),
      notes = COALESCE(o.notes, '') ||
              CASE WHEN o.notes IS NULL OR o.notes = '' THEN '' ELSE E'\\n' END ||
              '[autoclosed: orphan pending @ ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ']'
  FROM orphans WHERE o.id = orphans.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphan_pending_orders(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
`;

const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/[?&]uselibpqcompat=[^&]*/g, '');
const client = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(SQL);
  const r = await client.query(`SELECT proname FROM pg_proc WHERE proname='cleanup_orphan_pending_orders'`);
  console.log('cleanup_orphan_pending_orders rows in pg_proc:', r.rowCount);
  console.log('OK');
} catch (e) {
  console.error('FAILED:', e.message || e);
  process.exitCode = 1;
} finally {
  await client.end();
}
