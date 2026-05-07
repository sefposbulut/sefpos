import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env');
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] = v;
}
const ref = 'xdfnozfuuzctubijbnds';
const enc = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const host = `db.${ref}.supabase.co`;
const client = new pg.Client({
  connectionString: `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=no-verify`,
});
await client.connect();
const cols = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'instances'
  ORDER BY ordinal_position
`);
console.log(JSON.stringify(cols.rows, null, 2));
await client.end();
