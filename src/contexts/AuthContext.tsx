import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/supabase';
import { isSqlServerMode, isLocalMode } from '../lib/sqlDb';
import { prefetchCloudTableGrid } from '../lib/tableGridData';
import { prefetchTakeawayActiveOrders } from '../lib/takeawayOrdersApi';
import { prefetchOnlineOrders } from '../lib/onlineOrdersWarm';
import {
  verifyWaiterAccessByAuthUser,
  persistWaiterLogoutReason,
  clearWaiterLocalSession,
} from '../lib/waiterAccessGuard';
import { startAdaptivePoller } from '../lib/pollSchedule';
import {
  setPrintAgentBranchId,
  setPrintAgentTenantId,
  registerElectronPrinters,
  isElectron,
  fetchPrintSettingsFromCloud,
  flushPendingPrintSettingsToCloud,
  loadPrintSettings,
  savePrintSettings,
} from '../lib/printService';
import { syncTenantCurrencyCode } from '../lib/currency';
import { isAykaAdminPath } from '../lib/aykaRoute';
import { startTenantPresenceTracking, stopTenantPresenceTracking } from '../lib/tenantPresence';
import { computeClientBusinessDate, fetchCurrentBusinessDate } from '../lib/businessDayApi';
import { hideBootSplash } from '../lib/bootSplash';
import { posDebugLog } from '../lib/posDebugLog';
import {
  clearAuthSessionSnap,
  persistAuthSessionSnap,
  readAuthSessionSnap,
  resolveBootAuthState,
} from '../lib/authSessionSnap';

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
  /** Bu şube için varsayılan sabit iskonto yüzdesi (0-100). 0/false ise pasif. */
  default_discount_percent?: number | null;
  default_discount_active?: boolean | null;
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
  /**
   * Is gunu modu:
   *  - 'cutoff': sabit saatte yeni gun baslar (businessDayStartHour kullanilir)
   *  - 'manual': cutoff yok; gun ancak "Gunu Kapat" tiklayinca biter (24/7).
   */
  businessDayMode: 'cutoff' | 'manual';
  /**
   * Aktif subenin guncel is gunu tarihi (YYYY-MM-DD).
   * - cutoff modunda: businessDayStartHour'a gore client'ta hesaplanir.
   * - manual modunda: get_current_business_date RPC'den gelir
   *   (en son daily_closures.business_date + 1, hic kapanma yoksa bugun).
   */
  currentBusinessDate: string;
  /**
   * Manuel modda is gunu kac saattir acik (UI uyarisi icin).
   * cutoff modunda her zaman null.
   */
  businessDayHoursOpen: number | null;
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
  /** Süper-admin müşteri görünümü: hedef tenant (RLS ile uyumlu); yoksa null */
  impersonationTenantId: string | null;
  clearTenantImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseStoredRolePermissions(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

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
  const boot = resolveBootAuthState();
  const [user, setUser] = useState<User | null>(boot.user);
  const [profile, setProfile] = useState<Profile | null>(boot.snap?.profile ?? null);
  const [tenant, setTenant] = useState<Tenant | null>(boot.snap?.tenant ?? null);
  const [activeBranch, setActiveBranchState] = useState<Branch | null>(boot.activeBranch);
  const [branches, setBranches] = useState<Branch[]>(boot.snap?.branches ?? []);
  const [permissions, setPermissions] = useState<UserPermissions>(
    boot.snap?.permissions ?? DEFAULT_WAITER_PERMISSIONS,
  );
  const [loading, setLoading] = useState(boot.loading);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [impersonationTenantId, setImpersonationTenantId] = useState<string | null>(
    boot.snap?.impersonationTenantId ?? null,
  );

  const isProfileBlocked = (p: any) => p?.is_active === false;

  const forceSignOutForBlockedProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (uid) {
        try {
          await supabase.from('admin_tenant_impersonation' as any).delete().eq('user_id', uid);
        } catch {
          /* tablo yok / RLS */
        }
      }
    } catch {
      /* */
    }
    await supabase.auth.signOut();
    clearAuthSessionSnap();
    clearWaiterLocalSession();
    localStorage.removeItem('shefpos_admin_tenant_impersonation');
    setImpersonationTenantId(null);
    setUser(null);
    setProfile(null);
    setTenant(null);
    setBranches([]);
    setActiveBranchState(null);
    setPermissions(DEFAULT_WAITER_PERMISSIONS);
  };

  const loadBranches = async (
    tenantId: string,
    prof: Profile,
  ): Promise<{ active: Branch | null; list: Branch[] }> => {
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
      // Masa snapshot'ini login akisini bloklamadan tetikle: TableGrid kendi
      // taraf indaki sessionStorage/RAM cache'inden anlik tile'lari cizer; bu
      // arka plan istegi tamamlandiginda da otomatik olarak guncellenir.
      if (nextBranch && !isLocalMode() && !isSqlServerMode()) {
        prefetchCloudTableGrid(tenantId, nextBranch.id);
        prefetchTakeawayActiveOrders(tenantId, nextBranch.id);
        prefetchOnlineOrders(tenantId);
      }
      setActiveBranchState(nextBranch);
      return { active: nextBranch, list: branchList };
    } catch {
      setActiveBranchState(null);
      setBranches([]);
      return { active: null, list: [] };
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
          disabled_modules: null,
        };

        setProfile(profileData);
        setTenant(fakeTenant);

        const rp2 = parseStoredRolePermissions(rec2?.role_permissions);
        const roleData: Role | null = rp2
          ? { id: '', tenant_id: profileData.tenant_id, name: profileData.role, permissions: rp2 as Role['permissions'], created_at: '' }
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
        persistAuthSessionSnap({
          userId,
          profile: profileData,
          tenant: fakeTenant,
          branches: [fakeBranch],
          activeBranchId: fakeBranch.id,
          impersonationTenantId: null,
          permissions: buildPermissionsFromRole(profileData, roleData),
        });
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
          subscription_plan: rec?.subscription_plan || 'professional',
          subscription_expires_at: rec?.subscription_expires_at || null,
          max_branches: null,
          notes: null,
          deployment_mode: 'sqlserver',
          onboarding_completed: rec?.tenant_onboarding === true ? true : (rec?.onboarding_completed === true ? true : false),
          created_at: new Date().toISOString(),
          logo_url: null,
          address: rec?.tenant_address || null,
          phone: rec?.tenant_phone || null,
          email: rec?.email || null,
          printer_settings: null,
          require_cancel_reason: rec?.require_cancel_reason ?? false,
          lock_pin: rec?.lock_pin || null,
          ip_lock_enabled: null,
          disabled_modules: null,
        };

        setProfile(profileData);
        setTenant(fakeTenant);

        const rp = parseStoredRolePermissions(rec?.role_permissions);
        const roleData: Role | null = rp
          ? { id: '', tenant_id: profileData.tenant_id, name: profileData.role, permissions: rp as Role['permissions'], created_at: '' }
          : null;
        setPermissions(buildPermissionsFromRole(profileData, roleData));

        const api = (window as any).electronAPI;
        if (api?.sqlGetBranches) {
          const brRes = await api.sqlGetBranches({
            tenantId: profileData.tenant_id,
            userId: profileData.id,
            userRole: profileData.role,
          });
          const branchRows = (brRes?.data || []) as Branch[];
          if (branchRows.length > 0) {
            setBranches(branchRows);
            const preferred =
              branchRows.find((b) => b.id === profileData.branch_id) ||
              branchRows.find((b) => b.is_main) ||
              branchRows[0];
            setActiveBranchState(preferred);
            const sqlPerms = buildPermissionsFromRole(profileData, roleData);
            persistAuthSessionSnap({
              userId,
              profile: profileData,
              tenant: fakeTenant,
              branches: branchRows,
              activeBranchId: preferred.id,
              impersonationTenantId: null,
              permissions: sqlPerms,
            });
            return;
          }
        }

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
        persistAuthSessionSnap({
          userId,
          profile: profileData,
          tenant: fakeTenant,
          branches: [fakeBranch],
          activeBranchId: fakeBranch.id,
          impersonationTenantId: null,
          permissions: buildPermissionsFromRole(profileData, roleData),
        });
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
      const isSuperAdmin = (prof as any).is_super_admin === true;
      let impersonationTarget: string | null = null;

      if (isSuperAdmin) {
        try {
          const { data: impRow, error: impErr } = await supabase
            .from('admin_tenant_impersonation' as any)
            .select('target_tenant_id')
            .eq('user_id', userId)
            .maybeSingle();
          if (!impErr && impRow && (impRow as { target_tenant_id?: string }).target_tenant_id) {
            impersonationTarget = String((impRow as { target_tenant_id: string }).target_tenant_id);
          }
        } catch {
          /* migration henüz yok / ağ */
        }
        if (!impersonationTarget) {
          try {
            const ls = localStorage.getItem('shefpos_admin_tenant_impersonation');
            const uuidRe =
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (ls && uuidRe.test(ls)) {
              impersonationTarget = ls;
              const nowIso = new Date().toISOString();
              void supabase.from('admin_tenant_impersonation' as any).upsert(
                { user_id: userId, target_tenant_id: ls, updated_at: nowIso },
                { onConflict: 'user_id' },
              );
            }
          } catch {
            /* storage */
          }
        }
        setImpersonationTenantId(impersonationTarget);
        if (impersonationTarget) {
          try {
            localStorage.setItem('shefpos_admin_tenant_impersonation', impersonationTarget);
          } catch {
            /* private mode */
          }
        } else {
          try {
            localStorage.removeItem('shefpos_admin_tenant_impersonation');
          } catch {
            /* */
          }
        }
      } else {
        setImpersonationTenantId(null);
        try {
          localStorage.removeItem('shefpos_admin_tenant_impersonation');
        } catch {
          /* */
        }
      }

      const effectiveTenantId =
        isSuperAdmin && impersonationTarget ? impersonationTarget : prof.tenant_id;
      const effectiveProfile = {
        ...(prof as any),
        tenant_id: effectiveTenantId,
      } as unknown as ProfileWithRole;

      setProfile(effectiveProfile as unknown as Profile);

      const perms = buildPermissionsFromRole(effectiveProfile as unknown as Profile, prof.roles ?? null);
      setPermissions(perms);

      const [{ data: tenantData }, { active: activeBranch, list: branchList }] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', effectiveTenantId).maybeSingle(),
        loadBranches(effectiveTenantId, effectiveProfile as unknown as Profile),
      ]);

      const tenantRow = tenantData as unknown as Tenant;
      setTenant(tenantRow);
      persistAuthSessionSnap({
        userId,
        profile: effectiveProfile as unknown as Profile,
        tenant: tenantRow,
        branches: branchList,
        activeBranchId: activeBranch?.id ?? null,
        impersonationTenantId: impersonationTarget,
        permissions: perms,
      });
    } catch {
      setProfileLoadFailed(true);
    }
  };

  useEffect(() => {
    if (!boot.snap) return;
    hideBootSplash();
    const tid = boot.snap.tenant.id;
    const bid = boot.activeBranch?.id;
    if (bid && !isLocalMode() && !isSqlServerMode()) {
      prefetchCloudTableGrid(tid, bid);
      prefetchTakeawayActiveOrders(tid, bid);
      prefetchOnlineOrders(tid);
    }
    if (boot.user?.id) {
      void loadProfile(boot.user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    // En son baglanmis user.id — ayni user icin profile/tenant/branches yeniden
    // yuklemeyi engellemek icin ref. Token refresh sirasinda app'in "yenileniyor"
    // hissi vermesini onler (UX kritik).
    let lastLoadedUserId: string | null = boot.snap?.userId ?? boot.user?.id ?? null;

    const applySession = async (session: Session | null, opts?: { force?: boolean }) => {
      if (cancelled) return;
      if (session?.user) {
        // Ayni user — sadece user objesi guncellensin, profile reload YOK
        if (!opts?.force && lastLoadedUserId === session.user.id) {
          // Reference comparison'i yutmak icin: user state'i sadece id degisirse setle
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
          if (loading && !cancelled) setLoading(false);
          hideBootSplash();
          return;
        }
        const cached = !opts?.force ? readAuthSessionSnap(session.user.id) : null;
        lastLoadedUserId = session.user.id;
        setUser(session.user);
        if (cached) {
          setProfile(cached.profile);
          setTenant(cached.tenant);
          setBranches(cached.branches);
          const active =
            (cached.activeBranchId
              ? cached.branches.find((b) => b.id === cached.activeBranchId)
              : null) ||
            cached.branches.find((b) => b.is_main) ||
            cached.branches[0] ||
            null;
          setActiveBranchState(active);
          setPermissions(cached.permissions);
          setImpersonationTenantId(cached.impersonationTenantId);
          setProfileLoadFailed(false);
          if (!cancelled) setLoading(false);
          hideBootSplash();
          void loadProfile(session.user.id);
          return;
        }
        await loadProfile(session.user.id);
      } else {
        if (lastLoadedUserId === null) {
          if (loading && !cancelled) setLoading(false);
          hideBootSplash();
          return;
        }
        lastLoadedUserId = null;
        clearAuthSessionSnap();
        setUser(null);
        setProfile(null);
        setTenant(null);
        setActiveBranchState(null);
        setBranches([]);
        setPermissions(DEFAULT_WAITER_PERMISSIONS);
        setProfileLoadFailed(false);
      }
      if (!cancelled) setLoading(false);
      hideBootSplash();
    };

    // Safety net: getSession() bazı Electron / offline senaryolarında çok uzun
    // sürebiliyor ve "Oturum kontrol ediliyor..." ekranı sonsuza kalıyor. 8 sn
    // sonunda hala loading true ise zorla false'a çek; kullanıcı login ekranına
    // düşer ve manuel giriş yapabilir. Sonradan getSession() resolve olursa
    // applySession yine doğru durumu yansıtır.
    const safetyTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLoading((prev) => (prev ? false : prev));
      }
    }, 2000);

    void (async () => {
      try {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await applySession(session);
        } catch {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 60));
          if (cancelled) return;
          const { data: { session } } = await supabase.auth.getSession();
          await applySession(session);
        }
      } finally {
        window.clearTimeout(safetyTimer);
        if (!cancelled) setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION zaten getSession ile islendi.
      // TOKEN_REFRESHED + ayni user icin profile reload gerekmez (UX kritik).
      // SIGNED_IN ayni user.id ile gelirse de skip olacak (applySession icindeki id kontrolu).
      if (event === 'INITIAL_SESSION') return;
      // Gecici ag / yarim token yenileme: GoTrue bazen SIGNED_OUT yayinlar; storage'da
      // gecerli oturum varsa bir kez getSession ile toparla. Gercek cikista session yoktur.
      if (event === 'SIGNED_OUT') {
        void (async () => {
          if (cancelled) return;
          // GoTrue bazen gecici SIGNED_OUT yayinlar (uyku, ag, yarim refresh).
          await new Promise((r) => setTimeout(r, 350));
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (cancelled) return;
            if (refreshed.session?.user) {
              await applySession(refreshed.session, { force: false });
              return;
            }
            const { data: { session: recovered } } = await supabase.auth.getSession();
            if (cancelled) return;
            if (recovered?.user) {
              await applySession(recovered, { force: false });
            } else {
              await applySession(null);
            }
          } catch {
            if (!cancelled) await applySession(null);
          }
        })();
        return;
      }
      // USER_UPDATED metadata degisikligi anlamina gelir → profile yeniden yuklenir.
      const force = event === 'USER_UPDATED';
      void applySession(session, { force });
    });

    const onPageShow = (ev: PageTransitionEvent) => {
      if (!ev.persisted) return;
      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            await applySession(session, { force: false });
          }
        } catch {
          /* ignore */
        }
      })();
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
      window.removeEventListener('pageshow', onPageShow);
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
    const uid = user?.id ?? null;
    await stopTenantPresenceTracking(uid);
    try {
      if (uid) {
        try {
          await supabase.from('admin_tenant_impersonation' as any).delete().eq('user_id', uid);
        } catch {
          /* tablo yok / RLS */
        }
      }
      // Yalnızca bu cihaz/tarayıcı — diğer kasa/tablet oturumları açık kalır.
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    localStorage.removeItem('shefpos_sql_session');
    clearAuthSessionSnap();
    localStorage.removeItem('shefpos_active_branch');
    // Beni hatırla ile saklanan telefon/e-posta/kullanıcı adı kalsın (Electron + web giriş ekranı).
    // Kayıtlı şifre güvenlik için çıkışta silinir; tekrar girişte yazılması gerekir.
    try {
      localStorage.removeItem('shefpos_remembered_password');
    } catch {
      /* private mode */
    }
    localStorage.removeItem('device_binding_checked');
    localStorage.removeItem('shefpos_admin_tenant_impersonation');
    setImpersonationTenantId(null);
    setUser(null);
    setProfile(null);
    setTenant(null);
    setBranches([]);
    setActiveBranchState(null);
  };

  const clearTenantImpersonation = async () => {
    if (!user?.id) return;
    try {
      await supabase.from('admin_tenant_impersonation' as any).delete().eq('user_id', user.id);
    } catch {
      /* */
    }
    try {
      localStorage.removeItem('shefpos_admin_tenant_impersonation');
    } catch {
      /* */
    }
    setImpersonationTenantId(null);
    await loadProfile(user.id);
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
    syncTenantCurrencyCode((tenant as any)?.currency_code);
  }, [tenant]);

  // Restoran adı / ünvan: kullanıcı Ayarlar → Yazıcılar → "Restoran Bilgileri"
  // bölümünden henüz değer girmediyse paket / adisyon / kasa fişlerinde
  // başlığa hardcoded "ŞefPOS" yazılıyordu. Müşteri kendi işletme adıyla bassın
  // diye tenant adı geldiği anda boş alanları tek seferlik tenant.name ile
  // doldurup kalıcı kaydederiz. Kullanıcı sonra istediğinde Ayarlar'dan
  // ünvan / adres / telefon'u istediği gibi değiştirebilir.
  useEffect(() => {
    if (!tenant?.id) return;
    try {
      const current = loadPrintSettings();
      const patch: Partial<typeof current> = {};
      if (!current.restaurantName && tenant.name) {
        (patch as any).restaurantName = tenant.name;
      }
      // Phone/address sadece henüz hiç değer yoksa otomatik doldurulur — kullanıcı
      // ayarlardan sildiyse tekrar yazmayız (boş bırakmak istemiş olabilir).
      const tenantPhone = (tenant as any).phone || '';
      const tenantAddress = (tenant as any).address || '';
      if (!current.restaurantPhone && tenantPhone) {
        (patch as any).restaurantPhone = tenantPhone;
      }
      if (!current.restaurantAddress && tenantAddress) {
        (patch as any).restaurantAddress = tenantAddress;
      }
      if (Object.keys(patch).length > 0) {
        savePrintSettings({ ...current, ...patch });
      }
    } catch {
      /* localStorage erişim hatasında sessiz */
    }
  }, [tenant?.id, tenant?.name]);

  // Electron Print Agent: main süreç `currentUserJwt` olmadan print_jobs
  // çekemez (RLS). İlk frame'de session henüz yoksa + token yenilenince
  // mutlaka `register-printers` tekrarlanmalı — aksi halde kasada fiş düşmez.
  useEffect(() => {
    if (!isElectron() || !isSqlServerMode() || !tenant?.id) return;
    const api = (window as any).electronAPI;
    if (api?.sqlApplySchemaPatches) {
      void api
        .sqlApplySchemaPatches(null)
        .then((result: { success?: boolean; error?: string; errors?: string[] }) => {
          if (!result?.success) {
            console.error('[ŞefPOS] SQL patch:', result?.error || result?.errors?.[0]);
            window.alert(
              'SQL tabloları otomatik güncellenemedi.\n\nAyarlar → SQL Server → «Eksik tabloları güncelle» butonuna basın, sonra uygulamayı yeniden başlatın.',
            );
          } else if (result?.errors?.length) {
            console.warn('[ŞefPOS] SQL patch uyarıları:', result.errors);
          }
        })
        .catch((err: unknown) => {
          console.error('[ŞefPOS] SQL patch hata:', err);
        });
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (!isElectron()) return;
    if (!tenant?.id) return;
    let cancelled = false;

    const pushAgent = async (jwt: string) => {
      if (cancelled) return;
      try {
        await registerElectronPrinters(tenant.id, activeBranch?.id ?? null, jwt);
      } catch {
        /* IPC yoksa sessiz */
      }
    };

    (async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        let jwt = '';
        try {
          const { data } = await supabase.auth.getSession();
          jwt = data?.session?.access_token || '';
        } catch {
          /* local/sql mod */
        }
        if (jwt || isSqlServerMode()) {
          await pushAgent(jwt || 'sqlserver-local');
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled) await pushAgent('');
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'INITIAL_SESSION') return;
      const jwt = session?.access_token || '';
      if (jwt) void pushAgent(jwt);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [tenant?.id, activeBranch?.id]);

  // Tenant veya aktif şube değiştiğinde bulut tarafındaki yazıcı ayarlarını
  // çek. Böylece Electron kasada yapılan kategori → yazıcı eşlemesi web ve
  // mobil tarafında otomatik görünür; her cihazda ayrı yapılandırma şart
  // olmaz. Hata olursa lokal cache aktif kalır.
  useEffect(() => {
    if (!tenant?.id) return;
    if (isLocalMode() || isSqlServerMode()) return;
    let cancelled = false;
    void fetchPrintSettingsFromCloud()
      .then((res) => {
        if (cancelled) return;
        if (res) {
          posDebugLog('[ŞefPOS] yazıcı ayarları buluttan yüklendi', {
            tenant: tenant.id,
            branch: activeBranch?.id ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, activeBranch?.id]);

  // is_active polling — sadece sayfa gorunurken calisir.
  // Tab arkaplandayken network spam olmasin, sayfaya geri donuldugunde anlik check yapilir.
  // ÖNEMLI: Kullanici sadece silindiginde veya is_active=false olduğunda
  // çıkış yaptırılır. Token refresh / sayfa gorunurluk degisikliği oturumu KAPATMAZ.
  useEffect(() => {
    if (!user || isLocalMode() || isSqlServerMode()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let missingProfileStreak = 0;

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
        if ((data as any)?.is_active === false) {
          await forceSignOutForBlockedProfile();
          return;
        }
        // Profil satiri yok: tek seferlik bos cevap olabilir; iki ardışık kontrolde cik.
        if (data === null) {
          missingProfileStreak += 1;
          if (missingProfileStreak >= 2) {
            await forceSignOutForBlockedProfile();
          }
          return;
        }
        missingProfileStreak = 0;
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

  // Garson: Realtime birincil; 8 sn poll kaldırıldı (ölçek). Yedek: ~90 sn, yalnız görünür sekme.
  useEffect(() => {
    if (!user?.id || !profile?.tenant_id || profile.role !== 'waiter') return;
    if (isLocalMode() || isSqlServerMode()) return;
    let cancelled = false;
    let bindingCh: ReturnType<typeof supabase.channel> | null = null;

    const ensureBindingChannel = (waiterId: string) => {
      if (bindingCh) return;
      bindingCh = supabase
        .channel(`auth-waiter-binding-${user.id}-${waiterId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'device_bindings', filter: `waiter_id=eq.${waiterId}` },
          () => { void checkWaiterAccess(); },
        )
        .subscribe();
    };

    const checkWaiterAccess = async () => {
      if (cancelled) return;
      try {
        const { data: profRow } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', user.id)
          .maybeSingle();
        if (profRow === null || (profRow as { is_active?: boolean })?.is_active === false) {
          persistWaiterLogoutReason('Hesap pasif', 'Garson hesabınız pasif duruma alındı. Erişim sonlandırıldı.');
          await forceSignOutForBlockedProfile();
          return;
        }

        const access = await verifyWaiterAccessByAuthUser(user.id, profile.tenant_id);
        if (cancelled) return;
        if (access.allowed) {
          ensureBindingChannel(access.waiterId);
        } else {
          persistWaiterLogoutReason(access.title, access.message);
          await forceSignOutForBlockedProfile();
        }
      } catch {
        /* geçici ağ hatası: oturumu koru */
      }
    };

    void checkWaiterAccess();

    const stopPoll = startAdaptivePoller({
      baseMs: 90_000,
      idleMs: 120_000,
      hiddenMs: 0,
      run: checkWaiterAccess,
      immediate: false,
    });

    const ch = supabase
      .channel(`auth-waiter-guard-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waiters', filter: `auth_user_id=eq.${user.id}` },
        () => { void checkWaiterAccess(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => { void checkWaiterAccess(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      stopPoll();
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
      if (bindingCh) {
        try {
          supabase.removeChannel(bindingCh);
        } catch {
          /* ignore */
        }
      }
    };
  }, [user?.id, profile?.tenant_id, profile?.role]);

  // Bulut: uzun süre açık kasada JWT süresi dolmadan yenile (uyku/arka plan sonrası düşmesin).
  useEffect(() => {
    if (!user?.id || isLocalMode() || isSqlServerMode()) return;
    let cancelled = false;
    const REFRESH_WHEN_LEFT_MS = 30 * 60 * 1000;
    const TICK_MS = 5 * 60 * 1000;

    const bump = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const expMs = session.expires_at ? session.expires_at * 1000 : 0;
        const left = expMs ? expMs - Date.now() : 0;
        if (left > REFRESH_WHEN_LEFT_MS) return;
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          await new Promise((r) => setTimeout(r, 2500));
          if (!cancelled) await supabase.auth.refreshSession().catch(() => {});
        }
      } catch {
        /* ag kesintisi: oturumu koru */
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') void bump();
    };
    const onFocus = () => void bump();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    const iv = window.setInterval(() => void bump(), TICK_MS);
    if (document.visibilityState === 'visible') void bump();
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  const setActiveBranch = (branch: Branch) => {
    setActiveBranchState(branch);
    localStorage.setItem('shefpos_active_branch', branch.id);
    const tid = tenant?.id;
    if (tid && !isLocalMode() && !isSqlServerMode()) {
      prefetchCloudTableGrid(tid, branch.id);
      prefetchTakeawayActiveOrders(tid, branch.id);
      prefetchOnlineOrders(tid);
    }
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
  const branchMode: string | null | undefined = (activeBranch as any)?.business_day_mode;
  const tenantMode: string | null | undefined = (tenant as any)?.business_day_mode;
  const businessDayMode: 'cutoff' | 'manual' = (
    branchMode === 'manual' || branchMode === 'cutoff' ? branchMode :
    tenantMode === 'manual' || tenantMode === 'cutoff' ? tenantMode :
    'cutoff'
  ) as 'cutoff' | 'manual';

  const [serverBusinessDate, setServerBusinessDate] = useState<string | null>(null);
  const [serverHoursOpen, setServerHoursOpen] = useState<number | null>(null);

  // Manuel modda: server tarafli is gunu tarihini cek (cutoff modunda gerekli degil)
  useEffect(() => {
    let cancelled = false;
    if (!activeBranch?.id || businessDayMode !== 'manual') {
      setServerBusinessDate(null);
      setServerHoursOpen(null);
      return;
    }
    const fetchIt = async () => {
      const row = await fetchCurrentBusinessDate(activeBranch.id);
      if (cancelled || !row) return;
      if (row.business_date) setServerBusinessDate(String(row.business_date));
      if (typeof row.hours_open === 'number') {
        setServerHoursOpen(Number(row.hours_open));
      } else if (row.hours_open != null && row.hours_open !== '') {
        const n = Number(row.hours_open);
        setServerHoursOpen(Number.isFinite(n) ? n : null);
      } else {
        setServerHoursOpen(null);
      }
    };
    fetchIt();
    const id = window.setInterval(fetchIt, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeBranch?.id, businessDayMode]);

  const currentBusinessDate: string = (() => {
    if (businessDayMode === 'manual' && serverBusinessDate) return serverBusinessDate;
    return computeClientBusinessDate(businessDayStartHour);
  })();
  const businessDayHoursOpen = businessDayMode === 'manual' ? serverHoursOpen : null;

  // Restoran POS: çevrimiçi nabız (~60 sn). Kurucu super_admin POS'ta ping gönderir;
  // yalnızca lisans paneli URL'sinde (/ayka-yonetim45) ping kapalı.
  useEffect(() => {
    if (!user?.id || !tenant?.id || !profile) {
      void stopTenantPresenceTracking();
      return;
    }
    const onLicensePanel =
      typeof window !== 'undefined' && isAykaAdminPath(window.location.pathname);
    if (profile.is_super_admin && onLicensePanel && !impersonationTenantId) {
      void stopTenantPresenceTracking(user.id);
      return;
    }
    startTenantPresenceTracking({
      tenantId: tenant.id,
      userId: user.id,
      fullName: profile.full_name || undefined,
      role: profile.role || undefined,
    });
    return () => {
      void stopTenantPresenceTracking();
    };
  }, [user?.id, tenant?.id, profile?.id, profile?.is_super_admin, impersonationTenantId]);

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
      businessDayMode,
      currentBusinessDate,
      businessDayHoursOpen,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      refreshBranches,
      setActiveBranch,
      impersonationTenantId,
      clearTenantImpersonation,
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
