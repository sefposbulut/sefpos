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

await c.query(`
  UPDATE auth.users
  SET created_at = COALESCE(created_at, email_confirmed_at, now()),
      updated_at = COALESCE(updated_at, now())
  WHERE created_at IS NULL OR updated_at IS NULL
`);

const r = await c.query(`SELECT id, email, created_at, updated_at FROM auth.users`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
