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

const sqlPath = path.join(root, 'supabase/migrations/20260508250000_waiters_auth_user_id_profile_sync.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);

const r = await c.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='waiters' AND column_name='auth_user_id'
`);
console.log('auth_user_id column:', r.rows.length > 0);

const r2 = await c.query(`
  SELECT COUNT(*)::int AS n FROM waiters WHERE auth_user_id IS NOT NULL
`);
console.log('waiters with auth_user_id:', r2.rows[0]?.n);

await c.end();
