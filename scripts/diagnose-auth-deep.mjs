import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, i).trim()] = v;
  }
}
loadEnv();

function extractRef(url) {
  try {
    const m = new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
const ref = process.env.SUPABASE_PROJECT_REF || extractRef(process.env.VITE_SUPABASE_URL || '') || 'xdfnozfuuzctubijbnds';
const password = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.DATABASE_URL;

async function connect() {
  if (connectionString) return new pg.Client({ connectionString });
  const host = `db.${ref}.supabase.co`;
  const enc = encodeURIComponent(password);
  const connStr = `postgresql://postgres:${enc}@${host}:5432/postgres?sslmode=no-verify`;
  try {
    if ((await dns.resolve4(host)).length) return new pg.Client({ connectionString: connStr });
  } catch {
    /* */
  }
  const v6 = await dns.resolve6(host).catch(() => []);
  if (v6.length) {
    return new pg.Client({
      host: v6[0],
      port: 5432,
      user: 'postgres',
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: true, servername: host },
    });
  }
  return new pg.Client({ connectionString: connStr });
}

const c = await connect();
await c.connect();

const u = await c.query(`
  SELECT id, email,
    encrypted_password IS NULL AS pwd_null,
    email_confirmed_at IS NULL AS em_conf_null,
    length(coalesce(encrypted_password,'')) AS pwd_len,
    aud, role, instance_id::text
  FROM auth.users
`);
console.log('auth.users critical:', JSON.stringify(u.rows, null, 2));

// Simulate GoTrue-style SELECT (columns GoTrue typically reads)
const sim = await c.query(`
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower($1)
  ) AS found
`, ['info@sefpos.com.tr']);
console.log('email lookup:', sim.rows[0]);

// Role grants for supabase_auth_admin
const gr = await c.query(`
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'auth' AND table_name = 'users' AND grantee = 'supabase_auth_admin'
`);
console.log('GRANTS auth.users -> supabase_auth_admin:', gr.rows.length, 'rows');

const inst = await c.query(`SELECT id, raw_base_config IS NOT NULL AS has_cfg FROM auth.instances ORDER BY id`);
console.log('auth.instances:', JSON.stringify(inst.rows, null, 2));

await c.end();
