import 'dotenv/config';
import pg from 'pg';
const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

const phone = '05324475943';
const authEmail = `m${phone}@sefpos.com.tr`;
console.log('Aranan auth email:', authEmail);

const r1 = await c.query(`SELECT id, email, encrypted_password IS NOT NULL AS has_pwd FROM auth.users WHERE email=$1`, [authEmail]);
console.log('auth.users:'); console.table(r1.rows);

const r2 = await c.query(`SELECT id, name, phone, pin, status, tenant_id FROM public.waiters WHERE phone=$1`, [phone]);
console.log('waiters:'); console.table(r2.rows);

if (r2.rows[0]) {
  const w = r2.rows[0];
  const r3 = await c.query(`SELECT id, tenant_id, role, branch_id, full_name FROM public.profiles WHERE tenant_id=$1 AND (role='waiter' OR full_name=$2)`, [w.tenant_id, w.name]);
  console.log('profiles (waiter rol):'); console.table(r3.rows);
}

await c.end();
