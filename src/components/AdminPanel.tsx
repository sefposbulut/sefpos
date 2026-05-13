import { useState, useEffect, useRef } from 'react';
import { supabase, invokeEdgeFunction } from '../lib/supabase';
import { Shield, Search, Building2, Users, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, X, Save, Calendar, CreditCard, TrendingUp, LogOut, Bell, Send, TicketCheck, MessageCircle, Trash2, Eye, EyeOff, Ban, Play, ChevronRight, Mail, Phone, MapPin, Hash, UserCheck, AlertCircle, Info, Headphones, BarChart3, Banknote, Package2, Server, Handshake, Key, Plus, CreditCard as Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AYKA_ADMIN_PATH } from '../lib/aykaRoute';
import { TOGGLEABLE_MODULES } from '../lib/modules';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  address: string | null;
  subscription_plan: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  max_branches: number;
  notes: string;
  onboarding_completed: boolean;
  deployment_mode: string | null;
  created_at: string;
  _profileCount?: number;
  _branchCount?: number;
  _profiles?: ProfileRow[];
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  branch_id: string | null;
}

const PLANS = [
  { value: 'trial', label: 'Deneme', color: 'bg-slate-100 text-slate-600' },
  { value: 'starter', label: 'Başlangıç', color: 'bg-blue-100 text-blue-700' },
  { value: 'professional', label: 'Profesyonel', color: 'bg-orange-100 text-orange-700' },
  { value: 'enterprise', label: 'Kurumsal', color: 'bg-emerald-100 text-emerald-700' },
];

const STATUSES = [
  { value: 'trial', label: 'Deneme', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', icon: Clock },
  { value: 'active', label: 'Aktif', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle },
  { value: 'suspended', label: 'Askıda', color: 'bg-red-100 text-red-700', dot: 'bg-red-500', icon: Ban },
  { value: 'expired', label: 'Süresi Doldu', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', icon: AlertTriangle },
];

function PlanBadge({ plan }: { plan: string }) {
  const p = PLANS.find(x => x.value === plan) || PLANS[0];
  return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${p.color}`}>{p.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status) || STATUSES[0];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

interface ConfirmDeleteProps {
  tenant: TenantRow;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

function ConfirmDeleteModal({ tenant, onConfirm, onCancel, deleting }: ConfirmDeleteProps) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-6 border-b border-slate-100">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-center font-black text-slate-800 text-lg mb-1">Restoranı Sil</h3>
          <p className="text-center text-slate-500 text-sm">
            <span className="font-semibold text-slate-700">{tenant.name}</span> ve tüm verileri kalıcı olarak silinecek.
            Bu işlem geri alınamaz.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1 text-sm text-red-700">
            <p className="font-semibold">Silinecekler:</p>
            <p>• {tenant._profileCount} kullanıcı profili</p>
            <p>• {tenant._branchCount} şube kaydı</p>
            <p>• Tüm siparişler ve ödeme geçmişi</p>
            <p>• Ürünler, kategoriler ve ayarlar</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
              Onaylamak için <span className="text-red-600 font-black">"{tenant.name}"</span> yazın
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={tenant.name}
              className="w-full px-3 py-2.5 border-2 border-slate-200 focus:border-red-400 rounded-xl outline-none text-sm transition"
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold transition text-sm"
          >
            Vazgec
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== tenant.name || deleting}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold transition text-sm flex items-center justify-center gap-2"
          >
            {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Siliniyor...' : 'Kalıcı Olarak Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditModalProps {
  tenant: TenantRow;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ tenant, onClose, onSaved }: EditModalProps) {
  // UI mantığı: "İşaretli olan modül müşterinin menüsünde GÖRÜNÜR".
  // Veritabanı `disabled_modules` (gizli olanların listesi) tutuyor; biz UI'da
  // ters çeviriyoruz. Hiç kayıt yoksa = boş disabled = her şey görünür.
  const initialDisabled = Array.isArray((tenant as any).disabled_modules)
    ? new Set<string>((tenant as any).disabled_modules as string[])
    : new Set<string>();
  const allCodes = TOGGLEABLE_MODULES.map((m) => m.code);
  const initialEnabled = new Set<string>(allCodes.filter((c) => !initialDisabled.has(c)));

  const [form, setForm] = useState({
    subscription_plan: tenant.subscription_plan || 'trial',
    subscription_status: tenant.subscription_status || 'trial',
    subscription_expires_at: tenant.subscription_expires_at ? tenant.subscription_expires_at.split('T')[0] : '',
    max_branches: tenant.max_branches || 1,
    notes: tenant.notes || '',
    deployment_mode: tenant.deployment_mode || 'online',
  });
  const [enabledModules, setEnabledModules] = useState<Set<string>>(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleModule = (code: string) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    // UI: enabled set → DB: disabled = tüm modüller \ enabled
    const disabledList = allCodes.filter((c) => !enabledModules.has(c));
    const { error: err } = await supabase.from('tenants').update({
      subscription_plan: form.subscription_plan,
      subscription_status: form.subscription_status,
      subscription_expires_at: form.subscription_expires_at || null,
      max_branches: form.max_branches,
      notes: form.notes,
      deployment_mode: form.deployment_mode,
      // Boş array = "her şey açık" (varsayılan, eski davranış).
      disabled_modules: disabledList,
    } as any).eq('id', tenant.id);

    if (err) {
      if (/disabled_modules/i.test(err.message)) {
        setError(
          'disabled_modules kolonu veritabanında yok. Migration ' +
          '20260515240000_tenants_disabled_modules.sql henüz uygulanmamış.'
        );
      } else {
        setError(err.message);
      }
    } else {
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-800 text-lg">{tenant.name}</h3>
            <p className="text-slate-400 text-sm">{tenant.email}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Plan</label>
              <select
                value={form.subscription_plan}
                onChange={(e) => setForm(p => ({ ...p, subscription_plan: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              >
                {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Durum</label>
              <select
                value={form.subscription_status}
                onChange={(e) => setForm(p => ({ ...p, subscription_status: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              >
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Bitiş Tarihi</label>
              <input
                type="date"
                value={form.subscription_expires_at}
                onChange={(e) => setForm(p => ({ ...p, subscription_expires_at: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Maks. Şube</label>
              <input
                type="number"
                min={1}
                value={form.max_branches}
                onChange={(e) => setForm(p => ({ ...p, max_branches: parseInt(e.target.value) || 1 }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Lisans Modu</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'online', label: 'Bulut', icon: '☁️', color: 'blue' },
                { value: 'offline', label: 'SQL Server', icon: '🖥️', color: 'emerald' },
                { value: 'hybrid', label: 'Hibrit', icon: '⚡', color: 'orange' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, deployment_mode: opt.value }))}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 text-xs font-bold transition ${
                    form.deployment_mode === opt.value
                      ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : opt.color === 'emerald' ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <span className="text-base">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {/* Modüller — restoran menüsünde hangi başlıklar görünsün?
              Mantık: TİKLİ olan modül müşteride GÖRÜNÜR.
              Hiç tik yoksa = "hiçbir şey seçilmemiş" → eski davranış (her şey görünür).
              (DB tarafında ters çevrilip disabled_modules olarak yazılır.) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                Müşteri Menüsü
              </label>
              <div className="text-[10px] text-slate-400">
                {enabledModules.size === TOGGLEABLE_MODULES.length
                  ? 'Tüm menüler açık (varsayılan)'
                  : `${enabledModules.size} menü görünür`}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              <strong>İşaretli olanlar</strong> müşterinin ana menüsünde görünür.
              Hiç değiştirmezsen tüm modüller açık kalır (eski davranış).
            </p>

            {/* Hazır ön ayarlar — tek tıkla tipik senaryolar. Yine "Kaydet"e
                basana kadar veritabanına yazmaz, sadece checkbox'ları doldurur. */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <button
                type="button"
                onClick={() => setEnabledModules(new Set(['quick-sale', 'cashier', 'shifts', 'endofday']))}
                className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-[11px] font-bold hover:bg-amber-200 active:scale-95"
              >
                ⚡ Sadece Hızlı Satış
              </button>
              <button
                type="button"
                onClick={() => setEnabledModules(new Set(TOGGLEABLE_MODULES.map((m) => m.code).filter((c) => c !== 'online-orders')))}
                className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-[11px] font-bold hover:bg-blue-200 active:scale-95"
              >
                🍽️ Masa + Paket
              </button>
              <button
                type="button"
                onClick={() => setEnabledModules(new Set(TOGGLEABLE_MODULES.map((m) => m.code)))}
                className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-bold hover:bg-emerald-200 active:scale-95"
              >
                ✅ Tümü açık
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {TOGGLEABLE_MODULES.map((m) => {
                const visible = enabledModules.has(m.code);
                return (
                  <label
                    key={m.code}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border-2 cursor-pointer transition text-xs ${
                      visible
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={() => toggleModule(m.code)}
                      className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold leading-tight">{m.label}</div>
                      <div className="text-[10px] opacity-80 leading-tight mt-0.5 line-clamp-2">
                        {m.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">İç Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
              rows={3}
              placeholder="Müşteri tarafından görülmez..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition text-sm">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TenantDetailProps {
  tenant: TenantRow;
  onlineUserIds: string[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onImpersonate: () => void;
  onApplyPlan: (plan: 'trial' | 'starter' | 'professional' | 'enterprise', durationDays: number) => void;
  planUpdating: boolean;
  onStatusChange: (status: string) => void;
  statusChanging: boolean;
}

function TenantDetailPanel({ tenant, onlineUserIds, onClose, onEdit, onDelete, onImpersonate, onApplyPlan, planUpdating, onStatusChange, statusChanging }: TenantDetailProps) {
  const [showUsers, setShowUsers] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-end z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg h-full max-h-[calc(100vh-2rem)] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              tenant.subscription_status === 'active' ? 'bg-emerald-100' :
              tenant.subscription_status === 'suspended' ? 'bg-red-100' :
              'bg-slate-100'
            }`}>
              <Building2 className={`w-5 h-5 ${
                tenant.subscription_status === 'active' ? 'text-emerald-600' :
                tenant.subscription_status === 'suspended' ? 'text-red-600' :
                'text-slate-600'
              }`} />
            </div>
            <div>
              <h3 className="font-black text-slate-800">{tenant.name}</h3>
              <StatusBadge status={tenant.subscription_status} />
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <Mail className="w-3 h-3" /> E-posta
              </p>
              <p className="text-sm font-semibold text-slate-700 break-all">{tenant.email}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Telefon
              </p>
              <p className="text-sm font-semibold text-slate-700">{tenant.phone || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" /> Plan
              </p>
              <PlanBadge plan={tenant.subscription_plan} />
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Bitiş
              </p>
              <p className="text-sm font-semibold text-slate-700">
                {tenant.subscription_expires_at
                  ? new Date(tenant.subscription_expires_at).toLocaleDateString('tr-TR')
                  : '—'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Kullanıcılar
              </p>
              <p className="text-2xl font-black text-slate-800">{tenant._profileCount}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Şubeler
              </p>
              <p className="text-2xl font-black text-slate-800">{tenant._branchCount} / {tenant.max_branches}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 col-span-2">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1.5">
                <Server className="w-3 h-3" /> Lisans Modu
              </p>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                tenant.deployment_mode === 'offline' ? 'bg-emerald-100 text-emerald-700' :
                tenant.deployment_mode === 'hybrid' ? 'bg-orange-100 text-orange-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {tenant.deployment_mode === 'offline' ? '🖥️ SQL Server (Offline)' :
                 tenant.deployment_mode === 'hybrid' ? '⚡ Hibrit' : '☁️ Bulut (Online)'}
              </span>
            </div>
          </div>

          {tenant.address && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" /> Adres
              </p>
              <p className="text-sm text-slate-700">{tenant.address}</p>
            </div>
          )}

          {tenant.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs font-bold text-amber-600 uppercase mb-1 flex items-center gap-1.5">
                <Info className="w-3 h-3" /> İç Not
              </p>
              <p className="text-sm text-amber-800">{tenant.notes}</p>
            </div>
          )}

          <div>
            <button
              onClick={() => setShowUsers(!showUsers)}
              className="w-full flex items-center justify-between py-2 text-sm font-bold text-slate-700 hover:text-slate-900 transition"
            >
              <span className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" /> Kullanıcı Listesi ({tenant._profiles?.length || 0})
              </span>
              {showUsers ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showUsers && tenant._profiles && tenant._profiles.length > 0 && (
              <div className="mt-2 space-y-2">
                {tenant._profiles.map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                    <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-xs font-black text-orange-700">
                        {p.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {p.email?.includes('.shefpos.local') ? `@${p.email.split('@')[0]}` : p.email}
                      </p>
                      <p className={`text-[10px] font-bold mt-0.5 ${onlineUserIds.includes(p.id) ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {onlineUserIds.includes(p.id) ? 'Online' : 'Offline'}
                      </p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      p.role === 'owner' ? 'bg-orange-100 text-orange-700' :
                      p.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      p.role === 'manager' ? 'bg-emerald-100 text-emerald-700' :
                      p.role === 'cashier' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {p.role === 'owner' ? 'Sahip' :
                       p.role === 'admin' ? 'Yönetici' :
                       p.role === 'manager' ? 'Müdür' :
                       p.role === 'cashier' ? 'Kasiyer' :
                       p.role === 'waiter' ? 'Garson' : p.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {showUsers && (!tenant._profiles || tenant._profiles.length === 0) && (
              <p className="text-sm text-slate-400 text-center py-4">Kullanıcı bulunamadı</p>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase mb-3">Hızlı Aksiyonlar</p>
            <div className="space-y-2">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 mb-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Planlama (Manuel)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onApplyPlan('trial', 3)}
                    disabled={planUpdating}
                    className="px-2 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Deneme 3 Gun
                  </button>
                  <button
                    onClick={() => onApplyPlan('starter', 30)}
                    disabled={planUpdating}
                    className="px-2 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Baslangic 30 Gun
                  </button>
                  <button
                    onClick={() => onApplyPlan('professional', 30)}
                    disabled={planUpdating}
                    className="px-2 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Profesyonel 30 Gun
                  </button>
                  <button
                    onClick={() => onApplyPlan('enterprise', 365)}
                    disabled={planUpdating}
                    className="px-2 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    Kurumsal 365 Gun
                  </button>
                </div>
              </div>
              {tenant.subscription_status !== 'active' && (
                <button
                  onClick={() => onStatusChange('active')}
                  disabled={statusChanging}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-700 font-semibold text-sm transition disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  Hesabı Aktifleştir
                </button>
              )}
              {tenant.subscription_status !== 'suspended' && (
                <button
                  onClick={() => onStatusChange('suspended')}
                  disabled={statusChanging}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-red-700 font-semibold text-sm transition disabled:opacity-50"
                >
                  <Ban className="w-4 h-4" />
                  Hesabı Askıya Al
                </button>
              )}
              {tenant.subscription_status !== 'trial' && (
                <button
                  onClick={() => onStatusChange('trial')}
                  disabled={statusChanging}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  Deneme Moduna Al
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button
            onClick={onImpersonate}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl font-semibold text-sm transition"
          >
            <UserCheck className="w-4 h-4" />
            Oturum Aç
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-xl font-semibold text-sm transition"
          >
            <Trash2 className="w-4 h-4" />
            Sil
          </button>
          <button
            onClick={onEdit}
            className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-sm"
          >
            <Save className="w-4 h-4" />
            Düzenle
          </button>
        </div>
      </div>
    </div>
  );
}

interface SupportTicket {
  id: string;
  tenant_id: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
  tenants?: { name: string; email: string } | null;
}

interface SupportNotification {
  id: string;
  tenant_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

function normalizeSmsPhone(input: string | null | undefined) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('90')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return '';
}

function extractPhoneFromEmail(email: string | null | undefined) {
  const value = (email || '').trim().toLowerCase();
  if (!value || !value.includes('@')) return '';
  const local = value.split('@')[0] || '';
  // Phone-based accounts: m5XXXXXXXXX@sefpos.com.tr (Auth synthetic email)
  if (!/^\d{10,12}$/.test(local)) return '';
  return normalizeSmsPhone(local);
}

function SupportPanel({ tenants }: { tenants: TenantRow[] }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tickets' | 'notifications'>('tickets');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<SupportNotification[]>([]);
  const [deletingTicketId, setDeletingTicketId] = useState<string | null>(null);
  const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);

  const [notifForm, setNotifForm] = useState({ tenant_id: '', title: '', message: '', type: 'info' });
  const [sendingNotif, setSendingNotif] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const [smsForm, setSmsForm] = useState({ tenant_id: '', title: '', message: '' });
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResult, setSmsResult] = useState('');
  const hiddenTicketKey = 'shefpos_hidden_admin_tickets';
  const hiddenTicketBeforeKey = 'shefpos_hidden_admin_tickets_before';
  const hiddenNotifKey = 'shefpos_hidden_admin_notifications';
  const hiddenBeforeKey = 'shefpos_hidden_admin_notifications_before';

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    if (activeTab === 'tickets') {
      const { data } = await supabase
        .from('support_tickets')
        .select('*, tenants(name, email)')
        .order('created_at', { ascending: false });
      const hiddenTicketIds = new Set(JSON.parse(localStorage.getItem(hiddenTicketKey) || '[]') as string[]);
      const hiddenTicketBefore = localStorage.getItem(hiddenTicketBeforeKey);
      setTickets(((data || []) as SupportTicket[]).filter((t) => {
        if (hiddenTicketIds.has(t.id)) return false;
        if (hiddenTicketBefore && t.created_at && t.created_at <= hiddenTicketBefore) return false;
        return true;
      }));
    } else {
      const { data } = await supabase
        .from('support_notifications')
        .select('*')
        .neq('type', 'revoke')
        .order('created_at', { ascending: false });
      const hiddenIds = new Set(JSON.parse(localStorage.getItem(hiddenNotifKey) || '[]') as string[]);
      const hiddenBefore = localStorage.getItem(hiddenBeforeKey);
      setNotifications((data || []).filter((n: any) => {
        if (hiddenIds.has(n.id)) return false;
        if (hiddenBefore && n.created_at && n.created_at <= hiddenBefore) return false;
        return true;
      }));
    }
    setLoading(false);
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSaving(true);
    await supabase.from('support_tickets').update({
      admin_reply: replyText,
      status: 'answered',
      admin_id: user?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedTicket.id);
    setSaving(false);
    setSelectedTicket(null);
    setReplyText('');
    loadData();
  };

  const handleCloseTicket = async (id: string) => {
    await supabase.from('support_tickets').update({
      status: 'closed',
      resolved_at: new Date().toISOString(),
    }).eq('id', id);
    loadData();
  };

  const handleDeleteTicket = async (id: string) => {
    if (!confirm('Bu destek talebi kalici silinsin mi?')) return;
    setDeletingTicketId(id);
    const hiddenTicketIds = new Set(JSON.parse(localStorage.getItem(hiddenTicketKey) || '[]') as string[]);
    hiddenTicketIds.add(id);
    localStorage.setItem(hiddenTicketKey, JSON.stringify(Array.from(hiddenTicketIds).slice(-1000)));
    setTickets(prev => prev.filter(t => t.id !== id));
    try {
      const { error } = await supabase
        .from('support_tickets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      alert('Destek talebi silinemedi: ' + (e?.message || 'hata'));
    } finally {
      setDeletingTicketId(null);
    }
  };

  const handleSendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.message.trim()) return;
    setSendingNotif(true);
    const { error } = await supabase.from('support_notifications').insert({
      tenant_id: notifForm.tenant_id || null,
      title: notifForm.title,
      message: notifForm.message,
      type: notifForm.type,
      created_by: user?.id,
    });
    if (error) {
      alert('Bildirim gonderilemedi: ' + error.message);
      setSendingNotif(false);
      return;
    }
    setSendingNotif(false);
    setNotifForm({ tenant_id: '', title: '', message: '', type: 'info' });
    setNotifSuccess(true);
    setTimeout(() => setNotifSuccess(false), 3000);
    loadData();
  };

  const handleDeleteNotification = async (id: string) => {
    setDeletingNotificationId(id);
    const hiddenIds = new Set(JSON.parse(localStorage.getItem(hiddenNotifKey) || '[]') as string[]);
    hiddenIds.add(id);
    localStorage.setItem(hiddenNotifKey, JSON.stringify(Array.from(hiddenIds).slice(-1000)));
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      const { error } = await supabase
        .from('support_notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setDeletingNotificationId(null);
    } catch (e: any) {
      alert('Bildirim kalici silinemedi: ' + (e?.message || 'hata'));
      setDeletingNotificationId(null);
    }
  };

  const handleDeleteAllNotifications = async () => {
    if (!confirm('Tum gonderilmis bildirimler silinsin mi?')) return;
    setDeletingNotificationId('__all__');
    localStorage.setItem(hiddenBeforeKey, new Date().toISOString());
    setNotifications([]);
    try {
      const ids = notifications.map(n => n.id);
      if (ids.length > 0) {
        const { error } = await supabase
          .from('support_notifications')
          .delete()
          .in('id', ids);
        if (error) throw error;
      }
      setDeletingNotificationId(null);
    } catch (e: any) {
      alert('Tum bildirimler kalici silinemedi: ' + (e?.message || 'hata'));
      setDeletingNotificationId(null);
    }
  };

  const handleSendSms = async () => {
    if (!smsForm.message.trim()) return;
    setSendingSms(true);
    setSmsResult('');
    try {
      const targets = smsForm.tenant_id ? tenants.filter(t => t.id === smsForm.tenant_id) : tenants;
      const phones = Array.from(new Set(
        targets.flatMap((t) => {
          const fromTenant = normalizeSmsPhone(t.phone);
          const fromProfiles = (t._profiles || [])
            .map((p) => extractPhoneFromEmail(p.email))
            .filter(Boolean);
          return [fromTenant, ...fromProfiles].filter(Boolean);
        }),
      ));
      if (phones.length === 0) throw new Error('SMS gonderilecek gecerli telefon bulunamadi');

      let ok = 0;
      let fail = 0;
      for (const phone of phones) {
        try {
          await invokeEdgeFunction('send-sms-custom', {
            phone,
            title: smsForm.title.trim() || 'Bilgilendirme',
            message: smsForm.message.trim(),
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      setSmsResult(`SMS tamamlandi: ${ok} basarili, ${fail} hatali`);
      if (ok > 0) setSmsForm(p => ({ ...p, title: '', message: '' }));
    } catch (e: any) {
      setSmsResult(e?.message || 'SMS gonderilemedi');
    } finally {
      setSendingSms(false);
    }
  };

  const ticketStatusColor = (s: string) => {
    if (s === 'open') return 'bg-red-100 text-red-700';
    if (s === 'answered') return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-500';
  };

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'bg-red-500 text-white';
    if (p === 'high') return 'bg-orange-100 text-orange-700';
    return 'bg-blue-100 text-blue-700';
  };

  const notifTypeStyle = (t: string) => {
    if (t === 'warning') return 'bg-amber-50 border-amber-200';
    if (t === 'error') return 'bg-red-50 border-red-200';
    if (t === 'success') return 'bg-emerald-50 border-emerald-200';
    return 'bg-blue-50 border-blue-200';
  };

  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
          <Headphones className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-black text-slate-800 text-xl">Destek Merkezi</h2>
          <p className="text-slate-500 text-sm">Destek talepleri ve bildirim yönetimi</p>
        </div>
        {openCount > 0 && (
          <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            {openCount} açık talep
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition ${activeTab === 'tickets' ? 'bg-slate-800 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
        >
          <TicketCheck className="w-4 h-4" />
          Destek Talepleri
          {openCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {openCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 transition ${activeTab === 'notifications' ? 'bg-slate-800 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}
        >
          <Bell className="w-4 h-4" />
          Bildirimler
        </button>
      </div>

      {activeTab === 'tickets' && (
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100">
              <TicketCheck className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400">Henüz destek talebi yok</p>
            </div>
          ) : tickets.map(ticket => (
            <div key={ticket.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ticketStatusColor(ticket.status)}`}>
                      {ticket.status === 'open' ? 'Açık' : ticket.status === 'answered' ? 'Yanıtlandı' : 'Kapatıldı'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${priorityColor(ticket.priority)}`}>
                      {ticket.priority === 'urgent' ? 'Acil' : ticket.priority === 'high' ? 'Yüksek' : 'Normal'}
                    </span>
                    <span className="text-xs text-slate-400">{ticket.category}</span>
                  </div>
                  <h4 className="font-bold text-slate-800">{ticket.subject}</h4>
                  <p className="text-sm text-slate-500 mt-0.5">{ticket.tenants?.name} — {ticket.tenants?.email}</p>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{ticket.message}</p>
                  {ticket.admin_reply && (
                    <div className="mt-3 bg-blue-50 rounded-lg px-3 py-2 border-l-2 border-blue-400">
                      <p className="text-xs font-bold text-blue-600 mb-1">Yanıtınız</p>
                      <p className="text-sm text-blue-800">{ticket.admin_reply}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-xs text-slate-400">{new Date(ticket.created_at).toLocaleDateString('tr-TR')}</span>
                  <div className="flex gap-2">
                    {ticket.status !== 'closed' && (
                      <>
                        <button
                          onClick={() => { setSelectedTicket(ticket); setReplyText(ticket.admin_reply || ''); }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" /> Yanıtla
                        </button>
                        <button
                          onClick={() => handleCloseTicket(ticket.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Kapat
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteTicket(ticket.id)}
                      disabled={deletingTicketId === ticket.id}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition flex items-center gap-1 disabled:opacity-50"
                    >
                      {deletingTicketId === ticket.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> SMS Duyuru
            </h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Alıcı</label>
                <select
                  value={smsForm.tenant_id}
                  onChange={e => setSmsForm(p => ({ ...p, tenant_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none text-sm"
                >
                  <option value="">Tüm Restoranlar</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Konu</label>
                <input
                  type="text"
                  value={smsForm.title}
                  onChange={e => setSmsForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Bayram, kampanya, duyuru..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">SMS Mesajı</label>
                <textarea
                  value={smsForm.message}
                  onChange={e => setSmsForm(p => ({ ...p, message: e.target.value }))}
                  rows={3}
                  placeholder="Restoranlara gidecek SMS metni..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none text-sm resize-none"
                />
              </div>
              <button
                onClick={handleSendSms}
                disabled={sendingSms || !smsForm.message.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                {sendingSms ? 'SMS Gönderiliyor...' : (smsForm.tenant_id ? 'Seçili Restorana SMS Gönder' : 'Tüm Restoranlara SMS Gönder')}
              </button>
              {smsResult && (
                <div className="bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-xl text-sm font-semibold">
                  {smsResult}
                </div>
              )}
            </div>

            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Send className="w-4 h-4" /> Yeni Bildirim Gönder
            </h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Alıcı</label>
                <select
                  value={notifForm.tenant_id}
                  onChange={e => setNotifForm(p => ({ ...p, tenant_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                >
                  <option value="">Tüm Restoranlar</option>
                  {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Tür</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'info', label: 'Bilgi', color: 'bg-blue-50 border-blue-200 text-blue-700' },
                    { value: 'success', label: 'Başarı', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    { value: 'warning', label: 'Uyarı', color: 'bg-amber-50 border-amber-200 text-amber-700' },
                    { value: 'error', label: 'Hata', color: 'bg-red-50 border-red-200 text-red-700' },
                  ].map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNotifForm(p => ({ ...p, type: t.value }))}
                      className={`py-2 rounded-lg border-2 text-xs font-bold transition ${
                        notifForm.type === t.value ? t.color + ' border-2' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Başlık</label>
                <input
                  type="text"
                  value={notifForm.title}
                  onChange={e => setNotifForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="Bildirim başlığı..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Mesaj</label>
                <textarea
                  value={notifForm.message}
                  onChange={e => setNotifForm(p => ({ ...p, message: e.target.value }))}
                  rows={4}
                  placeholder="Bildirim içeriği..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm resize-none"
                />
              </div>
              {notifSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2 font-semibold">
                  <CheckCircle className="w-4 h-4" /> Bildirim gönderildi!
                </div>
              )}
              <button
                onClick={handleSendNotification}
                disabled={sendingNotif || !notifForm.title.trim() || !notifForm.message.trim()}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition"
              >
                <Send className="w-4 h-4" />
                {sendingNotif ? 'Gönderiliyor...' : notifForm.tenant_id ? 'Seçili Restoran\'a Gönder' : 'Herkese Gönder'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <Bell className="w-4 h-4" /> Gönderilmiş Bildirimler
              </h3>
              <button
                onClick={handleDeleteAllNotifications}
                disabled={deletingNotificationId === '__all__' || notifications.length === 0}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition disabled:opacity-50"
              >
                {deletingNotificationId === '__all__' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Tümü Sil
              </button>
            </div>
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {loading ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                  <RefreshCw className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
                  <Bell className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Henüz bildirim gönderilmedi</p>
                </div>
              ) : notifications.map(notif => (
                <div key={notif.id} className={`rounded-xl border p-4 ${notifTypeStyle(notif.type)}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-sm">{notif.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {notif.tenant_id
                          ? tenants.find(t => t.id === notif.tenant_id)?.name || 'Belirli restoran'
                          : 'Tüm restoranlar'}
                      </p>
                      <p className="text-sm text-slate-700 mt-1.5">{notif.message}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-xs text-slate-400">{new Date(notif.created_at).toLocaleDateString('tr-TR')}</span>
                      <button
                        onClick={() => handleDeleteNotification(notif.id)}
                        disabled={deletingNotificationId === notif.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold transition disabled:opacity-50"
                      >
                        {deletingNotificationId === notif.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedTicket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-800">{selectedTicket.subject}</h3>
                <p className="text-slate-400 text-sm">{selectedTicket.tenants?.name}</p>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-slate-100 rounded-lg transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Müşteri Mesajı</p>
                <p className="text-sm text-slate-700">{selectedTicket.message}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Yanıtınız</label>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={5}
                  placeholder="Müşteriye yanıt yazın..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setSelectedTicket(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition text-sm">
                İptal
              </button>
              <button
                onClick={handleReply}
                disabled={saving || !replyText.trim()}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition text-sm"
              >
                <Send className="w-4 h-4" />
                {saving ? 'Gönderiliyor...' : 'Yanıt Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AdminPanelProps {
  onExit: () => void;
}

export function AdminPanel({ onExit }: AdminPanelProps) {
  const { signOut, refreshProfile, profile } = useAuth();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null);
  const [detailTenant, setDetailTenant] = useState<TenantRow | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<TenantRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [sortField, setSortField] = useState<'created_at' | 'name' | 'subscription_expires_at'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<'restaurants' | 'support' | 'sales' | 'resellers' | 'licenses'>('restaurants');
  const [salesData, setSalesData] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [onlineByTenant, setOnlineByTenant] = useState<Record<string, string[]>>({});
  const [planUpdating, setPlanUpdating] = useState(false);
  const presenceChannelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const loadTenants = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .order(sortField, { ascending: sortDir === 'asc' });

    if (error) {
      setLoadError(error.message || 'Restoranlar yuklenemedi');
      setLoading(false);
      return;
    }

    if (data) {
      const tenantIds = data.map(t => t.id);
      const [profilesRes, branchesRes] = await Promise.all([
        supabase.from('profiles').select('id, tenant_id, full_name, email, role, branch_id').in('tenant_id', tenantIds),
        supabase.from('branches').select('id, tenant_id').in('tenant_id', tenantIds),
      ]);

      const profilesByTenant: Record<string, ProfileRow[]> = {};
      const branchCounts: Record<string, number> = {};

      (profilesRes.data || []).forEach(p => {
        if (!profilesByTenant[p.tenant_id]) profilesByTenant[p.tenant_id] = [];
        profilesByTenant[p.tenant_id].push(p as ProfileRow);
      });
      (branchesRes.data || []).forEach(b => {
        branchCounts[b.tenant_id] = (branchCounts[b.tenant_id] || 0) + 1;
      });

      setTenants(data.map(t => ({
        ...t,
        subscription_plan: t.subscription_plan || 'trial',
        subscription_status: t.subscription_status || 'trial',
        max_branches: t.max_branches || 1,
        notes: t.notes || '',
        onboarding_completed: t.onboarding_completed || false,
        _profileCount: profilesByTenant[t.id]?.length || 0,
        _branchCount: branchCounts[t.id] || 0,
        _profiles: profilesByTenant[t.id] || [],
      })));
    }
    setLoading(false);
  };

  useEffect(() => { loadTenants(); }, [sortField, sortDir]);

  const loadSalesData = async () => {
    setSalesLoading(true);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: orders } = await supabase
      .from('orders')
      .select('tenant_id, total_amount, status, branch_id, created_at')
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString());

    const { data: branches } = await supabase
      .from('branches')
      .select('id, name, tenant_id');

    const branchMap: Record<string, string> = {};
    (branches || []).forEach(b => { branchMap[b.id] = b.name; });

    const grouped: Record<string, { tenantName: string; branches: Record<string, { name: string; revenue: number; orders: number }> }> = {};

    (orders || []).forEach((o: any) => {
      const tenant = tenants.find(t => t.id === o.tenant_id);
      if (!tenant) return;
      if (!grouped[o.tenant_id]) {
        grouped[o.tenant_id] = { tenantName: tenant.name, branches: {} };
      }
      const bKey = o.branch_id || 'main';
      if (!grouped[o.tenant_id].branches[bKey]) {
        grouped[o.tenant_id].branches[bKey] = {
          name: branchMap[o.branch_id] || 'Ana Şube',
          revenue: 0,
          orders: 0,
        };
      }
      grouped[o.tenant_id].branches[bKey].revenue += o.total_amount || 0;
      grouped[o.tenant_id].branches[bKey].orders += 1;
    });

    setSalesData(Object.entries(grouped).map(([tid, d]) => ({
      tenantId: tid,
      tenantName: d.tenantName,
      branches: Object.values(d.branches),
      totalRevenue: Object.values(d.branches).reduce((s, b) => s + b.revenue, 0),
      totalOrders: Object.values(d.branches).reduce((s, b) => s + b.orders, 0),
    })).sort((a, b) => b.totalRevenue - a.totalRevenue));

    setSalesLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'sales' && tenants.length > 0) loadSalesData();
  }, [activeTab, tenants]);

  useEffect(() => {
    presenceChannelsRef.current.forEach(ch => supabase.removeChannel(ch));
    presenceChannelsRef.current = [];
    setOnlineByTenant({});

    if (activeTab !== 'restaurants' || tenants.length === 0) return;

    const refreshTenantPresence = (tenantId: string, channel: ReturnType<typeof supabase.channel>) => {
      const state = channel.presenceState() as Record<string, any[]>;
      const activeIds = new Set<string>();
      const now = Date.now();
      Object.values(state).forEach((entries: any[]) => {
        entries.forEach((e: any) => {
          if (!e?.user_id) return;
          const seenAt = e?.at ? new Date(e.at).getTime() : now;
          if (now - seenAt <= 70000) {
            activeIds.add(e.user_id);
          }
        });
      });
      setOnlineByTenant(prev => ({ ...prev, [tenantId]: Array.from(activeIds) }));
    };

    const channels = tenants.map((t) => {
      const ch = supabase
        .channel(`tenant-presence-${t.id}`)
        .on('presence', { event: 'sync' }, () => refreshTenantPresence(t.id, ch))
        .on('presence', { event: 'join' }, () => refreshTenantPresence(t.id, ch))
        .on('presence', { event: 'leave' }, () => refreshTenantPresence(t.id, ch));
      ch.subscribe();
      return ch;
    });

    presenceChannelsRef.current = channels;

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
      presenceChannelsRef.current = [];
    };
  }, [activeTab, tenants]);

  const handleDeleteTenant = async () => {
    if (!deletingTenant) return;
    setDeleteLoading(true);
    const tid = deletingTenant.id;

    try {
      const { error } = await supabase.rpc('delete_tenant_cascade', { p_tenant_id: tid });
      if (error) throw error;

      alert('Restoran başarıyla silindi');
      setDeleteLoading(false);
      setDeletingTenant(null);
      setDetailTenant(null);
      await loadTenants();
    } catch (err: any) {
      console.error('Delete error:', err);
      const detail = err?.message || err?.error_description || '';
      const hint = err?.hint || '';
      const code = err?.code || '';
      const lines = [`Silme islemi basarisiz`, detail, hint, code ? `(code: ${code})` : ''].filter(Boolean);
      alert(lines.join('\n'));
      setDeleteLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!detailTenant) return;
    setStatusChanging(true);
    await supabase.from('tenants').update({ subscription_status: status }).eq('id', detailTenant.id);
    await loadTenants();
    setDetailTenant(prev => prev ? { ...prev, subscription_status: status } : null);
    setStatusChanging(false);
  };

  const handleImpersonateTenant = async (tenantId: string) => {
    localStorage.setItem('shefpos_admin_tenant_impersonation', tenantId);
    await refreshProfile();
    onExit();
  };

  const handleApplyPlan = async (plan: 'trial' | 'starter' | 'professional' | 'enterprise', durationDays: number) => {
    if (!detailTenant) return;
    setPlanUpdating(true);
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const status = plan === 'trial' ? 'trial' : 'active';

    const { error } = await supabase
      .from('tenants')
      .update({
        subscription_plan: plan,
        subscription_status: status,
        subscription_expires_at: expiresAt,
      })
      .eq('id', detailTenant.id);

    if (error) {
      alert('Plan güncellenemedi: ' + error.message);
      setPlanUpdating(false);
      return;
    }

    await loadTenants();
    setDetailTenant(prev => prev ? {
      ...prev,
      subscription_plan: plan,
      subscription_status: status,
      subscription_expires_at: expiresAt,
    } : null);
    setPlanUpdating(false);
  };

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !search || t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || (t.phone || '').includes(q);
    const matchStatus = filterStatus === 'all' || t.subscription_status === filterStatus;
    const matchPlan = filterPlan === 'all' || t.subscription_plan === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.subscription_status === 'active').length,
    trial: tenants.filter(t => t.subscription_status === 'trial').length,
    suspended: tenants.filter(t => t.subscription_status === 'suspended').length,
    expiringSoon: tenants.filter(t => {
      if (!t.subscription_expires_at) return false;
      const diff = new Date(t.subscription_expires_at).getTime() - Date.now();
      return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
      : <ChevronDown className="w-3 h-3 text-slate-300" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-xl border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-orange-300/30">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight">ŞefPOS Admin</h1>
            <p className="text-slate-300 text-[11px]">{stats.total} restoran · {stats.active} aktif</p>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-2.5 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-white flex items-center justify-center font-black text-xs">
            AK
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-tight">Alper Karaaslan Hos Geldiniz</p>
            <p className="text-[10px] text-emerald-200 font-semibold">Kurucu</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExit}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs md:text-sm font-semibold transition flex items-center gap-1.5"
          >
            <Building2 className="w-4 h-4" /> Panelime Dön
          </button>
          <button
            onClick={signOut}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs md:text-sm font-semibold transition flex items-center gap-1.5 text-red-300"
          >
            <LogOut className="w-4 h-4" /> Çıkış
          </button>
        </div>
      </div>

      <div className="mx-4 md:mx-6 mt-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span><b>Proje:</b> {(import.meta as any).env?.VITE_SUPABASE_URL || '-'}</span>
        <span><b>Rol:</b> {profile?.role || '-'}</span>
        <span className={profile?.is_super_admin ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold'}>
          <b>Super Admin:</b> {profile?.is_super_admin ? 'Evet' : 'Hayir'}
        </span>
      </div>

      {!profile?.is_super_admin && (
        <div className="mx-4 md:mx-6 mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs md:text-sm font-semibold">
          Bu hesap super-admin degil. Eski restoran/lisans listesinin tamami gorunmez. {AYKA_ADMIN_PATH} icin super-admin hesapla giris yapin.
        </div>
      )}

      <div className="px-6 py-4 bg-white border-b border-slate-200">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Toplam Restoran', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-100' },
            { label: 'Aktif Lisans', value: stats.active, color: 'text-emerald-700', bg: 'bg-emerald-100' },
            { label: 'Deneme', value: stats.trial, color: 'text-blue-700', bg: 'bg-blue-100' },
            { label: 'Askıda', value: stats.suspended, color: 'text-red-700', bg: 'bg-red-100' },
            { label: 'Süresi Yaklaşan', value: stats.expiringSoon, color: 'text-amber-700', bg: 'bg-amber-100' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{item.label}</p>
                <p className={`text-xl font-black ${item.color}`}>{item.value}</p>
              </div>
              <div className={`w-8 h-8 rounded-lg ${item.bg}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="sticky top-0 z-20 bg-slate-800/95 backdrop-blur-sm px-6 py-2.5 flex gap-1 border-t border-white/5">
        {[
          { key: 'restaurants', label: 'Restoranlar', icon: Building2 },
          { key: 'sales', label: 'Satışlar', icon: BarChart3 },
          { key: 'resellers', label: 'Bayiler', icon: UserCheck },
          { key: 'licenses', label: 'Lisanslar', icon: CreditCard },
          { key: 'support', label: 'Destek', icon: Headphones },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition ${
              activeTab === tab.key ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
          {loadError}
        </div>
      )}

      {activeTab === 'resellers' && <ResellersPanel />}
      {activeTab === 'licenses' && <LicensesPanel tenants={tenants} />}
      {activeTab === 'support' && <SupportPanel tenants={tenants} />}

      {activeTab === 'sales' && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-slate-800">Bugünün Satışları</h2>
              <p className="text-slate-400 text-sm">Tüm restoranlar ve şubeler — bugün</p>
            </div>
            <button onClick={loadSalesData} disabled={salesLoading} className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition">
              <RefreshCw className={`w-4 h-4 text-slate-500 ${salesLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {salesLoading ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-slate-100">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto" />
            </div>
          ) : salesData.length === 0 ? (
            <div className="bg-white rounded-2xl p-16 text-center border border-slate-100">
              <BarChart3 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400">Bugün henüz satış yok</p>
            </div>
          ) : (
            <div className="space-y-4">
              {salesData.map(tenant => (
                <div key={tenant.tenantId} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-orange-100 rounded-xl flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-orange-600" />
                      </div>
                      <div>
                        <span className="font-black text-slate-800">{tenant.tenantName}</span>
                        <div className="text-xs text-slate-400">{tenant.branches.length} şube</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-emerald-600">{tenant.totalRevenue.toFixed(0)} ₺</div>
                      <div className="text-xs text-slate-400">{tenant.totalOrders} sipariş</div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {tenant.branches.map((branch: any, i: number) => (
                      <div key={i} className="px-6 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                          <span className="text-sm font-semibold text-slate-700">{branch.name}</span>
                          <span className="text-xs text-slate-400">{branch.orders} sipariş</span>
                        </div>
                        <span className="font-bold text-slate-800">{branch.revenue.toFixed(0)} ₺</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <Banknote className="w-6 h-6 text-emerald-400" />
                  <span className="font-bold">Toplam Platform Geliri (Bugün)</span>
                </div>
                <span className="text-2xl font-black text-emerald-400">
                  {salesData.reduce((s, t) => s + t.totalRevenue, 0).toFixed(0)} ₺
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'restaurants' && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Toplam', value: stats.total, icon: Building2, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
              { label: 'Aktif', value: stats.active, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
              { label: 'Deneme', value: stats.trial, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
              { label: 'Askıda', value: stats.suspended, icon: Ban, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
            ].map(({ label, value, icon: Icon, color, bg, border }) => (
              <div key={label} className={`bg-white rounded-2xl border ${border} p-5 flex items-center gap-4 shadow-sm`}>
                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <div>
                  <div className="text-2xl font-black text-slate-800">{value}</div>
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Restoran adı, e-posta veya telefon..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none text-sm"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
              >
                <option value="all">Tüm Durumlar</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 outline-none text-sm"
              >
                <option value="all">Tüm Planlar</option>
                {PLANS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <button
                onClick={loadTenants}
                disabled={loading}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition"
              >
                <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <span className="text-sm text-slate-400 font-medium">{filtered.length} sonuç</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600" onClick={() => toggleSort('name')}>
                      <span className="flex items-center gap-1">Restoran <SortIcon field="name" /></span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Plan</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Durum</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600" onClick={() => toggleSort('subscription_expires_at')}>
                      <span className="flex items-center gap-1">Bitiş <SortIcon field="subscription_expires_at" /></span>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Kullanıcı / Şube</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600" onClick={() => toggleSort('created_at')}>
                      <span className="flex items-center gap-1">Kayıt <SortIcon field="created_at" /></span>
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Detay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading && (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-400" />
                        Yükleniyor...
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-16 text-slate-400">
                        <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                        Sonuç bulunamadı
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.map((tenant) => {
                    const isExpiringSoon = tenant.subscription_expires_at
                      && new Date(tenant.subscription_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
                      && new Date(tenant.subscription_expires_at).getTime() > Date.now();
                    const isSuspended = tenant.subscription_status === 'suspended';

                    return (
                      <tr
                        key={tenant.id}
                        className={`hover:bg-slate-50/80 transition cursor-pointer ${isSuspended ? 'bg-red-50/30' : isExpiringSoon ? 'bg-amber-50/30' : ''}`}
                        onClick={() => setDetailTenant(tenant)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                              isSuspended ? 'bg-red-100 text-red-700' :
                              tenant.subscription_status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {tenant.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800">{tenant.name}</div>
                              <div className="text-xs text-slate-400 mt-0.5">{tenant.email}</div>
                              {!tenant.onboarding_completed && (
                                <span className="text-[10px] bg-yellow-100 text-yellow-700 font-bold px-1.5 py-0.5 rounded mt-1 inline-block">
                                  Kurulum eksik
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><PlanBadge plan={tenant.subscription_plan} /></td>
                        <td className="px-4 py-4"><StatusBadge status={tenant.subscription_status} /></td>
                        <td className="px-4 py-4">
                          {tenant.subscription_expires_at ? (
                            <div className={`text-xs font-semibold flex items-center gap-1 ${isExpiringSoon ? 'text-red-600' : 'text-slate-600'}`}>
                              <Calendar className="w-3 h-3" />
                              {new Date(tenant.subscription_expires_at).toLocaleDateString('tr-TR')}
                              {isExpiringSoon && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                            </div>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 text-slate-600">
                              <Users className="w-3.5 h-3.5 text-slate-400" /> {tenant._profileCount}
                            </span>
                            <span className="flex items-center gap-1 text-slate-600">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" /> {tenant._branchCount}
                            </span>
                            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" /> {(onlineByTenant[tenant.id] || []).length} online
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs text-slate-400">
                            {new Date(tenant.created_at).toLocaleDateString('tr-TR')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end">
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {detailTenant && (
        <TenantDetailPanel
          tenant={detailTenant}
          onlineUserIds={onlineByTenant[detailTenant.id] || []}
          onClose={() => setDetailTenant(null)}
          onEdit={() => setEditingTenant(detailTenant)}
          onDelete={() => setDeletingTenant(detailTenant)}
          onImpersonate={() => handleImpersonateTenant(detailTenant.id)}
          onApplyPlan={handleApplyPlan}
          planUpdating={planUpdating}
          onStatusChange={handleStatusChange}
          statusChanging={statusChanging}
        />
      )}

      {editingTenant && (
        <EditModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSaved={() => {
            loadTenants();
            setDetailTenant(null);
          }}
        />
      )}

      {deletingTenant && (
        <ConfirmDeleteModal
          tenant={deletingTenant}
          onConfirm={handleDeleteTenant}
          onCancel={() => setDeletingTenant(null)}
          deleting={deleteLoading}
        />
      )}
    </div>
  );
}

interface ResellerRow {
  id: string;
  email: string;
  company_name: string;
  contact_name: string;
  phone: string;
  status: string;
  commission_rate: number;
  notes: string;
  created_at: string;
}

interface ApplicationRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  city: string;
  message: string;
  status: string;
  created_at: string;
}

function ResellersPanel() {
  const [resellers, setResellers] = useState<ResellerRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'resellers' | 'applications'>('resellers');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newReseller, setNewReseller] = useState({ email: '', company_name: '', contact_name: '', phone: '', commission_rate: '0', notes: '' });
  const [editResellerId, setEditResellerId] = useState<string | null>(null);
  const [editReseller, setEditReseller] = useState({ email: '', company_name: '', contact_name: '', phone: '', commission_rate: '0', notes: '' });
  const [deletingResellerId, setDeletingResellerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [r, a] = await Promise.all([
      supabase.from('resellers').select('*').order('created_at', { ascending: false }),
      supabase.from('reseller_applications').select('*').order('created_at', { ascending: false }),
    ]);
    if (r.data) setResellers(r.data as ResellerRow[]);
    if (a.data) setApplications(a.data as ApplicationRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAddReseller = async () => {
    if (!newReseller.email || !newReseller.company_name) return;
    setSaving(true);
    await supabase.from('resellers').insert({
      email: newReseller.email,
      company_name: newReseller.company_name,
      contact_name: newReseller.contact_name,
      phone: newReseller.phone,
      commission_rate: parseFloat(newReseller.commission_rate) || 0,
      notes: newReseller.notes,
      status: 'active',
    });
    setSaving(false);
    setShowAddForm(false);
    setNewReseller({ email: '', company_name: '', contact_name: '', phone: '', commission_rate: '0', notes: '' });
    load();
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    await supabase.from('resellers').update({ status }).eq('id', id);
    load();
  };

  const handleStartEditReseller = (r: ResellerRow) => {
    setEditResellerId(r.id);
    setEditReseller({
      email: r.email || '',
      company_name: r.company_name || '',
      contact_name: r.contact_name || '',
      phone: r.phone || '',
      commission_rate: String(r.commission_rate ?? 0),
      notes: r.notes || '',
    });
  };

  const handleSaveReseller = async () => {
    if (!editResellerId || !editReseller.company_name.trim() || !editReseller.email.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('resellers')
        .update({
          email: editReseller.email.trim(),
          company_name: editReseller.company_name.trim(),
          contact_name: editReseller.contact_name.trim(),
          phone: editReseller.phone.trim(),
          commission_rate: parseFloat(editReseller.commission_rate) || 0,
          notes: editReseller.notes.trim(),
        })
        .eq('id', editResellerId);
      if (error) throw error;
      setEditResellerId(null);
      await load();
    } catch (e: any) {
      alert('Bayi guncellenemedi: ' + (e?.message || 'hata'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReseller = async (id: string) => {
    if (!confirm('Bu bayi kalici silinsin mi?')) return;
    setDeletingResellerId(id);
    try {
      const { error } = await supabase
        .from('resellers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setResellers(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      alert('Bayi silinemedi: ' + (e?.message || 'hata'));
    } finally {
      setDeletingResellerId(null);
    }
  };

  const handleApproveApplication = async (app: ApplicationRow) => {
    await supabase.from('resellers').insert({
      email: app.email,
      company_name: app.company_name,
      contact_name: app.contact_name,
      phone: app.phone,
      status: 'active',
    });
    await supabase.from('reseller_applications').update({ status: 'approved' }).eq('id', app.id);
    load();
  };

  const handleRejectApplication = async (id: string) => {
    await supabase.from('reseller_applications').update({ status: 'rejected' }).eq('id', id);
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      active: 'bg-emerald-100 text-emerald-700',
      approved: 'bg-emerald-100 text-emerald-700',
      suspended: 'bg-red-100 text-red-700',
      rejected: 'bg-slate-100 text-slate-600',
    };
    const labels: Record<string, string> = { pending: 'Bekliyor', active: 'Aktif', approved: 'Onaylandı', suspended: 'Askıda', rejected: 'Reddedildi' };
    return <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${map[s] || 'bg-slate-100 text-slate-600'}`}>{labels[s] || s}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Handshake className="w-5 h-5 text-amber-500" />Bayi Yönetimi</h2>
          <p className="text-slate-400 text-sm">{resellers.length} bayi · {applications.filter(a => a.status === 'pending').length} bekleyen başvuru</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
          <Plus className="w-4 h-4" /> Bayi Ekle
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="font-bold text-slate-800 mb-4">Yeni Bayi</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'company_name', label: 'Firma Adı *', placeholder: 'Firma Adı' },
              { key: 'contact_name', label: 'İletişim Kişisi', placeholder: 'Ad Soyad' },
              { key: 'email', label: 'E-posta *', placeholder: 'email@firma.com' },
              { key: 'phone', label: 'Telefon', placeholder: '05XX XXX XXXX' },
              { key: 'commission_rate', label: 'Komisyon %', placeholder: '0' },
              { key: 'notes', label: 'Not', placeholder: 'İç notlar...' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                <input type="text" placeholder={f.placeholder}
                  value={(newReseller as any)[f.key]}
                  onChange={e => setNewReseller({ ...newReseller, [f.key]: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm transition-colors">İptal</button>
            <button onClick={handleAddReseller} disabled={saving} className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Kaydet
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('resellers')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === 'resellers' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Bayiler ({resellers.length})
        </button>
        <button onClick={() => setTab('applications')} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${tab === 'applications' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          Başvurular
          {applications.filter(a => a.status === 'pending').length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{applications.filter(a => a.status === 'pending').length}</span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-slate-100"><RefreshCw className="w-8 h-8 animate-spin text-amber-400 mx-auto" /></div>
      ) : tab === 'resellers' ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Firma</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">İletişim</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Komisyon</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Kayıt</th>
                <th className="text-right px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {resellers.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Henüz bayi yok</td></tr>
              )}
              {resellers.map(r => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    {editResellerId === r.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editReseller.company_name}
                          onChange={e => setEditReseller(prev => ({ ...prev, company_name: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                          placeholder="Firma adı"
                        />
                        <input
                          type="email"
                          value={editReseller.email}
                          onChange={e => setEditReseller(prev => ({ ...prev, email: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400"
                          placeholder="E-posta"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-slate-800">{r.company_name}</div>
                        <div className="text-xs text-slate-400">{r.email}</div>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {editResellerId === r.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editReseller.contact_name}
                          onChange={e => setEditReseller(prev => ({ ...prev, contact_name: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                          placeholder="İletişim kişi"
                        />
                        <input
                          type="text"
                          value={editReseller.phone}
                          onChange={e => setEditReseller(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400"
                          placeholder="Telefon"
                        />
                      </div>
                    ) : (
                      <>{r.contact_name || '-'}<br /><span className="text-xs text-slate-400">{r.phone}</span></>
                    )}
                  </td>
                  <td className="px-4 py-4">{statusBadge(r.status)}</td>
                  <td className="px-4 py-4 text-slate-700 font-semibold">
                    {editResellerId === r.id ? (
                      <div className="space-y-2">
                        <input
                          type="number"
                          step="0.1"
                          value={editReseller.commission_rate}
                          onChange={e => setEditReseller(prev => ({ ...prev, commission_rate: e.target.value }))}
                          className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                        />
                        <input
                          type="text"
                          value={editReseller.notes}
                          onChange={e => setEditReseller(prev => ({ ...prev, notes: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-400"
                          placeholder="Not"
                        />
                      </div>
                    ) : (
                      `%${r.commission_rate}`
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-xs">{new Date(r.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editResellerId === r.id ? (
                        <>
                          <button
                            onClick={handleSaveReseller}
                            disabled={saving}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Kaydet
                          </button>
                          <button
                            onClick={() => setEditResellerId(null)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            İptal
                          </button>
                        </>
                      ) : (
                        <>
                          {r.status === 'active' ? (
                            <button onClick={() => handleUpdateStatus(r.id, 'suspended')} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-colors">Askıya Al</button>
                          ) : (
                            <button onClick={() => handleUpdateStatus(r.id, 'active')} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-semibold transition-colors">Aktifleştir</button>
                          )}
                          <button
                            onClick={() => handleStartEditReseller(r)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Düzenle
                          </button>
                          <button
                            onClick={() => handleDeleteReseller(r.id)}
                            disabled={deletingResellerId === r.id}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {deletingResellerId === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Sil
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Firma</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">İletişim</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Şehir</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Tarih</th>
                <th className="text-right px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {applications.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Başvuru yok</td></tr>
              )}
              {applications.map(a => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-800">{a.company_name}</div>
                    <div className="text-xs text-slate-400">{a.email}</div>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{a.contact_name}<br /><span className="text-xs text-slate-400">{a.phone}</span></td>
                  <td className="px-4 py-4 text-slate-600">{a.city || '-'}</td>
                  <td className="px-4 py-4">{statusBadge(a.status)}</td>
                  <td className="px-4 py-4 text-slate-400 text-xs">{new Date(a.created_at).toLocaleDateString('tr-TR')}</td>
                  <td className="px-6 py-4 text-right">
                    {a.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleApproveApplication(a)} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Onayla
                        </button>
                        <button onClick={() => handleRejectApplication(a.id)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                          <X className="w-3.5 h-3.5" /> Reddet
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface LicenseRow {
  id: string;
  tenant_id: string | null;
  reseller_id: string | null;
  license_key: string;
  plan: string;
  status: string;
  expires_at: string | null;
  max_branches: number;
  max_users: number;
  notes: string;
  created_at: string;
}

function LicensesPanel({ tenants }: { tenants: TenantRow[] }) {
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [resellers, setResellers] = useState<ResellerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLicense, setNewLicense] = useState({
    tenant_id: '',
    reseller_id: '',
    plan: 'trial',
    status: 'active',
    expires_at: '',
    max_branches: '1',
    max_users: '5',
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    const [l, r] = await Promise.all([
      supabase.from('licenses').select('*').order('created_at', { ascending: false }),
      supabase.from('resellers').select('id, company_name, email').eq('status', 'active'),
    ]);
    if (l.data) setLicenses(l.data as LicenseRow[]);
    if (r.data) setResellers(r.data as ResellerRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAddLicense = async () => {
    if (!newLicense.tenant_id) return;
    setSaving(true);
    await supabase.from('licenses').insert({
      tenant_id: newLicense.tenant_id || null,
      reseller_id: newLicense.reseller_id || null,
      plan: newLicense.plan,
      status: newLicense.status,
      expires_at: newLicense.expires_at || null,
      max_branches: parseInt(newLicense.max_branches) || 1,
      max_users: parseInt(newLicense.max_users) || 5,
      notes: newLicense.notes,
    });
    setSaving(false);
    setShowAddForm(false);
    load();
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    await supabase.from('licenses').update({ status }).eq('id', id);
    load();
  };

  const planColor: Record<string, string> = {
    trial: 'bg-slate-100 text-slate-700',
    starter: 'bg-blue-100 text-blue-700',
    pro: 'bg-orange-100 text-orange-700',
    enterprise: 'bg-emerald-100 text-emerald-700',
  };

  const planLabel: Record<string, string> = {
    trial: 'Deneme',
    starter: 'Başlangıç',
    pro: 'Profesyonel',
    enterprise: 'Kurumsal',
  };

  const statusColor: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-amber-100 text-amber-700',
    suspended: 'bg-red-100 text-red-700',
  };

  const statusLabel: Record<string, string> = { active: 'Aktif', expired: 'Süresi Doldu', suspended: 'Askıda' };

  const getTenantName = (id: string | null) => {
    if (!id) return '-';
    return tenants.find(t => t.id === id)?.name || id.slice(0, 8) + '...';
  };

  const getResellerName = (id: string | null) => {
    if (!id) return 'Direkt';
    return resellers.find(r => r.id === id)?.company_name || '-';
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-blue-500" />Lisans Yönetimi</h2>
          <p className="text-slate-400 text-sm">{licenses.filter(l => l.status === 'active').length} aktif · {licenses.length} toplam</p>
        </div>
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
          <Plus className="w-4 h-4" /> Lisans Ekle
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="font-bold text-slate-800 mb-4">Yeni Lisans</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Restoran *</label>
              <select value={newLicense.tenant_id} onChange={e => setNewLicense({ ...newLicense, tenant_id: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                <option value="">Seçin...</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bayi</label>
              <select value={newLicense.reseller_id} onChange={e => setNewLicense({ ...newLicense, reseller_id: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                <option value="">Direkt (Bayisiz)</option>
                {resellers.map(r => <option key={r.id} value={r.id}>{r.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Plan</label>
              <select value={newLicense.plan} onChange={e => setNewLicense({ ...newLicense, plan: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                {Object.entries(planLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Durum</label>
              <select value={newLicense.status} onChange={e => setNewLicense({ ...newLicense, status: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                {Object.entries(statusLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Bitiş Tarihi</label>
              <input type="date" value={newLicense.expires_at} onChange={e => setNewLicense({ ...newLicense, expires_at: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Max Şube</label>
              <input type="number" value={newLicense.max_branches} onChange={e => setNewLicense({ ...newLicense, max_branches: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Max Kullanıcı</label>
              <input type="number" value={newLicense.max_users} onChange={e => setNewLicense({ ...newLicense, max_users: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Not</label>
              <input type="text" value={newLicense.notes} onChange={e => setNewLicense({ ...newLicense, notes: e.target.value })}
                placeholder="İç notlar..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm transition-colors">İptal</button>
            <button onClick={handleAddLicense} disabled={saving || !newLicense.tenant_id} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Kaydet
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-slate-100"><RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Lisans Anahtarı</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Restoran</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Bayi</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Bitiş</th>
                <th className="text-right px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {licenses.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Henüz lisans yok</td></tr>
              )}
              {licenses.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-bold tracking-wider">{l.license_key}</span>
                  </td>
                  <td className="px-4 py-4 text-slate-700 font-medium">{getTenantName(l.tenant_id)}</td>
                  <td className="px-4 py-4 text-slate-500">{getResellerName(l.reseller_id)}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${planColor[l.plan] || 'bg-slate-100 text-slate-600'}`}>{planLabel[l.plan] || l.plan}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor[l.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabel[l.status] || l.status}</span>
                  </td>
                  <td className="px-4 py-4 text-slate-400 text-xs">
                    {l.expires_at ? new Date(l.expires_at).toLocaleDateString('tr-TR') : 'Süresiz'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {l.status === 'active' ? (
                        <button onClick={() => handleUpdateStatus(l.id, 'suspended')} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-semibold transition-colors">Askıya Al</button>
                      ) : (
                        <button onClick={() => handleUpdateStatus(l.id, 'active')} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-semibold transition-colors">Aktifleştir</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
