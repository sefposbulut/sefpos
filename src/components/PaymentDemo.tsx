import { useState } from 'react';
import { X, Zap, Gift, BarChart3, Users, Smartphone } from 'lucide-react';
import { PaymentModal } from './PaymentModal';

export function PaymentDemo() {
  const [showPayment, setShowPayment] = useState(false);

  const mockOrderItems = [
    { id: '1', name: 'MEVSIM SALATASI', quantity: 2, unit_price: 200, total_amount: 400 },
    { id: '2', name: 'PEYNİRLİ MEVS...', quantity: 1, unit_price: 250, total_amount: 250 },
    { id: '3', name: 'GAVURDAĞ', quantity: 3, unit_price: 250, total_amount: 750 },
    { id: '4', name: 'Kahve', quantity: 1, unit_price: 150, total_amount: 150 },
    { id: '5', name: 'Çay', quantity: 2, unit_price: 100, total_amount: 200 },
    { id: '6', name: 'Tatlı', quantity: 1, unit_price: 300, total_amount: 300 },
  ];

  const features = [
    { icon: Smartphone, title: 'Responsive Tasarım', desc: 'Mobile, tablet ve desktop uyumlu' },
    { icon: Gift, title: 'İkram Sistemi', desc: 'Ürün başı ikram işlemleri' },
    { icon: Zap, title: 'Dinamik Hesaplama', desc: 'Gerçek zamanlı tutar güncelleme' },
    { icon: BarChart3, title: 'Detaylı Raporlar', desc: 'Şube ve kullanıcı bazlı analiz' },
    { icon: Users, title: 'Müşteri Yönetimi', desc: 'Veresiye sistemi entegrasyonu' },
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4 z-50">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-4xl">
        <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-white/20">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 px-6 sm:px-8 py-6 sm:py-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-white">Ödeme Sistemi</h1>
              <p className="text-blue-100 text-sm sm:text-base mt-1">Modern POS ödeme ekranı örneği</p>
            </div>
            {showPayment && (
              <button
                onClick={() => setShowPayment(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Content */}
          {!showPayment ? (
            <div className="p-6 sm:p-8 space-y-8">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4 text-center">
                  <p className="text-xs sm:text-sm text-green-700 font-bold">Sipariş Adedi</p>
                  <p className="text-2xl sm:text-3xl font-black text-green-600 mt-1">{mockOrderItems.length}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-xl p-4 text-center">
                  <p className="text-xs sm:text-sm text-blue-700 font-bold">Toplam</p>
                  <p className="text-2xl sm:text-3xl font-black text-blue-600 mt-1">₺2.850</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-xl p-4 text-center">
                  <p className="text-xs sm:text-sm text-orange-700 font-bold">Para Üstü</p>
                  <p className="text-2xl sm:text-3xl font-black text-orange-600 mt-1">₺200</p>
                </div>
              </div>

              {/* Items Preview */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border-2 border-slate-200 overflow-hidden">
                <div className="bg-slate-200 px-4 sm:px-6 py-3 sm:py-4">
                  <h3 className="font-bold text-slate-800 text-base">Sipariş Detayları</h3>
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {mockOrderItems.map((item, idx) => (
                    <div key={idx} className="px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between hover:bg-white/60 transition-colors border-b border-slate-200 last:border-0">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-xs sm:text-sm truncate">{item.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{item.unit_price} ₺ × {item.quantity}</p>
                      </div>
                      <span className="text-sm sm:text-base font-black text-slate-800 ml-4 shrink-0">{item.total_amount} ₺</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features Grid */}
              <div className="space-y-3">
                <h3 className="font-bold text-slate-900 text-base">Sistemin Özellikleri</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {features.map((feature, idx) => {
                    const Icon = feature.icon;
                    return (
                      <div key={idx} className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-lg p-4 hover:border-blue-400 transition-all">
                        <Icon className="w-6 h-6 text-blue-600 mb-2" />
                        <h4 className="font-bold text-slate-900 text-sm">{feature.title}</h4>
                        <p className="text-xs text-slate-600 mt-1">{feature.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CTA Button */}
              <button
                onClick={() => setShowPayment(true)}
                className="w-full bg-gradient-to-r from-green-600 via-green-700 to-green-800 hover:from-green-700 hover:via-green-800 hover:to-green-900 text-white font-bold py-4 rounded-xl transition-all active:scale-95 text-lg shadow-lg"
              >
                Ödeme Ekranını Aç
              </button>
            </div>
          ) : null}

          {/* Payment Modal */}
          {showPayment && (
            <div className="fixed inset-0 z-[60]">
              <PaymentModal
                remainingAmount={2650}
                discount={0}
                onDiscountChange={() => {}}
                onPayment={async (method, amount) => {
                  console.log('Ödeme:', { method, amount });
                  alert(`${amount} ₺ ile ${method} ödeme alındı!`);
                  setShowPayment(false);
                }}
                onClose={() => setShowPayment(false)}
                loading={false}
                orderItems={mockOrderItems}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
