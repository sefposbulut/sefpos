import 'dotenv/config';
import pg from 'pg';
const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

for (const t of ['branches', 'tenants', 'categories', 'products', 'product_variants', 'waiter_calls']) {
  const r = await c.query(`
    SELECT grantee, privilege_type FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=$1
       AND grantee IN ('anon','authenticated','service_role')
     ORDER BY grantee, privilege_type
  `, [t]);
  console.log(`\n${t}:`);
  console.table(r.rows);
}
await c.end();
