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

console.log('--- triggers on waiters ---');
const t1 = await c.query(`
  SELECT tgname, pg_get_triggerdef(oid) AS def
  FROM pg_trigger
  WHERE tgrelid = 'public.waiters'::regclass AND NOT tgisinternal
`);
console.log(JSON.stringify(t1.rows, null, 2));

console.log('\n--- functions referencing waiter status cleanup ---');
const f = await c.query(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND (
    proname ILIKE '%waiter%' OR
    proname ILIKE '%cleanup%' OR
    proname ILIKE '%binding%'
  )
`);
console.table(f.rows);

await c.end();
