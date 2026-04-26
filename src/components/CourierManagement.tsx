import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Bike, Plus, Trash2, Save, X, Phone, ChevronLeft, CreditCard as Edit3, ToggleLeft, ToggleRight, CheckCircle } from 'lucide-react';
import { Courier } from './TakeawayOrders';

interface CourierManagementProps {
  onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; dot: string }> = {
  available: { label: 'Müsait', dot: 'bg-green-500' },
  busy: { label: 'Meşgul', dot: 'bg-orange-500' },
  offline: { label: 'Çevrimdışı', dot: 'bg-gray-400' },
};

export function CourierManagement({ onClose }: CourierManagementProps) {
  const { tenant, activeBranch } = useAuth();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const loadCouriers = async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('couriers')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('is_active', { ascending: false })
      .order('full_name');
    if (data) setCouriers(data as Courier[]);
    setLoading(false);
  };

  useEffect(() => { loadCouriers(); }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;
    if (!name.trim()) { alert('İsim zorunludur'); return; }
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
      alert('PIN 4-6 haneli sayısal olmalıdır');
      return;
    }
    setSaving(true);

    const cleanedPhone = phone.replace(/\D/g, '');

    if (editingId) {
      const updates: Record<string, any> = { full_name: name.trim(), phone: cleanedPhone };
      if (pin) updates.pin_code = pin;
      const { error } = await supabase.from('couriers').update(updates).eq('id', editingId);
      if (error) { alert('Hata: ' + error.message); setSaving(false); return; }
      setSavedId(editingId);
      setTimeout(() => setSavedId(null), 2000);
      setEditingId(null);
    } else {
      const { error } = await supabase.from('couriers').insert({
        tenant_id: tenant.id,
        branch_id: activeBranch?.id || null,
        full_name: name.trim(),
        phone: cleanedPhone,
        pin_code: pin || null,
        status: 'available',
        is_active: true,
      });
      if (error) { alert('Hata: ' + error.message); setSaving(false); return; }
      setShowForm(false);
    }

    setName('');
    setPhone('');
    setPin('');
    setSaving(false);
    loadCouriers();
  };

  const handleToggleActive = async (courier: Courier) => {
    await supabase.from('couriers').update({ is_active: !courier.is_active }).eq('id', courier.id);
    loadCouriers();
  };

  const handleSetStatus = async (courierId: string, status: string) => {
    await supabase.from('couriers').update({ status }).eq('id', courierId);
    loadCouriers();
  };

  const handleDelete = async (courierId: string) => {
    if (!confirm('Bu kuryeyi silmek istediğinizden emin misiniz?')) return;
    await supabase.from('couriers').delete().eq('id', courierId);
    loadCouriers();
  };

  const startEdit = (c: Courier) => {
    setEditingId(c.id);
    setName(c.full_name);
    setPhone(c.phone || '');
    setPin((c as any).pin_code || '');
    setShowForm(false);
  };

  const activeCouriers = couriers.filter(c => c.is_active);
  const inactiveCouriers = couriers.filter(c => !c.is_active);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white shadow-md border-b border-slate-200 px-4 py-3 md:px-6 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition">
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl">
          <Bike className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-black text-slate-800">Kurye Yönetimi</h1>
          <p className="text-xs text-slate-500">{activeCouriers.length} aktif kurye</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setName(''); setPhone(''); setPin(''); }}
          className="flex items-center gap-1.5 px-3 py-2.5 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> Kurye Ekle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {showForm && (
            <div className="bg-white rounded-xl border-2 border-blue-200 p-5 space-y-3 shadow-md">
              <h3 className="font-bold text-slate-800">Yeni Kurye</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Ad Soyad *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Kurye adı"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="05XX XXX XX XX"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Kurye PIN (4-6 hane)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Örn: 1234"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold text-sm transition active:scale-95"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
                  Ekle
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-sm transition active:scale-95"
                >
                  İptal
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {activeCouriers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-600">Aktif Kuryeler ({activeCouriers.length})</h3>
                  {activeCouriers.map(courier => (
                    <CourierCard
                      key={courier.id}
                      courier={courier}
                      isEditing={editingId === courier.id}
                      editName={name}
                      editPhone={phone}
                      editPin={pin}
                      setEditName={setName}
                      setEditPhone={setPhone}
                      setEditPin={setPin}
                      savedId={savedId}
                      saving={saving}
                      onSave={handleSave}
                      onCancelEdit={() => { setEditingId(null); setName(''); setPhone(''); setPin(''); }}
                      onStartEdit={() => startEdit(courier)}
                      onToggleActive={() => handleToggleActive(courier)}
                      onSetStatus={(status) => handleSetStatus(courier.id, status)}
                      onDelete={() => handleDelete(courier.id)}
                    />
                  ))}
                </div>
              )}

              {inactiveCouriers.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-400">Pasif Kuryeler ({inactiveCouriers.length})</h3>
                  {inactiveCouriers.map(courier => (
                    <CourierCard
                      key={courier.id}
                      courier={courier}
                      isEditing={editingId === courier.id}
                      editName={name}
                      editPhone={phone}
                      editPin={pin}
                      setEditName={setName}
                      setEditPhone={setPhone}
                      setEditPin={setPin}
                      savedId={savedId}
                      saving={saving}
                      onSave={handleSave}
                      onCancelEdit={() => { setEditingId(null); setName(''); setPhone(''); setPin(''); }}
                      onStartEdit={() => startEdit(courier)}
                      onToggleActive={() => handleToggleActive(courier)}
                      onSetStatus={(status) => handleSetStatus(courier.id, status)}
                      onDelete={() => handleDelete(courier.id)}
                    />
                  ))}
                </div>
              )}

              {couriers.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                  <Bike className="w-14 h-14 mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">Henüz kurye eklenmedi</p>
                  <p className="text-xs mt-1">Yukarıdaki butona tıklayarak kurye ekleyebilirsiniz</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface CourierCardProps {
  courier: Courier;
  isEditing: boolean;
  editName: string;
  editPhone: string;
  editPin: string;
  setEditName: (v: string) => void;
  setEditPhone: (v: string) => void;
  setEditPin: (v: string) => void;
  savedId: string | null;
  saving: boolean;
  onSave: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onToggleActive: () => void;
  onSetStatus: (status: string) => void;
  onDelete: () => void;
}

function CourierCard({
  courier, isEditing, editName, editPhone, editPin, setEditName, setEditPhone, setEditPin,
  savedId, saving, onSave, onCancelEdit, onStartEdit, onToggleActive, onSetStatus, onDelete
}: CourierCardProps) {
  const statusInfo = STATUS_LABELS[courier.status] || STATUS_LABELS.offline;
  const isSaved = savedId === courier.id;

  return (
    <div className={`bg-white rounded-xl border-2 p-4 transition ${courier.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
      {isEditing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Ad Soyad"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="tel"
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              placeholder="Telefon"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={editPin}
              onChange={e => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="PIN (4-6 hane)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition ${isSaved ? 'bg-green-500 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
            >
              {isSaved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isSaved ? 'Kaydedildi' : 'Kaydet'}
            </button>
            <button onClick={onCancelEdit} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-sm transition">
              İptal
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${courier.is_active ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <Bike className={`w-5 h-5 ${courier.is_active ? 'text-blue-600' : 'text-slate-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800">{courier.full_name}</span>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                  <span className="text-xs text-slate-500">{statusInfo.label}</span>
                </div>
              </div>
              {courier.phone && (
                <a href={`tel:${courier.phone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {courier.phone}
                </a>
              )}
              {(courier as any).pin_code && (
                <span className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">PIN: {(courier as any).pin_code}</span>
                </span>
              )}
              {courier.is_active && (
                <div className="flex gap-1 mt-2">
                  {(['available', 'busy', 'offline'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => onSetStatus(s)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition ${courier.status === s ? `${s === 'available' ? 'bg-green-500' : s === 'busy' ? 'bg-orange-500' : 'bg-gray-500'} text-white` : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {STATUS_LABELS[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={onStartEdit} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition">
              <Edit3 className="w-4 h-4" />
            </button>
            <button onClick={onToggleActive} className={`p-2 rounded-lg transition ${courier.is_active ? 'text-green-600 hover:bg-green-50' : 'text-slate-400 hover:bg-slate-50'}`}>
              {courier.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <button onClick={onDelete} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
