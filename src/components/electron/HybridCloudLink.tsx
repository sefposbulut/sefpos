import { useState } from 'react';
import { Cloud, Link2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getCloudSupabaseClient } from '../../lib/supabase';
import { resolveLoginIdentifier } from '../../lib/panelUserLoginResolve';
import { markHybridCloudLinked } from '../../lib/hybridMode';

type Props = {
  onLinked: () => void;
  onSkip?: () => void;
};

export function HybridCloudLink({ onLinked, onSkip }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const handleLink = async () => {
    setError('');
    setLoading(true);
    setStatus('Bulut hesabı doğrulanıyor…');
    try {
      const api = (window as any).electronAPI;
      const trimmed = phone.trim();
      let loginEmail: string;

      if (trimmed.includes('@')) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          setError('Geçersiz e-posta adresi');
          setLoading(false);
          return;
        }
        loginEmail = trimmed.toLowerCase();
      } else {
        const resolved = await resolveLoginIdentifier(phone);
        if (!resolved.ok || !resolved.email) {
          setError(resolved.message || 'Telefon veya e-posta bulunamadı');
          setLoading(false);
          return;
        }
        loginEmail = resolved.email;
      }

      const cloud = getCloudSupabaseClient();
      const { data: authData, error: authErr } = await cloud.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (authErr) {
        setError(authErr.message || 'Bulut girişi başarısız');
        setLoading(false);
        return;
      }
      if (!authData.session?.access_token || !authData.user?.id) {
        setError('Bulut oturumu oluşturulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.');
        setLoading(false);
        return;
      }

      await cloud.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      });

      const { data: profile, error: profileErr } = await cloud
        .from('profiles')
        .select('id, tenant_id, branch_id, full_name')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileErr) {
        setError('Profil okunamadı: ' + profileErr.message);
        setLoading(false);
        return;
      }
      if (!profile?.tenant_id) {
        setError('Bulut profili veya işletme bulunamadı');
        setLoading(false);
        return;
      }

      const { data: tenant } = await cloud
        .from('tenants')
        .select('id, name, subscription_expires_at, subscription_plan, subscription_status')
        .eq('id', profile.tenant_id)
        .maybeSingle();

      setStatus('SQL kasa hesabı eşleştiriliyor…');
      let sqlTenantId = '';
      let sqlBranchId = profile.branch_id || '';
      const sqlResolved = await api?.resolveSqlTenantForHybrid?.();
      if (sqlResolved?.success && sqlResolved.sqlTenantId) {
        sqlTenantId = sqlResolved.sqlTenantId;
        sqlBranchId = sqlResolved.sqlBranchId || sqlBranchId;
      } else {
        setError(
          sqlResolved?.error ||
            'SQL kurulumu tamamlanmamış. «Veritabanı kurulumu» adımında «Test Et + Kur ve Başla»yı çalıştırın.',
        );
        setLoading(false);
        return;
      }

      setStatus('Bulut bağlantısı kaydediliyor…');
      const syncRes = await api?.syncHybridKasaUser?.({
        email: loginEmail,
        password,
        sqlTenantId,
        sqlBranchId: sqlBranchId || profile.branch_id,
        fullName: profile.full_name,
        tenantName: tenant?.name || '',
      });
      if (!syncRes?.success) {
        setError(syncRes?.error || 'Kasa hesabı eşleştirilemedi');
        setLoading(false);
        return;
      }

      const linkRes = await api?.setHybridLink?.({
        cloudTenantId: profile.tenant_id,
        cloudBranchId: profile.branch_id,
        sqlTenantId,
        sqlBranchId,
        tenantName: tenant?.name || '',
        kasaLoginEmail: loginEmail,
        accessToken: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        expiresAt: authData.session.expires_at,
      });
      if (!linkRes?.success) {
        setError(linkRes?.error || 'Bağlantı kaydedilemedi');
        setLoading(false);
        return;
      }

      setStatus('Menü ve masalar buluttan aktarılıyor…');
      const importRes = await api?.hybridImportFromCloud?.();
      if (!importRes?.success) {
        setError(importRes?.error || 'Menü aktarımı başarısız');
        setLoading(false);
        return;
      }

      await cloud.auth.signOut();
      markHybridCloudLinked(true);
      try {
        localStorage.setItem('shefpos_hybrid_kasa_hint_email', loginEmail);
        localStorage.removeItem('shefpos_hybrid_kasa_hint');
        localStorage.removeItem('shefpos_remembered_login');
        localStorage.removeItem('shefpos_remembered_password');
      } catch {
        /* ignore */
      }
      setStatus(
        `Hazır: ${importRes.products || 0} ürün, ${importRes.tables || 0} masa aktarıldı. Kasaya bulut şifrenizle girebilirsiniz.`,
      );
      onLinked();
    } catch (e: any) {
      setError(e?.message || 'Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
          <Link2 className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bulut hesabını bağla</h2>
          <p className="text-sm text-slate-600">Mevcut bulut veriniz SQL şubeye aktarılır; mobil garson aynı hesapla çalışır.</p>
        </div>
      </div>

      <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-4 text-sm text-slate-700 space-y-1">
        <p className="font-semibold flex items-center gap-2"><Cloud className="w-4 h-4" /> Hibrit mod nasıl çalışır?</p>
        <ul className="list-disc pl-5 space-y-1 text-slate-600">
          <li>Kasa → SQL Server (internet kesilse de çalışır)</li>
          <li>Mobil garson / QR → bulut (mevcut telefon girişiniz)</li>
          <li>Online olunca siparişler otomatik iki yöne senkron olur</li>
        </ul>
      </div>

      <div className="space-y-3 mb-4">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Bulut giriş telefonu veya e-posta"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Bulut şifreniz"
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm mb-4">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {status && !error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm mb-4">
          {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          {status}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            disabled={loading}
            className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm"
          >
            Sonra bağlarım
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleLink()}
          disabled={loading || !phone.trim() || !password}
          className="flex-1 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold text-sm"
        >
          {loading ? 'Bağlanıyor…' : 'Bulutu bağla + menüyü aktar'}
        </button>
      </div>
    </div>
  );
}
