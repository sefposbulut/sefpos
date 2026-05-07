import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getDeviceBindingCode } from '../lib/deviceBinding';
import { Trash2, RefreshCw, ShieldAlert, Smartphone, MapPin, Clock, ToggleRight, ToggleLeft, Plus, Key } from 'lucide-react';

interface DeviceRegistration {
  id: string;
  user_id: string;
  device_name: string;
  device_fingerprint: string;
  ip_address: string;
  is_active: boolean;
  last_seen: string;
  registered_at: string;
  profiles?: {
    full_name: string;
    email: string;
  };
}

interface DeviceBinding {
  id: string;
  device_id: string;
  tenant_id: string;
  waiter_id?: string;
  status: 'active' | 'inactive';
  registered_at: string;
  waiters?: {
    name: string;
    phone: string;
  };
}

interface Waiter {
  id: string;
  name: string;
  phone: string;
}

interface DeviceAccessLog {
  id: string;
  device_fingerprint: string;
  ip_address: string;
  user_id: string;
  access_type: 'allowed' | 'blocked_ip' | 'blocked_device' | 'blocked_inactive' | 'invalid_key';
  reason: string;
  timestamp: string;
}

interface BindingRequest {
  id: string;
  code: string;
  waiter_id: string;
  device_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  expires_at: string;
  waiters?: {
    name: string;
    phone: string;
  };
}

export function DeviceManagement() {
  const { tenant, profile } = useAuth();
  const [devices, setDevices] = useState<DeviceRegistration[]>([]);
  const [logs, setLogs] = useState<DeviceAccessLog[]>([]);
  const [bindings, setBindings] = useState<DeviceBinding[]>([]);
  const [requests, setRequests] = useState<BindingRequest[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'devices' | 'bindings' | 'logs'>('requests');
  const [toggling, setToggling] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [bindingError, setBindingError] = useState('');

  const syncLegacyWaiterStatus = async (waiterId: string, status: 'active' | 'inactive') => {
    if (!tenant?.id) return;
    // Legacy-only table; ignore errors on schemas that only use profiles.
    await supabase
      .from('waiters')
      .update({ status })
      .eq('tenant_id', tenant.id)
      .eq('id', waiterId)
      .then(() => {})
      .catch(() => {});
  };

  const loadDevices = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('device_registrations')
        .select(`
          *,
          profiles:user_id(full_name, email)
        `)
        .eq('tenant_id', tenant.id)
        .order('last_seen', { ascending: false });

      if (error) throw error;
      setDevices((data || []) as any);
    } catch (e) {
      console.error('Error loading devices:', e);
    }
  };

  const loadBindings = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('device_bindings')
        .select(`
          *,
          waiters(name, phone)
        `)
        .eq('tenant_id', tenant.id)
        .order('registered_at', { ascending: false });

      if (error) throw error;
      setBindings((data || []) as any);
    } catch (e) {
      console.error('Error loading bindings:', e);
    }
  };

  const loadWaiters = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('waiters')
        .select('id, name, phone')
        .eq('tenant_id', tenant.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setWaiters((data || []) as any);
    } catch (e) {
      // Newer schemas may not have `waiters`; fall back to `profiles`.
      try {
        const { data: profileWaiters, error: profileErr } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role')
          .eq('tenant_id', tenant.id)
          .in('role', ['waiter', 'courier']);

        if (profileErr) throw profileErr;
        const mapped = (profileWaiters || []).map((p: any) => ({
          id: p.id,
          name: p.full_name || (p.phone ? `Garson (${p.phone})` : 'Garson'),
          phone: p.phone || '',
        }));
        setWaiters(mapped);
      } catch (fallbackErr) {
        console.error('Error loading waiters/profiles:', fallbackErr);
      }
    }
  };

  const loadRequests = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('device_binding_requests')
        .select(`
          *,
          waiters(name, phone)
        `)
        .eq('tenant_id', tenant.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests((data || []) as any);
    } catch (e) {
      console.error('Error loading requests:', e);
    }
  };

  const acceptRequest = async (requestId: string, waiterId: string, deviceId: string) => {
    if (!tenant) return;
    setToggling(requestId);
    try {
      const { data: reqData, error: reqErr } = await supabase
        .from('device_binding_requests')
        .select('device_info')
        .eq('id', requestId)
        .maybeSingle();
      if (reqErr) throw reqErr;

      const di: any = (reqData as any)?.device_info || {};
      const allowedIpPrefix = String(di.ipPrefix || di.ip_prefix || '').trim() || null;

      // Update request to accepted
      const { error: updateError } = await supabase
        .from('device_binding_requests')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Create-or-activate device binding (idempotent for unique_waiter_device)
      const { data: existingBinding, error: existingErr } = await supabase
        .from('device_bindings')
        .select('id, status')
        .eq('waiter_id', waiterId)
        .eq('device_id', deviceId)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existingBinding?.id) {
        const { error: activateErr } = await supabase
          .from('device_bindings')
          .update({
            status: 'active',
            tenant_id: tenant.id,
            ...(allowedIpPrefix ? { allowed_ip_prefix: allowedIpPrefix } : {}),
          })
          .eq('id', existingBinding.id);
        if (activateErr) throw activateErr;
      } else {
        const { error: bindError } = await supabase
          .from('device_bindings')
          .insert({
            device_id: deviceId,
            waiter_id: waiterId,
            tenant_id: tenant.id,
            status: 'active',
            ...(allowedIpPrefix ? { allowed_ip_prefix: allowedIpPrefix } : {}),
          });
        if (bindError) throw bindError;
      }

      await loadRequests();
      await loadBindings();
    } catch (e: any) {
      console.error('Error accepting request:', e);
      alert(e.message || 'Hata oluştu');
    } finally {
      setToggling(null);
    }
  };

  const rejectRequest = async (requestId: string) => {
    if (!confirm('İsteği reddetmek istediğinizden emin misiniz?')) return;
    setToggling(requestId);
    try {
      const { error } = await supabase
        .from('device_binding_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) throw error;
      await loadRequests();
    } catch (e: any) {
      console.error('Error rejecting request:', e);
      alert(e.message || 'Hata oluştu');
    } finally {
      setToggling(null);
    }
  };

  const loadLogs = async () => {
    if (!tenant) return;
    try {
      const { data, error } = await supabase
        .from('device_access_logs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data || []) as any);
    } catch (e) {
      console.error('Error loading logs:', e);
    }
  };

  const bindDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setBindingError('');

    const codeInput = deviceId.trim().toUpperCase();
    if (!codeInput) {
      setBindingError('Cihaz bağlama kodunu girin');
      return;
    }

    if (codeInput.length !== 6) {
      setBindingError('Kod 6 karakterden oluşmalıdır');
      return;
    }

    if (!waiterId) {
      setBindingError('Garson seçin');
      return;
    }

    if (!tenant) {
      setBindingError('İşletme bilgisi bulunamadı');
      return;
    }

    try {
      const { error } = await supabase
        .from('device_bindings')
        .insert({
          device_id: codeInput,
          waiter_id: waiterId,
          tenant_id: tenant.id,
          status: 'active',
        });

      if (error) throw error;
      setDeviceId('');
      setWaiterId('');
      await loadBindings();
    } catch (err: any) {
      setBindingError(err.message || 'Bağlama başarısız');
    }
  };

  const deleteBinding = async (id: string) => {
    if (!confirm('Bu cihaz bağlamasını kaldırmak istediğinizden emin misiniz?')) return;

    try {
      const binding = bindings.find(b => b.id === id);
      let query = supabase
        .from('device_bindings')
        .delete()
        .eq('tenant_id', tenant?.id || '');

      // Delete all duplicate rows for same waiter/device pair to prevent resurrection.
      if (binding?.waiter_id && binding?.device_id) {
        query = query.eq('waiter_id', binding.waiter_id).eq('device_id', binding.device_id);
      } else {
        query = query.eq('id', id);
      }

      const { error } = await query;

      if (error) throw error;

      // If waiter has no more active devices, mark waiter inactive.
      if (binding?.waiter_id && tenant?.id) {
        const { data: activeForWaiter } = await supabase
          .from('device_bindings')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('waiter_id', binding.waiter_id)
          .eq('status', 'active')
          .limit(1);

        if (!activeForWaiter || activeForWaiter.length === 0) {
          await syncLegacyWaiterStatus(binding.waiter_id, 'inactive');
        }
      }

      await loadBindings();
      await loadWaiters();
    } catch (e) {
      console.error('Error deleting binding:', e);
      alert((e as Error).message || 'Bağlama silinemedi');
    }
  };

  const toggleBindingStatus = async (id: string, currentStatus: string) => {
    setToggling(id);
    try {
      const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const binding = bindings.find(b => b.id === id);
      let query = supabase
        .from('device_bindings')
        .update({ status: nextStatus })
        .eq('tenant_id', tenant?.id || '');

      // Update all duplicate rows for same waiter/device pair.
      if (binding?.waiter_id && binding?.device_id) {
        query = query.eq('waiter_id', binding.waiter_id).eq('device_id', binding.device_id);
      } else {
        query = query.eq('id', id);
      }

      const { error } = await query;

      if (error) throw error;

      // When disabling, also close device requests so approval polling can't resurrect access.
      if (nextStatus === 'inactive' && binding?.waiter_id && tenant?.id) {
        await supabase
          .from('device_binding_requests')
          .update({ status: 'rejected' })
          .eq('tenant_id', tenant.id)
          .eq('waiter_id', binding.waiter_id)
          .eq('device_id', binding.device_id)
          .in('status', ['pending', 'accepted']);
      }

      // Keep waiter status synchronized with binding state.
      if (binding?.waiter_id && tenant?.id) {
        if (nextStatus === 'active') {
          await syncLegacyWaiterStatus(binding.waiter_id, 'active');
        } else {
          const { data: activeForWaiter } = await supabase
            .from('device_bindings')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('waiter_id', binding.waiter_id)
            .eq('status', 'active')
            .neq('id', id)
            .limit(1);

          if (!activeForWaiter || activeForWaiter.length === 0) {
            await syncLegacyWaiterStatus(binding.waiter_id, 'inactive');
          }
        }
      }

      await loadBindings();
      await loadWaiters();
    } catch (e) {
      console.error('Error toggling binding:', e);
      alert((e as Error).message || 'Durum güncellenemedi');
    } finally {
      setToggling(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDevices(), loadBindings(), loadLogs(), loadWaiters(), loadRequests()]).finally(() => setLoading(false));
  }, [tenant]);

  useEffect(() => {
    if (activeTab === 'requests') {
      const interval = setInterval(loadRequests, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, tenant]);

  const toggleDeviceStatus = async (deviceId: string, currentStatus: boolean) => {
    setToggling(deviceId);
    try {
      const { error } = await supabase
        .from('device_registrations')
        .update({ is_active: !currentStatus })
        .eq('id', deviceId)
        .eq('tenant_id', tenant?.id || '');

      if (error) throw error;
      await loadDevices();
    } catch (e) {
      console.error('Error toggling device:', e);
      alert((e as Error).message || 'Cihaz durumu güncellenemedi');
    } finally {
      setToggling(null);
    }
  };

  const deleteDevice = async (deviceId: string) => {
    if (!confirm('Bu cihazı silmek istediğinizden emin misiniz?')) return;

    try {
      const { error } = await supabase
        .from('device_registrations')
        .delete()
        .eq('id', deviceId)
        .eq('tenant_id', tenant?.id || '');

      if (error) throw error;
      await loadDevices();
    } catch (e) {
      console.error('Error deleting device:', e);
      alert((e as Error).message || 'Cihaz silinemedi');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('tr-TR');
  };

  const getAccessTypeColor = (type: string) => {
    switch (type) {
      case 'allowed':
        return 'text-green-600 bg-green-50';
      case 'blocked_ip':
        return 'text-orange-600 bg-orange-50';
      case 'blocked_device':
        return 'text-red-600 bg-red-50';
      case 'invalid_key':
        return 'text-red-600 bg-red-50';
      case 'blocked_inactive':
        return 'text-slate-600 bg-slate-50';
      default:
        return 'text-slate-600 bg-slate-50';
    }
  };

  const getAccessTypeLabel = (type: string) => {
    switch (type) {
      case 'allowed':
        return 'İzin Verildi';
      case 'blocked_ip':
        return 'IP Blocked';
      case 'blocked_device':
        return 'Cihaz Blocked';
      case 'invalid_key':
        return 'Geçersiz Key';
      case 'blocked_inactive':
        return 'Cihaz Pasif';
      default:
        return type;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Yükleniyor...</div>;
  }

  if (!tenant || !profile) {
    return <div className="text-center py-8 text-red-500">İşletme bilgisi bulunamadı</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-3 font-medium transition border-b-2 whitespace-nowrap ${
            activeTab === 'requests'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Key className="w-4 h-4 inline mr-2" />
          İstekler ({requests.length})
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-3 font-medium transition border-b-2 whitespace-nowrap ${
            activeTab === 'devices'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4 inline mr-2" />
          Cihazlar ({devices.length})
        </button>
        <button
          onClick={() => setActiveTab('bindings')}
          className={`px-4 py-3 font-medium transition border-b-2 whitespace-nowrap ${
            activeTab === 'bindings'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4 inline mr-2" />
          Garson Cihazları ({bindings.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-3 font-medium transition border-b-2 whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4 inline mr-2" />
          Erişim Logları
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl">
              <Key className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">Bekleyen istek yok</p>
            </div>
          ) : (
            requests.map((req) => {
              const isExpired = new Date(req.expires_at) < new Date();
              return (
                <div
                  key={req.id}
                  className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Key className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {req.waiters?.name || 'Bilinmeyen Garson'}
                          </p>
                          <p className="text-sm text-slate-500">
                            {req.waiters?.phone || ''}
                          </p>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-lg px-3 py-2 inline-block mt-2">
                        <p className="text-xs text-slate-500 mb-1">Bağlama Kodu:</p>
                        <code className="text-lg font-mono font-bold text-slate-900 tracking-widest">
                          {req.code}
                        </code>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        İstek: {formatDate(req.created_at)}
                        {isExpired && (
                          <span className="text-red-600 font-semibold ml-2">Süresi Doldu</span>
                        )}
                      </p>
                    </div>

                    {!isExpired && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptRequest(req.id, req.waiter_id, req.device_id)}
                          disabled={toggling === req.id}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
                        >
                          {toggling === req.id ? 'İşleniyor...' : 'Kabul Et'}
                        </button>
                        <button
                          onClick={() => rejectRequest(req.id)}
                          disabled={toggling === req.id}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
                        >
                          Reddet
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'devices' && (
        <div className="space-y-4">
          {devices.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl">
              <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">Kayıtlı cihaz yok</p>
            </div>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone className="w-4 h-4 text-slate-400" />
                      <h3 className="font-semibold text-slate-900">{device.device_name}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          device.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {device.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium min-w-24">Kullanıcı:</span>
                        {device.profiles ? (
                          <span>
                            {device.profiles.full_name} ({device.profiles.email})
                          </span>
                        ) : (
                          <span className="text-slate-400">Bilinmiyor</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span className="font-medium min-w-24">IP Adresi:</span>
                        <code className="bg-slate-100 px-2 py-1 rounded text-xs">
                          {device.ip_address}
                        </code>
                      </div>

                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="font-medium min-w-24">Son Görülme:</span>
                        {formatDate(device.last_seen)}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <span className="font-medium min-w-24 text-xs">Kayıt Tarihi:</span>
                        <span className="text-xs text-slate-500">
                          {formatDate(device.registered_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleDeviceStatus(device.id, device.is_active)}
                      disabled={toggling === device.id}
                      className={`p-2 rounded-lg transition ${
                        device.is_active
                          ? 'bg-green-100 text-green-600 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      } disabled:opacity-50`}
                      title={device.is_active ? 'Deaktif Et' : 'Aktif Et'}
                    >
                      {device.is_active ? (
                        <ToggleRight className="w-5 h-5" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteDevice(device.id)}
                      className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                      title="Sil"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'bindings' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 mb-3">Garson Cihazı Bağla</h3>
            <form onSubmit={bindDevice} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Garson
                </label>
                <select
                  value={waiterId}
                  onChange={(e) => setWaiterId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Garson Seçin --</option>
                  {waiters.map((waiter) => (
                    <option key={waiter.id} value={waiter.id}>
                      {waiter.name} ({waiter.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Cihaz Bağlama Kodu
                </label>
                <p className="text-xs text-slate-600 mb-2">
                  Garson giriş ekranında "Cihaz Bağlama Kodu" butonundan kodu almasını isteyin
                </p>
                <input
                  type="text"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                  placeholder="ör: A1B2C3"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono tracking-widest uppercase text-center text-lg"
                />
              </div>
              <button
                type="submit"
                disabled={!deviceId.trim() || !waiterId}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Cihazı Bağla
              </button>
            </form>
            {bindingError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {bindingError}
              </div>
            )}
          </div>

          {bindings.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl">
              <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">Bağlı garson cihazı yok</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bindings.map((binding) => (
                <div
                  key={binding.id}
                  className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className="w-4 h-4 text-slate-400" />
                          <code className="bg-slate-100 px-2 py-1 rounded text-sm font-mono">
                            {binding.device_id}
                          </code>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              binding.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {binding.status === 'active' ? 'Aktif' : 'Pasif'}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-slate-700">
                          Garson: {binding.waiters?.name || 'Bilinmiyor'}
                        </div>
                        <div className="text-xs text-slate-500">
                          Bağlanma: {formatDate(binding.registered_at)}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleBindingStatus(binding.id, binding.status)}
                        disabled={toggling === binding.id}
                        className={`p-2 rounded-lg transition ${
                          binding.status === 'active'
                            ? 'bg-green-100 text-green-600 hover:bg-green-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        } disabled:opacity-50`}
                        title={binding.status === 'active' ? 'Deaktif Et' : 'Aktif Et'}
                      >
                        {binding.status === 'active' ? (
                          <ToggleRight className="w-4 h-4" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteBinding(binding.id)}
                        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => loadLogs()}
              className="px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Yenile
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl">
              <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">Erişim kaydı yok</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg text-sm border ${getAccessTypeColor(log.access_type)}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">
                      {getAccessTypeLabel(log.access_type)}
                    </span>
                    <span className="text-xs opacity-75">
                      {formatDate(log.timestamp)}
                    </span>
                  </div>
                  <div className="space-y-0.5 opacity-90">
                    <div>
                      <span className="font-medium">IP:</span> {log.ip_address}
                    </div>
                    {log.reason && (
                      <div>
                        <span className="font-medium">Nedeni:</span> {log.reason}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
