import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Database } from '../lib/supabase';
import { Branch } from '../contexts/AuthContext';
import {
  Users, Plus, Trash2, CreditCard as Edit2, Save, X, MapPin, Building2,
  KeyRound, Shield, ShieldOff, ShieldCheck, Info, Wifi, WifiOff, AlertTriangle,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Pencil
} from 'lucide-react';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Role = Database['public']['Tables']['roles']['Row'];

interface ProfileWithRole extends Profile {
  roles?: Role;
  branches?: Branch;
  allowed_ips?: string | null;
  is_active?: boolean | null;
}

interface PermissionDef {
  key: string;
  label: string;
  description: string;
  color: string;
}

const PERMISSION_DEFS: PermissionDef[] = [
  { key: 'can_view_tables', label: 'Masaları Görüntüle', description: 'Masa ekranını ve durumlarını görebilir', color: 'blue' },
  { key: 'can_take_orders', label: 'Sipariş Al', description: 'Masadan/paketten sipariş açabilir, ürün ekleyebilir', color: 'green' },
  { key: 'can_process_payments', label: 'Ödeme Al', description: 'Sipariş ödemesi alabilir, fatura kesebilir', color: 'emerald' },
  { key: 'can_delete_order_items', label: 'Sipariş Kalemi Sil', description: 'Açık siparişten ürün çıkarabilir', color: 'orange' },
  { key: 'can_manage_discounts', label: 'İndirim Uygula', description: 'Siparişe indirim/iskonto ekleyebilir', color: 'yellow' },
  { key: 'can_manage_products', label: 'Ürün/Stok Yönetimi', description: 'Ürün ekleyebilir, fiyat değiştirebilir, kategori yönetebilir', color: 'purple' },
  { key: 'can_manage_cash_register', label: 'Kasa Yönetimi', description: 'Kasayı açıp kapatabilir, nakit işlem yapabilir', color: 'teal' },
  { key: 'can_view_reports', label: 'Raporları Görüntüle', description: 'Satış ve personel raporlarına erişebilir', color: 'indigo' },
  { key: 'can_end_of_day', label: 'Gün Sonu', description: 'Gün sonu kapanış işlemini yapabilir', color: 'slate' },
  { key: 'can_view_cancel_logs', label: 'İptal Kayıtları', description: 'İptal edilen sipariş kayıtlarını görebilir', color: 'red' },
  { key: 'can_manage_users', label: 'Kullanıcı Yönetimi', description: 'Kullanıcı ekleyip silebilir, rolleri değiştirebilir', color: 'rose' },
  { key: 'can_manage_settings', label: 'Ayarlar', description: 'Sistem ayarlarını görüntüleyip değiştirebilir', color: 'gray' },
];

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};

interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({ message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-6">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-center text-slate-700 font-semibold text-base">{message}</p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold transition text-sm">
            Vazgeç
          </button>
          <button onClick={onConfirm} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition text-sm">
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

interface PasswordModalProps {
  user: ProfileWithRole;
  onClose: () => void;
  onSave: (userId: string, password: string) => Promise<void>;
}

function PasswordModal({ user, onClose, onSave }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır'); return; }
    if (password !== confirm) { setError('Şifreler eşleşmiyor'); return; }
    setSaving(true);
    await onSave(user.id, password);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Şifre Değiştir</h3>
              <p className="text-sm text-gray-500">{user.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Yeni Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="En az 6 karakter"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Şifre Tekrar</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Şifreyi tekrar girin"
              required
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-xl text-sm">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm font-medium">
              İptal
            </button>
            <button type="submit" disabled={saving} className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl transition text-sm font-medium">
              {saving ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface IpLockModalProps {
  user: ProfileWithRole;
  onClose: () => void;
  onSave: (userId: string, ips: string | null) => Promise<void>;
}

function IpLockModal({ user, onClose, onSave }: IpLockModalProps) {
  const [ips, setIps] = useState(user.allowed_ips || '');
  const [saving, setSaving] = useState(false);
  const [detectedIp, setDetectedIp] = useState<string | null>(null);
  const [loadingIp, setLoadingIp] = useState(false);

  const fetchCurrentIp = async () => {
    setLoadingIp(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      setDetectedIp(data.ip);
    } catch {
      setDetectedIp(null);
    } finally {
      setLoadingIp(false);
    }
  };

  useEffect(() => { fetchCurrentIp(); }, []);

  const addCurrentIp = () => {
    if (!detectedIp) return;
    const existing = ips.split(',').map(s => s.trim()).filter(Boolean);
    if (!existing.includes(detectedIp)) {
      setIps([...existing, detectedIp].join(', '));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const cleaned = ips.split(',').map(s => s.trim()).filter(Boolean).join(',');
    await onSave(user.id, cleaned || null);
    setSaving(false);
    onClose();
  };

  const ipList = ips.split(',').map(s => s.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">IP Kilidi</h3>
              <p className="text-sm text-gray-500">{user.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              Buraya eklenen IP adreslerinden <strong>başka</strong> bir ağdan bu kullanıcı giriş yapamaz.
              Boş bırakılırsa herhangi bir ağdan giriş yapabilir.
            </p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Mevcut Ağ IP'si</span>
              <button onClick={fetchCurrentIp} className="text-xs text-orange-600 hover:text-orange-700 font-medium">
                {loadingIp ? 'Alınıyor...' : 'Yenile'}
              </button>
            </div>
            {detectedIp ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-green-500" />
                  <code className="text-sm font-mono font-semibold text-gray-800">{detectedIp}</code>
                </div>
                <button onClick={addCurrentIp} className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg transition">
                  Listeye Ekle
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <WifiOff className="w-4 h-4" />
                <span className="text-sm">IP alınamadı</span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              İzin Verilen IP Adresleri
              <span className="text-gray-400 font-normal ml-2">(virgülle ayırın)</span>
            </label>
            <textarea
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-sm resize-none"
              placeholder="Örn: 192.168.1.100, 82.120.45.23"
            />
          </div>
          {ipList.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Aktif kısıtlamalar:</p>
              <div className="flex flex-wrap gap-2">
                {ipList.map((ip) => (
                  <span key={ip} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-mono font-medium">
                    <ShieldCheck className="w-3 h-3" />
                    {ip}
                    <button onClick={() => setIps(ipList.filter(i => i !== ip).join(', '))} className="hover:text-red-600 transition ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {ipList.length === 0 && ips === '' && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <ShieldOff className="w-4 h-4 flex-shrink-0" />
              <p className="text-sm">IP kilidi devre dışı – her yerden giriş yapılabilir</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm font-medium">
              İptal
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl transition text-sm font-medium">
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleEditModalProps {
  role: Role;
  onClose: () => void;
  onSave: (roleId: string, name: string, permissions: Record<string, boolean>) => Promise<void>;
}

function RoleEditModal({ role, onClose, onSave }: RoleEditModalProps) {
  const [name, setName] = useState(role.name);
  const [perms, setPerms] = useState<Record<string, boolean>>(() => {
    const p = role.permissions as Record<string, unknown>;
    const result: Record<string, boolean> = {};
    PERMISSION_DEFS.forEach(def => {
      result[def.key] = !!(p?.[def.key]);
    });
    return result;
  });
  const [saving, setSaving] = useState(false);

  const togglePerm = (key: string) => {
    setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const enabledCount = Object.values(perms).filter(Boolean).length;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(role.id, name, perms);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Pencil className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Rol Düzenle</h3>
              <p className="text-sm text-gray-500">{enabledCount} / {PERMISSION_DEFS.length} yetki aktif</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rol Adı</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 font-medium"
              placeholder="Örn: Müdür, Garson, Kasiyer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Yetkiler</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPerms(Object.fromEntries(PERMISSION_DEFS.map(d => [d.key, true])))}
                  className="text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 bg-green-50 rounded-lg transition"
                >
                  Tümünü Aç
                </button>
                <button
                  onClick={() => setPerms(Object.fromEntries(PERMISSION_DEFS.map(d => [d.key, false])))}
                  className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1 bg-red-50 rounded-lg transition"
                >
                  Tümünü Kapat
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {PERMISSION_DEFS.map((def) => {
                const enabled = perms[def.key];
                return (
                  <button
                    key={def.key}
                    onClick={() => togglePerm(def.key)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                      enabled
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <p className={`font-semibold text-sm ${enabled ? 'text-green-800' : 'text-gray-600'}`}>
                        {def.label}
                      </p>
                      <p className={`text-xs mt-0.5 ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
                        {def.description}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {enabled
                        ? <ToggleRight className="w-7 h-7 text-green-500" />
                        : <ToggleLeft className="w-7 h-7 text-gray-300" />
                      }
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition text-sm font-medium">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl transition text-sm font-bold"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserManagement() {
  const { tenant, profile } = useAuth();
  const [users, setUsers] = useState<ProfileWithRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [passwordModal, setPasswordModal] = useState<ProfileWithRole | null>(null);
  const [ipLockModal, setIpLockModal] = useState<ProfileWithRole | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ProfileWithRole | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [rolesExpanded, setRolesExpanded] = useState(true);
  const [newUser, setNewUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role_id: '',
    branch_id: '',
    isWaiter: false,
    waiterPin: '',
    waiterPhone: '',
  });

  useEffect(() => {
    if (tenant) {
      loadRoles();
      loadBranches();
      loadUsers();
    }
  }, [tenant]);

  useEffect(() => {
    if (tenant) loadUsers();
  }, [filterBranch]);

  const loadRoles = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('roles')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');
    if (data) setRoles(data);
  };

  const loadBranches = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name');
    if (data) setBranches(data as Branch[]);
  };

  const loadUsers = async () => {
    if (!tenant) return;
    let query = supabase
      .from('profiles')
      .select('*, roles(*), branches(*)')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });

    if (filterBranch !== 'all') query = query.eq('branch_id', filterBranch);
    const { data } = await query;
    if (data) setUsers(data as ProfileWithRole[]);
    setLoading(false);
  };

  const callUpdateUser = async (payload: Record<string, unknown>) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Oturum bilgisi alınamadı');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'İşlem başarısız');
    return result;
  };

  const handleUpdateUser = async (userId: string) => {
    const updateData: Record<string, unknown> = { role_id: selectedRole };
    if (selectedBranch) updateData.branch_id = selectedBranch;
    else updateData.branch_id = null;
    const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
    if (!error) {
      setEditingUser(null);
      loadUsers();
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      // Cleanup waiter/courier device access before profile delete.
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, tenant_id, role')
        .eq('id', userId)
        .maybeSingle();

      if (targetProfile?.tenant_id && ['waiter', 'courier'].includes((targetProfile as any).role || '')) {
        await Promise.all([
          supabase
            .from('device_bindings')
            .update({ status: 'inactive' } as any)
            .eq('tenant_id', (targetProfile as any).tenant_id)
            .eq('waiter_id', userId),
          supabase
            .from('device_binding_requests')
            .update({ status: 'rejected' } as any)
            .eq('tenant_id', (targetProfile as any).tenant_id)
            .eq('waiter_id', userId)
            .in('status', ['pending', 'accepted']),
        ]);
      }

      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      alert('Kullanıcı başarıyla silindi');
      loadUsers();
    } catch (err) {
      alert('Hata: ' + (err as Error).message);
    }
    setDeleteConfirm(null);
  };

  const handleToggleUserActive = async (userId: string, nextActive: boolean) => {
    try {
      const target = users.find(u => u.id === userId);
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: nextActive } as any)
        .eq('id', userId);
      if (error) throw error;

      // Permanent rule: inactive waiter/courier cannot keep active device authorization.
      if (target?.tenant_id && ['waiter', 'courier'].includes(target.role || '')) {
        if (!nextActive) {
          await Promise.all([
            supabase
              .from('device_bindings')
              .update({ status: 'inactive' } as any)
              .eq('tenant_id', target.tenant_id)
              .eq('waiter_id', userId),
            supabase
              .from('device_binding_requests')
              .update({ status: 'rejected' } as any)
              .eq('tenant_id', target.tenant_id)
              .eq('waiter_id', userId)
              .in('status', ['pending', 'accepted']),
          ]);
        }
      }

      await loadUsers();
      alert(nextActive ? 'Kullanıcı aktifleştirildi' : 'Kullanıcı pasife alındı');
    } catch (err) {
      alert('Durum güncellenemedi: ' + (err as Error).message);
    }
  };

  const handleChangePassword = async (userId: string, password: string) => {
    try {
      await callUpdateUser({ target_user_id: userId, new_password: password });
      alert('Şifre başarıyla güncellendi');
    } catch (err) {
      alert('Şifre değiştirilemedi: ' + (err as Error).message);
    }
  };

  const handleSaveIpLock = async (userId: string, ips: string | null) => {
    try {
      await callUpdateUser({ target_user_id: userId, allowed_ips: ips });
    } catch (err) {
      alert('IP kilidi kaydedilemedi: ' + (err as Error).message);
    }
    loadUsers();
  };

  const handleSaveRole = async (roleId: string, name: string, permissions: Record<string, boolean>) => {
    const { error } = await supabase
      .from('roles')
      .update({ name, permissions })
      .eq('id', roleId);
    if (error) {
      alert('Rol kaydedilemedi: ' + error.message);
      return;
    }
    await loadRoles();
    await loadUsers();
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingUser) return;
    if (!newUser.username.trim()) { alert('Kullanıcı adı zorunludur'); return; }
    if (!newUser.role_id) { alert('Lütfen bir rol seçin'); return; }
    if (!tenant?.id) { alert('Tenant bilgisi bulunamadı'); return; }

    if (newUser.isWaiter) {
      if (newUser.waiterPhone.length !== 11 || !newUser.waiterPhone.startsWith('0')) {
        alert('Geçerli telefon numarası girin (05XXXXXXXXX)');
        return;
      }
      if (newUser.waiterPin.length !== 4 || !/^\d+$/.test(newUser.waiterPin)) {
        alert('4 haneli sayısal PIN girin');
        return;
      }
    }

    setAddingUser(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { alert('Oturum bilgisi alınamadı, lütfen tekrar giriş yapın'); return; }

      const sanitized = newUser.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const waiterDigits = newUser.waiterPhone.replace(/\D/g, '');
      const waiterEmail = `${waiterDigits}@sefpos.com.tr`;
      const autoEmail = newUser.isWaiter ? waiterEmail : `${sanitized}@${tenant?.id?.slice(0, 8)}.shefpos.local`;
      const accountPassword = newUser.isWaiter ? newUser.waiterPin : newUser.password;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: autoEmail,
          password: accountPassword,
          full_name: newUser.full_name,
          role_id: newUser.role_id,
          tenant_id: tenant?.id,
          branch_id: newUser.branch_id || null,
        }),
      });

      let result: Record<string, unknown> = {};
      try { result = await response.json(); } catch {
        alert('Kullanıcı oluşturulamadı: Sunucu yanıtı okunamadı (HTTP ' + response.status + ')');
        return;
      }

      if (!response.ok || !result?.success) {
        alert('Kullanıcı oluşturulamadı: ' + (result?.error || result?.message || JSON.stringify(result) || 'Bilinmeyen hata'));
        return;
      }

      // If waiter, create waiter record
      if (newUser.isWaiter) {
        const { error: waiterError } = await supabase.from('waiters').insert({
          tenant_id: tenant.id,
          name: newUser.full_name,
          phone: newUser.waiterPhone,
          pin: newUser.waiterPin,
          status: 'active',
        });

        if (waiterError) {
          console.error('Garson kaydı hatası:', waiterError);
          alert('Garson kaydı başarılı oldu ama telefon kaydında hata: ' + waiterError.message);
        }
      }

      setShowAddUser(false);
      setNewUser({ username: '', full_name: '', password: '', role_id: '', branch_id: '', isWaiter: false, waiterPin: '', waiterPhone: '' });
      loadUsers();
    } catch (error) {
      alert('Kullanıcı oluşturulamadı: ' + (error as Error).message);
    } finally {
      setAddingUser(false);
    }
  };

  const canManageUsers = ['owner', 'admin', 'manager'].includes(profile?.role || '');

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-lg">Bu sayfaya erişim yetkiniz yok.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative z-0 space-y-4 md:space-y-6">
      <div className="bg-white rounded-lg md:rounded-xl shadow-md p-3 md:p-6 relative">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 md:mb-6">
          <div className="flex items-center space-x-2 md:space-x-3">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />
            <h2 className="text-lg md:text-2xl font-bold text-gray-800">Kullanıcı Yönetimi</h2>
          </div>
          <div className="flex items-center gap-2">
            {branches.length > 1 && (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none"
                >
                  <option value="all">Tüm Şubeler</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => setShowAddUser(true)}
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 md:px-4 rounded-lg flex items-center space-x-1 md:space-x-2 transition shadow-md hover:shadow-lg text-sm md:text-base"
            >
              <Plus className="w-4 h-4 md:w-5 md:h-5" />
              <span>Yeni Kullanıcı</span>
            </button>
          </div>
        </div>

        {showAddUser && (
          <form onSubmit={handleAddUser} className="bg-gray-50 p-4 rounded-xl mb-6 border-2 border-orange-200">
            <h3 className="font-semibold text-lg mb-4">Yeni Kullanıcı Ekle</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
                <input
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kullanıcı Adı <span className="text-xs text-gray-400">(giriş için)</span>
                </label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="ör: garson1, ahmet"
                  required
                />
                {newUser.username && (
                  <p className="text-xs text-gray-400 mt-1">
                    Giriş: <span className="font-medium text-gray-600">{newUser.username.toLowerCase().replace(/[^a-z0-9]/g, '')}@{tenant?.id?.slice(0, 8)}.shefpos.local</span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={newUser.role_id}
                  onChange={(e) => setNewUser({ ...newUser, role_id: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">Rol Seçin</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Atandığı Şube</label>
                <select
                  value={newUser.branch_id}
                  onChange={(e) => setNewUser({ ...newUser, branch_id: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Şube Seçin (Opsiyonel)</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}{branch.is_main ? ' (Ana Şube)' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Kullanıcı yalnızca bu şubede giriş yapabilecek</p>
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUser.isWaiter}
                    onChange={(e) => setNewUser({ ...newUser, isWaiter: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Bu kullanıcı garson mudur?</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">Eğer evet ise, garson telefon numarası ve 4-haneli PIN'i belirleyin</p>
              </div>

              {newUser.isWaiter && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Garson Telefon Numarası</label>
                    <input
                      type="tel"
                      value={newUser.waiterPhone}
                      onChange={(e) => {
                        let digits = e.target.value.replace(/\D/g, '');
                        // Ensure it starts with 0 and has max 11 digits
                        if (digits.length > 11) digits = digits.slice(0, 11);
                        if (!digits.startsWith('0') && digits.length > 0) {
                          digits = '0' + digits;
                        }
                        setNewUser({ ...newUser, waiterPhone: digits });
                      }}
                      maxLength={11}
                      inputMode="numeric"
                      placeholder="05XXXXXXXXX"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Garson PIN (4 Hane)</label>
                    <input
                      type="password"
                      value={newUser.waiterPin}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setNewUser({ ...newUser, waiterPin: digits.slice(0, 4) });
                      }}
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="****"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 tracking-widest"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                type="button"
                onClick={() => { setShowAddUser(false); setNewUser({ username: '', full_name: '', password: '', role_id: '', branch_id: '' }); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                İptal
              </button>
              <button type="submit" disabled={addingUser} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition">
                {addingUser ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        )}

        <div className="md:hidden space-y-3">
          {users.map((u) => (
            <div key={u.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{u.full_name}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {u.email?.includes('.shefpos.local') ? `@${u.email.split('@')[0]}` : u.email}
                  </p>
                  {u.branches && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-orange-500" />
                      <span className="text-xs text-orange-600 font-medium">{u.branches.name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  {editingUser === u.id ? (
                    <>
                      <button onClick={() => handleUpdateUser(u.id)} className="text-green-600 hover:text-green-700 p-1.5 bg-green-50 rounded-lg transition">
                        <Save className="w-5 h-5" />
                      </button>
                      <button onClick={() => setEditingUser(null)} className="text-gray-600 p-1.5 bg-gray-100 rounded-lg transition">
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleToggleUserActive(u.id, (u as any).is_active === false)}
                        className={`p-1.5 rounded-lg transition ${((u as any).is_active === false) ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-amber-600 bg-amber-50 hover:bg-amber-100'}`}
                        title={(u as any).is_active === false ? 'Aktifleştir' : 'Pasife Al'}
                      >
                        {(u as any).is_active === false ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setPasswordModal(u)} className="text-gray-600 hover:text-orange-600 p-1.5 bg-gray-100 hover:bg-orange-50 rounded-lg transition" title="Şifre Değiştir">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => setIpLockModal(u)} className={`p-1.5 rounded-lg transition ${u.allowed_ips ? 'text-blue-600 bg-blue-50' : 'text-gray-400 bg-gray-100 hover:text-blue-600 hover:bg-blue-50'}`} title="IP Kilidi">
                        <Shield className="w-4 h-4" />
                      </button>
                      <button onClick={() => { setEditingUser(u.id); setSelectedRole(u.role_id || ''); setSelectedBranch(u.branch_id || ''); }} className="text-orange-600 hover:text-orange-700 p-1.5 bg-orange-50 rounded-lg transition">
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button onClick={() => setDeleteConfirm(u)} className="text-red-600 hover:text-red-700 p-1.5 bg-red-50 rounded-lg transition">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editingUser === u.id ? (
                <div className="space-y-2">
                  <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                    {roles.map((role) => (<option key={role.id} value={role.id}>{role.name}</option>))}
                  </select>
                  <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                    <option value="">Şube Atanmamış</option>
                    {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      {u.roles?.name || 'Atanmamış'}
                    </span>
                    {(u as any).is_active === false && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Pasif
                      </span>
                    )}
                    {u.allowed_ips && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        <ShieldCheck className="w-3 h-3" />
                        IP Kilitli
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(u.roles?.permissions as any)?.can_take_orders && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Sipariş</span>}
                    {(u.roles?.permissions as any)?.can_process_payments && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Ödeme</span>}
                    {(u.roles?.permissions as any)?.can_manage_products && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Ürün</span>}
                    {(u.roles?.permissions as any)?.can_manage_users && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Kullanıcı</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ad Soyad</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Kullanıcı Adı</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Şube</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Yetkiler</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    <div className="flex items-center gap-2">
                      {u.full_name}
                      {(u as any).is_active === false && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Pasif
                        </span>
                      )}
                      {u.allowed_ips && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          <ShieldCheck className="w-3 h-3" />
                          IP Kilitli
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {u.email?.includes('.shefpos.local') ? `@${u.email.split('@')[0]}` : u.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingUser === u.id ? (
                      <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm">
                        <option value="">Şube Yok</option>
                        {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                      </select>
                    ) : u.branches ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                        <MapPin className="w-3 h-3" />
                        {u.branches.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingUser === u.id ? (
                      <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
                        {roles.map((role) => (<option key={role.id} value={role.id}>{role.name}</option>))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                        {u.roles?.name || 'Atanmamış'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles?.permissions as any)?.can_take_orders && <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Sipariş</span>}
                      {(u.roles?.permissions as any)?.can_process_payments && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Ödeme</span>}
                      {(u.roles?.permissions as any)?.can_manage_products && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">Ürün</span>}
                      {(u.roles?.permissions as any)?.can_view_reports && <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs">Rapor</span>}
                      {(u.roles?.permissions as any)?.can_manage_users && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">Kullanıcı</span>}
                      {(u.roles?.permissions as any)?.can_manage_settings && <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">Ayarlar</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {editingUser === u.id ? (
                      <div className="flex justify-end space-x-2">
                        <button onClick={() => handleUpdateUser(u.id)} className="text-green-600 hover:text-green-700 transition"><Save className="w-5 h-5" /></button>
                        <button onClick={() => setEditingUser(null)} className="text-gray-600 hover:text-gray-700 transition"><X className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center space-x-1">
                        <button
                          onClick={() => handleToggleUserActive(u.id, (u as any).is_active === false)}
                          className={`p-1.5 rounded-lg transition ${((u as any).is_active === false) ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-amber-600 bg-amber-50 hover:bg-amber-100'}`}
                          title={(u as any).is_active === false ? 'Aktifleştir' : 'Pasife Al'}
                        >
                          {(u as any).is_active === false ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setPasswordModal(u)} className="text-gray-500 hover:text-orange-600 p-1.5 hover:bg-orange-50 rounded-lg transition" title="Şifre Değiştir">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => setIpLockModal(u)} className={`p-1.5 rounded-lg transition ${u.allowed_ips ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`} title="IP Kilidi">
                          <Shield className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingUser(u.id); setSelectedRole(u.role_id || ''); setSelectedBranch(u.branch_id || ''); }} className="text-orange-600 hover:text-orange-700 p-1.5 hover:bg-orange-50 rounded-lg transition">
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button onClick={() => setDeleteConfirm(u)} className="text-red-600 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Bu şubede kullanıcı bulunamadı</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <button
          onClick={() => setRolesExpanded(!rolesExpanded)}
          className="w-full flex items-center justify-between p-5 md:p-6 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg md:text-xl font-bold text-gray-800">Rol ve Yetki Yönetimi</h3>
            <span className="text-sm text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">{roles.length} rol</span>
          </div>
          {rolesExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {rolesExpanded && (
          <div className="px-5 pb-6 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {roles.map((role) => {
                const p = role.permissions as Record<string, unknown>;
                const enabledPerms = PERMISSION_DEFS.filter(d => p?.[d.key]);
                const disabledPerms = PERMISSION_DEFS.filter(d => !p?.[d.key]);

                return (
                  <div key={role.id} className="border-2 border-gray-200 rounded-2xl p-4 hover:border-orange-200 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h4 className="font-bold text-base text-gray-900">{role.name}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {enabledPerms.length} / {PERMISSION_DEFS.length} yetki aktif
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingRole(role)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Düzenle
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {enabledPerms.map(def => {
                        const c = colorMap[def.color] || colorMap.gray;
                        return (
                          <div key={def.key} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${c.bg} border ${c.border}`}>
                            <ToggleRight className={`w-4 h-4 flex-shrink-0 ${c.text}`} />
                            <span className={`text-xs font-medium ${c.text}`}>{def.label}</span>
                          </div>
                        );
                      })}
                      {disabledPerms.map(def => (
                        <div key={def.key} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50">
                          <ToggleLeft className="w-4 h-4 flex-shrink-0 text-gray-300" />
                          <span className="text-xs text-gray-400">{def.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {passwordModal && (
        <PasswordModal
          user={passwordModal}
          onClose={() => setPasswordModal(null)}
          onSave={handleChangePassword}
        />
      )}

      {ipLockModal && (
        <IpLockModal
          user={ipLockModal}
          onClose={() => setIpLockModal(null)}
          onSave={handleSaveIpLock}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          message={`"${deleteConfirm.full_name}" adlı kullanıcıyı silmek istediğinizden emin misiniz?`}
          onConfirm={() => handleDeleteUser(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {editingRole && (
        <RoleEditModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSave={handleSaveRole}
        />
      )}
    </div>
  );
}
