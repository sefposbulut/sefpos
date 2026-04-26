import { useState, useEffect } from 'react';
import { Scale, AlertCircle, CheckCircle2, Loader, Settings as SettingsIcon } from 'lucide-react';

interface ScaleCalibrationProps {
  onClose?: () => void;
}

export function ScaleCalibration({ onClose }: ScaleCalibrationProps) {
  const [scalePort, setScalePort] = useState('COM3');
  const [baudRate, setBaudRate] = useState('9600');
  const [format, setFormat] = useState('grams'); // 'grams', 'kg', 'oz'
  const [multiplier, setMultiplier] = useState('1');
  const [currentReading, setCurrentReading] = useState<number | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [status, setStatus] = useState<'idle' | 'reading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [ports, setPorts] = useState<{ path: string; name: string }[]>([]);
  const electronAPI = (window as any).electronAPI;

  useEffect(() => {
    loadPorts();
    loadCalibrationSettings();
  }, []);

  const loadPorts = async () => {
    if (!electronAPI?.scaleListPorts) return;
    try {
      const availablePorts = await electronAPI.scaleListPorts();
      setPorts(availablePorts);
    } catch (err) {
      console.error('Failed to load ports:', err);
    }
  };

  const loadCalibrationSettings = () => {
    const saved = localStorage.getItem('scale_calibration');
    if (saved) {
      const config = JSON.parse(saved);
      setScalePort(config.port || 'COM3');
      setBaudRate(config.baudRate || '9600');
      setFormat(config.format || 'grams');
      setMultiplier(config.multiplier || '1');
    }
  };

  const saveCalibrationSettings = () => {
    const config = { port: scalePort, baudRate, format, multiplier };
    localStorage.setItem('scale_calibration', JSON.stringify(config));
    setStatus('success');
    setMessage('Kalibrasyonayarları kaydedildi');
    setTimeout(() => setStatus('idle'), 3000);
  };

  const testReading = async () => {
    if (!electronAPI?.scaleStartWeighing) {
      setStatus('error');
      setMessage('Terazi API kullanılamıyor');
      return;
    }

    setIsCalibrating(true);
    setStatus('reading');
    setMessage('Terazi okunuyor. Lütfen ürün koyunuz...');
    setCurrentReading(null);

    try {
      const result = await electronAPI.scaleStartWeighing({
        port: scalePort,
        baudRate: parseInt(baudRate)
      });

      if (!result.success) {
        setStatus('error');
        setMessage(result.error || 'Terazi bağlanması başarısız');
        setIsCalibrating(false);
        return;
      }

      // Listen for weight updates
      let hasReading = false;
      const unsubscribe = electronAPI.onScaleWeightUpdate?.((data: any) => {
        if (data.stabilized) {
          hasReading = true;
          const rawValue = data.weight;
          const multiplierNum = parseFloat(multiplier) || 1;

          let displayValue = rawValue * multiplierNum;
          if (format === 'kg') {
            displayValue = displayValue / 1000;
          } else if (format === 'oz') {
            displayValue = (displayValue / 1000) * 35.274; // grams to oz
          }
          setCurrentReading(displayValue);
          setStatus('success');
          setMessage(`Okunan: ${displayValue.toFixed(3)} ${format === 'kg' ? 'kg' : format === 'oz' ? 'oz' : 'g'}`);

          // Stop after 3 seconds
          setTimeout(() => {
            electronAPI.scaleStopWeighing?.();
            unsubscribe?.();
            setIsCalibrating(false);
          }, 2000);
        }
      });

      // Timeout after 15 seconds
      setTimeout(() => {
        if (!hasReading) {
          setStatus('error');
          setMessage('Terazi yanıtı yok. Port ve baud rate kontrol edin.');
          electronAPI.scaleStopWeighing?.();
          unsubscribe?.();
          setIsCalibrating(false);
        }
      }, 15000);
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Hata oluştu');
      setIsCalibrating(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-white" />
          <h2 className="text-xl font-bold text-white">Terazi Kalibrasyonu</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            ✕
          </button>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Port Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">
            <Scale className="w-4 h-4 inline mr-2" />
            Terazi Portu
          </label>
          <select
            value={scalePort}
            onChange={(e) => setScalePort(e.target.value)}
            disabled={isCalibrating}
            className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            {ports.map(p => (
              <option key={p.path} value={p.path}>
                {p.name || p.path}
              </option>
            ))}
          </select>
        </div>

        {/* Baud Rate */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">
            <SettingsIcon className="w-4 h-4 inline mr-2" />
            Baud Rate
          </label>
          <select
            value={baudRate}
            onChange={(e) => setBaudRate(e.target.value)}
            disabled={isCalibrating}
            className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
            <option value="57600">57600</option>
            <option value="115200">115200</option>
          </select>
        </div>

        {/* Format */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">
            Ağırlık Birimi
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['grams', 'kg', 'oz'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => setFormat(fmt)}
                disabled={isCalibrating}
                className={`py-2 px-4 rounded-lg font-bold transition ${
                  format === fmt
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {fmt === 'grams' ? 'Gram' : fmt === 'kg' ? 'Kilogram' : 'Ons'}
              </button>
            ))}
          </div>
        </div>

        {/* Multiplier */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700">
            Çarpan (Ayarlama Faktörü)
          </label>
          <input
            type="number"
            step="0.001"
            min="0.001"
            max="10"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            disabled={isCalibrating}
            className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
            placeholder="1.0"
          />
          <p className="text-xs text-slate-500">
            Eğer terazi 1000g ama sistem 1.365 gösteriyorsa, çarpan 1000 / 1.365 = 0.733 yapabilirsin
          </p>
        </div>

        {/* Status */}
        {status !== 'idle' && (
          <div className={`p-4 rounded-lg flex items-start gap-3 ${
            status === 'success' ? 'bg-green-50 border-2 border-green-300' :
            status === 'error' ? 'bg-red-50 border-2 border-red-300' :
            'bg-blue-50 border-2 border-blue-300'
          }`}>
            {status === 'reading' && <Loader className="w-5 h-5 text-blue-600 animate-spin shrink-0 mt-0.5" />}
            {status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />}
            {status === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
            <div className="flex-1">
              <div className="font-bold text-sm">
                {status === 'reading' ? 'Okuma yapılıyor...' :
                 status === 'success' ? 'Başarılı' :
                 'Hata'}
              </div>
              <div className="text-sm mt-1">
                {message}
              </div>
              {currentReading !== null && (
                <div className="text-lg font-bold mt-2">
                  {currentReading.toFixed(3)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={testReading}
            disabled={isCalibrating}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
          >
            {isCalibrating ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Bekleniyor...
              </>
            ) : (
              <>
                <Scale className="w-4 h-4" />
                Test Oku
              </>
            )}
          </button>
          <button
            onClick={saveCalibrationSettings}
            disabled={isCalibrating}
            className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Kaydet
          </button>
        </div>

        {/* Help */}
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
          <h3 className="font-bold text-amber-900 mb-2">Kalibrasyonu Ayarlama:</h3>
          <ol className="text-sm text-amber-800 space-y-1 list-decimal list-inside">
            <li>Terazi portunu seç (COM3, COM4 gibi)</li>
            <li>Terazi baud rate'ini kontrol et (çoğu 9600)</li>
            <li>Ağırlık birimini seç (gram, kg, oz)</li>
            <li>Test oku butonuna bas</li>
            <li>Terazi yanlış okuyorsa çarpan değiştir</li>
            <li>Kaydet butonuna bas</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
