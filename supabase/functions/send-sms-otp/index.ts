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

async function sendOtpSms(phone: string, message: string) {
  const endpoint = Deno.env.get('OZTEK_SMS_ENDPOINT') || 'http://www.oztekbayi.com/panel/smsgonder1Npost.php';
  const kullanicino = Deno.env.get('OZTEK_KULLANICINO') || '';
  const kullaniciadi = Deno.env.get('OZTEK_KULLANICIADI') || '';
  const sifre = Deno.env.get('OZTEK_SIFRE') || '';
  const orjinator = Deno.env.get('OZTEK_ORGINATOR') || 'AYKA SOFT';
  const body = `data=<sms><kno>${kullanicino}</kno><kulad>${kullaniciadi}</kulad><sifre>${sifre}</sifre><gonderen>${orjinator}</gonderen><mesaj>${message}</mesaj><numaralar>${phone}</numaralar><tur>Turkce</tur></sms>`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`SMS servis hatası: ${res.status}`);
  const rawResult = text.trim();
  if (!rawResult) throw new Error('SMS servis yaniti bos');
  if (!rawResult.startsWith('1:')) throw new Error(`SMS saglayici reddetti: ${rawResult}`);
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const body = await req.json();
    const purpose = body?.purpose || 'signup';
    const phoneRaw = body?.phone || '';
    const phone = normalizePhone(phoneRaw);
    if (!phone || phone.length !== 10 || !phone.startsWith('5')) {
      return new Response(JSON.stringify({ success: false, error: 'Geçerli telefon numarası girin' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const exp = Date.now() + 4 * 60 * 1000;
    const payload = JSON.stringify({ phone, purpose, codeHash: await sha256(code), exp });
    const payloadB64 = b64urlEncode(payload);
    const signingSecret = Deno.env.get('OTP_SIGNING_SECRET') || 'sefpos-otp-secret';
    const sig = await hmacSign(payloadB64, signingSecret);
    const otpToken = `${payloadB64}.${sig}`;

    const message = `SefPOS dogrulama kodunuz: ${code}. Kod 4 dakika gecerlidir.`;
    await sendOtpSms(phone, message);

    return new Response(JSON.stringify({ success: true, otpToken }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Beklenmeyen hata' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
