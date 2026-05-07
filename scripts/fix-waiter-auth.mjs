/**
 * Eksik kalan waiter auth user'larini Admin API ile olusturur.
 * Admin API (service_role) "email_confirm:true" ile MX validasyonu bypass eder.
 *
 * Kullanim:
 *   node scripts/fix-waiter-auth.mjs           -> tum eksik waiter'lar icin
 *   node scripts/fix-waiter-auth.mjs <phone>   -> tek waiter icin
 */
import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const arg = process.argv[2] || null;

const u = new URL(process.env.DATABASE_URL);
const c = new pg.Client({
  host: u.hostname, port: +u.port,
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1), ssl: { rejectUnauthorized: false },
});
await c.connect();

const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL_ = process.env.VITE_SUPABASE_URL;
if (!SR || !URL_) {
  console.error('SUPABASE_SERVICE_ROLE_KEY veya VITE_SUPABASE_URL eksik.');
  process.exit(1);
}
const admin = createClient(URL_, SR, { auth: { persistSession: false } });

const phoneAuthDomain = (process.env.VITE_PHONE_AUTH_EMAIL_DOMAIN || 'sefpos.com.tr').trim();
const phoneToEmail = (p) => `m${String(p).replace(/\D/g, '')}@${phoneAuthDomain}`;
const pinToAuthPassword = (pin) => {
  const d = String(pin || '').replace(/\D/g, '');
  if (!d) throw new Error('PIN bos olamaz');
  let padded = d;
  while (padded.length < 8) padded = padded + d;
  return `sefp_${padded.slice(0, 8)}`;
};

// Hangi waiter'lar?
let waiters;
if (arg) {
  const phone = String(arg).replace(/\D/g, '');
  const res = await c.query(`SELECT id, name, phone, pin, tenant_id FROM public.waiters WHERE phone=$1`, [phone]);
  waiters = res.rows;
} else {
  // Tum waiter'lar - auth.users'da yoksa eksik say
  const res = await c.query(`
    SELECT w.id, w.name, w.phone, w.pin, w.tenant_id
      FROM public.waiters w
     WHERE w.status='active'
  `);
  waiters = res.rows;
}

console.log(`Toplam ${waiters.length} waiter incelenecek\n`);

const branchId = (await c.query(`
  SELECT id FROM public.branches
   WHERE tenant_id=$1 AND COALESCE(is_main, FALSE)=TRUE
   LIMIT 1
`, [waiters[0]?.tenant_id])).rows[0]?.id || null;

let created = 0, alreadyOk = 0, failed = 0;

for (const w of waiters) {
  const email = phoneToEmail(w.phone);
  console.log(`-> ${w.name} (${w.phone}) -> ${email}`);

  // 1) auth.users'da var mi?
  const exists = await c.query(`SELECT id FROM auth.users WHERE email=$1`, [email]);
  let userId = exists.rows[0]?.id;

  const authPwd = pinToAuthPassword(w.pin || '0000');

  if (!userId) {
    const cre = await admin.auth.admin.createUser({
      email,
      password: authPwd,
      email_confirm: true,
      user_metadata: { full_name: w.name, phone: w.phone, source: 'waiter-fix' },
    });
    if (cre.error) {
      console.log('   AUTH HATA:', cre.error.message);
      failed++;
      continue;
    }
    userId = cre.data.user?.id;
    console.log('   auth.user yaratildi:', userId);
    created++;
  } else {
    const upd = await admin.auth.admin.updateUserById(userId, {
      password: authPwd,
      email_confirm: true,
    });
    if (upd.error) {
      console.log('   AUTH PWD UPD HATA:', upd.error.message);
    } else {
      console.log('   auth.user mevcut, parola PIN ile yenilendi');
      alreadyOk++;
    }
  }

  // 4) profiles tablosunda kayit garanti (waiters.branch_id varsa kullan)
  const wCols = await c.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='waiters' AND column_name='branch_id'
  `);
  let wBranch = branchId;
  if (wCols.rows.length > 0) {
    const wb = (await c.query(`SELECT branch_id FROM public.waiters WHERE id=$1`, [w.id])).rows[0]?.branch_id;
    if (wb) wBranch = wb;
  }
  // profiles tablosunda phone kolonu olmayabilir; dinamik insert
  const profCols = await c.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles'
  `);
  const has = (n) => profCols.rows.some(r => r.column_name === n);
  const fields = ['id', 'tenant_id', 'role', 'full_name'];
  const vals = [userId, w.tenant_id, 'waiter', w.name];
  if (has('email')) { fields.push('email'); vals.push(email); }
  if (has('phone')) { fields.push('phone'); vals.push(w.phone); }
  if (has('branch_id')) { fields.push('branch_id'); vals.push(wBranch); }
  if (has('is_active')) { fields.push('is_active'); vals.push(true); }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  const updates = fields.filter(f => f !== 'id').map(f => `${f}=EXCLUDED.${f}`).join(', ');
  await c.query(
    `INSERT INTO public.profiles (${fields.join(', ')}) VALUES (${placeholders})
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    vals
  );
  console.log('   profile upsert OK\n');
}

console.log(`\nOzet: yaratildi=${created}, mevcut(parola sifirlandi)=${alreadyOk}, basarisiz=${failed}`);

await c.end();
