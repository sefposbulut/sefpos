import 'dotenv/config';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
const client = new pg.Client({
  host: url.hostname, port: Number(url.port),
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.replace('/', ''), ssl: { rejectUnauthorized: false },
});
await client.connect();

const buckets = await client.query(`SELECT id, name, public, file_size_limit FROM storage.buckets ORDER BY name`);
console.log('Buckets:');
console.table(buckets.rows);

const policies = await client.query(`
  SELECT policyname, cmd, roles, qual::text, with_check::text
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname
`);
console.log('\nstorage.objects policies:');
for (const p of policies.rows) console.log(` - ${p.policyname} (${p.cmd}) roles=${p.roles}`);

await client.end();
