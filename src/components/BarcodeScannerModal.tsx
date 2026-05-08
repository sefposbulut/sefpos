import { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, AlertTriangle, ScanBarcode } from 'lucide-react';
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser';
import {
  BarcodeFormat,
  DecodeHintType,
  type Result,
} from '@zxing/library';
import { playScanSuccess } from '../lib/beep';

interface BarcodeScannerModalProps {
  onDetected: (code: string) => void;
  onClose: () => void;
  /** Otomatik kapatmadan ardışık okumaya izin ver (varsayılan: false → ilk okumada kapat) */
  continuous?: boolean;
}

// Bakkal/perakende öncelikli — kısa liste hız için kritik (ZXing her frame'de
// her formatı dener). EAN/UPC en yaygın olanlar; Code128 ile ITF de dahil.
const PREFERRED_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

export function BarcodeScannerModal({ onDetected, onClose, continuous }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const detectedOnceRef = useRef(false);
  // continuous modda aynı barkodu kısa sürede tekrar tetikleme
  const lastFiredRef = useRef<{ code: string; at: number } | null>(null);

  // Kameraları listele, varsayılan olarak arka kamerayı seç
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Önce mikrofonsuz kamera erişimi iste — bazı tarayıcılar listMediaDevices'ta
        // izin verilmeden cihaz adlarını boş döner.
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
          tmp.getTracks().forEach((t) => t.stop());
        } catch (e: any) {
          if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
            throw new Error('Kamera izni reddedildi.');
          }
          if (e?.name === 'NotFoundError') {
            throw new Error('Cihazda kamera bulunamadı.');
          }
        }

        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter((d) => d.kind === 'videoinput');
        if (!mounted) return;
        setDevices(cams);

        // Tercih: arka kamera (back / environment / rear)
        const back = cams.find((d) => /back|rear|environment|arka/i.test(d.label));
        setDeviceId((back || cams[0])?.deviceId);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Kamera başlatılamadı');
        setStarting(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Seçili cihazla okuyucuyu başlat
  useEffect(() => {
    if (!deviceId || !videoRef.current) return;
    detectedOnceRef.current = false;
    setError(null);
    setStarting(true);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, PREFERRED_FORMATS);
    // TRY_HARDER bulanık/eğik barkodlarda yardımcı olur ama her frame'i yavaşlatır.
    // Hızlı okuma için kapatıyoruz; modern POS akışında barkod genellikle düz tutulur.
    hints.set(DecodeHintType.TRY_HARDER, false);

    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 30 });
    let cancelled = false;

    (async () => {
      try {
        // Yüksek çözünürlük (1280x720) ve arka kamera tercihi → barkod büyük görünür,
        // okuma anında olur. decodeFromConstraints, decodeFromVideoDevice'a göre
        // çözünürlük ve focus moduna doğrudan müdahale imkânı sağlar.
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: deviceId ? undefined : { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // Mobilde sürekli odak — barkod okumayı belirgin hızlandırır
            // (Safari/Chrome destekliyor, desteklenmeyen tarayıcılar yok sayar)
            ...( { advanced: [{ focusMode: 'continuous' as any }] } as any ),
          },
        };
        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current!,
          (result: Result | undefined, _err) => {
            if (!result) return;
            const code = result.getText();
            if (!code) return;
            setLastCode(code);
            if (continuous) {
              const now = Date.now();
              const last = lastFiredRef.current;
              // Aynı barkod 1500ms içinde yeniden okunduysa ateşleme
              if (last && last.code === code && now - last.at < 1500) return;
              lastFiredRef.current = { code, at: now };
              // Anında "did" sesi — algılanma ile aynı tick
              try { playScanSuccess(); } catch { /* noop */ }
              try { onDetected(code); } catch { /* noop */ }
            } else if (!detectedOnceRef.current) {
              detectedOnceRef.current = true;
              // Tek-atış modunda da algılanma anında beep çalsın
              try { playScanSuccess(); } catch { /* noop */ }
              try { onDetected(code); } catch { /* noop */ }
              try { controls.stop(); } catch { /* noop */ }
              try { onClose(); } catch { /* noop */ }
            }
          },
        );
        if (cancelled) {
          try { controls.stop(); } catch { /* noop */ }
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Okuyucu başlatılamadı');
          setStarting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      controlsRef.current = null;
    };
  }, [deviceId, continuous, onDetected, onClose]);

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-slate-900 text-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500 to-orange-600">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5" />
            <h3 className="font-black text-base">Barkod Tara</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="hover:bg-white/15 p-1.5 rounded-lg transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3] sm:aspect-video">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            // iOS Safari için autoplay attribütü gerekiyor
            autoPlay
          />
          {/* Görsel hizalama çerçevesi */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative w-3/4 h-1/3 border-2 border-amber-400/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-amber-400 animate-pulse" />
            </div>
          </div>
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Kamera başlatılıyor…
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center">
              <div className="flex flex-col items-center gap-2 text-red-300 text-sm font-bold">
                <AlertTriangle className="w-6 h-6" />
                {error}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 space-y-2 bg-slate-900">
          {devices.length > 1 && (
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              <select
                value={deviceId || ''}
                onChange={(e) => setDeviceId(e.target.value)}
                className="flex-1 bg-slate-800 border border-white/15 rounded-lg px-2 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
              >
                {devices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Kamera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {lastCode && (
            <div className="text-xs font-mono bg-slate-800 border border-white/10 rounded-lg px-3 py-2 break-all">
              <span className="text-emerald-400 font-bold">Son okunan:</span>{' '}
              {lastCode}
            </div>
          )}

          <div className="text-[11px] text-slate-400 leading-relaxed">
            Barkodu kameranın merkezindeki çerçeveye getirin. EAN-13, UPC, Code-128, QR ve daha fazlası desteklenir. USB / Bluetooth barkod okuyucularda bu pencereyi açmadan da arama kutusuna doğrudan tarama yapabilirsiniz.
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-bold active:scale-95"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
