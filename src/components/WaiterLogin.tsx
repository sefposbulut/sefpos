import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getDeviceBindingCode } from '../lib/deviceBinding';
import { Phone, Lock, ArrowRight, Sparkles, LogOut, Key, Copy, Check } from 'lucide-react';

interface Waiter {
  id: string;
  name: string;
  tenant_id: string;
}

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  if (digits.length <= 9) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`;
};

export function WaiterLogin({ onLoginSuccess, onBack }: { onLoginSuccess: (waiter: Waiter) => void; onBack: () => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBindingInfo, setShowBindingInfo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bindingRequested, setBindingRequested] = useState(false);

  const requestBinding = async (waiterId: string, tenantId: string) => {
    try {
      // Generate random 6-char code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const deviceCode = getDeviceBindingCode();

      // Create binding request
      const { data: requestData, error: insertError } = await supabase
        .from('device_binding_requests')
        .insert({
          code: code,
          waiter_id: waiterId,
          tenant_id: tenantId,
          device_id: deviceCode,
          device_info: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        })
        .select();

      if (insertError) {
        console.error('Insert error:', insertError);
        if (insertError.message?.includes('duplicate')) {
          setError('Bağlama isteğiniz zaten gönderildi. Yöneticiyi bekleyin.');
        } else {
          setError(insertError.message || 'Bağlama isteği gönderilemedi');
        }
        return false;
      }

      console.log('Binding request created successfully:', requestData);

      // Auto-accept: create device binding immediately
      const { error: bindingError } = await supabase
        .from('device_bindings')
        .insert({
          device_id: deviceCode,
          waiter_id: waiterId,
          tenant_id: tenantId,
          status: 'active',
          device_info: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
          },
        });

      if (bindingError) {
        console.error('Device binding error (non-critical):', bindingError);
      }

      localStorage.setItem('binding_request_code', code);
      localStorage.setItem('binding_request_time', Date.now().toString());
      setBindingRequested(true);
      return true;
    } catch (err: any) {
      setError(err.message || 'Hata oluştu');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phone.trim()) {
      setError('Telefon numarası girin');
      return;
    }

    if (!pin.trim() || pin.length !== 4) {
      setError('4 haneli PIN girin');
      return;
    }

    setLoading(true);
    try {
      let phoneToSearch = phone.replace(/\D/g, '');
      // Ensure phone starts with 0
      if (!phoneToSearch.startsWith('0')) {
        phoneToSearch = '0' + phoneToSearch;
      }
      // Limit to 11 digits
      phoneToSearch = phoneToSearch.slice(0, 11);

      const { data: waiter, error: queryError } = await supabase
        .from('waiters')
        .select('id, name, tenant_id, pin, status')
        .eq('phone', phoneToSearch)
        .maybeSingle();

      if (queryError) throw queryError;
      if (!waiter) {
        setError('Garson bulunamadı');
        setLoading(false);
        return;
      }

      if (waiter.status !== 'active') {
        setError('Bu garson hesabı deaktif');
        setLoading(false);
        return;
      }

      if (waiter.pin !== pin) {
        setError('PIN hatalı');
        setLoading(false);
        return;
      }

      // Get device binding code
      const deviceCode = getDeviceBindingCode();

      // Check if device is already bound to this waiter
      const { data: deviceBinding } = await supabase
        .from('device_bindings')
        .select('id, status')
        .eq('device_id', deviceCode)
        .eq('waiter_id', waiter.id)
        .eq('status', 'active')
        .maybeSingle();

      if (deviceBinding) {
        // Device already bound - login successful
        localStorage.setItem('waiter_session', JSON.stringify({
          id: waiter.id,
          name: waiter.name,
          phone: cleaned,
          tenant_id: waiter.tenant_id,
          loginTime: new Date().toISOString(),
        }));

        onLoginSuccess({
          id: waiter.id,
          name: waiter.name,
          tenant_id: waiter.tenant_id,
        });
        return;
      }

      // Device not bound - request binding
      const requested = await requestBinding(waiter.id, waiter.tenant_id);
      if (!requested) {
        console.error('Binding request failed with error:', error);
        setLoading(false);
        return;
      }

      // Binding request successful - set session and login
      localStorage.setItem('waiter_session', JSON.stringify({
        id: waiter.id,
        name: waiter.name,
        phone: phoneToSearch,
        tenant_id: waiter.tenant_id,
        loginTime: new Date().toISOString(),
      }));

      onLoginSuccess({
        id: waiter.id,
        name: waiter.name,
        tenant_id: waiter.tenant_id,
      });

      // Clear form
      setPhone('');
      setPin('');
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -right-40 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">ŞefPOS</h1>
              <p className="text-xs text-slate-400">Garson Giriş</p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4 text-orange-500" />
            Geri
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          {bindingRequested ? (
            <div className="text-center">
              <div className="mb-8">
                <div className="w-16 h-16 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Key className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Bağlama İsteği Gönderildi!</h2>
                <p className="text-slate-300 mb-6">
                  Yönetici cihazınızı kabul ettikten sonra giriş yapabileceksiniz.
                </p>

                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
                  <p className="text-xs text-slate-400 mb-2">Bekleme Süresi</p>
                  <p className="text-sm text-slate-300">
                    Lütfen yönetici ile iletişime geçin ve cihazı kabul etmelerini isteyin.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setBindingRequested(false);
                    setError('');
                  }}
                  className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition"
                >
                  Geri Dön
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Garson Girişi</h2>
                <p className="text-slate-400">Telefon numarası ve PIN ile giriş yapın</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value;
                  const digits = val.replace(/\D/g, '');
                  if (digits === '' || /^\d+$/.test(digits)) {
                    setPhone(formatPhone(val));
                  }
                }}
                placeholder="Telefon Numarası"
                autoComplete="tel"
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500"
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val.slice(0, 4));
                }}
                placeholder="4 Haneli PIN"
                autoComplete="off"
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 hover:border-slate-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 rounded-lg outline-none text-white text-sm transition-all placeholder:text-slate-500 tracking-widest"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i < pin.length ? 'bg-orange-500' : 'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-all duration-200 flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-orange-200 border-t-white rounded-full animate-spin" />
                  Kontrol ediliyor...
                </>
              ) : (
                <>
                  Giriş Yap
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
              </button>
            </form>

            <div className="space-y-3">
              {showBindingInfo && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-green-400 font-medium">Bağlama isteği gönderildi!</p>
                  <p className="text-xs text-green-300">
                    Yönetici bağlama kodunuzu kabul ettikten sonra giriş yapabileceksiniz.
                  </p>
                  <p className="text-xs text-green-400 font-mono tracking-widest">
                    Bekleniyor...
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowBindingInfo(!showBindingInfo);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition text-sm"
              >
                <Key className="w-4 h-4" />
                {showBindingInfo ? 'Kapat' : 'Bağlama İste'}
              </button>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-400">
                <p className="font-semibold mb-1">Garson hesabı yok mu?</p>
                <p className="text-xs">Müdür veya müdür yardımcısından garson hesabı açılması isteyin.</p>
              </div>
            </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-sm text-slate-500">
          <p>© 2026 ŞefPOS. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
}
