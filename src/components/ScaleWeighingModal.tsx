import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Scale, AlertCircle, CheckCircle2, Loader, Keyboard } from 'lucide-react';

interface ScaleWeighingModalProps {
  product: {
    id: string;
    name: string;
    price: number;
    unit?: string;
  };
  scalePort: string;
  scaleBaudRate?: number;
  onConfirm: (weight: number, totalPrice: number) => void;
  onCancel: () => void;
}

export function ScaleWeighingModal({ product, scalePort, scaleBaudRate, onConfirm, onCancel }: ScaleWeighingModalProps) {
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [stabilized, setStabilized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [manualWeight, setManualWeight] = useState('');
  const displaySmoothRef = useRef<number | null>(null);
  /** Sadece donanım darası kapalıyken: ilk ölçümde yazılım darası */
  const needAutoTareRef = useRef(true);
  const autoTareInFlightRef = useRef(false);
  const manualModeRef = useRef(false);
  manualModeRef.current = manualMode;
  const electronAPI = (window as any).electronAPI;

  const resolveBaud = () => {
    if (scaleBaudRate && scaleBaudRate > 0) return scaleBaudRate;
    try {
      const raw = localStorage.getItem('scale_calibration');
      if (raw) {
        const j = JSON.parse(raw);
        const n = parseInt(String(j.baudRate || '9600'), 10);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch { /* ignore */ }
    return 9600;
  };

  const readInitialZeroOpts = () => {
    try {
      const raw = localStorage.getItem('scale_calibration');
      const j = raw ? JSON.parse(raw) : {};
      const h = j.tareCommandHex;
      return {
        tareCommandHex: typeof h === 'string' ? h.trim() : '',
        disableHardwareTare: j.disableHardwareTare === true,
      };
    } catch {
      return { tareCommandHex: '', disableHardwareTare: false };
    }
  };

  useEffect(() => {
    if (!electronAPI) {
      setError('Elektron API kullanılabilir değil');
      setManualMode(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    /** Donanım darası kapalıysa: ilk ölçümde yazılım darası (kap/tepsi). Donanım açıksa ASLA — yoksa ürün gramajı 0’a çekilir. */
    let softwareTareFallback = readInitialZeroOpts().disableHardwareTare;

    setCurrentWeight(null);
    setStabilized(false);
    setError(null);
    setManualMode(false);
    setManualWeight('');
    displaySmoothRef.current = null;
    needAutoTareRef.current = true;
    autoTareInFlightRef.current = false;

    const startWeighing = async () => {
      try {
        await electronAPI.scaleStopWeighing?.();
        if (cancelled) return;
        const result = await electronAPI.scaleStartWeighing?.({
          port: scalePort,
          baudRate: resolveBaud(),
        });
        if (cancelled) return;
        if (!result?.success) {
          setError(result?.error || 'Terazi oturumu başlatılamadı');
          setManualMode(true);
          setLoading(false);
          return;
        }
        const z = readInitialZeroOpts();
        softwareTareFallback = z.disableHardwareTare;
        await electronAPI.scaleInitialZero?.({
          tareCommandHex: z.tareCommandHex || undefined,
          disableHardwareTare: z.disableHardwareTare,
        });
        if (cancelled) return;
        displaySmoothRef.current = 0;
        setCurrentWeight(0);
        setStabilized(false);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message);
          setManualMode(true);
          setLoading(false);
        }
      }
    };

    let weightRaf = 0;
    let pendingW: number | undefined;
    let pendingStab: boolean | undefined;
    const flushWeightRaf = () => {
      weightRaf = 0;
      if (pendingW !== undefined && Number.isFinite(pendingW)) {
        displaySmoothRef.current = pendingW;
        setCurrentWeight(pendingW);
        pendingW = undefined;
      }
      if (pendingStab !== undefined) {
        setStabilized(pendingStab);
        pendingStab = undefined;
      }
    };
    const queueWeightUi = (w: number, stab?: boolean) => {
      pendingW = w;
      if (typeof stab === 'boolean') pendingStab = stab;
      if (!weightRaf) weightRaf = requestAnimationFrame(flushWeightRaf);
    };

    const unsubWeight = electronAPI.onScaleWeightUpdate?.((data: any) => {
      if (
        softwareTareFallback &&
        needAutoTareRef.current &&
        !manualModeRef.current &&
        !autoTareInFlightRef.current &&
        data.weight !== undefined &&
        data.weight !== null &&
        Number.isFinite(Number(data.weight))
      ) {
        autoTareInFlightRef.current = true;
        void electronAPI.scaleTareWeighing?.().then((r: any) => {
          autoTareInFlightRef.current = false;
          if (r?.success) {
            needAutoTareRef.current = false;
            displaySmoothRef.current = 0;
            setCurrentWeight(0);
            setStabilized(false);
          }
        });
        return;
      }

      if (data.weight !== undefined && data.weight !== null) {
        const w = Number(data.weight);
        if (!Number.isFinite(w)) return;
        const stab = typeof data.stabilized === 'boolean' ? data.stabilized : undefined;
        queueWeightUi(w, stab);
      }
    });

    const unsubError = electronAPI.onScaleWeighingError?.((data: any) => {
      setError(data.error || 'Terazi bağlantısı kesildi');
      setManualMode(true);
      setLoading(false);
    });

    startWeighing();

    return () => {
      cancelled = true;
      if (weightRaf) cancelAnimationFrame(weightRaf);
      unsubWeight?.();
      unsubError?.();
      void electronAPI.scaleStopWeighing?.();
    };
  }, [scalePort, scaleBaudRate, product.id, electronAPI]);

  const handleConfirm = useCallback(async () => {
    let weightToUse = currentWeight;

    if (manualMode && manualWeight) {
      const inputWeight = parseFloat(manualWeight);
      if (isNaN(inputWeight) || inputWeight <= 0) {
        setError('Geçersiz ağırlık değeri');
        return;
      }
      weightToUse = inputWeight * 1000; // convert kg to grams
    } else if (!currentWeight || !stabilized) {
      return;
    }

    setConfirming(true);

    try {
      const weight = weightToUse!; // grams
      const weightKg = weight / 1000;
      const totalPrice = product.price * weightKg;

      try {
        if (electronAPI?.scaleStopWeighing) {
          await electronAPI.scaleStopWeighing();
        }
      } catch (err) {
        console.error('Error stopping weighing:', err);
      }

      try {
        onConfirm(weight, totalPrice);
      } catch (err) {
        console.error('Error in onConfirm callback:', err);
        throw err;
      }
    } catch (err: any) {
      setError(err?.message || 'Bir hata oluştu');
      setConfirming(false);
    }
  }, [currentWeight, stabilized, manualMode, manualWeight, product.price, electronAPI, onConfirm]);

  const handleCancel = useCallback(async () => {
    try {
      if (electronAPI?.scaleStopWeighing) {
        await electronAPI.scaleStopWeighing();
      }
    } catch (err) {
      console.error('Error stopping weighing:', err);
    }
    try {
      onCancel();
    } catch (err) {
      console.error('Error in onCancel callback:', err);
    }
  }, [electronAPI, onCancel]);

  const getWeightKg = () => {
    if (manualMode && manualWeight) {
      return parseFloat(manualWeight) || 0;
    }
    if (!currentWeight) return 0;

    // Apply calibration settings
    const calibration = JSON.parse(localStorage.getItem('scale_calibration') || '{}');
    const multiplier = parseFloat(calibration.multiplier) || 1;
    let value = currentWeight * multiplier; // grams by default

    // Apply format conversion
    if (calibration.format === 'kg') {
      value = value / 1000; // grams to kg
    } else if (calibration.format === 'oz') {
      value = (value / 1000) * 35.274; // grams to oz
    } else {
      // grams - convert to kg for calculation
      value = value / 1000;
    }

    return value;
  };

  const weightKg = getWeightKg().toFixed(3);
  const totalPrice = getWeightKg() * product.price;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[100] p-2 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">Tartı Okuma</h2>
              <p className="text-xs sm:text-sm text-blue-100">{scalePort}</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-white/20 rounded-lg transition text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto flex-1">
          {/* Product Info */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="text-sm font-bold text-slate-600 mb-1">Ürün</div>
            <div className="text-base sm:text-lg font-black text-slate-800 break-words">{product.name}</div>
            <div className="text-xs sm:text-sm text-slate-500 mt-2">
              Birim Fiyat: <span className="font-bold text-slate-700">{product.price.toFixed(2)} ₺/kg</span>
            </div>
          </div>

          {/* Weight Display */}
          {error && !manualMode ? (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-red-700">Hata</div>
                <div className="text-sm text-red-600 mt-1">{error}</div>
              </div>
            </div>
          ) : null}

          {manualMode ? (
            <>
              {/* Manual Weight Input */}
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Keyboard className="w-5 h-5 text-amber-700" />
                  <div className="font-bold text-amber-700">Manuel Giriş Modu</div>
                </div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Ağırlık (kg)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={manualWeight}
                  onChange={(e) => {
                    setManualWeight(e.target.value);
                    setError(null);
                  }}
                  placeholder="0.000"
                  autoFocus
                  className="w-full px-4 py-3 border-2 border-amber-300 rounded-lg text-lg font-mono focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                />
              </div>

              {manualWeight && (
                <>
                  {/* Total Price for Manual */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-xl p-4 text-center">
                    <div className="text-sm font-bold text-green-700 mb-1">Toplam Tutar</div>
                  <div className="text-3xl sm:text-4xl font-black text-green-600">
                      {totalPrice.toFixed(2)} ₺
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-600">{error}</div>
                </div>
              )}
            </>
          ) : loading ? (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 flex flex-col items-center justify-center gap-3">
              <Loader className="w-8 h-8 text-blue-600 animate-spin" />
              <div className="text-center">
                <div className="font-bold text-blue-700">Terazi Bağlanıyor...</div>
                <div className="text-sm text-blue-600 mt-1">Lütfen bekleyin</div>
              </div>
            </div>
          ) : (
            <>
              {/* Weight Value */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-4 sm:p-6 text-center">
                <div className="text-sm font-bold text-blue-700 mb-2">Ağırlık</div>
                <div className="text-3xl sm:text-5xl font-black text-blue-600 font-mono break-all">
                  {currentWeight !== null ? weightKg : '—'}
                </div>
                <div className="text-base sm:text-lg font-bold text-blue-700 mt-2">kg</div>
                <div className={`text-xs font-bold mt-3 px-3 py-1 rounded-full inline-block ${
                  stabilized
                    ? 'bg-green-200 text-green-800'
                    : 'bg-amber-200 text-amber-800'
                }`}>
                  {stabilized ? 'Kararlı' : 'Değişiyor...'}
                </div>
                <p className="text-[11px] text-slate-500 mt-3 text-center leading-snug">
                  Yeni ürün seçince teraziye sıfır komutu gider; 0 göründükten sonra ürünü tartıp onaylayın.
                </p>
              </div>

              {/* Total Price */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-xl p-4 text-center">
                <div className="text-sm font-bold text-green-700 mb-1">Toplam Tutar</div>
                <div className="text-3xl sm:text-4xl font-black text-green-600 break-words">
                  {totalPrice.toFixed(2)} ₺
                </div>
              </div>

              {/* Status */}
              <div className="text-center text-sm">
                {!stabilized && currentWeight !== null ? (
                  <div className="text-amber-600 font-medium">
                    Ağırlık kararlı hale gelene kadar bekleyin...
                  </div>
                ) : currentWeight === null ? (
                  <div className="text-slate-500">
                    Ürünü terazinin üzerine koyunuz...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-green-600 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Okuma hazır
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-6 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            onClick={handleCancel}
            disabled={confirming}
            className="px-4 py-3 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 font-bold rounded-xl transition-all active:scale-95"
          >
            İptal
          </button>
          {!manualMode && !loading && (
            <button
              onClick={() => {
                setManualMode(true);
                setError(null);
              }}
              className="px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Manuel Giriş
            </button>
          )}
          {manualMode && (
            <button
              onClick={() => {
                setManualMode(false);
                setManualWeight('');
                setError(null);
              }}
              className="px-4 py-3 bg-slate-400 hover:bg-slate-500 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Teraziye Dön
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={
              confirming || (
                !manualMode && (!stabilized || currentWeight === null || error !== null)
              ) || (
                manualMode && (!manualWeight || parseFloat(manualWeight) <= 0)
              )
            }
            className={`px-4 py-3 font-bold rounded-xl transition-all active:scale-95 ${
              !confirming && (
                (!manualMode && stabilized && currentWeight !== null && !error) ||
                (manualMode && manualWeight && parseFloat(manualWeight) > 0)
              )
                ? 'bg-green-500 hover:bg-green-600 text-white'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {confirming ? 'İşleniyor...' : 'Onayla'}
          </button>
        </div>
      </div>
    </div>
  );
}
