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

await client.query(`
  CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    name text
  );
`);

const applied = await client.query(
  `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30`
);
console.log('Son 30 uygulanan migration:');
for (const r of applied.rows) console.log('  -', r.version);

const sync = await client.query(
  `SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass`
);
console.log('\norders trigger:', sync.rows.map(r => r.tgname));

console.log('\n20260507160000 schema_migrations icine isaretleniyor (zaten uygulanmis sayiliyor)...');
await client.query(
  `INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('20260507160000','orders_order_items_panel_columns')
   ON CONFLICT (version) DO NOTHING`
);

await client.end();
console.log('Tamam.');
