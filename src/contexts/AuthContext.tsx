import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';
import { isSqlServerMode, isLocalMode } from '../lib/sqlDb';
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
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, tenantName: string, contactEmail?: string) => Promise<{ error: any }>;
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
    };
  }

  if (profile.role === 'cashier') {
    return {
      ...DEFAULT_WAITER_PERMISSIONS,
      can_process_payments: true,
      can_manage_cash_register: true,
      can_end_of_day: true,
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
      if (savedBranchId) {
        const saved = branchList.find((b) => b.id === savedBranchId);
        if (saved) { setActiveBranchState(saved); return; }
      }
      const main = branchList.find((b) => b.is_main) || branchList[0] || null;
      setActiveBranchState(main);
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

      // Cloud mode
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*, roles(*)')
        .eq('id', userId)
        .maybeSingle();

      if (profileError || !profileData) {
        setProfileLoadFailed(true);
        return;
      }

      const prof = profileData as unknown as ProfileWithRole;
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setTenant(null);
          setActiveBranchState(null);
          setBranches([]);
          setPermissions(DEFAULT_WAITER_PERMISSIONS);
          setProfileLoadFailed(false);
        }
        setLoading(false);
      })();
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

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

  const signUp = async (email: string, password: string, fullName: string, tenantName: string, contactEmail?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          tenant_name: tenantName,
          contact_email: contactEmail || null,
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

  useEffect(() => {
    if (!user || isLocalMode() || isSqlServerMode()) return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', user.id)
        .maybeSingle();
      if ((data as any)?.is_active === false) {
        await forceSignOutForBlockedProfile();
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [user?.id]);

  const setActiveBranch = (branch: Branch) => {
    setActiveBranchState(branch);
    localStorage.setItem('shefpos_active_branch', branch.id);
  };

  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin' || !!profile?.is_super_admin;

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
