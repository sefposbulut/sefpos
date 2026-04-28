import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) throw new Error('Yetkisiz istek');

    const body = await req.json();
    const action = String(body?.action || '').trim();
    const id = String(body?.id || '').trim();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const userRes = await supabaseAdmin.auth.getUser(token);
    const uid = userRes.data.user?.id;
    if (!uid) throw new Error('Oturum gecersiz');

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', uid)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile?.is_super_admin) {
      return new Response(JSON.stringify({ success: false, error: 'Bu islem icin super admin gerekli' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_one') {
      if (!id) throw new Error('Bildirim ID zorunludur');
      const { error } = await supabaseAdmin.from('support_notifications').delete().eq('id', id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete_all') {
      const { error } = await supabaseAdmin.from('support_notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Gecersiz islem');
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Beklenmeyen hata' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

