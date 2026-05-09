import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';
import { isSqlServerMode, isLocalMode } from '../lib/sqlDb';
import { fetchCloudTableGridSnapshot, prefetchCloudTableGrid } from '../lib/tableGridData';
import { setPrintAgentBranchId, setPrintAgentTenantId, registerElectronPrinters, isElectron } from '../lib/printService';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Tenant = Database['public']['Tables']['tenants']['Row'];
type Role = Database['public']['Tables']['roles']['Row'];

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  is_main: boolean;
  created_at: string;
}

interface ProfileWithRole extends Profile {
  roles?: Role;
}

export interface UserPermissions {
  can_view_tables: boolean;
  can_take_orders: boolean;
  can_process_payments: boolean;
  can_delete_order_items: boolean;
  can_manage_discounts: boolean;
  can_manage_products: boolean;
  can_manage_cash_register: boolean;
  can_view_reports: boolean;
  can_end_of_day: boolean;
  can_view_cancel_logs: boolean;
  can_manage_users: boolean;
  can_manage_settings: boolean;
  /** Vardiya kullanim yetkisi — kapaliyken Header rozeti, otomatik prompt ve Vardiyalar menusu gosterilmez. */
  can_use_shifts: boolean;
}

const DEFAULT_OWNER_PERMISSIONS: UserPermissions = {
  can_view_tables: true,
  can_take_orders: true,
  can_process_payments: true,
  can_delete_order_items: true,
  can_manage_discounts: true,
  can_manage_products: true,
  can_manage_cash_register: true,
  can_view_reports: true,
  can_end_of_day: true,
  can_view_cancel_logs: true,
  can_manage_users: true,
  can_manage_settings: true,
  can_use_shifts: true,
};

const DEFAULT_WAITER_PERMISSIONS: UserPermissions = {
  can_view_tables: true,
  can_take_orders: true,
  can_process_payments: false,
  can_delete_order_items: false,
  can_manage_discounts: false,
  can_manage_products: false,
  can_manage_cash_register: false,
  can_view_reports: false,
  can_end_of_day: false,
  can_view_cancel_logs: false,
  can_manage_users: false,
  can_manage_settings: false,
  can_use_shifts: false,
};

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  tenant: Tenant | null;
  activeBranch: Branch | null;
  branches: Branch[];
  permissions: UserPermissions;
  loading: boolean;
  profileLoadFailed: boolean;
  isOwnerOrAdmin: boolean;
  /** tenants.shifts_enabled — vardiya/gun sonu sistemi acik mi (Settings'ten admin acar). */
  shiftsEnabled: boolean;
  /**
   * Aktif subenin (yoksa tenant'in) is gunu baslangic saati (0-23, default 6).
   * Gun degisim/cutoff hesaplari icin businessDay yardimcilarina verilir.
   */
  businessDayStartHour: number;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    tenantName: string,
    contactEmail?: string,
    phone?: string,
  ) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  setActiveBranch: (branch: Branch) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildPermissionsFromRole(profile: Profile | null, roleData?: Role | null): UserPermissions {
  if (!profile) return DEFAULT_WAITER_PERMISSIONS;
  if (profile.role === 'owner' || profile.role === 'admin') return DEFAULT_OWNER_PERMISSIONS;

  if (roleData?.permissions) {
    const p = roleData.permissions as any;
    return {
      can_view_tables: p.can_view_tables ?? true,
      can_take_orders: p.can_take_orders ?? true,
      can_process_payments: p.can_process_payments ?? false,
      can_delete_order_items: p.can_delete_order_items ?? false,
      can_manage_discounts: p.can_manage_discounts ?? false,
      can_manage_products: p.can_manage_products ?? false,
      can_manage_cash_register: p.can_manage_cash_register ?? false,
      can_view_reports: p.can_view_reports ?? false,
      can_end_of_day: p.can_end_of_day ?? false,
      can_view_cancel_logs: p.can_view_cancel_logs ?? false,
      can_manage_users: p.can_manage_users ?? false,
      can_manage_settings: p.can_manage_settings ?? false,
      // Geriye uyumluluk: rol kaydinda alan yoksa, kasa yetkisi olanlara veya
      // odeme alabilenlere otomatik aktif et — boylece eski hesaplar Settings'ten
      // sistem acildiginda dogrudan calismaya baslar.
      can_use_shifts: p.can_use_shifts ?? (p.can_manage_cash_register || p.can_process_payments || false),
    };
  }

  if (profile.role === 'manager') {
    return {
      ...DEFAULT_WAITER_PERMISSIONS,
      can_process_payments: true,
      can_delete_order_items: true,
      can_manage_discounts: true,
      can_view_reports: true,
      can_manage_cash_register: true,
      can_end_of_day: true,
      can_view_cancel_logs: true,
      can_use_shifts: true,
    };
  }

  if (profile.role === 'cashier') {
    return {
      ...DEFAULT_WAITER_PERMISSIONS,
      can_process_payments: true,
      can_manage_cash_register: true,
      can_end_of_day: true,
      can_use_shifts: true,
    };
  }

  return DEFAULT_WAITER_PERMISSIONS;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_WAITER_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);

  const isProfileBlocked = (p: any) => p?.is_active === false;

  const forceSignOutForBlockedProfile = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('shefpos_admin_tenant_impersonation');
    setUser(null);
    setProfile(null);
    setTenant(null);
    setBranches([]);
    setActiveBranchState(null);
    setPermissions(DEFAULT_WAITER_PERMISSIONS);
  };

  const loadBranches = async (tenantId: string, prof: Profile) => {
    try {
      let query = supabase.from('branches' as any).select('*').eq('tenant_id', tenantId).eq('is_active', true);
      if (prof.role !== 'owner' && prof.role !== 'admin' && prof.branch_id) {
        query = query.eq('id', prof.branch_id);
      }
      const { data } = await query.order('is_main', { ascending: false });
      const branchList: Branch[] = (data || []) as unknown as Branch[];
      setBranches(branchList);

      const savedBranchId = localStorage.getItem('shefpos_active_branch');
      let nextBranch: Branch | null = null;
      if (savedBranchId) {
        const saved = branchList.find((b) => b.id === savedBranchId);
        if (saved) nextBranch = saved;
      }
      if (!nextBranch) {
        nextBranch = branchList.find((b) => b.is_main) || branchList[0] || null;
      }
      if (nextBranch && !isLocalMode() && !isSqlServerMode()) {
        try {
          await fetchCloudTableGridSnapshot(tenantId, nextBranch.id);
        } catch {
          prefetchCloudTableGrid(tenantId, nextBranch.id);
        }
      }
      setActiveBranchState(nextBranch);
    } catch {
      setActiveBranchState(null);
      setBranches([]);
    }
  };

  const loadProfile = async (userId: string) => {
    try {
      setProfileLoadFailed(false);

      if (isLocalMode()) {
        const rec2 = (() => {
          try { const s = localStorage.getItem('shefpos_sql_session'); return s ? JSON.parse(s)?._sqlRecord : null; } catch { return null; }
        })();

        if (!rec2) { setProfileLoadFailed(true); return; }

        const profileData: Profile = {
          id: rec2.profile_id || userId,
          tenant_id: rec2.tenant_id,
          email: rec2.email,
          full_name: rec2.full_name || '',
          role: rec2.role || 'owner',
          role_id: rec2.role_id || null,
          avatar_url: null,
          branch_id: rec2.branch_id || null,
          is_super_admin: rec2.is_super_admin || false,
          onboarding_completed: rec2.onboarding_completed ?? null,
          allowed_ips: rec2.allowed_ips || null,
          created_at: new Date().toISOString(),
        };

        const localOnboardingKey = `local_onboarding_done_${profileData.tenant_id}`;
        const localOnboardingDone = localStorage.getItem(localOnboardingKey) === 'true'
          || rec2?.tenant_onboarding === true;

        const fakeTenant: Tenant = {
          id: profileData.tenant_id,
          name: rec2?.tenant_name || profileData.tenant_id,
          slug: rec2?.tenant_slug || profileData.tenant_id,
          subscription_status: rec2?.subscription_status || 'active',
          subscription_plan: null,
          subscription_expires_at: null,
          max_branches: null,
          notes: null,
          deployment_mode: 'local',
          onboarding_completed: localOnboardingDone ? true : false,
          created_at: new Date().toISOString(),
          logo_url: null,
          address: null,
          phone: null,
          email: null,
          printer_settings: null,
          require_cancel_reason: rec2?.require_cancel_reason ?? false,
          lock_pin: rec2?.lock_pin || null,
          ip_lock_enabled: null,
        };

        setProfile(profileData);
        setTenant(fakeTenant);

        const roleData: Role | null = rec2?.role_permissions
          ? { id: '', tenant_id: profileData.tenant_id, name: profileData.role, permissions: rec2.role_permissions, created_at: '' }
          : null;
        setPermissions(buildPermissionsFromRole(profileData, roleData));

        const fakeBranch: Branch = {
          id: rec2.branch_id || profileData.tenant_id,
          tenant_id: profileData.tenant_id,
          name: rec2.branch_name || 'Ana Şube',
          address: '',
          phone: '',
          is_active: true,
          is_main: rec2.branch_is_main ?? true,
          created_at: new Date().toISOString(),
        };
        setBranches([fakeBranch]);
        setActiveBranchState(fakeBranch);

        if (isElectron()) {
          registerElectronPrinters(profileData.tenant_id, fakeBranch.id).catch(() => {});
        }
        return;
      }

      if (isSqlServerMode()) {
        const rec = (() => {
          try { const s = localStorage.getItem('shefpos_sql_session'); return s ? JSON.parse(s)?._sqlRecord : null; } catch { return null; }
        })();

        if (!rec) { setProfileLoadFailed(true); return; }

        const profileData: Profile = {
          id: rec.profile_id || userId,
          tenant_id: rec.tenant_id,
          email: rec.email,
          full_name: rec.full_name || '',
          role: rec.role || 'owner',
          role_id: rec.role_id || null,
          avatar_url: null,
          branch_id: rec.branch_id || null,
          is_super_admin: rec.is_super_admin || false,
          onboarding_completed: rec.onboarding_completed ?? null,
          allowed_ips: rec.allowed_ips || null,
          created_at: new Date().toISOString(),
        };

        const fakeTenant: Tenant = {
          id: profileData.tenant_id,
          name: rec?.tenant_name || profileData.tenant_id,
          slug: rec?.tenant_slug || profileData.tenant_id,
          subscription_status: rec?.subscription_status || 'active',
          subscription_plan: null,
          subscription_expires_at: null,
          max_branches: null,
          notes: null,
          deployment_mode: 'sqlserver',
          onboarding_completed: rec?.tenant_onboarding === true ? true : (rec?.onboarding_completed === true ? true : false),
          created_at: new Date().toISOString(),
          logo_url: null,
          address: null,
          phone: null,
          email: null,
          printer_settings: null,
          require_cancel_reason: rec?.require_cancel_reason ?? false,
          lock_pin: rec?.lock_pin || null,
          ip_lock_enabled: null,
        };

        setProfile(profileData);
        setTenant(fakeTenant);

        const roleData: Role | null = rec?.role_permissions
          ? { id: '', tenant_id: profileData.tenant_id, name: profileData.role, permissions: rec.role_permissions, created_at: '' }
          : null;
        setPermissions(buildPermissionsFromRole(profileData, roleData));

        const fakeBranch: Branch = {
          id: rec.branch_id || profileData.tenant_id,
          tenant_id: profileData.tenant_id,
          name: rec.branch_name || 'Ana Şube',
          address: '',
          phone: '',
          is_active: true,
          is_main: rec.branch_is_main ?? true,
          created_at: new Date().toISOString(),
        };
        setBranches([fakeBranch]);
        setActiveBranchState(fakeBranch);

        if (isElectron()) {
          registerElectronPrinters(profileData.tenant_id, fakeBranch.id).catch(() => {});
        }
        return;
      }

      // Cloud mode — önce sadece profil (roles(*) gömülüsü bazı PostgREST/şema sürümlerinde hata verebiliyor)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profileData) {
        if (import.meta.env.DEV) {
          console.error('[ŞefPOS] Profil yüklenemedi:', profileError?.message || profileError, 'userId=', userId);
        }
        setProfileLoadFailed(true);
        return;
      }

      let prof = profileData as unknown as ProfileWithRole;
      const rid = (profileData as { role_id?: string | null }).role_id;
      if (rid) {
        const { data: roleRow, error: roleErr } = await supabase
          .from('roles')
          .select('*')
          .eq('id', rid)
          .maybeSingle();
        if (import.meta.env.DEV && roleErr) {
          console.warn('[ŞefPOS] Rol satırı okunamadı (izinler varsayılan):', roleErr.message);
        }
        if (roleRow) prof = { ...prof, roles: roleRow as unknown as ProfileWithRole['roles'] };
      }
      if (isProfileBlocked(prof)) {
        await forceSignOutForBlockedProfile();
        setProfileLoadFailed(true);
        return;
      }
      const impersonatedTenantId = localStorage.getItem('shefpos_admin_tenant_impersonation');
      const effectiveTenantId = (prof as any).is_super_admin && impersonatedTenantId
        ? impersonatedTenantId
        : prof.tenant_id;
      const effectiveProfile = {
        ...(prof as any),
        tenant_id: effectiveTenantId,
      } as unknown as ProfileWithRole;

      setProfile(effectiveProfile as unknown as Profile);

      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', effectiveTenantId)
        .maybeSingle();

      setTenant(tenantData as unknown as Tenant);
      setPermissions(buildPermissionsFromRole(effectiveProfile as unknown as Profile, prof.roles ?? null));
      await loadBranches(effectiveTenantId, effectiveProfile as unknown as Profile);
    } catch {
      setProfileLoadFailed(true);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // En son baglanmis user.id — ayni user icin profile/tenant/branches yeniden
    // yuklemeyi engellemek icin ref. Token refresh sirasinda app'in "yenileniyor"
    // hissi vermesini onler (UX kritik).
    let lastLoadedUserId: string | null = null;

    const applySession = async (session: Session | null, opts?: { force?: boolean }) => {
      if (cancelled) return;
      if (session?.user) {
        // Ayni user — sadece user objesi guncellensin, profile reload YOK
        if (!opts?.force && lastLoadedUserId === session.user.id) {
          // Reference comparison'i yutmak icin: user state'i sadece id degisirse setle
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
          if (loading && !cancelled) setLoading(false);
          return;
        }
        lastLoadedUserId = session.user.id;
        setUser(session.user);
        await loadProfile(session.user.id);
      } else {
        if (lastLoadedUserId === null) {
          if (loading && !cancelled) setLoading(false);
          return;
        }
        lastLoadedUserId = null;
        setUser(null);
        setProfile(null);
        setTenant(null);
        setActiveBranchState(null);
        setBranches([]);
        setPermissions(DEFAULT_WAITER_PERMISSIONS);
        setProfileLoadFailed(false);
      }
      if (!cancelled) setLoading(false);
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION zaten getSession ile islendi.
      // TOKEN_REFRESHED + ayni user icin profile reload gerekmez (UX kritik).
      // SIGNED_IN ayni user.id ile gelirse de skip olacak (applySession icindeki id kontrolu).
      if (event === 'INITIAL_SESSION') return;
      // USER_UPDATED metadata degisikligi anlamina gelir → profile yeniden yuklenir.
      const force = event === 'USER_UPDATED';
      void applySession(session, { force });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const status = (error as { status?: number }).status;
      const m = String(error.message || '');
      if (
        status === 500 ||
        /\b500\b/i.test(m) ||
        /database error|internal server error|unexpected_failure|querying schema/i.test(m)
      ) {
        return {
          error: new Error(
            'Database error querying schema (GoTrue). Dashboard → SQL Editor’da `scripts/fix-gotrue-database-error-querying-schema.sql` içeriğini çalıştırın veya `npm run db:migrate-remote`.',
          ),
        };
      }
      return { error };
    }

    if (data.user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (isProfileBlocked(profileData)) {
        await forceSignOutForBlockedProfile();
        return {
          error: new Error('Bu kullanıcı hesabı pasif durumda. Yönetici ile görüşün.'),
          blocked: true,
        };
      }

      if (profileData?.tenant_id) {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('subscription_status, name')
          .eq('id', profileData.tenant_id)
          .maybeSingle();

        if ((tenantData as any)?.subscription_status === 'suspended') {
          await supabase.auth.signOut();
          return {
            error: new Error('Hesabınız askıya alınmıştır. Lütfen destek ile iletişime geçin.'),
            suspended: true,
          };
        }
      }
    }

    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    tenantName: string,
    contactEmail?: string,
    phone?: string,
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          tenant_name: tenantName,
          contact_email: contactEmail || null,
          // Telefon → handle_new_user trigger'i normalize edip profiles.phone'a yazar.
          // Boylece telefon ile login akisi (panelUserLoginResolve) profiles.phone
          // uzerinden gercek email'i bulur — sentetik @sefpos.com.tr e-postasina
          // gerek kalmaz, MX olmayan domain hatasi olusmaz.
          phone: phone || null,
        },
      },
    });

    if (error) return { error };
    if (!data.user) return { error: new Error('Kullanıcı oluşturulamadı') };

    return { error: null };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    localStorage.removeItem('shefpos_sql_session');
    localStorage.removeItem('shefpos_active_branch');
    localStorage.removeItem('shefpos_remembered_login');
    localStorage.removeItem('device_binding_checked');
    localStorage.removeItem('shefpos_admin_tenant_impersonation');
    setUser(null);
    setProfile(null);
    setTenant(null);
    setBranches([]);
    setActiveBranchState(null);
  };

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id);
    }
  };

  const refreshBranches = async () => {
    if (tenant && profile) {
      await loadBranches(tenant.id, profile);
    }
  };

  useEffect(() => {
    setPrintAgentBranchId(activeBranch?.id ?? null);
  }, [activeBranch]);

  useEffect(() => {
    setPrintAgentTenantId(tenant?.id ?? null);
  }, [tenant]);

  // is_active polling — sadece sayfa gorunurken calisir.
  // Tab arkaplandayken network spam olmasin, sayfaya geri donuldugunde anlik check yapilir.
  // ÖNEMLI: Kullanici sadece silindiginde veya is_active=false olduğunda
  // çıkış yaptırılır. Token refresh / sayfa gorunurluk degisikliği oturumu KAPATMAZ.
  useEffect(() => {
    if (!user || isLocalMode() || isSqlServerMode()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const checkActive = async () => {
      if (cancelled) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', user.id)
          .maybeSingle();
        // Network/PostgREST hatasinda KESINLIKLE cikis yaptırma — geçici hata olabilir.
        if (error) return;
        // data === null → satır silinmiş demektir (kullanici silinmiş).
        if (data === null || (data as any)?.is_active === false) {
          await forceSignOutForBlockedProfile();
        }
      } catch {
        /* network hatası: sessizce geç, oturumu koru */
      }
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(checkActive, 60_000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Sayfaya geri dönüldü → tek bir hızlı kontrol + interval başlat.
        void checkActive();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') {
      start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.id]);

  const setActiveBranch = (branch: Branch) => {
    setActiveBranchState(branch);
    localStorage.setItem('shefpos_active_branch', branch.id);
  };

  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin' || !!profile?.is_super_admin;
  const shiftsEnabled = !!(tenant as any)?.shifts_enabled;
  const branchCutoff: number | null | undefined = (activeBranch as any)?.business_day_start_hour;
  const tenantCutoff: number | null | undefined = (tenant as any)?.business_day_start_hour;
  const businessDayStartHour: number = (() => {
    const raw = typeof branchCutoff === 'number' ? branchCutoff
      : typeof tenantCutoff === 'number' ? tenantCutoff
      : 6;
    if (!Number.isFinite(raw)) return 6;
    const v = Math.floor(raw);
    if (v < 0) return 0;
    if (v > 23) return 23;
    return v;
  })();

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      tenant,
      activeBranch,
      branches,
      permissions,
      loading,
      profileLoadFailed,
      isOwnerOrAdmin,
      shiftsEnabled,
      businessDayStartHour,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshBranches,
      setActiveBranch,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
