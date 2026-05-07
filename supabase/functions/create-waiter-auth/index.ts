import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, prefer, x-requested-with, baggage, sentry-trace',
  'Access-Control-Max-Age': '86400',
};

function json(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normPhoneDigits(p: string): string {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('90')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('05')) d = d.slice(1);
  return d;
}

function phoneToAuthEmail(phone: string, domain: string): string {
  const d = normPhoneDigits(phone);
  return `m${d}@${domain.trim()}`;
}

function pinToAuthPassword(pin: string): string {
  const digits = String(pin || '').replace(/\D/g, '');
  if (!digits) throw new Error('PIN eksik');
  let padded = digits;
  while (padded.length < 8) padded += digits;
  return `sefp_${padded.slice(0, 8)}`;
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  const maxPages = 25;
  for (; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit?.id) return hit.id;
    if (!data.users.length || data.users.length < perPage) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'Oturum gerekli (Authorization).' }, 401);
    }

    const jwt = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return json({ success: false, error: 'Sunucu yapılandırması eksik' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: jwtErr } = await admin.auth.getUser(jwt);
    if (jwtErr || !userData?.user?.id) {
      return json({ success: false, error: 'Geçersiz veya süresi dolmuş oturum' }, 401);
    }
    const callerId = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as {
      waiter_id?: string;
      phone_auth_domain?: string;
    };
    const waiter_id = body?.waiter_id?.trim();
    const phone_auth_domain =
      body?.phone_auth_domain?.trim() ||
      Deno.env.get('PHONE_AUTH_EMAIL_DOMAIN')?.trim() ||
      'sefpos.com.tr';

    if (!waiter_id) {
      return json({ success: false, error: 'waiter_id gerekli' }, 400);
    }

    const { data: prof, error: pErr } = await admin
      .from('profiles')
      .select('tenant_id, role, branch_id')
      .eq('id', callerId)
      .maybeSingle();

    if (pErr || !prof) {
      return json({ success: false, error: 'Profil bulunamadı' }, 403);
    }

    const role = String((prof as { role?: string }).role || '');
    if (!['owner', 'manager', 'admin'].includes(role)) {
      return json({ success: false, error: 'Bu işlem için yetkiniz yok (yalnızca yönetici).' }, 403);
    }

    const { data: waiter, error: wErr } = await admin
      .from('waiters')
      .select('id, name, phone, pin, tenant_id, status')
      .eq('id', waiter_id)
      .maybeSingle();

    if (wErr || !waiter) {
      return json({ success: false, error: 'Garson kaydı bulunamadı' }, 404);
    }

    const w = waiter as {
      id: string;
      name: string;
      phone: string;
      pin: string;
      tenant_id: string;
      status: string;
    };

    if (w.tenant_id !== (prof as { tenant_id: string }).tenant_id) {
      return json({ success: false, error: 'Başka işletmenin garsonuna işlem yapılamaz' }, 403);
    }

    if (w.status !== 'active') {
      return json({ success: false, error: 'Garson hesabı aktif değil' }, 400);
    }

    const email = phoneToAuthEmail(w.phone, phone_auth_domain);
    const password = pinToAuthPassword(w.pin);

    let userId: string | null = null;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: w.name,
        phone: w.phone,
        role: 'waiter',
      },
    });

    if (createErr) {
      const msg = (createErr.message || '').toLowerCase();
      if (
        msg.includes('already') ||
        msg.includes('registered') ||
        msg.includes('exists') ||
        msg.includes('duplicate')
      ) {
        userId = await findAuthUserIdByEmail(admin, email);
        if (!userId) {
          return json({ success: false, error: createErr.message }, 400);
        }
        const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: w.name, phone: w.phone, role: 'waiter' },
        });
        if (updErr) {
          return json({ success: false, error: updErr.message }, 400);
        }
      } else {
        return json({ success: false, error: createErr.message }, 400);
      }
    } else if (created?.user?.id) {
      userId = created.user.id;
    }

    if (!userId) {
      return json({ success: false, error: 'Auth kullanıcısı oluşturulamadı' }, 500);
    }

    const branchId = (prof as { branch_id?: string | null }).branch_id ?? null;

    const row: Record<string, unknown> = {
      id: userId,
      tenant_id: w.tenant_id,
      role: 'waiter',
      full_name: w.name,
      email,
      branch_id: branchId,
      is_active: true,
    };

    const { error: upErr } = await admin.from('profiles').upsert(row, { onConflict: 'id' });

    if (upErr) {
      const { error: up2 } = await admin
        .from('profiles')
        .upsert(
          {
            id: userId,
            tenant_id: w.tenant_id,
            role: 'waiter',
            full_name: w.name,
            email,
            is_active: true,
          },
          { onConflict: 'id' },
        );
      if (up2) {
        console.error('profiles upsert:', upErr, up2);
        return json({ success: false, error: up2.message || upErr.message }, 500);
      }
    }

    return json({ success: true, user_id: userId, email }, 200);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('create-waiter-auth:', message);
    return json({ success: false, error: message }, 500);
  }
});
