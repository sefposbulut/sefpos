/**
 * Demo tenant'ına test verisi yükler:
 *  - Eksik profile kaydı (info@sefpos.com.tr → owner)
 *  - 2. şube (Beşiktaş)
 *  - Her şube için Salon/Bahçe masa grupları (branch_id ile)
 *  - 2. şube için 10 masa
 *  - Her kategoride toplam 9 ürün (idempotent: zaten varsa eklemez)
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

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

await c.query('BEGIN');
try {
  // 0) Tenant adresi olsun
  await c.query(
    `UPDATE tenants
       SET name = COALESCE(NULLIF(name,''), 'ŞefPOS Demo Restaurant'),
           email = COALESCE(NULLIF(email,''), 'info@sefpos.com.tr')
     WHERE id = $1`,
    [TENANT],
  );

  // 1) Ana şubenin adını net "Kadıköy Şubesi" yap (mevcut Ana Şube), 2. şubeyi ekle
  const mainBr = (
    await c.query(`SELECT id FROM branches WHERE tenant_id=$1 AND is_main=true LIMIT 1`, [TENANT])
  ).rows[0];
  if (!mainBr) throw new Error('Ana şube bulunamadı');
  await c.query(
    `UPDATE branches SET name='Kadıköy Şubesi', address='Kadıköy / İstanbul', phone='+90 216 000 00 00' WHERE id=$1`,
    [mainBr.id],
  );

  let secondBranchId = (
    await c.query(`SELECT id FROM branches WHERE tenant_id=$1 AND name='Beşiktaş Şubesi'`, [TENANT])
  ).rows[0]?.id;
  if (!secondBranchId) {
    secondBranchId = (
      await c.query(
        `INSERT INTO branches (tenant_id, name, address, phone, is_main, is_active)
         VALUES ($1,'Beşiktaş Şubesi','Beşiktaş / İstanbul','+90 212 000 00 00', false, true)
         RETURNING id`,
        [TENANT],
      )
    ).rows[0].id;
  }

  // 2) profile kaydı (RLS için zorunlu)
  await c.query(
    `INSERT INTO profiles (id, tenant_id, branch_id, email, full_name, role, onboarding_completed)
     VALUES ($1,$2,$3,'info@sefpos.com.tr','Demo Yönetici','owner', true)
     ON CONFLICT (id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       branch_id = EXCLUDED.branch_id,
       email = EXCLUDED.email,
       full_name = EXCLUDED.full_name,
       role = EXCLUDED.role,
       onboarding_completed = true`,
    [USER, TENANT, mainBr.id],
  );

  // 3) Mevcut Salon/Bahçe tablo gruplarını Ana şubeye bağla
  await c.query(
    `UPDATE table_groups SET branch_id=$1 WHERE tenant_id=$2 AND branch_id IS NULL`,
    [mainBr.id, TENANT],
  );

  // 4) Mevcut masaları Ana şubeye bağla (branch_id NULL ise)
  await c.query(
    `UPDATE restaurant_tables SET branch_id=$1 WHERE tenant_id=$2 AND branch_id IS NULL`,
    [mainBr.id, TENANT],
  );

  // 5) 2. şube için Salon/Bahçe grupları
  for (const g of [
    { name: 'Salon', color: '#3B82F6', prefix: 'S' },
    { name: 'Bahçe', color: '#10B981', prefix: 'B' },
  ]) {
    await c.query(
      `INSERT INTO table_groups (tenant_id, branch_id, name, color, prefix)
       SELECT $1, $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM table_groups
         WHERE tenant_id=$1 AND branch_id=$2 AND name=$3
       )`,
      [TENANT, secondBranchId, g.name, g.color, g.prefix],
    );
  }

  // 6) 2. şube için 10 masa (5 salon + 5 bahçe), 100..109 numaralı
  const groupsB = (
    await c.query(
      `SELECT id, name FROM table_groups WHERE tenant_id=$1 AND branch_id=$2`,
      [TENANT, secondBranchId],
    )
  ).rows;
  const gByName = Object.fromEntries(groupsB.map((g) => [g.name, g.id]));
  const tables = [
    { num: '101', cap: 4, size: 'medium', g: 'Salon' },
    { num: '102', cap: 4, size: 'medium', g: 'Salon' },
    { num: '103', cap: 2, size: 'small', g: 'Salon' },
    { num: '104', cap: 6, size: 'large', g: 'Salon' },
    { num: '105', cap: 4, size: 'medium', g: 'Salon' },
    { num: '106', cap: 4, size: 'medium', g: 'Bahçe' },
    { num: '107', cap: 6, size: 'large', g: 'Bahçe' },
    { num: '108', cap: 4, size: 'medium', g: 'Bahçe' },
    { num: '109', cap: 2, size: 'small', g: 'Bahçe' },
    { num: '110', cap: 6, size: 'large', g: 'Bahçe' },
  ];
  for (const t of tables) {
    await c.query(
      `INSERT INTO restaurant_tables (tenant_id, branch_id, table_number, capacity, size, group_id, status)
       SELECT $1,$2,$3,$4,$5,$6,'available'
       WHERE NOT EXISTS (
         SELECT 1 FROM restaurant_tables
         WHERE tenant_id=$1 AND branch_id=$2 AND table_number=$3
       )`,
      [TENANT, secondBranchId, t.num, t.cap, t.size, gByName[t.g]],
    );
  }

  // 7) Her kategoriye 7 ek ürün (toplam ~9/kat). Mevcut 2 ürün KORUNUR.
  const moreProducts = {
    'Çorbalar': [
      { name: 'Ezogelin Çorbası', price: 50 },
      { name: 'Tarhana Çorbası', price: 55 },
      { name: 'Domates Çorbası', price: 50 },
      { name: 'İşkembe Çorbası', price: 75 },
      { name: 'Tavuk Suyu Çorbası', price: 55 },
      { name: 'Kremalı Mantar Çorbası', price: 70 },
      { name: 'Düğün Çorbası', price: 65 },
    ],
    'Salatalar': [
      { name: 'Mevsim Salata', price: 70 },
      { name: 'Roka Salata', price: 75 },
      { name: 'Ton Balıklı Salata', price: 110 },
      { name: 'Akdeniz Salata', price: 95 },
      { name: 'Karışık Salata', price: 85 },
      { name: 'Yeşil Salata', price: 65 },
      { name: 'Tavuklu Sezar', price: 125 },
    ],
    'Başlangıçlar': [
      { name: 'Sigara Böreği', price: 70 },
      { name: 'Cacık', price: 45 },
      { name: 'Haydari', price: 55 },
      { name: 'Soğan Halkası', price: 60 },
      { name: 'Mozzarella Sticks', price: 95 },
      { name: 'Karides Tava', price: 175 },
      { name: 'Köz Patlıcan', price: 75 },
    ],
    'Ana Yemekler': [
      { name: 'Etli Güveç', price: 245 },
      { name: 'Hünkar Beğendi', price: 235 },
      { name: 'Kuru Fasulye + Pilav', price: 145 },
      { name: 'Karnıyarık', price: 165 },
      { name: 'Mantı', price: 155 },
      { name: 'Bonfile', price: 345 },
      { name: 'Tas Kebabı', price: 215 },
    ],
    'Izgara': [
      { name: 'Kuzu Şiş', price: 245 },
      { name: 'Beyti', price: 235 },
      { name: 'Antrikot', price: 365 },
      { name: 'Köfte', price: 175 },
      { name: 'Çöp Şiş', price: 195 },
      { name: 'Tavuk Pirzola', price: 195 },
      { name: 'Karışık Izgara', price: 285 },
    ],
    'Tavuk': [
      { name: 'Tavuk Kanat', price: 145 },
      { name: 'Tavuk Sote', price: 165 },
      { name: 'Tavuk Pane', price: 155 },
      { name: 'Tavuk Çıtır', price: 145 },
      { name: 'Tavuk Curry', price: 175 },
      { name: 'BBQ Tavuk', price: 175 },
      { name: 'Tavuk Stroganoff', price: 185 },
    ],
    'Deniz Ürünleri': [
      { name: 'Somon Izgara', price: 285 },
      { name: 'Kalamar', price: 195 },
      { name: 'Çupra Izgara', price: 265 },
      { name: 'Hamsi Tava', price: 175 },
      { name: 'Midye Tava', price: 165 },
      { name: 'Karides Köz', price: 245 },
      { name: 'Balık Şiş', price: 225 },
    ],
    'Makarnalar': [
      { name: 'Penne Arrabiata', price: 145 },
      { name: 'Ravioli', price: 165 },
      { name: 'Lazanya', price: 175 },
      { name: 'Karbonara', price: 165 },
      { name: 'Pesto Soslu Makarna', price: 155 },
      { name: 'Makarna Napoliten', price: 135 },
      { name: 'Mantar Soslu Makarna', price: 145 },
    ],
    'Pizzalar': [
      { name: 'Karışık Pizza', price: 185 },
      { name: 'Sucuklu Pizza', price: 165 },
      { name: 'Tavuklu Pizza', price: 165 },
      { name: 'Sebzeli Pizza', price: 145 },
      { name: 'Quattro Formaggi', price: 195 },
      { name: 'Mantarlı Pizza', price: 155 },
      { name: 'Hawai Pizza', price: 165 },
    ],
    'Tatlılar': [
      { name: 'Sütlaç', price: 65 },
      { name: 'Trileçe', price: 75 },
      { name: 'Kazandibi', price: 70 },
      { name: 'Cheesecake', price: 95 },
      { name: 'Tiramisu', price: 105 },
      { name: 'Brownie', price: 85 },
      { name: 'Profiterol', price: 85 },
    ],
  };

  const cats = (
    await c.query(`SELECT id, name FROM categories WHERE tenant_id=$1`, [TENANT])
  ).rows;
  const catByName = Object.fromEntries(cats.map((r) => [r.name, r.id]));

  let inserted = 0;
  for (const [catName, items] of Object.entries(moreProducts)) {
    const catId = catByName[catName];
    if (!catId) {
      console.warn(' (kategori yok, atlandı):', catName);
      continue;
    }
    for (const it of items) {
      const r = await c.query(
        `INSERT INTO products (tenant_id, category_id, name, price, is_active, is_available)
         SELECT $1,$2,$3,$4, true, true
         WHERE NOT EXISTS (
           SELECT 1 FROM products WHERE tenant_id=$1 AND name=$3
         )
         RETURNING id`,
        [TENANT, catId, it.name, it.price],
      );
      if (r.rowCount) inserted++;
    }
  }
  console.log('eklenen ürün:', inserted);

  await c.query('COMMIT');
} catch (e) {
  await c.query('ROLLBACK');
  console.error('hata:', e);
  process.exit(1);
}

console.log('\n--- ÖZET ---');
console.log('branches:', (await c.query(`SELECT name, is_main FROM branches WHERE tenant_id=$1 ORDER BY is_main DESC, name`, [TENANT])).rows);
console.log('table_groups:', (await c.query(`
  SELECT tg.name AS grup, b.name AS sube
    FROM table_groups tg
    LEFT JOIN branches b ON b.id = tg.branch_id
   WHERE tg.tenant_id=$1
   ORDER BY b.name, tg.name`, [TENANT])).rows);
console.log('tables count by branch:', (await c.query(`
  SELECT b.name AS sube, COUNT(rt.id)::int AS masa
    FROM branches b
    LEFT JOIN restaurant_tables rt ON rt.branch_id=b.id
   WHERE b.tenant_id=$1
   GROUP BY b.name ORDER BY b.name`, [TENANT])).rows);
console.log('products per category:', (await c.query(`
  SELECT cat.name AS kategori, COUNT(p.id)::int AS urun
    FROM categories cat
    LEFT JOIN products p ON p.category_id=cat.id
   WHERE cat.tenant_id=$1
   GROUP BY cat.name ORDER BY cat.name`, [TENANT])).rows);

await c.end();
console.log('\nOK');
