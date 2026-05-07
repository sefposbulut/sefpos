import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Eye, EyeOff, AlertCircle, RefreshCw, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { phoneToAuthEmail, pinToAuthPassword, getPhoneAuthEmailDomain } from '../lib/phoneAuthEmail';

interface Waiter {
  id: string;
  name: string;
  phone: string;
  pin: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export function WaiterManagement({ tenantId }: { tenantId: string }) {
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPin, setShowPin] = useState<{ [key: string]: boolean }>({});
  const [formData, setFormData] = useState({ name: '', phone: '', pin: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { profile } = useAuth();

  useEffect(() => {
    fetchWaiters();
  }, [tenantId]);

  const fetchWaiters = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('waiters')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setWaiters(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWaiter = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('Garson adı girin');
      return;
    }

    const cleaned = formData.phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setError('Geçerli bir telefon numarası girin');
      return;
    }

    if (formData.pin.length !== 4 || !/^\d+$/.test(formData.pin)) {
      setError('4 haneli PIN girin');
      return;
    }

    setSaving(true);
    try {
      const { data: inserted, error: err } = await supabase
        .from('waiters')
        .insert([
          {
            tenant_id: tenantId,
            name: formData.name.trim(),
            phone: cleaned,
            pin: formData.pin,
            status: 'active',
          },
        ])
        .select('id')
        .single();

      if (err) throw err;
      const newWaiterId = inserted?.id as string | undefined;
      if (!newWaiterId) throw new Error('Garson kaydı oluşturulamadı');

      // Auth: Edge Function (service role) — MX kaydı olmayan domain ile tarayıcı signUp çalışmaz.
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session?.access_token) {
          setError(
            'Garson kaydedildi ancak oturum bulunamadı; auth hesabı için çıkış yapıp tekrar yönetici olarak girin, ' +
              'veya `npm run edge:deploy:waiter-auth` ile create-waiter-auth fonksiyonunu yayınlayıp tekrar deneyin.',
          );
        } else {
          const { data: fnData, error: fnErr } = await supabase.functions.invoke<{
            success?: boolean;
            error?: string;
          }>('create-waiter-auth', {
            body: {
              waiter_id: newWaiterId,
              phone_auth_domain: getPhoneAuthEmailDomain(),
            },
          });
          if (fnErr) {
            throw new Error(fnErr.message || 'Edge fonksiyonu çağrılamadı');
          }
          if (!fnData?.success) {
            throw new Error(fnData?.error || 'Auth hesabı oluşturulamadı');
          }
        }
      } catch (authE: any) {
        const m = String(authE?.message || authE || '');
        const low = m.toLowerCase();
        if (low.includes('not found') || low.includes('404') || low.includes('failed to fetch')) {
          setError(
            'Garson kaydedildi. Auth hesabı için Edge Function gerekli: proje kökünde ' +
              '`npm run edge:deploy:waiter-auth` (veya Dashboard → Edge Functions → create-waiter-auth). ' +
              'Geçici: `node scripts/fix-waiter-auth.mjs`',
          );
        } else {
          // Edge başarısız → eski yol (MX varsa çalışır)
          try {
            const authEmail = phoneToAuthEmail(cleaned);
            const authPwd = pinToAuthPassword(formData.pin);
            const sub = await supabase.auth.signUp({
              email: authEmail,
              password: authPwd,
              options: { data: { full_name: formData.name.trim(), phone: cleaned, role: 'waiter' } },
            });
            if (sub.error) {
              const msg = (sub.error.message || '').toLowerCase();
              if (!msg.includes('already registered') && !msg.includes('already exists')) {
                setError(
                  'Garson kaydedildi; auth: ' +
                    (sub.error.message || 'bilinmeyen') +
                    '. Edge Function yayınlayın: `npm run edge:deploy:waiter-auth` veya `node scripts/fix-waiter-auth.mjs`.',
                );
              }
            }
          } catch {
            setError(
              'Garson kaydedildi; auth hesabı oluşturulamadı: ' +
                m +
                '. Çözüm: `npm run edge:deploy:waiter-auth` veya MX + VITE_PHONE_AUTH_EMAIL_DOMAIN.',
            );
          }
        }
      }

      setFormData({ name: '', phone: '', pin: '' });
      setShowForm(false);
      await fetchWaiters();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWaiter = async (id: string) => {
    if (!window.confirm('Bu garson hesabını silmek istediğinize emin misiniz?')) return;

    try {
      const { error: err } = await supabase.from('waiters').delete().eq('id', id);
      if (err) throw err;
      await fetchWaiters();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleStatus = async (waiter: Waiter) => {
    try {
      const { error: err } = await supabase
        .from('waiters')
        .update({ status: waiter.status === 'active' ? 'inactive' : 'active' })
        .eq('id', waiter.id);

      if (err) throw err;
      await fetchWaiters();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const canManage = profile?.role === 'owner' || profile?.role === 'manager';

  if (!canManage) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
        <AlertCircle className="inline w-4 h-4 mr-2" />
        Garson yönetimi için müdür veya müdür yardımcısı olmalısınız.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Garsonlar ({waiters.length})</h3>
        <div className="flex gap-2">
          <button
            onClick={fetchWaiters}
            disabled={loading}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Garson Ekle
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {showForm && (
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-slate-800">Yeni Garson Ekle</h4>
            <button
              onClick={() => {
                setShowForm(false);
                setFormData({ name: '', phone: '', pin: '' });
                setError('');
              }}
              className="text-slate-500 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddWaiter} className="space-y-3">
            <input
              type="text"
              placeholder="Garson Adı"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-orange-500"
            />

            <input
              type="tel"
              placeholder="Telefon Numarası"
              value={formData.phone}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                let formatted = '';
                if (digits.length <= 4) formatted = digits;
                else if (digits.length <= 7)
                  formatted = `${digits.slice(0, 4)} ${digits.slice(4)}`;
                else if (digits.length <= 9)
                  formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
                else
                  formatted = `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
                setFormData({ ...formData, phone: formatted });
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-orange-500"
            />

            <input
              type="password"
              placeholder="4 Haneli PIN"
              maxLength={4}
              value={formData.pin}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                setFormData({ ...formData, pin: digits.slice(0, 4) });
              }}
              inputMode="numeric"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-orange-500 tracking-widest"
            />

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-3 h-3 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Ekle
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
        </div>
      ) : waiters.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <p className="text-sm">Henüz garson kaydı yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {waiters.map((waiter) => (
            <div
              key={waiter.id}
              className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm">{waiter.name}</p>
                <p className="text-xs text-slate-500">{waiter.phone}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPin({ ...showPin, [waiter.id]: !showPin[waiter.id] })}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                  title={showPin[waiter.id] ? 'Gizle' : 'Göster'}
                >
                  {showPin[waiter.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>

                <div className="px-2 py-1 bg-slate-100 rounded text-xs font-mono min-w-8 text-center">
                  {showPin[waiter.id] ? waiter.pin : '****'}
                </div>

                <button
                  onClick={() => toggleStatus(waiter)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                    waiter.status === 'active'
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 hover:bg-red-200'
                  }`}
                >
                  {waiter.status === 'active' ? 'Aktif' : 'Pasif'}
                </button>

                <button
                  onClick={() => handleDeleteWaiter(waiter.id)}
                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
