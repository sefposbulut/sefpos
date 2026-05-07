import 'dotenv/config';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace('/', ''),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const tables = ['branches', 'tenants', 'categories', 'products', 'product_variants'];
for (const t of tables) {
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [t]
  );
  console.log(`\n=== ${t} (${cols.rows.length}) ===`);
  for (const c of cols.rows)
    console.log(`  ${c.column_name} :: ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ' DEFAULT ' + c.column_default : ''}`);
}

const pol = await client.query(
  `SELECT schemaname, tablename, policyname, permissive, roles, cmd
     FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY($1::text[])
    ORDER BY tablename, policyname`,
  [['categories', 'products', 'product_variants', 'branches', 'tenants']]
);
console.log('\n--- RLS policies ---');
for (const p of pol.rows)
  console.log(`  ${p.tablename} :: ${p.policyname} (${p.cmd}) roles=${p.roles}`);

await client.end();
