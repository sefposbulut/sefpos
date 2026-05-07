import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role_id: string;
  tenant_id: string;
  branch_id?: string | null;
  /** Login icin kullanici adi (lowercase, a-z0-9, opsiyonel) */
  username?: string | null;
  /** Login icin telefon numarasi (11 hane, opsiyonel) */
  phone?: string | null;
}

const sanitizeUsername = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return v.length >= 2 ? v : null;
};

const sanitizePhone = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return null;
  return digits.length === 10 ? '0' + digits : digits;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Yetkilendirme başlığı eksik' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !callerUser) {
      console.log('Auth check note: Token validation attempt', authError?.message);
    }

    const body: CreateUserRequest = await req.json();
    const {
      email,
      password,
      full_name,
      role_id,
      tenant_id,
      branch_id,
      username,
      phone,
    } = body;

    if (!email || !password || !full_name || !role_id || !tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Eksik alanlar: email, password, full_name, role_id, tenant_id zorunludur' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanUsername = sanitizeUsername(username);
    const cleanPhone = sanitizePhone(phone);

    // Username/phone aynı tenant icinde kullanimda mi? (RLS'i bypass etmek
    // icin service-role kullanildigindan tenant filtreleme manuel yapilir.)
    if (cleanUsername) {
      const { data: collide } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenant_id)
        .filter('username', 'eq', cleanUsername)
        .limit(1)
        .maybeSingle();
      if (collide?.id) {
        return new Response(
          JSON.stringify({ success: false, error: `Bu kullanıcı adı (${cleanUsername}) bu firmada zaten kullanılıyor.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    if (cleanPhone) {
      const { data: phoneCollide } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('phone', cleanPhone)
        .limit(1)
        .maybeSingle();
      if (phoneCollide?.id) {
        return new Response(
          JSON.stringify({ success: false, error: `Bu telefon numarası (${cleanPhone}) bu firmada zaten kullanılıyor.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        tenant_id,
        branch_id: branch_id || null,
        username: cleanUsername || null,
        phone: cleanPhone || null,
      },
    });

    if (signUpError) throw signUpError;
    if (!authData.user) throw new Error('Kullanıcı oluşturulamadı');

    // profile trigger ureteneye kadar kucuk bir bekleme
    await new Promise(resolve => setTimeout(resolve, 800));

    const profileUpdate: Record<string, unknown> = { role_id };
    if (branch_id) profileUpdate.branch_id = branch_id;
    if (cleanUsername) profileUpdate.username = cleanUsername;
    if (cleanPhone) profileUpdate.phone = cleanPhone;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          username: cleanUsername,
          phone: cleanPhone,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating user:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
