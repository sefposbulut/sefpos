const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, prefer, x-requested-with, baggage, sentry-trace',
  'Access-Control-Max-Age': '86400',
};

function normalizePhone(input: string) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2);
  return '';
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64urlDecode(input: string) {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(b64);
}

function b64urlEncode(input: string) {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const purpose = body?.purpose || 'signup';
    const phone = normalizePhone(body?.phone || '');
    const code = (body?.code || '').replace(/\D/g, '');
    if (!phone || !code) {
      return new Response(JSON.stringify({ success: false, error: 'Telefon ve kod zorunludur' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const otpToken = body?.otpToken || '';
    if (!otpToken || !otpToken.includes('.')) throw new Error('OTP token eksik');

    const [payloadB64, sig] = otpToken.split('.');
    const signingSecret = Deno.env.get('OTP_SIGNING_SECRET') || 'sefpos-otp-secret';
    const expectedSig = await hmacSign(payloadB64, signingSecret);
    if (sig !== expectedSig) throw new Error('OTP token gecersiz');

    const payload = JSON.parse(b64urlDecode(payloadB64));
    if (!payload?.phone || !payload?.purpose || !payload?.codeHash || !payload?.exp) {
      throw new Error('OTP token bozuk');
    }
    if (payload.phone !== phone || payload.purpose !== purpose) {
      throw new Error('OTP token telefon ile eslesmiyor');
    }
    if (Date.now() > Number(payload.exp)) throw new Error('Kodun suresi doldu');

    const codeHash = await sha256(code);
    if (codeHash !== payload.codeHash) throw new Error('OTP kodu gecersiz');

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Beklenmeyen hata' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
