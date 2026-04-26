import { useState } from 'react';
import { registerDevice, validateDeviceAccess } from '../lib/deviceBinding';
import { Copy, CheckCircle, AlertCircle } from 'lucide-react';

interface DeviceBindingModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  userRole?: string;
}

export function DeviceBindingModal({ isOpen, onDismiss, userRole }: DeviceBindingModalProps) {
  const [step, setStep] = useState<'check' | 'register' | 'success' | 'error'>('check');
  const [deviceName, setDeviceName] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Sadece garsonlar için device binding
  if (userRole && !['waiter', 'courier'].includes(userRole)) {
    return null;
  }

  const handleCheckDevice = async () => {
    setLoading(true);
    const result = await validateDeviceAccess();

    if (result.allowed) {
      setStep('success');
    } else if (result.register_required) {
      setStep('register');
    } else {
      setErrorMessage(result.reason || 'Cihaz doğrulaması başarısız oldu');
      setStep('error');
    }
    setLoading(false);
  };

  const handleRegisterDevice = async () => {
    if (!deviceName.trim()) {
      setErrorMessage('Lütfen cihaz adını girin');
      return;
    }

    setLoading(true);
    const result = await registerDevice(deviceName.trim());

    if (result.success && result.encryptionKey) {
      setEncryptionKey(result.encryptionKey);
      setStep('success');
    } else {
      setErrorMessage(result.error || 'Cihaz kaydı başarısız oldu');
      setStep('error');
    }
    setLoading(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Copy failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {step === 'check' && (
          <>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Cihaz Doğrulaması</h2>
            <p className="text-sm text-slate-500 mb-6">
              Güvenliğiniz için, bu cihazın kayıtlı olduğunu kontrol ediyoruz...
            </p>
            <button
              onClick={handleCheckDevice}
              disabled={loading}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {loading ? 'Kontrol ediliyor...' : 'Devam Et'}
            </button>
          </>
        )}

        {step === 'register' && (
          <>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Cihazı Kaydet</h2>
            <p className="text-sm text-slate-500 mb-4">
              Bu cihaz henüz kayıtlı değil. Sisteme erişim için cihazını kaydetmen gerekiyor.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Cihaz Adı (örn: "Garson PC 1")
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Cihaz adını girin"
                className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:border-orange-400 outline-none text-sm"
              />
            </div>
            <button
              onClick={handleRegisterDevice}
              disabled={loading || !deviceName.trim()}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {loading ? 'Kaydediliyor...' : 'Cihazı Kaydet'}
            </button>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">
              {encryptionKey ? 'Cihaz Başarıyla Kaydedildi' : 'Cihaz Doğrulandı'}
            </h2>

            {encryptionKey && (
              <>
                <p className="text-sm text-slate-500 mb-4 text-center">
                  Encryption anahtarını güvenli bir yerde saklayın. Cihaz değiştirilirse bu anahtara ihtiyacınız olacak.
                </p>
                <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-200">
                  <div className="flex items-center justify-between gap-2 font-mono text-xs text-slate-600 break-all">
                    <span>{encryptionKey}</span>
                    <button
                      onClick={() => copyToClipboard(encryptionKey)}
                      className="shrink-0 p-1.5 hover:bg-slate-200 rounded transition"
                      title="Kopyala"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {copied && (
                  <p className="text-xs text-green-600 text-center mb-4">Kopyalandı!</p>
                )}
              </>
            )}

            <p className="text-sm text-slate-500 mb-4 text-center">
              Bu cihazdan sadece kayıtlı IP adresiyle erişim yapabilirsiniz.
            </p>

            <button
              onClick={onDismiss}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition"
            >
              Sisteme Giriş Yap
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="flex justify-center mb-4">
              <AlertCircle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">Hata</h2>
            <p className="text-sm text-red-600 mb-4 text-center">{errorMessage}</p>
            <button
              onClick={() => {
                setStep('check');
                setErrorMessage('');
                setDeviceName('');
              }}
              className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition"
            >
              Tekrar Dene
            </button>
            <button
              onClick={onDismiss}
              className="w-full py-3 mt-2 border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition"
            >
              Kapat
            </button>
          </>
        )}
      </div>
    </div>
  );
}
