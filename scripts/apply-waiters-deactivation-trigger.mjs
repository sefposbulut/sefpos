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
-- 1) waiters.status değişimini device_bindings ve device_binding_requests'e yansıt.
CREATE OR REPLACE FUNCTION public.cleanup_waiter_device_access_on_waiter_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(NEW.status, '') <> 'active'
       AND coalesce(OLD.status, '') = 'active' THEN
      UPDATE public.device_bindings
         SET status = 'inactive'
       WHERE waiter_id = NEW.id
         AND tenant_id = NEW.tenant_id
         AND status = 'active';

      UPDATE public.device_binding_requests
         SET status = 'rejected'
       WHERE waiter_id = NEW.id
         AND tenant_id = NEW.tenant_id
         AND status IN ('pending', 'accepted');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.device_bindings
       SET status = 'inactive'
     WHERE waiter_id = OLD.id
       AND tenant_id = OLD.tenant_id
       AND status = 'active';

    UPDATE public.device_binding_requests
       SET status = 'rejected'
     WHERE waiter_id = OLD.id
       AND tenant_id = OLD.tenant_id
       AND status IN ('pending', 'accepted');

    RETURN OLD;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_waiter_update ON public.waiters;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_waiter_update
AFTER UPDATE OF status ON public.waiters
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_waiter_change();

DROP TRIGGER IF EXISTS trg_cleanup_waiter_device_access_on_waiter_delete ON public.waiters;
CREATE TRIGGER trg_cleanup_waiter_device_access_on_waiter_delete
AFTER DELETE ON public.waiters
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_waiter_device_access_on_waiter_change();

-- 2) Realtime: UPDATE/DELETE event'lerinde tam row gelsin.
ALTER TABLE public.waiters         REPLICA IDENTITY FULL;
ALTER TABLE public.device_bindings REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
`;

await c.query(sql);

console.log('--- triggers on waiters ---');
const t = await c.query(`
  SELECT tgname FROM pg_trigger WHERE tgrelid='public.waiters'::regclass AND NOT tgisinternal
`);
console.log(t.rows);

console.log('\n--- replica identity ---');
const r = await c.query(`
  SELECT relname,
         CASE relreplident
           WHEN 'd' THEN 'default'
           WHEN 'n' THEN 'nothing'
           WHEN 'f' THEN 'full'
           WHEN 'i' THEN 'index'
         END AS replica_identity
  FROM pg_class
  WHERE relname IN ('waiters','device_bindings')
    AND relnamespace = 'public'::regnamespace
`);
console.table(r.rows);

await c.end();
