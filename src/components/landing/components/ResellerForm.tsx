import { useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { TURKEY_PROVINCES } from '../content/turkeyLocations.generated';
import { resolveProvinceSlug, provinceDisplayName } from '../../../lib/resellerProvince';

export function ResellerForm({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    phone: '',
    email: '',
    province_slug: '',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { supabase } = await import('../../../lib/supabase');
      const city = provinceDisplayName(formData.province_slug);
      const payload: Record<string, unknown> = {
        company_name: formData.company.trim(),
        contact_name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        city,
        message: formData.message.trim(),
        status: 'pending',
      };
      const first = await supabase.from('reseller_applications').insert([payload]);
      if (first.error) throw first.error;
      setSuccess(true);
      setTimeout(onClose, 2200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bir hata oluştu';
      alert('Hata: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900 mb-2">Başvurunuz alındı</h3>
        <p className="text-slate-600">Ekibimiz en kısa sürede sizinle iletişime geçecek.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <button type="button" onClick={onClose} className="float-right text-slate-400 hover:text-slate-600" aria-label="Kapat">
        <X className="w-6 h-6" />
      </button>
      <h3 className="text-2xl font-bold text-slate-900 mb-2">Bayilik başvurusu</h3>
      <p className="text-slate-600 text-sm mb-6 clear-both">
        Formu doldurun; bölgenizdeki bayilik fırsatları için sizi arayalım.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Şirket adı *</label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">İsim soyisim *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Telefon *</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">E-posta *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">İl *</label>
          <select
            value={formData.province_slug}
            onChange={(e) => setFormData({ ...formData, province_slug: e.target.value })}
            required
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm bg-white"
          >
            <option value="">İl seçin</option>
            {TURKEY_PROVINCES.map((p) => (
              <option key={p.s} value={p.s}>
                {p.n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">Kısa mesaj</label>
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            rows={3}
            placeholder="Hedef bölge, deneyim, tahmini müşteri sayısı…"
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !resolveProvinceSlug(formData.province_slug)}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors mt-2"
        >
          {loading ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
        </button>
      </form>
    </div>
  );
}
