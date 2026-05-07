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

const TEXT_COLS = [
  'aud', 'role', 'email',
  'confirmation_token', 'recovery_token',
  'email_change_token_new', 'email_change',
  'phone_change', 'phone_change_token',
  'email_change_token_current', 'reauthentication_token',
];

const setExpr = TEXT_COLS.map((c) => `${c} = COALESCE(${c}, '')`).join(', ');
const sql = `UPDATE auth.users SET ${setExpr}
            WHERE ${TEXT_COLS.map((c) => `${c} IS NULL`).join(' OR ')}
            RETURNING email`;
const r = await c.query(sql);
console.log('updated rows:', r.rowCount);
for (const row of r.rows) console.log(' -', row.email);

const u = await c.query(
  `SELECT email, ${TEXT_COLS.map((c) => `${c} IS NULL AS ${c}_null`).join(', ')} FROM auth.users`,
);
console.log('NULL flags after:', JSON.stringify(u.rows, null, 2));

await c.end();
