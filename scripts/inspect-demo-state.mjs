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

console.log('--- tenant ---');
console.log((await c.query(`SELECT id, name, slug, email FROM tenants WHERE id=$1`, [TENANT])).rows);

console.log('--- profiles ---');
console.log((await c.query(`SELECT id, email, role, branch_id::text, tenant_id::text FROM profiles WHERE tenant_id=$1`, [TENANT])).rows);

console.log('--- branches ---');
console.log((await c.query(`SELECT id, name, is_main, is_active FROM branches WHERE tenant_id=$1`, [TENANT])).rows);

console.log('--- table_groups ---');
console.log((await c.query(`SELECT id, name, color, prefix, branch_id::text FROM table_groups WHERE tenant_id=$1`, [TENANT])).rows);

console.log('--- restaurant_tables count ---');
console.log((await c.query(`SELECT COUNT(*)::int AS n FROM restaurant_tables WHERE tenant_id=$1`, [TENANT])).rows);

console.log('--- categories ---');
console.log((await c.query(`SELECT id, name FROM categories WHERE tenant_id=$1 ORDER BY name`, [TENANT])).rows);

console.log('--- products count by category ---');
console.log((await c.query(`
  SELECT cat.name AS cat, COUNT(p.id)::int AS n
  FROM categories cat
  LEFT JOIN products p ON p.category_id=cat.id AND p.tenant_id=cat.tenant_id
  WHERE cat.tenant_id=$1
  GROUP BY cat.name ORDER BY cat.name
`, [TENANT])).rows);

console.log('--- categories columns ---');
console.log((await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' ORDER BY ordinal_position`)).rows);

console.log('--- products columns ---');
console.log((await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position`)).rows);

console.log('--- restaurant_tables columns ---');
console.log((await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurant_tables' ORDER BY ordinal_position`)).rows);

console.log('--- table_groups columns ---');
console.log((await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='table_groups' ORDER BY ordinal_position`)).rows);

console.log('--- branches columns ---');
console.log((await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='branches' ORDER BY ordinal_position`)).rows);

await c.end();
