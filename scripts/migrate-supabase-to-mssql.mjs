/**
 * Supabase Postgres → ŞefPOS MSSQL kopyası.
 * Üretimde hâlâ Supabase'te veri varsa bir kez çalıştırın. Hedef veritabanı boş veya
 * aynı birincil anahtarlarla yeniden çalıştırılabilir (var olan id atlanır).
 *
 * Ortam:
 *   SUPABASE_DB_URL=postgresql://...
 *   MSSQL_HOST MSSQL_PORT MSSQL_DATABASE MSSQL_USER MSSQL_PASSWORD
 *   MSSQL_ENCRYPT=true|false
 *
 * Örnek:
 *   node scripts/migrate-supabase-to-mssql.mjs
 */
import pg from 'pg';
import sql from 'mssql';

const tables = [
  'tenants', 'branches', 'roles', 'app_users', 'profiles',
  'categories', 'products', 'product_variants',
  'customers', 'orders', 'order_items', 'payment_transactions',
  'restaurant_tables', 'table_groups', 'print_jobs',
];

const pgUrl = process.env.SUPABASE_DB_URL;
if (!pgUrl || !process.env.MSSQL_PASSWORD || !process.env.MSSQL_USER) {
  console.error('SUPABASE_DB_URL, MSSQL_USER ve MSSQL_PASSWORD zorunlu. Değerleri komut satırına yazmayın, ortamdan okuyun.');
  process.exit(1);
}

const pool = await sql.connect({
  server: process.env.MSSQL_HOST || '127.0.0.1',
  port: Number(process.env.MSSQL_PORT || 1433),
  database: process.env.MSSQL_DATABASE || 'sefpos45',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
});

const client = new pg.Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const table of tables) {
  let rows;
  try {
    const res = await client.query(`SELECT * FROM public.${table}`);
    rows = res.rows;
  } catch (e) {
    console.warn('atlandi', table, e.message);
    continue;
  }
  let inserted = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter((c) => /^[a-z0-9_]+$/i.test(c));
    if (!cols.includes('id')) continue;
    const exists = await pool.request().input('id', row.id).query(`SELECT 1 AS x FROM ${table} WHERE id = @id`);
    if (exists.recordset.length) continue;
    const req = pool.request();
    cols.forEach((c, i) => {
      let v = row[c];
      if (v && typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v);
      req.input(`p${i}`, v);
    });
    const colSql = cols.join(', ');
    const valSql = cols.map((_, i) => `@p${i}`).join(', ');
    try {
      await req.query(`INSERT INTO ${table} (${colSql}) VALUES (${valSql})`);
      inserted += 1;
    } catch (e) {
      console.warn(table, row.id, e.message);
    }
  }
  console.log(table, 'okunan', rows.length, 'eklenen', inserted);
}

await client.end();
await pool.close();
console.log('bitti');
