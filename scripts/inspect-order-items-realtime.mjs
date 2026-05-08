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
const r = await c.query(`SELECT relname, relreplident FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='order_items'`);
console.log('replica identity (d=default, f=full, n=nothing, i=index):');
console.table(r.rows);
const pub = await c.query(`SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='order_items'`);
console.log('order_items in supabase_realtime publication:');
console.table(pub.rows);
await c.end();
