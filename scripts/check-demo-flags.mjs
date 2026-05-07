import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[t.slice(0, i).trim()] = v;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

console.log('--- profile detail ---');
console.log((await c.query(`SELECT * FROM profiles WHERE id=$1`, [USER])).rows);

console.log('--- tenants count ---');
console.log((await c.query(`SELECT id, name, slug FROM tenants`)).rows);

console.log('--- branches detail ---');
console.log((await c.query(`SELECT id, name, is_main, is_active, tenant_id FROM branches WHERE tenant_id=$1`, [TENANT])).rows);

console.log('--- products is_active flags ---');
console.log((await c.query(`
  SELECT name, is_active, is_available, category_id IS NOT NULL AS has_cat
    FROM products WHERE tenant_id=$1 ORDER BY name LIMIT 5`, [TENANT])).rows);

console.log('--- products with NULL is_active ---');
console.log((await c.query(`SELECT COUNT(*)::int FROM products WHERE tenant_id=$1 AND is_active IS NULL`, [TENANT])).rows);

console.log('--- restaurant_tables sample ---');
console.log((await c.query(`
  SELECT table_number, branch_id::text, group_id::text
    FROM restaurant_tables WHERE tenant_id=$1
    ORDER BY branch_id, table_number::int LIMIT 30`, [TENANT])).rows);

console.log('--- table_groups detail ---');
console.log((await c.query(`SELECT id::text, name, branch_id::text FROM table_groups WHERE tenant_id=$1`, [TENANT])).rows);

await c.end();
