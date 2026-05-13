import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isLocalMode } from '../lib/sqlDb';
import { TR_CITY_NAMES, getDistricts } from '../lib/turkeyCitiesDistricts';
import { getTrialInfo } from '../lib/tenantTrial';
import { CheckCircle, ChefHat, UtensilsCrossed, MapPin, Phone, Globe, Building2, ArrowRight, ArrowLeft, LayoutGrid, Users, Wifi, Star, WifiOff, RefreshCw, Server, Zap, Shield, Globe as Globe2 } from 'lucide-react';
import { publicAsset } from '../lib/assetUrl';

/** Zorunlu alan etiketinde kucuk kirmizi nokta */
const ReqDot = () => (
  <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1 align-middle" title="Zorunlu" />
);

interface OnboardingWizardProps {
  onComplete: () => Promise<void>;
}

type DeploymentMode = 'offline' | 'online' | 'hybrid';

const PHONE_FIRST_SIGNUP_SESSION = 'shefpos_phone_first_signup';

const STEPS = [
  { id: 1, title: 'Hoş Geldiniz', icon: Star },
  { id: 2, title: 'Çalışma Modu', icon: Server },
  { id: 3, title: 'İşletme Bilgileri', icon: ChefHat },
  { id: 4, title: 'Masaları Oluştur', icon: LayoutGrid },
  { id: 5, title: 'Hazırsınız!', icon: CheckCircle },
];

const TABLE_PRESETS = [
  { label: '6 Masa', value: 6 },
  { label: '10 Masa', value: 10 },
  { label: '15 Masa', value: 15 },
  { label: '20 Masa', value: 20 },
  { label: 'Özel', value: 0 },
];

const DEPLOYMENT_MODES: {
  id: DeploymentMode;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  icon: React.ElementType;
  accent: string;
  bg: string;
  border: string;
  dotColor: string;
  badge?: string;
}[] = [
  {
    id: 'offline',
    title: 'Bağımsız',
    subtitle: 'Offline Mod',
    description: 'İnternet bağlantısı olmadan tam çalışır. Tüm veriler yerel olarak saklanır.',
    features: ['İnternet gerektirmez', 'Tek şube / tek cihaz', 'En hızlı yanıt süresi', 'Güvenli, yerel depolama'],
    icon: WifiOff,
    accent: 'text-slate-700',
    bg: 'bg-slate-50',
    border: 'border-slate-300',
    dotColor: 'bg-slate-600',
  },
  {
    id: 'online',
    title: 'Bulut Bağlantılı',
    subtitle: 'Online Mod',
    description: 'Merkezi sunucu ile çalışır. Birden fazla şube ve cihazdan erişim sağlanır.',
    features: ['Çoklu şube desteği', 'Gerçek zamanlı senkron', 'Uzaktan erişim & raporlar', 'Online sipariş entegrasyonu'],
    icon: Globe2,
    accent: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    dotColor: 'bg-blue-600',
    badge: 'Önerilen',
  },
  {
    id: 'hybrid',
    title: 'Karma',
    subtitle: 'Hybrid Mod',
    description: 'Çevrimdışı çalışır, internet gelince otomatik senkronize eder. En güçlü mod.',
    features: ['İnternetsiz çalışır', 'Otomatik senkronizasyon', 'Veri kaybı riski sıfır', 'Çoklu şube desteği'],
    icon: RefreshCw,
    accent: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    dotColor: 'bg-emerald-600',
  },
];

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { tenant, activeBranch, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneFirstSignupHint, setPhoneFirstSignupHint] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(PHONE_FIRST_SIGNUP_SESSION) === '1') {
        sessionStorage.removeItem(PHONE_FIRST_SIGNUP_SESSION);
        setPhoneFirstSignupHint(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('online');

  const [bizInfo, setBizInfo] = useState({
    address: '',
    phone: '',
    city: '',
    district: '',
    website: '',
  });
  const [bizErrors, setBizErrors] = useState<Partial<Record<'address' | 'phone' | 'city' | 'district', string>>>({});

  const districtOptions = useMemo(() => getDistricts(bizInfo.city), [bizInfo.city]);

  const [tableCount, setTableCount] = useState(10);
  const [customTableCount, setCustomTableCount] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(10);
  const [groupName, setGroupName] = useState('Salon');
  const [groupPrefix, setGroupPrefix] = useState('S');
  /** Kullanici prefix'i elle degistirdiyse salon adi degisiminde uzerine yazma. */
  const [prefixManual, setPrefixManual] = useState(false);

  const computeAutoPrefix = (name: string): string =>
    (name || '').trim().slice(0, 1).toLocaleUpperCase('tr-TR') || 'M';

  const finalTableCount = selectedPreset === 0
    ? parseInt(customTableCount) || 0
    : tableCount;
  const finalPrefix = (groupPrefix.trim() || computeAutoPrefix(groupName))
    .toLocaleUpperCase('tr-TR')
    .slice(0, 4);
  const tenantTrialInfo = useMemo(() => getTrialInfo(tenant as any), [tenant]);

  const markLocalOnboardingDone = async () => {
    if (!tenant) return;
    localStorage.setItem(`local_onboarding_done_${tenant.id}`, 'true');
    const api = (window as any).electronAPI;
    if (api?.localDbWrite) {
      await api.localDbWrite({
        table: 'tenants',
        row: { id: tenant.id, onboarding_completed: true },
      });
    }
  };

  const handleModeNext = async () => {
    setLoading(true);
    setError('');
    try {
      if (!isLocalMode() && tenant) {
        await supabase.from('tenants').update({ deployment_mode: deploymentMode }).eq('id', tenant.id);
      }
      setStep(3);
    } catch {
      setError('Mod kaydedilemedi, lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleBizInfoNext = async () => {
    const errs: typeof bizErrors = {};
    if (!bizInfo.address.trim()) errs.address = 'Adres zorunludur';
    if (!bizInfo.phone.trim() || bizInfo.phone.replace(/\D/g, '').length < 10)
      errs.phone = 'Geçerli bir telefon girin';
    if (!bizInfo.city) errs.city = 'İl seçin';
    if (!bizInfo.district) errs.district = 'İlçe seçin';
    setBizErrors(errs);
    if (Object.keys(errs).length) {
      setError('Lütfen kırmızı nokta ile işaretli zorunlu alanları doldurun.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const cleanPhone = bizInfo.phone.replace(/\s+/g, '');
      if (!isLocalMode() && tenant) {
        await supabase.from('tenants').update({
          address: bizInfo.address.trim(),
          phone: cleanPhone,
          city: bizInfo.city,
          district: bizInfo.district,
        }).eq('id', tenant.id);

        if (activeBranch) {
          await supabase.from('branches').update({
            address: bizInfo.address.trim(),
            phone: cleanPhone,
            city: bizInfo.city,
            district: bizInfo.district,
          }).eq('id', activeBranch.id);
        }
      } else if (isLocalMode()) {
        const api = (window as any).electronAPI;
        if (api?.localDbWrite && tenant) {
          await api.localDbWrite({
            table: 'tenants',
            row: {
              id: tenant.id,
              address: bizInfo.address.trim(),
              phone: cleanPhone,
              city: bizInfo.city,
              district: bizInfo.district,
            },
          });
        }
      }
      setStep(4);
    } catch (err: any) {
      setError('Bilgiler kaydedilemedi: ' + (err?.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTables = async () => {
    if (!tenant || !activeBranch) return;
    if (finalTableCount < 1 || finalTableCount > 100) {
      setError('Lütfen 1 ile 100 arasında bir masa sayısı girin.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isLocalMode()) {
        const api = (window as any).electronAPI;
        if (!api?.localDbWrite) throw new Error('Electron API bulunamadi');

        const crypto = { randomUUID: () => Math.random().toString(36).slice(2) + Date.now().toString(36) };
        let groupId: string | null = null;

        if (groupName.trim()) {
          groupId = crypto.randomUUID();
          await api.localDbWrite({
            table: 'table_groups',
            row: {
              id: groupId,
              tenant_id: tenant.id,
              branch_id: activeBranch.id,
              name: groupName.trim(),
              prefix: finalPrefix,
              color: '#f97316',
            },
          });
        }

        for (let i = 0; i < finalTableCount; i++) {
          await api.localDbWrite({
            table: 'restaurant_tables',
            row: {
              id: crypto.randomUUID(),
              tenant_id: tenant.id,
              branch_id: activeBranch.id,
              table_number: `${finalPrefix}-${i + 1}`,
              capacity: 4,
              status: 'available',
              size: 'medium',
              group_id: groupId,
              current_order_id: null,
              session_start: null,
              payment_locked: false,
            },
          });
        }

        await markLocalOnboardingDone();
        setStep(5);
        return;
      }

      let groupId: string | null = null;

      if (groupName.trim()) {
        const { data: groupData, error: groupError } = await supabase
          .from('table_groups')
          .insert({ tenant_id: tenant.id, branch_id: activeBranch.id, name: groupName.trim(), prefix: finalPrefix, color: '#f97316' })
          .select('id')
          .single();
        if (groupError) {
          setError('Grup oluşturulamadı: ' + groupError.message);
          setLoading(false);
          return;
        }
        if (groupData?.id) {
          groupId = groupData.id;
        } else {
          const { data: fetched } = await supabase
            .from('table_groups')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('name', groupName.trim())
            .limit(1)
            .maybeSingle();
          if (fetched?.id) groupId = fetched.id;
        }
      }

      const tables = Array.from({ length: finalTableCount }, (_, i) => ({
        tenant_id: tenant.id,
        branch_id: activeBranch.id,
        table_number: `${finalPrefix}-${i + 1}`,
        capacity: 4,
        status: 'available' as const,
        size: 'medium',
        group_id: groupId,
      }));

      const tableInsertResult = await supabase.from('restaurant_tables').insert(tables);
      if (tableInsertResult.error) {
        setError('Masalar oluşturulamadı: ' + tableInsertResult.error.message);
        setLoading(false);
        return;
      }

      await supabase.from('tenants').update({ onboarding_completed: true }).eq('id', tenant.id);

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.id) {
          await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', userData.user.id);
        }
      } catch {}

      setStep(5);
    } catch (err: any) {
      setError('Bir hata oluştu: ' + (err?.message || 'Lütfen tekrar deneyin.'));
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    await onComplete();
    setLoading(false);
  };

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;
  const selectedMode = DEPLOYMENT_MODES.find(m => m.id === deploymentMode)!;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 via-red-500 to-rose-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-red-600 px-8 pt-8 pb-6">
          <div className="flex items-center justify-center mb-6">
            <img src={publicAsset('logo.png')} alt="ŞefPOS" className="h-14 w-auto brightness-0 invert" />
          </div>

          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.id === step;
              const isDone = s.id < step;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone ? 'bg-white border-white' :
                      isActive ? 'bg-white/20 border-white' :
                      'bg-white/10 border-white/30'
                    }`}>
                      {isDone
                        ? <CheckCircle className="w-5 h-5 text-orange-600" />
                        : <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-white/50'}`} />
                      }
                    </div>
                    <span className={`text-[10px] font-semibold mt-1 whitespace-nowrap ${isActive ? 'text-white' : 'text-white/50'}`}>
                      {s.title}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 bg-white/20 mb-5">
                      <div
                        className="h-full bg-white transition-all duration-500"
                        style={{ width: step > s.id ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-1 bg-white/20 rounded-full mt-2">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div className="text-center">
              {phoneFirstSignupHint && (
                <div className="mb-6 text-left rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <p className="font-bold text-emerald-800 mb-1">Cep telefonu ile kayıt tamamlandı</p>
                  <p className="text-emerald-800/90">
                    Bir sonraki adımlarda çalışma modu, işletme adresi ve masalarınızı tamamlayarak ŞefPOS&apos;u kullanmaya
                    başlayın.
                  </p>
                </div>
              )}
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <UtensilsCrossed className="w-10 h-10 text-orange-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-3">
                ŞefPOS'a Hoş Geldiniz!
              </h2>
              <p className="text-slate-500 text-lg mb-2">
                <span className="font-bold text-slate-700">{tenant?.name}</span> için hesabınız hazır.
              </p>
              <p className="text-slate-400 mb-8">
                Sizi birkaç adımda kuruluma yönlendireceğiz. Bu işlem yalnızca 2 dakika sürer.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { icon: LayoutGrid, label: 'Masa Yönetimi', desc: 'Masaları takip edin' },
                  { icon: Users, label: 'Sipariş Takibi', desc: 'Anlık siparişler' },
                  { icon: Wifi, label: 'Online Siparişler', desc: 'Entegre platform' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-slate-50 rounded-2xl p-4 text-center">
                    <Icon className="w-7 h-7 text-orange-500 mx-auto mb-2" />
                    <div className="font-bold text-slate-700 text-sm">{label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-lg shadow-lg"
              >
                Kuruluma Başla
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={async () => {
                  if (isLocalMode()) await markLocalOnboardingDone();
                  onComplete();
                }}
                className="mt-3 w-full text-slate-400 hover:text-slate-600 text-sm py-2 transition"
              >
                Şimdi atla, daha sonra yapayım
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Çalışma Modunu Seçin</h2>
              <p className="text-slate-400 mb-6">Sistemin nasıl çalışmasını istiyorsunuz? İşletmenize en uygun modu seçin.</p>

              <div className="space-y-3 mb-6">
                {DEPLOYMENT_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = deploymentMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setDeploymentMode(mode.id)}
                      className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ${
                        isSelected
                          ? `${mode.bg} ${mode.border} shadow-md`
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                          isSelected ? `${mode.bg} ${mode.border}` : 'bg-slate-100 border-slate-200'
                        }`}>
                          <Icon className={`w-5 h-5 ${isSelected ? mode.accent : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`font-black text-base ${isSelected ? mode.accent : 'text-slate-800'}`}>
                              {mode.title}
                            </span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                              isSelected
                                ? `${mode.bg} ${mode.accent} ${mode.border}`
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {mode.subtitle}
                            </span>
                            {mode.badge && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                                {mode.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 mb-2">{mode.description}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {mode.features.map(f => (
                              <span key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? mode.dotColor : 'bg-slate-300'}`} />
                                {f}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          isSelected ? `${mode.border} ${mode.bg}` : 'border-slate-300'
                        }`}>
                          {isSelected && (
                            <div className={`w-2.5 h-2.5 rounded-full ${mode.dotColor}`} />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className={`rounded-xl p-3 mb-6 flex items-start gap-3 ${selectedMode.bg} border ${selectedMode.border}`}>
                <Shield className={`w-4 h-4 mt-0.5 shrink-0 ${selectedMode.accent}`} />
                <p className={`text-sm font-medium ${selectedMode.accent}`}>
                  <span className="font-black">{selectedMode.title} modu seçildi. </span>
                  {deploymentMode === 'offline' && 'Sistem tamamen yerel olarak çalışacak, internet bağlantısı gerekmeyecek.'}
                  {deploymentMode === 'online' && 'Tüm veriler güvenli bulut sunucusunda saklanacak, çoklu cihaz erişimi mümkün.'}
                  {deploymentMode === 'hybrid' && 'İnternetsiz çalışır, bağlantı kurulunca otomatik senkronize eder.'}
                </p>
              </div>

              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" /> Geri
                </button>
                <button
                  onClick={handleModeNext}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? 'Kaydediliyor...' : 'Devam Et'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">İşletme Bilgileri</h2>
              <p className="text-slate-400 mb-6">
                Aşağıdaki bilgiler işletme kimliğinizi oluşturur ve fişlerde / raporlarda kullanılır.
                <span className="ml-1 inline-flex items-center gap-1 text-slate-500 text-xs">
                  Kırmızı nokta <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" /> ile işaretli alanlar zorunludur.
                </span>
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-orange-500" /> Adres<ReqDot />
                  </label>
                  <input
                    type="text"
                    value={bizInfo.address}
                    onChange={(e) => {
                      setBizInfo((p) => ({ ...p, address: e.target.value }));
                      if (bizErrors.address) setBizErrors((p) => ({ ...p, address: undefined }));
                    }}
                    placeholder="Mahalle, sokak, no"
                    className={`w-full px-4 py-3 rounded-xl border outline-none transition ${
                      bizErrors.address
                        ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                        : 'border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent'
                    }`}
                  />
                  {bizErrors.address && <p className="text-xs text-red-600 mt-1">{bizErrors.address}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-orange-500" /> İl<ReqDot />
                    </label>
                    <select
                      value={bizInfo.city}
                      onChange={(e) => {
                        setBizInfo((p) => ({ ...p, city: e.target.value, district: '' }));
                        if (bizErrors.city) setBizErrors((p) => ({ ...p, city: undefined }));
                      }}
                      className={`w-full px-4 py-3 rounded-xl border outline-none transition bg-white ${
                        bizErrors.city
                          ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                          : 'border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent'
                      }`}
                    >
                      <option value="">Seçin...</option>
                      {TR_CITY_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    {bizErrors.city && <p className="text-xs text-red-600 mt-1">{bizErrors.city}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-orange-500" /> İlçe<ReqDot />
                    </label>
                    <select
                      value={bizInfo.district}
                      onChange={(e) => {
                        setBizInfo((p) => ({ ...p, district: e.target.value }));
                        if (bizErrors.district) setBizErrors((p) => ({ ...p, district: undefined }));
                      }}
                      disabled={!bizInfo.city}
                      className={`w-full px-4 py-3 rounded-xl border outline-none transition bg-white disabled:bg-slate-50 disabled:text-slate-400 ${
                        bizErrors.district
                          ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                          : 'border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent'
                      }`}
                    >
                      <option value="">{bizInfo.city ? 'Seçin...' : 'Önce il seçin'}</option>
                      {districtOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {bizErrors.district && <p className="text-xs text-red-600 mt-1">{bizErrors.district}</p>}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Phone className="w-4 h-4 text-orange-500" /> Telefon<ReqDot />
                  </label>
                  <input
                    type="tel"
                    value={bizInfo.phone}
                    onChange={(e) => {
                      setBizInfo((p) => ({ ...p, phone: e.target.value }));
                      if (bizErrors.phone) setBizErrors((p) => ({ ...p, phone: undefined }));
                    }}
                    placeholder="0212 000 00 00"
                    className={`w-full px-4 py-3 rounded-xl border outline-none transition ${
                      bizErrors.phone
                        ? 'border-red-400 focus:ring-2 focus:ring-red-300'
                        : 'border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent'
                    }`}
                  />
                  {bizErrors.phone && <p className="text-xs text-red-600 mt-1">{bizErrors.phone}</p>}
                </div>

                <div>
                  <label className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4 text-orange-500" /> Web Sitesi <span className="text-slate-400 font-normal">(isteğe bağlı)</span>
                  </label>
                  <input
                    type="url"
                    value={bizInfo.website}
                    onChange={(e) => setBizInfo((p) => ({ ...p, website: e.target.value }))}
                    placeholder="www.restoraniniz.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition"
                  />
                </div>
              </div>

              {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" /> Geri
                </button>
                <button
                  onClick={handleBizInfoNext}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? 'Kaydediliyor...' : 'Devam Et'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-2xl font-black text-slate-800 mb-1">Masaları Oluştur</h2>
              <p className="text-slate-400 mb-6">Kaç masa ile başlamak istiyorsunuz? Sonradan ekleyebilirsiniz.</p>

              <div className="mb-5 grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Salon / Bölge Adı</label>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGroupName(v);
                      if (!prefixManual) setGroupPrefix(computeAutoPrefix(v));
                    }}
                    placeholder="Örn: Salon, Teras, Bahçe"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Masa Öneki</label>
                  <input
                    type="text"
                    value={groupPrefix}
                    maxLength={4}
                    onChange={(e) => {
                      setPrefixManual(true);
                      setGroupPrefix(e.target.value.toLocaleUpperCase('tr-TR'));
                    }}
                    placeholder="S"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition text-center font-bold uppercase tracking-widest"
                  />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-semibold text-slate-700 mb-3">Masa Sayısı</label>
                <div className="grid grid-cols-5 gap-2">
                  {TABLE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        setSelectedPreset(preset.value);
                        if (preset.value !== 0) setTableCount(preset.value);
                      }}
                      className={`py-3 rounded-xl font-bold text-sm transition border-2 ${
                        selectedPreset === preset.value
                          ? 'bg-orange-500 text-white border-orange-600 shadow-lg'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-orange-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {selectedPreset === 0 && (
                  <input
                    type="number"
                    value={customTableCount}
                    onChange={(e) => setCustomTableCount(e.target.value)}
                    placeholder="Masa sayısını girin (1-100)"
                    min={1}
                    max={100}
                    className="mt-3 w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-orange-400 focus:border-transparent outline-none transition"
                  />
                )}
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                <p className="text-orange-700 text-sm font-medium">
                  {groupName.trim() && `"${groupName}" bölgesi altında `}
                  <span className="font-black">{finalTableCount} masa</span> oluşturulacak.
                  {finalTableCount > 0 && (
                    <>
                      {' '}Numaralandırma:{' '}
                      <span className="font-mono font-bold">
                        {finalPrefix}-1, {finalPrefix}-2
                        {finalTableCount > 3 ? `, … ${finalPrefix}-${finalTableCount}` : finalTableCount === 3 ? `, ${finalPrefix}-3` : ''}
                      </span>
                      .
                    </>
                  )}
                </p>
              </div>

              {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition font-semibold"
                >
                  <ArrowLeft className="w-4 h-4" /> Geri
                </button>
                <button
                  onClick={handleCreateTables}
                  disabled={loading || finalTableCount < 1}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? 'Oluşturuluyor...' : `${finalTableCount} Masa Oluştur`}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={async () => {
                  if (isLocalMode()) {
                    await markLocalOnboardingDone();
                  } else {
                    await supabase.from('tenants').update({ onboarding_completed: true }).eq('id', tenant?.id || '');
                  }
                  onComplete();
                }}
                className="mt-3 w-full text-slate-400 hover:text-slate-600 text-sm py-2 transition"
              >
                Bu adımı atla, masaları sonra ekleyeyim
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-14 h-14 text-green-500" />
              </div>
              <h2 className="text-3xl font-black text-slate-800 mb-3">Her Şey Hazır!</h2>
              <p className="text-slate-500 text-lg mb-2">
                <span className="font-bold text-slate-700">{tenant?.name}</span> sisteme başarıyla eklendi.
              </p>
              <p className="text-slate-400 mb-4">
                {finalTableCount > 0 && `${finalTableCount} masa oluşturuldu. `}
                Artık siparişlerinizi yönetmeye başlayabilirsiniz.
              </p>

              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-4 border ${
                deploymentMode === 'offline' ? 'bg-slate-100 text-slate-700 border-slate-300' :
                deploymentMode === 'online' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                'bg-emerald-100 text-emerald-700 border-emerald-300'
              }`}>
                {deploymentMode === 'offline' && <WifiOff className="w-4 h-4" />}
                {deploymentMode === 'online' && <Globe2 className="w-4 h-4" />}
                {deploymentMode === 'hybrid' && <RefreshCw className="w-4 h-4" />}
                {deploymentMode === 'offline' && 'Bağımsız Mod aktif'}
                {deploymentMode === 'online' && 'Bulut Bağlantılı Mod aktif'}
                {deploymentMode === 'hybrid' && 'Karma Mod aktif'}
              </div>

              {/* Trial hosgeldin karti — yalniz yeni acilan ve trial planda olan tenant'larda goster */}
              {(() => {
                const ti = tenantTrialInfo;
                if (!ti.isTrial) return null;
                const endStr = ti.endDate
                  ? ti.endDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '';
                return (
                  <div className="mb-6 mx-auto max-w-md text-left rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-sm shrink-0">
                        <Star className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-amber-900 text-sm">
                          Hediyemiz: 3 gün ücretsiz deneme süresi başladı
                        </p>
                        <p className="text-xs text-amber-800/90 mt-1 leading-snug">
                          Tüm ŞefPOS modüllerini sınırsız kullanabilirsiniz. Süre sonunda
                          {endStr && <> (<span className="font-bold">{endStr}</span>)</>} lisansı aktif etmezseniz
                          giriş ekranı kilitlenir. Aktivasyon için: <span className="font-semibold text-amber-900">0850 309 04 04</span> · WhatsApp · destek@aykasoft.com.tr
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 mb-8 text-left">
                {[
                  { icon: LayoutGrid, title: 'Masa Görünümü', desc: 'Masalarınızı takip edin ve sipariş alın' },
                  { icon: ChefHat, title: 'Ürün Ekle', desc: 'Menünüzü oluşturmak için Ürünler menüsüne gidin' },
                  { icon: Users, title: 'Personel Ekle', desc: 'Kullanıcı yönetiminden garson hesapları açın' },
                  { icon: Zap, title: 'Online Siparişler', desc: 'Yemeksepeti ve getir entegrasyonu mevcut' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-slate-50 rounded-xl p-4 flex gap-3">
                    <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-700 text-sm">{title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleComplete}
                disabled={loading}
                className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 disabled:opacity-60 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-lg shadow-lg"
              >
                {loading ? 'Hazırlanıyor...' : 'ŞefPOS\'u Kullanmaya Başla'}
                {!loading && <ArrowRight className="w-5 h-5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
