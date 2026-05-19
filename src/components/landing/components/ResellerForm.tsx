import { useState } from 'react';
import { CheckCircle, X } from 'lucide-react';

export function ResellerForm({ onClose }: { onClose: () => void }) {
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    phone: '',
    email: '',
    city: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { supabase } = await import('../../../lib/supabase');
      const payload: Record<string, unknown> = {
        company_name: formData.company,
        contact_name: formData.name,
        phone: formData.phone,
        email: formData.email,
        status: 'pending',
        city: formData.city,
      };
      const first = await supabase.from('reseller_applications').insert([payload]);
      if (first.error && first.error.message?.toLowerCase().includes('city')) {
        delete payload.city;
        const retry = await supabase.from('reseller_applications').insert([payload]);
        if (retry.error) throw retry.error;
      } else if (first.error) {
        throw first.error;
      }
      setSuccess(true);
      setTimeout(onClose, 2000);
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
        <h3 className="text-2xl font-bold text-slate-900 mb-2">Başvurunuz Alındı!</h3>
        <p className="text-slate-600">En kısa sürede sizinle iletişime geçeceğiz.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <button type="button" onClick={onClose} className="float-right text-slate-400 hover:text-slate-600" aria-label="Kapat">
        <X className="w-6 h-6" />
      </button>
      <h3 className="text-2xl font-bold text-slate-900 mb-2">Bayi Başvurusu</h3>
      <p className="text-slate-600 text-sm mb-6">Aşağıdaki formu doldurarak bayi başvurusunda bulunabilirsiniz.</p>
      <form onSubmit={handleSubmit} className="space-y-4 clear-both">
        {(['company', 'name', 'phone', 'email', 'city'] as const).map((key) => {
          const labels: Record<typeof key, string> = {
            company: 'Şirket Adı',
            name: 'İsim Soyisim',
            phone: 'Telefon',
            email: 'E-posta',
            city: 'Şehir',
          };
          const types: Record<typeof key, string> = {
            company: 'text',
            name: 'text',
            phone: 'tel',
            email: 'email',
            city: 'text',
          };
          return (
            <div key={key}>
              <label className="block text-sm font-semibold text-slate-900 mb-2">{labels[key]}</label>
              <input
                type={types[key]}
                value={formData[key]}
                onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                required
                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none text-sm"
              />
            </div>
          );
        })}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors mt-6"
        >
          {loading ? 'Gönderiliyor...' : 'Başvuruyu Gönder'}
        </button>
      </form>
    </div>
  );
}
