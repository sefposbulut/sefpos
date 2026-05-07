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

const tables = ['support_tickets', 'cash_register_transactions', 'profiles', 'tenants'];
const exists = await client.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])`,
  [tables]
);
console.log('Mevcut tablolar:', exists.rows.map(r => r.table_name));

for (const t of tables) {
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position`,
    [t]
  );
  console.log(`\n=== ${t} (${cols.rows.length} kolon) ===`);
  for (const c of cols.rows) {
    console.log(`  - ${c.column_name} :: ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}`);
  }
}

await client.end();
