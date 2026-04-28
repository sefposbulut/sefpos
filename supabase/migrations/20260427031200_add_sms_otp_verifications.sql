/*
  SMS OTP doğrulama kayıtları
*/

CREATE TABLE IF NOT EXISTS public.sms_otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  purpose text NOT NULL DEFAULT 'signup',
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  is_verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_otp_phone_purpose_created
  ON public.sms_otp_verifications(phone, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_otp_expires
  ON public.sms_otp_verifications(expires_at);

ALTER TABLE public.sms_otp_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_select_sms_otp" ON public.sms_otp_verifications;
CREATE POLICY "deny_select_sms_otp"
  ON public.sms_otp_verifications
  FOR SELECT TO authenticated, anon
  USING (false);

DROP POLICY IF EXISTS "deny_insert_sms_otp" ON public.sms_otp_verifications;
CREATE POLICY "deny_insert_sms_otp"
  ON public.sms_otp_verifications
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_update_sms_otp" ON public.sms_otp_verifications;
CREATE POLICY "deny_update_sms_otp"
  ON public.sms_otp_verifications
  FOR UPDATE TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_delete_sms_otp" ON public.sms_otp_verifications;
CREATE POLICY "deny_delete_sms_otp"
  ON public.sms_otp_verifications
  FOR DELETE TO authenticated, anon
  USING (false);
