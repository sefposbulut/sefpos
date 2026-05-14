import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import {
  Download, FileDown, Link as LinkIcon, Copy, ExternalLink, Loader2,
  Building2, Image as ImageIcon, Palette, Save, Trash2, Eye, Sparkles,
  Store, MapPin, Phone,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildMenuUrl, MenuTheme } from '../lib/publicMenuData';

interface BranchRow {
  id: string;
  name: string;
  is_main: boolean | null;
  is_active: boolean | null;
  menu_enabled: boolean | null;
}

const QR_SIZE = 800;
const PRIMARY_DARK = '#0F172A';

const PRESET_COLORS = [
  '#0F172A', '#1E293B', '#0E7490', '#0369A1', '#1D4ED8',
  '#7C3AED', '#9333EA', '#BE185D', '#DC2626', '#EA580C',
  '#D97706', '#65A30D', '#15803D', '#0F766E', '#475569',
];

const ACCENT_PRESETS = [
  '#F97316', '#F59E0B', '#FBBF24', '#84CC16', '#10B981',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899', '#EF4444',
];

const FONT_OPTIONS: Array<{ id: 'modern' | 'elegant' | 'casual'; label: string; sample: string }> = [
  { id: 'modern', label: 'Modern', sample: 'Aa Bb 123' },
  { id: 'elegant', label: 'Şık', sample: 'Aa Bb 123' },
  { id: 'casual', label: 'Sıcak', sample: 'Aa Bb 123' },
];

export function QrMenuManager() {
  const { tenant, refreshProfile } = useAuth();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  /** Şube QR linkine ?masa= eklemek için (tarayıcıda kalıcı) */
  const [branchQrMasa, setBranchQrMasa] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [overrideOrigin, setOverrideOrigin] = useState<string>(() => {
    try {
      return localStorage.getItem('sefpos_qr_origin_override') || '';
    } catch {
      return '';
    }
  });
  const [copied, setCopied] = useState<string | null>(null);

  // Logo + tema
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant?.logo_url || null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [theme, setTheme] = useState<MenuTheme>(() => normalizeTheme(tenant?.menu_theme || null));
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restoran bilgileri (menu basliginda gozuken)
  const [infoName, setInfoName] = useState<string>(tenant?.name || '');
  const [infoAddress, setInfoAddress] = useState<string>((tenant as any)?.address || '');
  const [infoPhone, setInfoPhone] = useState<string>((tenant as any)?.phone || '');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    setLogoUrl(tenant?.logo_url || null);
    setTheme(normalizeTheme(tenant?.menu_theme || null));
    setInfoName(tenant?.name || '');
    setInfoAddress((tenant as any)?.address || '');
    setInfoPhone((tenant as any)?.phone || '');
  }, [tenant?.id, tenant?.name, tenant?.logo_url, tenant?.menu_theme, (tenant as any)?.address, (tenant as any)?.phone]);

  useEffect(() => {
    if (!tenant?.id) {
      setBranches([]);
      setLoading(false);
      return;
    }
    let cancel = false;
    setLoading(true);
    supabase
      .from('branches')
      .select('id, name, is_main, is_active, menu_enabled')
      .eq('tenant_id', tenant.id)
      .order('is_main', { ascending: false })
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) {
          console.error('[ŞefPOS] QR menü şubeler:', error);
          setBranches([]);
        } else {
          setBranches((data || []) as BranchRow[]);
        }
        setLoading(false);
      });
    return () => { cancel = true; };
  }, [tenant?.id]);

  const baseOrigin = useMemo(() => {
    const trimmed = (overrideOrigin || '').trim().replace(/\/$/, '');
    if (trimmed) return trimmed;
    if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
    return '';
  }, [overrideOrigin]);

  const persistOrigin = (val: string) => {
    setOverrideOrigin(val);
    try {
      if (val.trim()) localStorage.setItem('sefpos_qr_origin_override', val.trim());
      else localStorage.removeItem('sefpos_qr_origin_override');
    } catch { /* ignore */ }
  };

  useEffect(() => {
    setBranchQrMasa({});
  }, [tenant?.id]);

  useEffect(() => {
    if (!tenant?.id || !branches.length) return;
    setBranchQrMasa(prev => {
      const out = { ...prev };
      for (const b of branches) {
        if (out[b.id] !== undefined) continue;
        try {
          const k = `sefpos_qr_branch_masa:${tenant.id}:${b.id}`;
          out[b.id] = localStorage.getItem(k) || '';
        } catch {
          out[b.id] = '';
        }
      }
      return out;
    });
  }, [tenant?.id, branches]);

  const persistBranchMasa = (branchId: string, v: string) => {
    setBranchQrMasa(prev => ({ ...prev, [branchId]: v }));
    if (!tenant?.id) return;
    try {
      const k = `sefpos_qr_branch_masa:${tenant.id}:${branchId}`;
      if (v.trim()) localStorage.setItem(k, v.trim());
      else localStorage.removeItem(k);
    } catch { /* ignore */ }
  };

  const toggleMenuEnabled = async (b: BranchRow) => {
    const next = !(b.menu_enabled ?? true);
    const optimistic = branches.map(x => x.id === b.id ? { ...x, menu_enabled: next } : x);
    setBranches(optimistic);
    const { error } = await supabase.from('branches').update({ menu_enabled: next }).eq('id', b.id);
    if (error) {
      alert('Şube menü durumu güncellenemedi: ' + error.message);
      setBranches(branches);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* ignore */ }
  };

  // ---------- LOGO UPLOAD ----------
  const onSelectLogo = () => fileInputRef.current?.click();

  const uploadLogo = async (file: File) => {
    if (!tenant?.id) return;
    if (!/^image\//.test(file.type)) {
      alert('Lütfen bir resim dosyası seçin.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Logo dosyası 5 MB\'dan büyük olamaz.');
      return;
    }
    setLogoUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${tenant.id}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('tenant-assets').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (up.error) throw new Error(up.error.message);
      const { data: pub } = supabase.storage.from('tenant-assets').getPublicUrl(path);
      const newUrl = pub.publicUrl;
      const { error } = await supabase
        .from('tenants')
        .update({ logo_url: newUrl })
        .eq('id', tenant.id);
      if (error) throw new Error(error.message);
      setLogoUrl(newUrl);
      if (refreshProfile) await refreshProfile();
    } catch (e: any) {
      alert('Logo yüklenemedi: ' + (e?.message || e));
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!tenant?.id) return;
    if (!confirm('Logo kaldırılsın mı?')) return;
    setLogoUploading(true);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ logo_url: null })
        .eq('id', tenant.id);
      if (error) throw new Error(error.message);
      setLogoUrl(null);
      if (refreshProfile) await refreshProfile();
    } catch (e: any) {
      alert('Logo silinemedi: ' + (e?.message || e));
    } finally {
      setLogoUploading(false);
    }
  };

  // ---------- RESTORAN BILGILERI KAYDET ----------
  const saveInfo = async () => {
    if (!tenant?.id) return;
    const cleanName = infoName.trim();
    if (!cleanName) {
      setInfoMsg('Hata: Restoran adı boş olamaz.');
      return;
    }
    setInfoSaving(true);
    setInfoMsg(null);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          name: cleanName.slice(0, 80),
          address: infoAddress.trim().slice(0, 240) || null,
          phone: infoPhone.trim().slice(0, 40) || null,
        })
        .eq('id', tenant.id);
      if (error) throw new Error(error.message);
      if (refreshProfile) await refreshProfile();
      setInfoMsg('Bilgiler kaydedildi.');
      setTimeout(() => setInfoMsg(null), 2200);
    } catch (e: any) {
      setInfoMsg('Hata: ' + (e?.message || e));
    } finally {
      setInfoSaving(false);
    }
  };

  // ---------- TEMA KAYDET ----------
  const saveTheme = async () => {
    if (!tenant?.id) return;
    setThemeSaving(true);
    setThemeMsg(null);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ menu_theme: theme })
        .eq('id', tenant.id);
      if (error) throw new Error(error.message);
      if (refreshProfile) await refreshProfile();
      setThemeMsg('Tema kaydedildi.');
      setTimeout(() => setThemeMsg(null), 2200);
    } catch (e: any) {
      setThemeMsg('Hata: ' + (e?.message || e));
    } finally {
      setThemeSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Açıklama */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <div className="font-semibold mb-1">QR Menü Linkleri</div>
        <p className="text-blue-800/90">
          Müşteri telefonuyla QR'ı okuttuğunda <code>?menu=ŞUBE_ID</code> linki açılır;
          oturum açmadan o şubenin menüsünü görür. Restoranlar arası karışma yoktur — her QR
          yalnızca kendi şubesinin tenant ürünlerini gösterir.
        </p>
      </div>

      {/* LOGO */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-800">Restoran Logosu</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-slate-400" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm text-slate-600">
              QR menünün üst başlığında gösterilir. PNG / JPG / WebP, en fazla 5 MB.
              Kare oran (1:1) önerilir.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={onSelectLogo}
                disabled={logoUploading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
              >
                {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {logoUrl ? 'Logoyu Değiştir' : 'Logo Yükle'}
              </button>
              {logoUrl && (
                <button
                  onClick={removeLogo}
                  disabled={logoUploading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-sm font-semibold border border-red-200"
                >
                  <Trash2 className="w-4 h-4" /> Kaldır
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadLogo(f);
              }}
            />
          </div>
        </div>
      </div>

      {/* RESTORAN BILGILERI */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Store className="w-5 h-5 text-amber-600" />
          <h3 className="font-bold text-slate-800">Restoran Bilgileri</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          QR menünün üst başlığında müşteriye gösterilir. Şu an menüde
          <span className="font-semibold text-slate-700"> "{tenant?.name || 'ŞefPOS'}" </span>
          yazıyor — buradan değiştirebilirsiniz.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Restoran Adı *
            </label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={infoName}
                onChange={e => setInfoName(e.target.value)}
                maxLength={80}
                placeholder="Örn. Lezzet Sofrası"
                className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Adres
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={infoAddress}
                onChange={e => setInfoAddress(e.target.value)}
                maxLength={240}
                placeholder="Örn. Atatürk Cd. No:42, Şişli/İstanbul"
                className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">
              Telefon
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                value={infoPhone}
                onChange={e => setInfoPhone(e.target.value)}
                maxLength={40}
                placeholder="Örn. 0 (212) 555 12 34"
                className="w-full pl-10 pr-3 py-2.5 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={saveInfo}
            disabled={infoSaving}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-sm"
          >
            {infoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Bilgileri Kaydet
          </button>
          {infoMsg && (
            <span className={`text-xs ${infoMsg.startsWith('Hata') ? 'text-red-600' : 'text-emerald-700'}`}>
              {infoMsg}
            </span>
          )}
          <span className="ml-auto text-[11px] text-slate-400 hidden sm:inline">
            Tüm şubelerde geçerlidir
          </span>
        </div>
      </div>

      {/* TEMA EDITORÜ */}
      <ThemeEditor
        theme={theme}
        onChange={setTheme}
        logoUrl={logoUrl}
        tenantName={tenant?.name || 'Restoran'}
        onSave={saveTheme}
        saving={themeSaving}
        message={themeMsg}
      />

      {/* ORIGIN */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <label className="block text-sm font-bold text-slate-700 mb-1">
          Yayın Adresi (Origin)
        </label>
        <input
          type="text"
          value={overrideOrigin}
          placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://app.sefpos.com.tr'}
          onChange={e => persistOrigin(e.target.value)}
          className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
        />
        <p className="text-xs text-slate-500 mt-1.5">
          QR linkleri bu adresi kullanır. Boş bırakırsanız tarayıcı adresi kullanılır.
          Üretim için kalıcı domaininizi yazın (örn. <code>https://www.sefpos.com.tr</code>).
        </p>
      </div>

      {/* ŞUBE QR'LARI */}
      {branches.length === 0 ? (
        <div className="text-center text-slate-500 py-10 bg-white border border-slate-200 rounded-2xl">
          Önce şube ekleyin, sonra her şube için QR menü oluşturun.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {branches.map(b => {
            const masaVal = branchQrMasa[b.id] ?? '';
            const url = buildMenuUrl(b.id, baseOrigin, masaVal);
            const enabled = b.menu_enabled ?? true;
            return (
              <BranchQrCard
                key={b.id}
                branch={b}
                url={url}
                masaValue={masaVal}
                onMasaChange={(v) => persistBranchMasa(b.id, v)}
                enabled={enabled}
                tenantName={tenant?.name || 'Restoran'}
                logoUrl={logoUrl}
                accent={theme.accent || '#F97316'}
                primary={theme.primary || PRIMARY_DARK}
                copied={copied === url}
                onCopy={() => copyUrl(url)}
                onToggleEnabled={() => toggleMenuEnabled(b)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================
// THEME EDITOR
// =============================================================
function ThemeEditor({
  theme,
  onChange,
  logoUrl,
  tenantName,
  onSave,
  saving,
  message,
}: {
  theme: MenuTheme;
  onChange: (t: MenuTheme) => void;
  logoUrl: string | null;
  tenantName: string;
  onSave: () => void;
  saving: boolean;
  message: string | null;
}) {
  const primary = theme.primary || PRIMARY_DARK;
  const accent = theme.accent || '#F97316';
  const mode = theme.mode || 'light';
  const fontStyle = theme.fontStyle || 'modern';
  const heroStyle = theme.heroStyle || 'gradient';

  const set = <K extends keyof MenuTheme>(k: K, v: MenuTheme[K]) =>
    onChange({ ...theme, [k]: v });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Palette className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-slate-800">Tema & Tasarım</h3>
        <span className="ml-auto text-xs text-slate-400 inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Müşterinin gördüğü görünüm
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Sol: kontroller */}
        <div className="space-y-4">
          {/* Ana renk */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Ana Renk (Hero arka plan)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary}
                onChange={e => set('primary', e.target.value)}
                className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={primary}
                onChange={e => set('primary', e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => set('primary', c)}
                  className={`w-7 h-7 rounded-lg border-2 transition ${
                    primary.toLowerCase() === c.toLowerCase()
                      ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-300'
                      : 'border-white'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {/* Vurgu rengi */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Vurgu Rengi (Fiyat/Buton)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={e => set('accent', e.target.value)}
                className="w-12 h-10 rounded-lg border border-slate-200 cursor-pointer"
              />
              <input
                type="text"
                value={accent}
                onChange={e => set('accent', e.target.value)}
                className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {ACCENT_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => set('accent', c)}
                  className={`w-7 h-7 rounded-lg border-2 transition ${
                    accent.toLowerCase() === c.toLowerCase()
                      ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-300'
                      : 'border-white'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {/* Mod */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Görünüm Modu
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['light', 'dark'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => set('mode', m)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                    mode === m
                      ? m === 'dark'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m === 'light' ? 'Açık (Light)' : 'Koyu (Dark)'}
                </button>
              ))}
            </div>
          </div>

          {/* Hero stili */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Hero Stili
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['gradient', 'solid', 'image'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => set('heroStyle', s)}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold border-2 transition ${
                    heroStyle === s
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {s === 'gradient' ? 'Gradient' : s === 'solid' ? 'Düz' : 'Görsel'}
                </button>
              ))}
            </div>
            {heroStyle === 'image' && (
              <input
                type="text"
                value={theme.heroImageUrl || ''}
                onChange={e => set('heroImageUrl', e.target.value)}
                placeholder="https://... görsel URL'si"
                className="mt-2 w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm"
              />
            )}
          </div>

          {/* Font */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Yazı Tipi Karakteri
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map(f => (
                <button
                  key={f.id}
                  onClick={() => set('fontStyle', f.id)}
                  className={`px-2 py-2 rounded-lg border-2 transition text-center ${
                    fontStyle === f.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xs font-semibold">{f.label}</div>
                  <div
                    className={`text-base mt-0.5 ${
                      f.id === 'elegant'
                        ? "[font-family:'Playfair_Display',Georgia,serif]"
                        : f.id === 'casual'
                          ? "[font-family:'Quicksand',system-ui,sans-serif]"
                          : "[font-family:'Inter',system-ui,sans-serif]"
                    }`}
                  >
                    {f.sample}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Temayı Kaydet
            </button>
            {message && (
              <span className={`text-xs ${message.startsWith('Hata') ? 'text-red-600' : 'text-emerald-700'}`}>
                {message}
              </span>
            )}
          </div>
        </div>

        {/* Sağ: ÖN İZLEME */}
        <ThemePreview
          primary={primary}
          accent={accent}
          mode={mode}
          fontStyle={fontStyle}
          heroStyle={heroStyle}
          heroImageUrl={theme.heroImageUrl || null}
          logoUrl={logoUrl}
          tenantName={tenantName}
        />
      </div>
    </div>
  );
}

function ThemePreview({
  primary, accent, mode, fontStyle, heroStyle, heroImageUrl, logoUrl, tenantName,
}: {
  primary: string;
  accent: string;
  mode: 'light' | 'dark';
  fontStyle: 'modern' | 'elegant' | 'casual';
  heroStyle: 'gradient' | 'solid' | 'image';
  heroImageUrl: string | null;
  logoUrl: string | null;
  tenantName: string;
}) {
  const fontClass =
    fontStyle === 'elegant'
      ? "[font-family:'Playfair_Display',Georgia,serif]"
      : fontStyle === 'casual'
        ? "[font-family:'Quicksand',system-ui,sans-serif]"
        : "[font-family:'Inter',system-ui,sans-serif]";

  const heroBg =
    heroStyle === 'image' && heroImageUrl
      ? `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.65)), url(${heroImageUrl}) center/cover no-repeat`
      : heroStyle === 'solid'
        ? primary
        : `radial-gradient(circle at 0% 0%, ${shade(accent, 20)}33, transparent 50%), linear-gradient(135deg, ${primary}, ${shade(primary, mode === 'dark' ? 25 : -15)})`;

  const isDark = mode === 'dark';

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-slate-50 min-h-[420px]">
      <div className="relative" style={{ background: heroBg, color: 'white', padding: '20px 16px 18px' }}>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/30 shadow-md bg-white/10" />
          ) : (
            <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/30 shadow-md" style={{ backgroundColor: accent }}>
              <Eye className="w-5 h-5 text-white" />
            </div>
          )}
          <div className={`min-w-0 ${fontClass}`}>
            <div className="text-lg font-extrabold truncate drop-shadow">{tenantName}</div>
            <div className="text-xs text-white/80">Önizleme · Şube</div>
          </div>
        </div>
      </div>
      <div className={`p-3 ${isDark ? 'bg-slate-950' : 'bg-white'}`}>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
          {['Tümü', 'Başlangıçlar', 'Ana Yemekler', 'Tatlılar'].map((c, i) => (
            <span
              key={c}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                i === 0
                  ? 'text-white shadow'
                  : isDark
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
              style={i === 0 ? { backgroundColor: accent } : undefined}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {[
            { name: 'Sezar Salata', desc: 'Tavuk göğsü, parmesan, kruton', price: 145 },
            { name: 'Köfte Tabağı', desc: 'Pilav, közlenmiş biber, roka', price: 220 },
          ].map((p) => (
            <div
              key={p.name}
              className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className={`min-w-0 ${fontClass}`}>
                <div className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{p.name}</div>
                <div className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.desc}</div>
              </div>
              <div className="text-sm font-extrabold whitespace-nowrap" style={{ color: accent }}>
                ₺{p.price}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow"
            style={{ background: `linear-gradient(135deg, ${accent}, ${shade(accent, -15)})` }}
          >
            <Sparkles className="w-3.5 h-3.5" /> Garson Çağır
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// QR CARD
// =============================================================
function BranchQrCard({
  branch,
  url,
  masaValue,
  onMasaChange,
  enabled,
  tenantName,
  logoUrl,
  accent,
  primary,
  copied,
  onCopy,
  onToggleEnabled,
}: {
  branch: BranchRow;
  url: string;
  masaValue: string;
  onMasaChange: (v: string) => void;
  enabled: boolean;
  tenantName: string;
  logoUrl: string | null;
  accent: string;
  primary: string;
  copied: boolean;
  onCopy: () => void;
  onToggleEnabled: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancel = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: QR_SIZE,
      color: { dark: primary, light: '#FFFFFF' },
    })
      .then(d => { if (!cancel) setDataUrl(d); })
      .catch(err => console.error('[ŞefPOS] QR üretilemedi:', err));
    return () => { cancel = true; };
  }, [url, primary]);

  const downloadPng = async () => {
    if (!dataUrl) return;
    setBusy(true);
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qr-menu-${slugify(tenantName)}-${slugify(branch.name)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    if (!dataUrl) return;
    setBusy(true);
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      const [pr, pg, pb] = hexToRgb(primary);
      const [ar, ag, ab] = hexToRgb(accent);

      doc.setFillColor(pr, pg, pb);
      doc.rect(0, 0, pageW, 56, 'F');

      // logo (varsa)
      if (logoUrl) {
        try {
          const dataLogo = await fetchAsDataURL(logoUrl);
          if (dataLogo) doc.addImage(dataLogo, 'PNG', pageW / 2 - 12, 8, 24, 24);
        } catch { /* ignore */ }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.text(tenantName, pageW / 2, logoUrl ? 42 : 28, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(15);
      doc.text(branch.name, pageW / 2, logoUrl ? 50 : 40, { align: 'center' });

      // QR
      const qrSize = 130;
      const qrX = (pageW - qrSize) / 2;
      const qrY = 75;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 4, 4, 'F');
      doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

      // accent çubuk
      doc.setFillColor(ar, ag, ab);
      doc.roundedRect(pageW / 2 - 30, qrY + qrSize + 10, 60, 3, 1.5, 1.5, 'F');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Menüyü Görmek İçin Okutun', pageW / 2, qrY + qrSize + 26, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text('Telefonunuzun kamerasıyla QR kodu tarayın.', pageW / 2, qrY + qrSize + 38, { align: 'center' });

      doc.setFontSize(11);
      doc.setTextColor(ar, ag, ab);
      doc.setFont('helvetica', 'bold');
      doc.text('Garson Çağırma · Hesap İsteme · Tüm Menü', pageW / 2, qrY + qrSize + 50, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      doc.text(url, pageW / 2, pageH - 18, { align: 'center', maxWidth: pageW - 30 });
      doc.text('Powered by ŞefPOS', pageW / 2, pageH - 10, { align: 'center' });

      doc.save(`qr-menu-${slugify(tenantName)}-${slugify(branch.name)}.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-white border-2 rounded-2xl p-4 sm:p-5 shadow-sm transition-all ${
      enabled ? 'border-slate-200' : 'border-amber-200 bg-amber-50/30'
    }`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="w-5 h-5 text-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800 truncate">{branch.name}</h3>
            {branch.is_main && (
              <span className="text-[10px] uppercase tracking-wide text-blue-700 font-bold">
                Ana Şube
              </span>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggleEnabled}
            className="w-4 h-4 rounded border-slate-300"
          />
          <span className="font-semibold text-slate-700">{enabled ? 'Açık' : 'Kapalı'}</span>
        </label>
      </div>

      <div className="mb-3">
        <label className="block text-[11px] font-bold text-slate-600 mb-1">
          QR&apos;da sabit masa / bölüm (isteğe bağlı)
        </label>
        <input
          type="text"
          value={masaValue}
          onChange={e => onMasaChange(e.target.value)}
          placeholder="Örn: Masa 5 veya Bahçe-B3 — boşsa müşteri yazar"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="text-[10px] text-slate-400 mt-1">
          Doluysa link <code className="bg-slate-100 px-1 rounded text-[10px]">?masa=…</code> içerir; garson çağırda otomatik gelir. Her masa için ayrı QR basabilirsiniz.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div className="flex-shrink-0 bg-white border border-slate-200 rounded-xl p-2 shadow-sm relative">
          {dataUrl ? (
            <>
              <img src={dataUrl} alt="QR" className="w-40 h-40 sm:w-44 sm:h-44 block" />
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt=""
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-md object-cover border-2 border-white shadow-md bg-white"
                />
              )}
            </>
          ) : (
            <div className="w-40 h-40 sm:w-44 sm:h-44 flex items-center justify-center text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 w-full space-y-2.5">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-700 hover:text-blue-700 truncate flex-1 font-mono"
              title={url}
            >
              {url}
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onCopy}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              <Copy className="w-3.5 h-3.5" /> {copied ? 'Kopyalandı!' : 'Linki Kopyala'}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Önizle
            </a>
            <button
              onClick={downloadPng}
              disabled={!dataUrl || busy}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
            >
              <Download className="w-3.5 h-3.5" /> PNG İndir
            </button>
            <button
              onClick={downloadPdf}
              disabled={!dataUrl || busy}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
            >
              <FileDown className="w-3.5 h-3.5" /> PDF İndir
            </button>
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// =============================================================
// utils
// =============================================================
function normalizeTheme(t: any): MenuTheme {
  const r: MenuTheme = {
    primary: typeof t?.primary === 'string' ? t.primary : '#0F172A',
    accent: typeof t?.accent === 'string' ? t.accent : '#F97316',
    mode: t?.mode === 'dark' ? 'dark' : 'light',
    fontStyle: ['modern', 'elegant', 'casual'].includes(t?.fontStyle) ? t.fontStyle : 'modern',
    heroStyle: ['gradient', 'solid', 'image'].includes(t?.heroStyle) ? t.heroStyle : 'gradient',
    heroImageUrl: typeof t?.heroImageUrl === 'string' ? t.heroImageUrl : null,
    showCategoryImages: !!t?.showCategoryImages,
  };
  return r;
}

function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'sefpos';
}

function hexToRgb(hex: string): [number, number, number] {
  let h = (hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function shade(hex: string, percent: number): string {
  const [r0, g0, b0] = hexToRgb(hex);
  const f = 1 + percent / 100;
  const r = Math.max(0, Math.min(255, Math.round(r0 * f)));
  const g = Math.max(0, Math.min(255, Math.round(g0 * f)));
  const b = Math.max(0, Math.min(255, Math.round(b0 * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

async function fetchAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result));
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
