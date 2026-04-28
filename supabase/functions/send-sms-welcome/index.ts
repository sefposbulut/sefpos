const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function normalizePhone(input: string) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('5')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2);
  return '';
}

async function sendSms(phone: string, message: string) {
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
  if (!res.ok) throw new Error(`Hos geldin SMS servis hatasi: ${res.status}`);
  const rawResult = text.trim();
  if (!rawResult) throw new Error('Hos geldin SMS servis yaniti bos');
  if (!rawResult.startsWith('1:')) throw new Error(`Hos geldin SMS reddedildi: ${rawResult}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { phone: phoneRaw } = await req.json();
    const phone = normalizePhone(phoneRaw || '');
    if (!phone || phone.length !== 10 || !phone.startsWith('5')) {
      return new Response(JSON.stringify({ success: false, error: 'Gecerli telefon numarasi girin' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const message = 'SefPOS ailesine hos geldiniz! Hesabiniz hazir. Hemen giris yapip restoran yonetimine baslayabilirsiniz. Yardim: 0544 244 90 80';
    await sendSms(phone, message);

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
