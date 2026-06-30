/**
 * Tek seferlik: migration SQL dosyasını DATABASE_URL ile uygular.
 * Kullanım: node scripts/apply-migration-sql.mjs supabase/migrations/20260630134526_fix_order_number_timeout.sql
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFile() {
  const fp = path.join(root, '.env');
  if (!fs.existsSync(fp)) return;
  for (const line of fs.readFileSync(fp, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Kullanım: node scripts/apply-migration-sql.mjs <migration.sql>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL .env içinde yok');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(root, sqlFile), 'utf8');
const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('[apply] Bağlandı, SQL uygulanıyor...');
  await client.query(sql);
  const { rows } = await client.query(
    `SELECT pg_get_functiondef('public.next_order_number_for_row(public.orders)'::regprocedure) AS def`,
  );
  const def = rows[0]?.def || '';
  if (def.includes('order_daily_counters') && !def.includes('regexp_match')) {
    console.log('[apply] OK — next_order_number_for_row hızlı sürüm doğrulandı');
  } else {
    console.warn('[apply] Uyarı: fonksiyon beklenen içerikte görünmüyor');
  }
} catch (err) {
  console.error('[apply] HATA:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
