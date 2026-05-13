import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, MessageCircle, Phone, Copy, Check, ImageIcon, Loader2, Download } from 'lucide-react';
import {
  type WhatsAppReceiptInput,
  buildWhatsAppReceiptText,
  buildWhatsAppReceiptHtml,
  formatPhoneForWhatsApp,
  openWhatsAppWithReceipt,
} from '../lib/whatsappReceipt';

interface Props {
  receipt: WhatsAppReceiptInput;
  /** Önceden bilinen müşteri telefonu (açık hesap müşterisi vs.). */
  defaultPhone?: string | null;
  onClose: () => void;
}

/**
 * Ödeme sonrası fiş paylaşım modali.
 *
 * Üç yol sunar:
 *  1) **Görsel olarak Gönder** — gerçek termal-fiş görüntüsünü (PNG) üretir.
 *     Cihaz `navigator.share` ile dosya paylaşımını destekliyorsa native paylaşım
 *     ekranı açılır (telefonda WhatsApp seçilir); değilse görsel indirilir +
 *     `wa.me/<num>?text=...` açılır, kullanıcı eki yapıştırır.
 *  2) **Sadece Metin Gönder** — `wa.me` linkini düz metin fişiyle açar.
 *  3) **Kopyala** — fiş metnini panoya kopyalar.
 */
export function WhatsAppReceiptModal({ receipt, defaultPhone, onClose }: Props) {
  const [phone, setPhone] = useState<string>(defaultPhone || '');
  const [text, setText]   = useState<string>(() => buildWhatsAppReceiptText(receipt));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'image' | 'download' | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const offscreenRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const receiptHtml = useMemo(() => buildWhatsAppReceiptHtml(receipt), [receipt]);

  // Önizleme ve offscreen render hedefine HTML'i bas
  useEffect(() => {
    if (previewRef.current) previewRef.current.innerHTML = receiptHtml;
    if (offscreenRef.current) offscreenRef.current.innerHTML = receiptHtml;
  }, [receiptHtml]);

  const normalized = phone ? formatPhoneForWhatsApp(phone) : null;
  const phoneValid = !phone || (normalized && normalized.length >= 11);

  const captureReceiptPng = async (): Promise<Blob | null> => {
    const node = offscreenRef.current;
    if (!node) return null;
    const mod: any = await import('html2canvas').catch(() => null);
    const html2canvas: any = mod?.default || mod;
    if (!html2canvas) return null;
    const canvas: HTMLCanvasElement = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    });
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
  };

  const handleShareImage = async () => {
    setWarn(null);
    setBusy('image');
    try {
      const blob = await captureReceiptPng();
      if (!blob) {
        setWarn('Fiş görseli üretilemedi.');
        return;
      }
      const filename = `fis-${receipt.orderNumber || Date.now()}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      const nav: any = navigator;
      const canShareFiles = typeof nav.canShare === 'function' && nav.canShare({ files: [file] });

      if (canShareFiles && typeof nav.share === 'function') {
        try {
          await nav.share({
            files: [file],
            title: `Fiş #${receipt.orderNumber}`,
            text,
          });
          onClose();
          return;
        } catch (e: any) {
          if (e?.name === 'AbortError') return;
          // share denied; fallback'a düş
        }
      }

      // Fallback: görseli indir + wa.me'yi metinle aç, kullanıcı eki yapıştırsın.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      openWhatsAppWithReceipt(phone || null, text);
      setWarn('Fiş görüntüsü indirildi. WhatsApp ekranında ataç ikonundan "Görüntü" → indirilen dosyayı seçin.');
    } catch (e: any) {
      setWarn('Hata: ' + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  };

  const handleDownloadOnly = async () => {
    setWarn(null);
    setBusy('download');
    try {
      const blob = await captureReceiptPng();
      if (!blob) return;
      const filename = `fis-${receipt.orderNumber || Date.now()}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(null);
    }
  };

  const handleSendTextOnly = () => {
    if (!text.trim()) return;
    openWhatsAppWithReceipt(phone || null, text);
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard izni yok */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-800">WhatsApp'a Fiş Gönder</h3>
              <p className="text-xs text-slate-500">Gerçek fiş görüntüsü veya düz metin olarak</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-y-auto flex-1">
          {/* Sol: Fiş önizleme (gerçek görüntüsü) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Fiş görseli</label>
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-3 bg-slate-50 max-h-[60vh] overflow-auto flex justify-center">
              <div
                className="bg-white rounded-lg shadow-lg overflow-hidden"
                style={{ boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }}
              >
                <div ref={previewRef} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              "Görsel Olarak Gönder" bu görüntünün PNG kopyasını üretir.
            </p>
          </div>

          {/* Sağ: form */}
          <div className="flex flex-col">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Telefon numarası <span className="font-normal text-slate-400">(boş = numara seçim ekranı)</span>
            </label>
            <div className="relative mb-3">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0532 517 80 50"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm font-mono focus:outline-none ${
                  phoneValid ? 'border-slate-200 focus:border-emerald-400' : 'border-rose-400'
                }`}
              />
            </div>
            {phone && normalized && (
              <p className="text-[11px] text-slate-500 -mt-2 mb-2 ml-1">
                wa.me/<span className="font-mono">{normalized}</span>
              </p>
            )}

            <label className="block text-xs font-bold text-slate-700 mb-1">Eşlik edecek metin</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-xs font-mono resize-none"
            />

            {warn && (
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {warn}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-2 px-4 pb-4 border-t border-slate-100 pt-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Kopyalandı' : 'Metni Kopyala'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadOnly()}
            disabled={busy !== null}
            className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Fiş Görselini İndir
          </button>

          <button
            type="button"
            onClick={handleSendTextOnly}
            disabled={!text.trim() || busy !== null}
            className="px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-bold hover:bg-emerald-100 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 border border-emerald-200"
          >
            <Send className="w-4 h-4" />
            Metin Olarak Gönder
          </button>

          <button
            type="button"
            onClick={() => void handleShareImage()}
            disabled={busy !== null}
            className="flex-1 px-3 py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white font-black text-sm shadow hover:brightness-110 active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy === 'image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            Görsel Olarak Gönder
          </button>
        </div>

        {/* html2canvas için offscreen render hedefi. Fiş kendi genişliğini taşıyor (360px). */}
        <div
          aria-hidden="true"
          style={{ position: 'fixed', left: '-10000px', top: 0, background: '#ffffff' }}
        >
          <div ref={offscreenRef} />
        </div>
      </div>
    </div>
  );
}
