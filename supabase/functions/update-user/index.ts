import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager', 'super_admin']);
/** DB seed uses Turkish role names; profiles.role may be empty while role_id points here */
const MANAGER_ROLE_NAMES_TR = new Set(['Yönetici', 'Şube Müdürü']);

function callerCanManageUsers(callerProf: Record<string, unknown>): boolean {
  const role = String(callerProf.role || '');
  if (MANAGER_ROLES.has(role)) return true;
  if (callerProf.is_super_admin === true) return true;
  const joined = callerProf.roles as { name?: string; permissions?: { can_manage_users?: boolean } } | null;
  if (joined?.name && MANAGER_ROLE_NAMES_TR.has(String(joined.name))) return true;
  if (joined?.permissions?.can_manage_users === true) return true;
  return false;
}

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
      return new Response(
        JSON.stringify({ success: false, error: 'Geçersiz oturum, lütfen tekrar giriş yapın' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: {
      target_user_id?: string;
      new_password?: string;
      allowed_ips?: string | null;
      delete_user?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Geçersiz JSON gövdesi' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { target_user_id, new_password, allowed_ips, delete_user } = body;

    if (!target_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'target_user_id zorunludur' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (delete_user === true) {
      if (target_user_id === callerUser.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Kendi hesabınızı buradan silemezsiniz' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: callerProf, error: callerErr } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id, role, branch_id, is_super_admin, role_id, roles(name, permissions)')
        .eq('id', callerUser.id)
        .maybeSingle();

      if (callerErr || !callerProf?.tenant_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Yetkili profil bulunamadı' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!callerCanManageUsers(callerProf as Record<string, unknown>)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Bu işlem için yetkiniz yok' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Profil hâlâ duruyorsa: tenant + sube kontrolu + waiter/courier device temizliği
      // Profil yoksa (ör. delete_tenant_user RPC zaten sildi): auth.users hayalette
      //   kalmasın diye doğrudan silmeye geç. Caller yetkisi zaten doğrulandı.
      const tenantId = callerProf.tenant_id as string;
      const callerRoleStr = String((callerProf as { role?: string }).role || '');
      const callerBranch = (callerProf as { branch_id?: string }).branch_id || null;

      const { data: targetProf } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id, role, branch_id')
        .eq('id', target_user_id)
        .maybeSingle();

      if (targetProf) {
        if ((targetProf as { tenant_id?: string }).tenant_id !== callerProf.tenant_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'Farklı işletmeye ait kullanıcı silinemez' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Sube muduru sadece KENDI subesindeki kullaniciyi silebilir
        if (callerRoleStr === 'manager') {
          const targetBranch = (targetProf as { branch_id?: string }).branch_id || null;
          if (!callerBranch || targetBranch !== callerBranch) {
            return new Response(
              JSON.stringify({ success: false, error: 'Sube muduru sadece kendi subesindeki kullanicilari silebilir.' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
        const targetRole = String((targetProf as { role?: string }).role || '');
        if (['waiter', 'courier'].includes(targetRole)) {
          await Promise.all([
            supabaseAdmin
              .from('device_bindings')
              .update({ status: 'inactive' } as Record<string, unknown>)
              .eq('tenant_id', tenantId)
              .eq('waiter_id', target_user_id),
            supabaseAdmin
              .from('device_binding_requests')
              .update({ status: 'rejected' } as Record<string, unknown>)
              .eq('tenant_id', tenantId)
              .eq('waiter_id', target_user_id)
              .in('status', ['pending', 'accepted']),
          ]);
        }
      } else {
        // Profil yok ama auth.users'da olabilir — yine de waiter/courier
        // device kayıtlarını tarayıp pasifleştirelim ki yetim cihaz kalmasın.
        await Promise.all([
          supabaseAdmin
            .from('device_bindings')
            .update({ status: 'inactive' } as Record<string, unknown>)
            .eq('tenant_id', tenantId)
            .eq('waiter_id', target_user_id),
          supabaseAdmin
            .from('device_binding_requests')
            .update({ status: 'rejected' } as Record<string, unknown>)
            .eq('tenant_id', tenantId)
            .eq('waiter_id', target_user_id)
            .in('status', ['pending', 'accepted']),
        ]);
      }

      // auth.users silmeye çalış. Zaten yoksa (404 / not_found) idempotent kabul et.
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(target_user_id);
      if (delErr) {
        const msg = String(delErr.message || delErr).toLowerCase();
        const notFound =
          msg.includes('not found') ||
          msg.includes('user_not_found') ||
          msg.includes('does not exist') ||
          (typeof (delErr as { status?: number }).status === 'number' &&
            (delErr as { status?: number }).status === 404);
        if (!notFound) throw delErr;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sifre / IP guncellemesi icin de yetki + sube kontrolu
    if (new_password || allowed_ips !== undefined) {
      const { data: callerProfX } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id, role, branch_id, is_super_admin, role_id, roles(name, permissions)')
        .eq('id', callerUser.id)
        .maybeSingle();
      const isSuper = (callerProfX as { is_super_admin?: boolean } | null)?.is_super_admin === true;
      if (!isSuper) {
        if (!callerProfX?.tenant_id || !callerCanManageUsers(callerProfX as Record<string, unknown>)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Bu işlem için yetkiniz yok' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const callerR = String((callerProfX as { role?: string }).role || '');
        const callerB = (callerProfX as { branch_id?: string }).branch_id || null;
        const { data: tgt } = await supabaseAdmin
          .from('profiles')
          .select('tenant_id, branch_id')
          .eq('id', target_user_id)
          .maybeSingle();
        if (!tgt) {
          return new Response(
            JSON.stringify({ success: false, error: 'Kullanıcı bulunamadı' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if ((tgt as { tenant_id?: string }).tenant_id !== callerProfX.tenant_id) {
          return new Response(
            JSON.stringify({ success: false, error: 'Farkli isletmenin kullanicisi guncellenemez' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (callerR === 'manager') {
          const tgtB = (tgt as { branch_id?: string }).branch_id || null;
          if (!callerB || tgtB !== callerB) {
            return new Response(
              JSON.stringify({ success: false, error: 'Sube muduru sadece kendi subesindeki kullanicilari guncelleyebilir.' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    if (new_password) {
      if (new_password.length < 6) {
        return new Response(
          JSON.stringify({ success: false, error: 'Şifre en az 6 karakter olmalıdır' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
        password: new_password,
      });

      if (pwError) {
        throw pwError;
      }
    }

    if (allowed_ips !== undefined) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ allowed_ips: allowed_ips || null })
        .eq('id', target_user_id);

      if (profileError) {
        throw profileError;
      }
    }

    if (!new_password && allowed_ips === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'Yapılacak işlem belirtilmedi (şifre, IP veya silme)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error updating user:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
