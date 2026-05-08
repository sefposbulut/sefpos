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
DROP POLICY IF EXISTS "Managers can manage tenant device bindings" ON public.device_bindings;
CREATE POLICY "Managers can manage tenant device bindings"
  ON public.device_bindings
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

DROP POLICY IF EXISTS "Managers can view tenant device bindings" ON public.device_bindings;
CREATE POLICY "Managers can view tenant device bindings"
  ON public.device_bindings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

DROP POLICY IF EXISTS "Managers manage tenant binding requests" ON public.device_binding_requests;
CREATE POLICY "Managers manage tenant binding requests"
  ON public.device_binding_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

NOTIFY pgrst, 'reload schema';
`;

await c.query(sql);

const r = await c.query(`
  SELECT polname, polcmd,
         pg_get_expr(polqual, polrelid) AS using_expr,
         pg_get_expr(polwithcheck, polrelid) AS check_expr
  FROM pg_policy WHERE polrelid='public.device_bindings'::regclass
  ORDER BY polname
`);
console.log(JSON.stringify(r.rows, null, 2));

await c.end();
