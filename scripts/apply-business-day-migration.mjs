// One-shot: apply business_day_mode + cutoff migration directly via DATABASE_URL.
// Reads .env, executes the SQL idempotently, then exits.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const url = env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing in .env');
  process.exit(1);
}

const SQL = `
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint NOT NULL DEFAULT 6
  CHECK (business_day_start_hour BETWEEN 0 AND 23);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_mode text NOT NULL DEFAULT 'cutoff'
  CHECK (business_day_mode IN ('cutoff','manual'));

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint
  CHECK (business_day_start_hour IS NULL OR business_day_start_hour BETWEEN 0 AND 23);

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_mode text
  CHECK (business_day_mode IS NULL OR business_day_mode IN ('cutoff','manual'));

DROP FUNCTION IF EXISTS public.compute_business_date(timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.compute_business_date(p_at timestamptz, p_branch_id uuid)
RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE v_cutoff smallint := 6; v_mode text := 'cutoff'; v_hour smallint; v_last date;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6),
           COALESCE(b.business_day_mode, t.business_day_mode, 'cutoff')
      INTO v_cutoff, v_mode FROM public.branches b
      JOIN public.tenants t ON t.id = b.tenant_id WHERE b.id = p_branch_id LIMIT 1;
  END IF;
  IF v_mode = 'manual' AND p_branch_id IS NOT NULL THEN
    SELECT MAX(business_date) INTO v_last FROM public.daily_closures
      WHERE branch_id = p_branch_id AND status = 'closed';
    IF v_last IS NOT NULL THEN RETURN v_last + 1; END IF;
    RETURN (p_at AT TIME ZONE 'UTC')::date;
  END IF;
  v_hour := EXTRACT(HOUR FROM p_at)::smallint;
  IF v_hour < v_cutoff THEN RETURN (p_at AT TIME ZONE 'UTC')::date - 1; END IF;
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END; $$;

CREATE OR REPLACE FUNCTION public.get_current_business_date(p_branch_id uuid)
RETURNS TABLE (business_date date, mode text, cutoff_hour smallint, last_closed date, hours_open numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_mode text := 'cutoff'; v_cutoff smallint := 6; v_last date; v_first timestamptz; v_hours numeric := NULL;
BEGIN
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'branch_id zorunlu'; END IF;
  SELECT COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6),
         COALESCE(b.business_day_mode, t.business_day_mode, 'cutoff')
    INTO v_cutoff, v_mode FROM public.branches b
    JOIN public.tenants t ON t.id = b.tenant_id WHERE b.id = p_branch_id LIMIT 1;
  SELECT MAX(business_date) INTO v_last FROM public.daily_closures
    WHERE branch_id = p_branch_id AND status = 'closed';
  IF v_mode = 'manual' THEN
    SELECT MIN(opened_at) INTO v_first FROM public.shifts
      WHERE branch_id = p_branch_id AND (v_last IS NULL OR business_date > v_last);
    IF v_first IS NOT NULL THEN
      v_hours := EXTRACT(EPOCH FROM (now() - v_first)) / 3600.0;
    END IF;
  END IF;
  RETURN QUERY SELECT public.compute_business_date(now(), p_branch_id), v_mode, v_cutoff, v_last, v_hours;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_current_business_date(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
`;

// sslmode parametresi yeni pg surumlerinde verify-full anlaminda — manuel
// rejectUnauthorized:false ile ezmek icin URL'den sslmode'u temizliyoruz.
const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/[?&]uselibpqcompat=[^&]*/g, '');
const client = new pg.Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});

const probe = async () => {
  const r = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='tenants' AND column_name IN ('business_day_mode','business_day_start_hour');
  `);
  return r.rows.map((x) => x.column_name);
};

try {
  console.log('Connecting...');
  await client.connect();
  console.log('Applying migration...');
  await client.query(SQL);
  const cols = await probe();
  console.log('Tenants columns now include:', cols);
  console.log('OK');
} catch (e) {
  console.error('FAILED:', e.message || e);
  process.exitCode = 1;
} finally {
  await client.end();
}
