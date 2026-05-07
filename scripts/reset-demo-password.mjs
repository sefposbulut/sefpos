import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

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

const email = process.env.DEMO_EMAIL || 'info@sefpos.com.tr';
const newPwd = process.env.DEMO_PASSWORD || '2128948++';

const hash = bcrypt.hashSync(newPwd, 10);
console.log('Yeni hash prefiks:', hash.slice(0, 7));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

await c.query(
  `UPDATE auth.users SET
    encrypted_password = $1,
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    created_at = COALESCE(created_at, now()),
    updated_at = now()
   WHERE lower(email) = lower($2)`,
  [hash, email],
);

const r = await c.query(
  `SELECT id, email, length(encrypted_password) AS plen, substring(encrypted_password, 1, 7) AS prefix FROM auth.users WHERE lower(email) = lower($1)`,
  [email],
);
console.log('Sonra:', r.rows);

await c.end();
