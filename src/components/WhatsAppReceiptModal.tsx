import { useState } from 'react';
import { X, Send, MessageCircle, Phone, Copy, Check } from 'lucide-react';
import {
  type WhatsAppReceiptInput,
  buildWhatsAppReceiptText,
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
 * Ödeme sonrası açılır: fiş metnini hazırlar, kullanıcı telefon girer,
 * "WhatsApp'a Gönder" ile `wa.me/<num>?text=<fiş>` linkini açar.
 *
 * Önizleme alanı düzenlenebilir → kullanıcı gerekirse not ekleyebilir.
 */
export function WhatsAppReceiptModal({ receipt, defaultPhone, onClose }: Props) {
  const [phone, setPhone] = useState<string>(defaultPhone || '');
  const [text, setText]   = useState<string>(() => buildWhatsAppReceiptText(receipt));
  const [copied, setCopied] = useState(false);

  const normalized = phone ? formatPhoneForWhatsApp(phone) : null;
  const phoneValid = !phone || (normalized && normalized.length >= 11);

  const handleSend = () => {
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
      // clipboard izni yok → seç ve manuel kopyalama bekle
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-800">WhatsApp'a Gönder</h3>
              <p className="text-xs text-slate-500">Fişi müşterinin WhatsApp'ına ilet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs font-bold text-slate-700 mb-1">
          Telefon numarası <span className="font-normal text-slate-400">(boş bırakırsanız numara seçim ekranı açılır)</span>
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
              phoneValid ? 'border-slate-200 focus:border-emerald-400' : 'border-rose-400 focus:border-rose-500'
            }`}
          />
        </div>
        {phone && normalized && (
          <p className="text-[11px] text-slate-500 -mt-2 mb-3 ml-1">
            wa.me/<span className="font-mono">{normalized}</span>
          </p>
        )}

        <label className="block text-xs font-bold text-slate-700 mb-1">Fiş metni (düzenleyebilirsiniz)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-transparent text-xs font-mono resize-none"
        />

        <div className="flex items-center justify-between gap-2 mt-4">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 active:scale-95 flex items-center gap-2"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Kopyalandı' : 'Kopyala'}</span>
          </button>

          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex-1 py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white font-black text-sm shadow hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            WhatsApp'a Gönder
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mt-3 text-center">
          WhatsApp Web / mobil uygulaması açılır; gönder butonuna basmanız yeterli.
        </p>
      </div>
    </div>
  );
}
