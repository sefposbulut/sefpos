import 'dotenv/config';
import pg from 'pg';
const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

for (const t of ['branches', 'waiter_calls']) {
  console.log(`\n========= ${t} =========`);
  const r = await c.query(`
    SELECT policyname, cmd, permissive, roles::text AS roles,
           qual::text AS qual, with_check::text AS wc
      FROM pg_policies
     WHERE schemaname='public' AND tablename=$1
     ORDER BY cmd, policyname
  `, [t]);
  for (const p of r.rows) {
    console.log(`- ${p.policyname} | ${p.cmd} | ${p.permissive} | ${p.roles}`);
    console.log(`   qual: ${p.qual}`);
    console.log(`   wc  : ${p.wc}`);
  }
  const f = await c.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=$1 AND relnamespace='public'::regnamespace`, [t]);
  console.log('  rls/force:', f.rows[0]);
}

// Restrictive ya da farkli rol icin tum policy'leri ara
console.log('\n========= TUM branches/waiter_calls policy roller =========');
const r2 = await c.query(`
  SELECT tablename, policyname, cmd, permissive, roles::text
    FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('branches','waiter_calls')
   ORDER BY tablename, cmd, policyname
`);
console.table(r2.rows);

await c.end();
