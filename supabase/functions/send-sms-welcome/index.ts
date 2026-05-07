import { postOztekSms } from '../_shared/oztekSms.ts';

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
    await postOztekSms(phone, message, 'Hos geldin SMS');

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
