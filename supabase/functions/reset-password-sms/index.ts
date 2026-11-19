import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { postOztekSms } from '../_shared/oztekSms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, prefer, x-requested-with, baggage, sentry-trace',
};

function normalizePhone(input: string) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2);
  return '';
}

function b64urlEncode(input: string) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(input: string) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  return atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return b64urlEncode(String.fromCharCode(...new Uint8Array(sig)));
}

function generateTempPassword(len = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const purpose = body?.purpose || 'reset';
    const phone = normalizePhone(body?.phone || '');
    const code = String(body?.code || '').replace(/\D/g, '');
    const otpToken = String(body?.otpToken || '');
    if (!phone || !code || !otpToken.includes('.')) {
      return new Response(JSON.stringify({ success: false, error: 'Telefon, kod ve OTP token zorunlu' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [payloadB64, sig] = otpToken.split('.');
    const signingSecret = Deno.env.get('OTP_SIGNING_SECRET') || '';
    if (signingSecret.length < 16) {
      return new Response(JSON.stringify({ success: false, error: 'OTP_SIGNING_SECRET eksik' }), { status: 503 });
    }
    const expectedSig = await hmacSign(payloadB64, signingSecret);
    if (sig !== expectedSig) {
      return new Response(JSON.stringify({ success: false, error: 'OTP token geçersiz' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const payload = JSON.parse(b64urlDecode(payloadB64));
    if (payload.phone !== phone || payload.purpose !== purpose) {
      return new Response(JSON.stringify({ success: false, error: 'OTP telefon ile eşleşmiyor' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (Date.now() > Number(payload.exp)) {
      return new Response(JSON.stringify({ success: false, error: 'Kodun süresi doldu' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((await sha256(code)) !== payload.codeHash) {
      return new Response(JSON.stringify({ success: false, error: 'OTP kodu geçersiz' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, phone, email, full_name')
      .not('phone', 'is', null);

    if (pErr) throw pErr;
    const profile = (profiles || []).find((p) => normalizePhone(String(p.phone || '')) === phone);
    if (!profile?.id) {
      return new Response(JSON.stringify({ success: false, error: 'Bu telefona kayıtlı hesap bulunamadı' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newPassword = generateTempPassword(8);
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    if (pwErr) throw pwErr;

    await postOztekSms(
      phone,
      `SefPOS yeni sifreniz: ${newPassword}. Guvenliginiz icin giris yaptiktan sonra degistirin.`,
      'SMS password reset',
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Yeni şifreniz SMS ile gönderildi',
        masked_phone: `0${phone.slice(0, 3)}***${phone.slice(-2)}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
