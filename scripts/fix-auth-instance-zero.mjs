/**
 * Supabase Cloud GoTrue, tüm sorgularda instance_id = '00000000-0000-0000-0000-000000000000'
 * filtresini kullanır. Daha önce migrasyonla rastgele bir instance_id atanmıştı; bu nedenle
 * GoTrue auth.users tablosundaki kullanıcıları "göremiyor".
 *
 * Bu script:
 *  - auth.instances'a zero-UUID kayıtı ekler
 *  - auth.users.instance_id alanını zero-UUID yapar
 *  - artık kullanılmayan eski instance kaydını siler
 */
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

const ZERO = '00000000-0000-0000-0000-000000000000';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log('--- BEFORE ---');
console.log('auth.instances:', (await c.query(`SELECT id, uuid::text, raw_base_config IS NOT NULL AS has_cfg FROM auth.instances`)).rows);
console.log('auth.users instance_ids:', (await c.query(`SELECT email, instance_id::text FROM auth.users`)).rows);

await c.query('BEGIN');
try {
  // 1) zero-UUID instance kaydını yarat (varsa atla)
  await c.query(`
    INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
    VALUES ($1::uuid, $1::uuid, '{}'::jsonb, now(), now())
    ON CONFLICT (id) DO NOTHING
  `, [ZERO]);

  // 2) tüm kullanıcıları zero-UUID'ye taşı
  await c.query(`UPDATE auth.users SET instance_id = $1::uuid WHERE instance_id IS DISTINCT FROM $1::uuid`, [ZERO]);

  // 3) sessions / refresh tokens vs. de zero-UUID olmalı
  for (const tbl of ['sessions', 'refresh_tokens']) {
    const has = await c.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name=$1 AND column_name='instance_id'`,
      [tbl],
    );
    if (has.rowCount) {
      await c.query(`UPDATE auth.${tbl} SET instance_id = $1::uuid WHERE instance_id IS DISTINCT FROM $1::uuid`, [ZERO]);
    }
  }

  // 4) eski rastgele instance kaydını sil (zero-UUID hariç)
  await c.query(`DELETE FROM auth.instances WHERE id <> $1::uuid`, [ZERO]);

  await c.query('COMMIT');
} catch (e) {
  await c.query('ROLLBACK');
  console.error('hata, rollback:', e);
  process.exit(1);
}

console.log('\n--- AFTER ---');
console.log('auth.instances:', (await c.query(`SELECT id, uuid::text, raw_base_config IS NOT NULL AS has_cfg FROM auth.instances`)).rows);
console.log('auth.users instance_ids:', (await c.query(`SELECT email, instance_id::text FROM auth.users`)).rows);

await c.end();
console.log('\nOK');
