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

const fn = await c.query(`
  SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
         p.prosecdef AS sec_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'delete_tenant_cascade'
`);
console.log('delete_tenant_cascade definitions:');
console.table(fn.rows);

const grants = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.routine_privileges
  WHERE specific_schema = 'public' AND routine_name = 'delete_tenant_cascade'
`);
console.log('\nGrants:');
console.table(grants.rows);

await c.end();
