/**
 * tmp-vds-dump/*.json → SQL Server sefpos45
 * Kullanım: node scripts/import-dump-to-sefpos45.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sql from 'mssql';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dumpDir = path.join(root, 'tmp-vds-dump');

const ORDER = [
  'app_users', 'tenants', 'branches', 'roles', 'profiles',
  'table_groups', 'restaurant_tables', 'categories', 'products', 'product_variants',
  'customers', 'delivery_customers', 'couriers', 'waiters',
  'orders', 'order_items', 'payment_transactions', 'cash_register_transactions',
  'customer_transactions', 'online_order_platforms', 'online_orders', 'online_order_items',
  'print_jobs', 'printer_registrations', 'print_settings', 'order_cancel_logs',
  'courier_notifications', 'waiter_calls', 'ingredients', 'recipes',
  'stock_movements', 'suppliers', 'shifts', 'shift_definitions',
  'loyalty_settings', 'loyalty_transactions', 'daily_closures',
  'order_daily_counters', 'branch_product_stocks', 'device_bindings',
];

if (!process.env.MSSQL_PASSWORD || !process.env.MSSQL_USER) {
  console.error('MSSQL_USER ve MSSQL_PASSWORD ortam değişkeni zorunlu');
  process.exit(1);
}

const config = {
  server: process.env.MSSQL_HOST || '127.0.0.1',
  port: Number(process.env.MSSQL_PORT || 1433),
  database: process.env.MSSQL_DATABASE || 'sefpos45',
  user: process.env.MSSQL_USER || '',
  password: process.env.MSSQL_PASSWORD || '',
  options: { encrypt: process.env.MSSQL_ENCRYPT === 'true', trustServerCertificate: true },
  requestTimeout: 120000,
  connectionTimeout: 15000,
};

function coerce(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  if (typeof val === 'boolean') return val ? 1 : 0;
  return val;
}

async function noccheck(pool, on) {
  const q = on
    ? `EXEC sp_msforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL'`
    : `EXEC sp_msforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL'`;
  try { await pool.request().batch(q); } catch { /* 2008 R2 vs 2025: try per table later */ }
}

async function tableCols(pool, table) {
  const r = await pool.request().query(`
    SELECT c.name
    FROM sys.columns c
    JOIN sys.tables t ON t.object_id = c.object_id
    WHERE t.name = '${table.replace(/'/g, '')}'
  `);
  return new Set(r.recordset.map((x) => x.name));
}

async function insertTable(pool, table, rows, cols) {
  if (!rows.length) return 0;
  let ok = 0;
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const req = pool.request();
    const stmts = [];
    part.forEach((row, idx) => {
      const keys = Object.keys(row).filter((k) => cols.has(k));
      if (!keys.length) return;
      const colSql = keys.map((k) => `[${k}]`).join(',');
      const paramNames = keys.map((k) => {
        const p = `${k}_${idx}`;
        req.input(p, coerce(row[k]));
        return `@${p}`;
      });
      stmts.push(`INSERT INTO dbo.[${table}] (${colSql}) VALUES (${paramNames.join(',')})`);
    });
    if (!stmts.length) continue;
    try {
      await req.batch(stmts.join(';\n'));
      ok += part.length;
    } catch (e) {
      for (const row of part) {
        const keys = Object.keys(row).filter((k) => cols.has(k));
        if (!keys.length) continue;
        const r2 = pool.request();
        const colSql = keys.map((k) => `[${k}]`).join(',');
        const vals = keys.map((k) => {
          r2.input(k, coerce(row[k]));
          return `@${k}`;
        });
        try {
          await r2.query(`INSERT INTO dbo.[${table}] (${colSql}) VALUES (${vals.join(',')})`);
          ok++;
        } catch (e2) {
          if (String(e2.message).includes('duplicate') || String(e2.message).includes('UNIQUE') || String(e2.message).includes('PRIMARY')) {
            ok++;
            continue;
          }
          if (ok === 0 && i === 0) console.warn(table, 'ilk hata:', e2.message.slice(0, 180));
        }
      }
    }
    if ((i / chunk) % 20 === 0) process.stdout.write(`${table} ${Math.min(i + chunk, rows.length)}/${rows.length}\r`);
  }
  return ok;
}

const pool = await sql.connect(config);
console.log('connected sefpos45');

await pool.request().query(`
  IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'sefpos')
    THROW 50000, 'login sefpos yok', 1;
`);

try {
  await pool.request().query(`
    EXEC sp_msforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL'
  `);
} catch {
  console.warn('NOCHECK atlandi');
}

const files = (process.argv[2]
  ? process.argv[2].split(',').map((s) => s.trim()).filter(Boolean)
  : ORDER.filter((t) => existsSync(path.join(dumpDir, `${t}.json`)))
);
if (!process.argv[2]) {
  for (const extra of readdirSync(dumpDir).filter((f) => f.endsWith('.json') && f !== '_manifest.json')) {
    const t = extra.replace(/\.json$/, '');
    if (!files.includes(t)) files.push(t);
  }
}

for (const table of files) {
  let cols;
  try { cols = await tableCols(pool, table); }
  catch { console.log('yok', table); continue; }
  if (cols.size === 0) { console.log('yok', table); continue; }
  const rows = JSON.parse(readFileSync(path.join(dumpDir, `${table}.json`), 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) { console.log(table, 0); continue; }
  const n = await insertTable(pool, table, rows, cols);
  console.log(table, n, '/', rows.length);
}

try {
  await pool.request().query(`EXEC sp_msforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT ALL'`);
} catch { /* ignore */ }

const chk = await pool.request().query(`
  SELECT (SELECT COUNT(*) FROM tenants) tenants,
         (SELECT COUNT(*) FROM products) products,
         (SELECT COUNT(*) FROM orders) orders,
         (SELECT COUNT(*) FROM order_items) items,
         (SELECT COUNT(*) FROM app_users) users
`);
console.log('CHECK', chk.recordset[0]);
await sql.close();
