import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, getRealSupabaseClient, consumeInvalidRefreshHandled } from '../lib/supabase';
import { Database } from '../lib/supabase';
import { isSqlServerMode, isLocalMode, isElectronCloudMode, sqlDb, isVdsSelfHost, sqlTruth, patchSqlSessionRecord } from '../lib/sqlDb';
import { isHybridMode } from '../lib/hybridMode';
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
import { AYKA_ADMIN_PATH, isAykaAdminPath } from '../lib/aykaRoute';
import { startTenantPresenceTracking, stopTenantPresenceTracking } from '../lib/tenantPresence';
import { computeClientBusinessDate, fetchCurrentBusinessDate } from '../lib/businessDayApi';
import { hideBootSplash } from '../lib/bootSplash';
import { posDebugLog } from '../lib/posDebugLog';
import {
  clearAuthSessionSnap,
  persistAuthSessionSnap,
  readAuthSessionSnap,
  resolveBootAuthState,
  isRefreshTokenNotFoundError,
  purgeSupabaseAuthLocalStorage,
  readStoredSupabaseRefreshToken,
} from '../lib/authSessionSnap';

/** Electron acilisinda agir liste on-yuklemesi kasar — ilgili sayfa acilinca yuklenir. */
function warmPosCachesIfWeb(tenantId: string, branchId: string): void {
  if (typeof window !== 'undefined' && (window as any).electronAPI) return;
  if (isLocalMode() || isSqlServerMode()) return;
  prefetchCloudTableGrid(tenantId, branchId);
  prefetchTakeawayActiveOrders(tenantId, branchId);
  prefetchOnlineOrders(tenantId);
}

let profileLoadInflight: Promise<void> | null = null;
let lastProfileLoadFinishedAt = 0;
const PROFILE_LOAD_MIN_GAP_MS = 45_000;

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
  refreshProfile: (opts?: { force?: boolean }) => Promise<void>;
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

/** Süper-admin "Oturum Aç": hedef tenant + (varsa) sahibi profili. VDS/SQL ve bulut ortak. */
async function resolveAdminImpersonation(userId: string, isSuperAdmin: boolean): Promise<{
  targetTenantId: string | null;
  asProfile: Profile | null;
  asRole: Role | null;
}> {
  if (!isSuperAdmin) {
    try {
      localStorage.removeItem('shefpos_admin_tenant_impersonation');
      localStorage.removeItem('shefpos_admin_impersonation_as');
    } catch {
      /* */
    }
    return { targetTenantId: null, asProfile: null, asRole: null };
  }

  let targetTenantId: string | null = null;
  try {
    const { data: impRow, error: impErr } = await supabase
      .from('admin_tenant_impersonation' as any)
      .select('target_tenant_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!impErr && impRow && (impRow as { target_tenant_id?: string }).target_tenant_id) {
      targetTenantId = String((impRow as { target_tenant_id: string }).target_tenant_id);
    }
  } catch {
    /* tablo yok / ağ */
  }
  if (!targetTenantId) {
    try {
      const ls = localStorage.getItem('shefpos_admin_tenant_impersonation');
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (ls && uuidRe.test(ls)) {
        targetTenantId = ls;
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

  if (!targetTenantId) {
    try {
      localStorage.removeItem('shefpos_admin_tenant_impersonation');
      localStorage.removeItem('shefpos_admin_impersonation_as');
    } catch {
      /* */
    }
    return { targetTenantId: null, asProfile: null, asRole: null };
  }

  try {
    localStorage.setItem('shefpos_admin_tenant_impersonation', targetTenantId);
  } catch {
    /* */
  }

  let asProfile: Profile | null = null;
  let asRole: Role | null = null;
  try {
    const { data: ownerRows } = await supabase
      .from('profiles')
      .select(
        'id, tenant_id, email, full_name, role, role_id, avatar_url, branch_id, phone, is_active, onboarding_completed, created_at',
      )
      .eq('tenant_id', targetTenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(20);
    const rows = (ownerRows || []) as any[];
    const asUser =
      rows.find((p) => String(p.role || '').toLowerCase() === 'owner') ||
      rows.find((p) => String(p.role || '').toLowerCase() === 'admin') ||
      rows[0] ||
      null;
    if (asUser) {
      asProfile = {
        ...asUser,
        tenant_id: targetTenantId,
        is_super_admin: false,
      } as Profile;
      if (asUser.role_id) {
        const { data: roleRow } = await supabase
          .from('roles')
          .select('*')
          .eq('id', asUser.role_id)
          .maybeSingle();
        if (roleRow) asRole = roleRow as unknown as Role;
      }
      try {
        localStorage.setItem(
          'shefpos_admin_impersonation_as',
          JSON.stringify({
            profileId: asUser.id,
            fullName: asUser.full_name || '',
            email: asUser.email || '',
            role: asUser.role || 'owner',
          }),
        );
      } catch {
        /* */
      }
    }
  } catch {
    /* sahip okunamazsa sadece tenant switch */
  }

  return { targetTenantId, asProfile, asRole };
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
  const activeBranchRef = useRef<Branch | null>(boot.activeBranch);
  activeBranchRef.current = activeBranch;

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
        warmPosCachesIfWeb(tenantId, nextBranch.id);
      }
      setActiveBranchState(nextBranch);
      return { active: nextBranch, list: branchList };
    } catch {
      setActiveBranchState(null);
      setBranches([]);
      return { active: null, list: [] };
    }
  };

  const loadProfile = async (userId: string, opts?: { force?: boolean }) => {
    const now = Date.now();
    if (!opts?.force) {
      if (profileLoadInflight) return profileLoadInflight;
      if (now - lastProfileLoadFinishedAt < PROFILE_LOAD_MIN_GAP_MS) return;
    }

    const run = (async () => {
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
          subscription_status: rec2?.subscription_status || 'trial',
          subscription_plan: rec2?.subscription_plan || 'trial',
          subscription_expires_at: rec2?.subscription_expires_at || null,
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

        const baseProfile: Profile = {
          id: rec.profile_id || userId,
          tenant_id: rec.tenant_id,
          email: rec.email,
          full_name: rec.full_name || '',
          role: rec.role || 'owner',
          role_id: rec.role_id || null,
          avatar_url: null,
          branch_id: rec.branch_id || null,
          is_super_admin: rec.is_super_admin || false,
          onboarding_completed: sqlTruth(rec.onboarding_completed) ? true : false,
          allowed_ips: rec.allowed_ips || null,
          created_at: new Date().toISOString(),
        };

        // VDS/SQL: bulut yolundaki Oturum Aç burada da uygulanmalı (yoksa ayka tenant kalır)
        const imp = await resolveAdminImpersonation(
          userId,
          baseProfile.is_super_admin === true,
        );
        setImpersonationTenantId(imp.targetTenantId);

        let profileData: Profile = baseProfile;
        if (imp.targetTenantId) {
          if (imp.asProfile) {
            profileData = { ...imp.asProfile, is_super_admin: false };
          } else {
            profileData = {
              ...baseProfile,
              tenant_id: imp.targetTenantId,
              role: 'owner',
              is_super_admin: false,
              branch_id: null,
            };
          }
        }

        const effectiveTenantId = profileData.tenant_id;

        let tenantOnboarding =
          sqlTruth(rec?.tenant_onboarding) || sqlTruth(rec?.onboarding_completed);
        let deploymentMode =
          String(rec?.deployment_mode || (isVdsSelfHost() ? 'online' : 'offline')).toLowerCase();
        if (!['online', 'offline', 'hybrid'].includes(deploymentMode)) {
          deploymentMode = isVdsSelfHost() ? 'online' : 'offline';
        }
        let tenantAddress = rec?.tenant_address || null;
        let tenantPhone = rec?.tenant_phone || null;
        let tenantName = rec?.tenant_name || effectiveTenantId;
        let subStatus = rec?.subscription_status || 'trial';
        let subPlan = rec?.subscription_plan || 'trial';
        let subExpires = rec?.subscription_expires_at || null;
        let tenantDisabledModules: string[] | null = Array.isArray(rec?.disabled_modules)
          ? (rec.disabled_modules as string[])
          : null;
        let tenantSlug = rec?.tenant_slug || effectiveTenantId;

        // Canlı DB'den tenant oku — impersonation hedefi veya kendi tenant
        try {
          const { data: trow } = await supabase
            .from('tenants')
            .select(
              'id, name, slug, onboarding_completed, deployment_mode, address, phone, subscription_status, subscription_plan, subscription_expires_at, disabled_modules',
            )
            .eq('id', effectiveTenantId)
            .maybeSingle();
          if (trow) {
            tenantOnboarding = sqlTruth((trow as any).onboarding_completed);
            if ((trow as any).deployment_mode) {
              deploymentMode = String((trow as any).deployment_mode).toLowerCase();
            }
            tenantAddress = (trow as any).address ?? tenantAddress;
            tenantPhone = (trow as any).phone ?? tenantPhone;
            tenantName = (trow as any).name || tenantName;
            tenantSlug = (trow as any).slug || tenantSlug;
            subStatus = (trow as any).subscription_status || subStatus;
            subPlan = (trow as any).subscription_plan || subPlan;
            subExpires = (trow as any).subscription_expires_at ?? subExpires;
            if (Array.isArray((trow as any).disabled_modules)) {
              tenantDisabledModules = (trow as any).disabled_modules as string[];
            }
            // Impersonation sırasında admin oturum kaydını kalıcı bozma
            if (!imp.targetTenantId) {
              patchSqlSessionRecord({
                tenant_onboarding: tenantOnboarding,
                onboarding_completed: tenantOnboarding,
                deployment_mode: deploymentMode,
                tenant_name: tenantName,
                tenant_address: tenantAddress,
                tenant_phone: tenantPhone,
                subscription_status: subStatus,
                subscription_plan: subPlan,
                subscription_expires_at: subExpires,
                disabled_modules: tenantDisabledModules,
              });
            }
          }
        } catch {
          /* oturum alanlarıyla devam */
        }

        if (isHybridMode()) deploymentMode = 'hybrid';

        const fakeTenant: Tenant = {
          id: effectiveTenantId,
          name: tenantName,
          slug: tenantSlug,
          subscription_status: subStatus,
          subscription_plan: subPlan,
          subscription_expires_at: subExpires,
          max_branches: null,
          notes: null,
          deployment_mode: deploymentMode,
          onboarding_completed: tenantOnboarding,
          created_at: new Date().toISOString(),
          logo_url: null,
          address: tenantAddress,
          phone: tenantPhone,
          email: profileData.email || rec?.email || null,
          printer_settings: null,
          require_cancel_reason: rec?.require_cancel_reason ?? false,
          lock_pin: rec?.lock_pin || null,
          ip_lock_enabled: null,
          disabled_modules: tenantDisabledModules,
        };

        const rp = parseStoredRolePermissions(rec?.role_permissions);
        let roleData: Role | null = imp.asRole;
        if (!roleData && !imp.targetTenantId) {
          roleData = rp
            ? { id: '', tenant_id: effectiveTenantId, name: profileData.role, permissions: rp as Role['permissions'], created_at: '' }
            : null;
        }
        const sqlPerms = buildPermissionsFromRole(profileData, roleData);

        setProfile(profileData);
        setTenant(fakeTenant);
        setPermissions(sqlPerms);

        // Şubeleri hedef tenant'tan çek
        let branchRows: Branch[] = [];
        const api = (window as any).electronAPI;
        if (api?.sqlGetBranches) {
          const brRes = await api.sqlGetBranches({
            tenantId: effectiveTenantId,
            userId: profileData.id,
            userRole: profileData.role,
          });
          branchRows = (brRes?.data || []) as Branch[];
        }
        if (branchRows.length === 0) {
          try {
            let bq = supabase
              .from('branches')
              .select('*')
              .eq('tenant_id', effectiveTenantId)
              .eq('is_active', true);
            if (
              !imp.targetTenantId &&
              profileData.role !== 'owner' &&
              profileData.role !== 'admin' &&
              profileData.branch_id
            ) {
              bq = bq.eq('id', profileData.branch_id);
            }
            const { data: brows } = await bq.order('is_main', { ascending: false });
            branchRows = (brows || []) as unknown as Branch[];
          } catch {
            branchRows = [];
          }
        }

        if (branchRows.length > 0) {
          setBranches(branchRows);
          const preferred =
            branchRows.find((b) => b.id === profileData.branch_id) ||
            branchRows.find((b) => b.is_main) ||
            branchRows[0];
          setActiveBranchState(preferred);
          persistAuthSessionSnap({
            userId,
            profile: profileData,
            tenant: fakeTenant,
            branches: branchRows,
            activeBranchId: preferred.id,
            impersonationTenantId: imp.targetTenantId,
            permissions: sqlPerms,
          });
          return;
        }

        const fakeBranch: Branch = {
          id: profileData.branch_id || effectiveTenantId,
          tenant_id: effectiveTenantId,
          name: rec.branch_name || 'Ana Şube',
          address: '',
          phone: '',
          is_active: true,
          is_main: true,
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
          impersonationTenantId: imp.targetTenantId,
          permissions: sqlPerms,
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
      const imp = await resolveAdminImpersonation(userId, isSuperAdmin);
      const impersonationTarget = imp.targetTenantId;
      setImpersonationTenantId(impersonationTarget);

      const effectiveTenantId =
        isSuperAdmin && impersonationTarget ? impersonationTarget : prof.tenant_id;

      let effectiveProfile = {
        ...(prof as any),
        tenant_id: effectiveTenantId,
      } as unknown as ProfileWithRole;
      let effectiveRole = prof.roles ?? null;

      if (isSuperAdmin && impersonationTarget) {
        if (imp.asProfile) {
          effectiveProfile = {
            ...(imp.asProfile as any),
            tenant_id: impersonationTarget,
            is_super_admin: false,
          } as unknown as ProfileWithRole;
          effectiveRole = (imp.asRole as unknown as ProfileWithRole['roles']) ?? null;
        } else {
          effectiveProfile = {
            ...(effectiveProfile as any),
            role: 'owner',
            is_super_admin: false,
          } as unknown as ProfileWithRole;
          effectiveRole = null;
        }
      }

      setProfile(effectiveProfile as unknown as Profile);

      const perms = buildPermissionsFromRole(
        effectiveProfile as unknown as Profile,
        effectiveRole,
      );
      setPermissions(perms);

      const [{ data: tenantData }, { active: activeBranch, list: branchList }] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', effectiveTenantId).maybeSingle(),
        loadBranches(effectiveTenantId, effectiveProfile as unknown as Profile),
      ]);

      const tenantRow = tenantData as unknown as Tenant;
      setTenant(tenantRow);
      setBranches(branchList);
      setActiveBranchState(activeBranch);
      if (activeBranch?.id) {
        try {
          localStorage.setItem('shefpos_active_branch', activeBranch.id);
        } catch {
          /* ignore */
        }
      }
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
    } finally {
      lastProfileLoadFinishedAt = Date.now();
      profileLoadInflight = null;
    }
    })();

    profileLoadInflight = run;
    return run;
  };

  useEffect(() => {
    if (!boot.snap) return;
    hideBootSplash();
    const tid = boot.snap.tenant.id;
    const bid = boot.activeBranch?.id;
    if (bid) warmPosCachesIfWeb(tid, bid);
    // loadProfile: applySession/getSession zaten cagirir — cift profil yuklemesi yapma
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
          // Electron güncelleme: oturum aynı ama şube snap'i boş — profil/şubeleri yeniden yükle.
          if (!activeBranchRef.current?.id) {
            void loadProfile(session.user.id);
          }
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
        } catch (err) {
          if (isRefreshTokenNotFoundError(err)) {
            purgeSupabaseAuthLocalStorage();
            try {
              await supabase.auth.signOut({ scope: 'local' });
            } catch {
              /* ignore */
            }
            if (!cancelled) await applySession(null);
            return;
          }
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
          // SQL/yerel modda GoTrue refresh yok; yerel oturumu dogrudan oku.
          if (isSqlServerMode() || isLocalMode()) {
            try {
              const { data: { session: localSession } } = await supabase.auth.getSession();
              if (cancelled) return;
              if (localSession?.user) {
                await applySession(localSession, { force: false });
              } else {
                await applySession(null);
              }
            } catch {
              if (!cancelled) await applySession(null);
            }
            return;
          }
          if (consumeInvalidRefreshHandled()) {
            await applySession(null);
            return;
          }
          if (!readStoredSupabaseRefreshToken()) {
            await applySession(null);
            return;
          }
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
          } catch (err) {
            if (isRefreshTokenNotFoundError(err)) {
              purgeSupabaseAuthLocalStorage();
              try {
                await supabase.auth.signOut({ scope: 'local' });
              } catch {
                /* ignore */
              }
            }
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
    const authApi =
      isElectron && isElectronCloudMode()
        ? getRealSupabaseClient().auth
        : supabase.auth;
    const { data, error } = await authApi.signInWithPassword({ email, password });
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

    // SQL/yerel: profil yukleme applySession/loadProfile ile yapilir; bulut kontrolleri atlanir.
    if (isSqlServerMode() || isLocalMode()) {
      return { error: null };
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
    // VDS: Proxy/localDb karışmasın — doğrudan sqlDb (HTTP /vds-api/register)
    if (import.meta.env.VITE_VDS_SELFHOST === 'true') {
      const { data, error } = await sqlDb.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            tenant_name: tenantName,
            contact_email: contactEmail || null,
            phone: phone || null,
          },
        },
      });
      if (error) return { error };
      if (!data?.user) return { error: new Error('Kullanıcı oluşturulamadı') };
      return { error: null };
    }

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
      localStorage.removeItem('shefpos_admin_impersonation_as');
    } catch {
      /* */
    }
    setImpersonationTenantId(null);
    // Lisans paneline dön — admin profili yeniden yüklensin
    window.location.assign(AYKA_ADMIN_PATH);
  };

  const refreshProfile = async (opts?: { force?: boolean }) => {
    if (user) {
      await loadProfile(user.id, opts?.force ? { force: true } : undefined);
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

  // Ayarlar → Hesap Bilgileri (tenant name/phone/address) paket ve adisyon fişlerinde
  // görünsün diye yazıcı ayarlarındaki restoran bilgileri tenant ile senkron tutulur.
  useEffect(() => {
    if (!tenant?.id) return;
    try {
      const current = loadPrintSettings();
      const patch: Partial<typeof current> = {};
      const tenantName = (tenant.name || '').trim();
      const tenantPhone = ((tenant as any).phone || '').trim();
      const tenantAddress = ((tenant as any).address || '').trim();
      if (tenantName && current.restaurantName !== tenantName) {
        patch.restaurantName = tenantName;
      } else if (!current.restaurantName && tenantName) {
        patch.restaurantName = tenantName;
      }
      if (current.restaurantPhone !== tenantPhone) {
        patch.restaurantPhone = tenantPhone;
      }
      if (current.restaurantAddress !== tenantAddress) {
        patch.restaurantAddress = tenantAddress;
      }
      if (Object.keys(patch).length > 0) {
        savePrintSettings({ ...current, ...patch });
      }
    } catch {
      /* localStorage erişim hatasında sessiz */
    }
  }, [tenant?.id, tenant?.name, (tenant as any)?.phone, (tenant as any)?.address]);

  // Electron SQL: arka planda şema patch (waiter_calls vb.). POS çalışıyorsa
  // bu yalnızca bakım işidir — başarısızlıkta blocking alert gösterme;
  // (eski sürümlerde her oturumda yanlış alarm penceresi açılıyordu).
  useEffect(() => {
    if (!isElectron() || !isSqlServerMode() || !tenant?.id) return;
    const api = (window as any).electronAPI;
    if (!api?.sqlApplySchemaPatches) return;
    const dedupeKey = `sefpos:sql-patch-alerted:${tenant.id}`;
    void api
      .sqlApplySchemaPatches(null)
      .then((result: { success?: boolean; error?: string; errors?: string[]; output?: string }) => {
        if (result?.success) {
          if (result.errors?.length) {
            console.warn('[ŞefPOS] SQL patch uyarıları:', result.errors);
          }
          return;
        }
        const detail = result?.error || result?.errors?.[0] || 'bilinmeyen';
        console.warn('[ŞefPOS] SQL otomatik patch atlandı (POS etkilenmez):', detail, result?.output);
        // Tek oturumda bir kez soft uyarı — sipariş ekranını kilitleme
        try {
          if (sessionStorage.getItem(dedupeKey)) return;
          sessionStorage.setItem(dedupeKey, '1');
        } catch {
          /* private mode */
        }
      })
      .catch((err: unknown) => {
        console.warn('[ŞefPOS] SQL patch (sessiz):', err);
      });
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
    // Yerel-only DB'de print_settings bulutu yok; VDS/SQL dahil diğer tüm modlarda çek
    // (mobil/web masa siparişi mutfak fişi için kategori→yazıcı eşlemesi şart).
    if (isLocalMode()) return;
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
      warmPosCachesIfWeb(tid, branch.id);
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
    if (!user?.id || !tenant?.id || !profile || isSqlServerMode() || isLocalMode()) {
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
