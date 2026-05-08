import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i <= 0) continue;
    const k = t.slice(0, i).trim(); let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

for (const tbl of ['payment_transactions','order_items','table_groups','restaurant_tables','orders']) {
  console.log(`\n=== ${tbl} policies ===`);
  const r = await c.query(`
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies WHERE schemaname='public' AND tablename=$1
    ORDER BY cmd, policyname
  `, [tbl]);
  for (const row of r.rows) {
    console.log(`• [${row.cmd}] ${row.policyname} (roles: ${row.roles}) qual: ${row.qual}`);
  }
}

await c.end();
