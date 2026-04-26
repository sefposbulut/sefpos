import { useState } from 'react';
import {
  Cloud, Server, ArrowRight, ArrowLeft, CheckCircle, ChevronRight,
  Building2, User, Phone, Mail, MapPin, MessageSquare, Shield, Key,
  Zap, Globe, Wifi, WifiOff, RefreshCw, Download, Eye, EyeOff,
  AlertCircle, Handshake, Star, Monitor, HardDrive
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onModeSelect: (mode: 'cloud' | 'sqlserver' | 'terminal' | 'local') => void;
}

type Step = 'welcome' | 'mode' | 'reseller' | 'sqlserver' | 'done';

interface SqlServerConfig {
  host: string;
  port: string;
  username: string;
  password: string;
}

const defaultSqlConfig: SqlServerConfig = {
  host: 'localhost',
  port: '1433',
  username: 'sa',
  password: '',
};

export function SetupWizard({ onModeSelect }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [selectedMode, setSelectedMode] = useState<'cloud' | 'sqlserver' | null>(null);
  const [isReseller, setIsReseller] = useState<boolean | null>(null);
  const [resellerCode, setResellerCode] = useState('');
  const [resellerCodeStatus, setResellerCodeStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [sqlConfig, setSqlConfig] = useState<SqlServerConfig>(defaultSqlConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'ok' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');

  const [resellerForm, setResellerForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    city: '',
    message: '',
  });
  const [resellerSubmitting, setResellerSubmitting] = useState(false);
  const [resellerSubmitted, setResellerSubmitted] = useState(false);

  const handleModeSelect = (mode: 'cloud' | 'sqlserver' | 'terminal' | 'local') => {
    if (mode === 'terminal') {
      onModeSelect('terminal');
      return;
    }
    if (mode === 'local') {
      onModeSelect('local');
      return;
    }
    setSelectedMode(mode as 'cloud' | 'sqlserver');
    if (mode === 'cloud') {
      setStep('reseller');
    } else {
      setStep('sqlserver');
    }
  };

  const handleResellerCodeCheck = async () => {
    if (!resellerCode.trim()) return;
    setResellerCodeStatus('checking');
    const { data, error } = await supabase
      .from('resellers')
      .select('id, company_name, status')
      .eq('status', 'active')
      .ilike('id', resellerCode.trim())
      .maybeSingle();

    if (!error && data) {
      setResellerCodeStatus('ok');
    } else {
      setResellerCodeStatus('error');
    }
  };

  const handleResellerApplicationSubmit = async () => {
    if (!resellerForm.company_name || !resellerForm.email || !resellerForm.phone) return;
    setResellerSubmitting(true);
    const { error } = await supabase
      .from('reseller_applications')
      .insert({
        company_name: resellerForm.company_name,
        contact_name: resellerForm.contact_name,
        email: resellerForm.email,
        phone: resellerForm.phone,
        city: resellerForm.city,
        message: resellerForm.message,
      });
    setResellerSubmitting(false);
    if (!error) {
      setResellerSubmitted(true);
    }
  };

  const handleContinueFromReseller = () => {
    if (selectedMode === 'cloud') {
      onModeSelect('cloud');
    } else {
      setStep('sqlserver');
    }
  };

  const handleSqlServerImport = async () => {
    const api = (window as any).electronAPI;
    if (!api?.importSqlServerSchema) {
      setImportStatus('error');
      setImportMessage('Bu özellik sadece Electron uygulamasında çalışır.');
      return;
    }
    setImportStatus('importing');
    setImportMessage('');
    const result = await api.importSqlServerSchema({
      ...sqlConfig,
      database: 'sefpos45',
      encrypt: false,
      trustServerCertificate: true,
    });
    if (result.success) {
      setImportStatus('ok');
      const adminMsg = result.adminCreated
        ? ' Varsayılan giriş: kullanıcı adı "admin", şifre "1234"'
        : '';
      setImportMessage((result.output || 'sefpos45 veritabanı başarıyla oluşturuldu!') + adminMsg);
    } else {
      setImportStatus('error');
      setImportMessage(result.error || 'Kurulum başarısız oldu.');
    }
  };

  const handleSqlServerSaveAndContinue = async () => {
    const api = (window as any).electronAPI;
    if (api?.setSqlServerConfig) {
      await api.setSqlServerConfig({
        ...sqlConfig,
        database: 'sefpos45',
        encrypt: false,
        trustServerCertificate: true,
      });
    }
    onModeSelect('sqlserver');
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0a1628 0%, #0f2744 50%, #0a1628 100%)' }}>
      <div className="flex-1 flex flex-col items-center justify-center p-6">

        {step === 'welcome' && <WelcomeStep onNext={() => setStep('mode')} />}

        {step === 'mode' && (
          <ModeStep
            onSelect={handleModeSelect}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'reseller' && (
          <ResellerStep
            isReseller={isReseller}
            setIsReseller={setIsReseller}
            resellerCode={resellerCode}
            setResellerCode={setResellerCode}
            resellerCodeStatus={resellerCodeStatus}
            onCheckCode={handleResellerCodeCheck}
            resellerForm={resellerForm}
            setResellerForm={setResellerForm}
            resellerSubmitting={resellerSubmitting}
            resellerSubmitted={resellerSubmitted}
            onSubmitApplication={handleResellerApplicationSubmit}
            onContinue={handleContinueFromReseller}
            onBack={() => setStep('mode')}
          />
        )}

        {step === 'sqlserver' && (
          <SqlServerStep
            config={sqlConfig}
            setConfig={setSqlConfig}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            importStatus={importStatus}
            importMessage={importMessage}
            onImport={handleSqlServerImport}
            onBack={() => setStep('mode')}
            onContinue={handleSqlServerSaveAndContinue}
          />
        )}

      </div>
    </div>
  );
}

function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            i < current
              ? 'bg-emerald-500/20 text-emerald-400'
              : i === current
              ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/50'
              : 'bg-white/5 text-slate-500'
          }`}>
            {i < current ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 flex items-center justify-center text-[10px]">{i + 1}</span>}
            {label}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="w-3 h-3 text-slate-600 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center max-w-lg w-full">
      <div className="mb-8">
        <img src="/logo.png" alt="SefPOS" className="h-16 mx-auto mb-6 drop-shadow-2xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-blue-400 text-sm font-medium mb-5">
          <Star className="w-3.5 h-3.5" />
          Kurulum Sihirbazı
        </div>
        <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
          SefPOS'a<br />
          <span className="text-blue-400">Hoş Geldiniz</span>
        </h1>
        <p className="text-slate-400 text-base leading-relaxed">
          Restoran yönetim sisteminizi birkaç dakikada kurun. Bu sihirbaz sizi adım adım yönlendirecek.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-10">
        {[
          { icon: Zap, label: 'Hızlı Kurulum', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
          { icon: Shield, label: 'Güvenli', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
          { icon: Globe, label: 'Çoklu Şube', color: 'text-blue-400', bg: 'bg-blue-400/10' },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className={`${bg} border border-white/5 rounded-xl p-4 flex flex-col items-center gap-2`}>
            <Icon className={`w-6 h-6 ${color}`} />
            <span className="text-slate-300 text-xs font-medium">{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-2xl py-4 font-bold text-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-900/40"
      >
        Kuruluma Başla
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function ModeStep({ onSelect, onBack }: { onSelect: (m: 'cloud' | 'sqlserver' | 'terminal' | 'local') => void; onBack: () => void }) {
  const [hovered, setHovered] = useState<'cloud' | 'sqlserver' | 'terminal' | 'local' | null>(null);

  return (
    <div className="w-full max-w-4xl">
      <StepIndicator steps={['Hoş Geldiniz', 'Bağlantı', 'Bayi', 'Tamamlandı']} current={1} />

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Bağlantı Modu</h2>
        <p className="text-slate-400">Sisteminizin nasıl çalışacağını seçin</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <button
          onClick={() => onSelect('cloud')}
          onMouseEnter={() => setHovered('cloud')}
          onMouseLeave={() => setHovered(null)}
          className="group bg-white/5 hover:bg-blue-600/15 border border-white/10 hover:border-blue-500/50 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="w-12 h-12 bg-blue-500/20 group-hover:bg-blue-500/30 rounded-xl flex items-center justify-center transition-colors">
              <Cloud className="w-6 h-6 text-blue-400" />
            </div>
            <ArrowRight className={`w-4 h-4 transition-all duration-300 ${hovered === 'cloud' ? 'translate-x-1 text-blue-400' : 'text-slate-600'}`} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">Bulut (Supabase)</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Verileriniz güvenli bulut sunucularında. Çoklu şube ve cihaz desteği.
          </p>
          <ul className="space-y-1.5">
            {['Otomatik yedekleme', 'Çoklu şube', 'Uzaktan erişim', 'Gerçek zamanlı'].map(f => (
              <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                <Wifi className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </button>

        <button
          onClick={() => onSelect('local')}
          onMouseEnter={() => setHovered('local')}
          onMouseLeave={() => setHovered(null)}
          className="group relative bg-white/5 hover:bg-amber-600/15 border border-white/10 hover:border-amber-500/50 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer"
        >
          <span className="absolute top-4 right-4 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-2 py-0.5 rounded-full">Önerilen</span>
          <div className="flex items-center justify-between mb-5">
            <div className="w-12 h-12 bg-amber-500/20 group-hover:bg-amber-500/30 rounded-xl flex items-center justify-center transition-colors">
              <HardDrive className="w-6 h-6 text-amber-400" />
            </div>
            <ArrowRight className={`w-4 h-4 transition-all duration-300 ${hovered === 'local' ? 'translate-x-1 text-amber-400' : 'text-slate-600'}`} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">Yerel (Kurulum Gereksiz)</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            SQL Server kurmaya gerek yok. Veriler bu bilgisayarda saklanır.
          </p>
          <ul className="space-y-1.5">
            {['SQL Server gerektirmez', 'Anında kurulum', 'Kullanıcı adı + şifre', 'Tamamen offline'].map(f => (
              <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                <HardDrive className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </button>

        <button
          onClick={() => onSelect('sqlserver')}
          onMouseEnter={() => setHovered('sqlserver')}
          onMouseLeave={() => setHovered(null)}
          className="group bg-white/5 hover:bg-emerald-600/15 border border-white/10 hover:border-emerald-500/50 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="w-12 h-12 bg-emerald-500/20 group-hover:bg-emerald-500/30 rounded-xl flex items-center justify-center transition-colors">
              <Server className="w-6 h-6 text-emerald-400" />
            </div>
            <ArrowRight className={`w-4 h-4 transition-all duration-300 ${hovered === 'sqlserver' ? 'translate-x-1 text-emerald-400' : 'text-slate-600'}`} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">Yerel (SQL Server)</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Verileriniz yerel sunucuda. SQL Server kurulumu gerektirir.
          </p>
          <ul className="space-y-1.5">
            {['SQL Server gerektirir', 'Tam kontrol', 'Düşük gecikme', 'Tek lokasyon'].map(f => (
              <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                <WifiOff className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </button>

        <button
          onClick={() => onSelect('terminal')}
          onMouseEnter={() => setHovered('terminal')}
          onMouseLeave={() => setHovered(null)}
          className="group bg-white/5 hover:bg-cyan-600/15 border border-white/10 hover:border-cyan-500/50 rounded-2xl p-6 text-left transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="w-12 h-12 bg-cyan-500/20 group-hover:bg-cyan-500/30 rounded-xl flex items-center justify-center transition-colors">
              <Monitor className="w-6 h-6 text-cyan-400" />
            </div>
            <ArrowRight className={`w-4 h-4 transition-all duration-300 ${hovered === 'terminal' ? 'translate-x-1 text-cyan-400' : 'text-slate-600'}`} />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">Terminal (2. PC)</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Ana kasaya bağlı garson terminali. Sadece masalar görünür.
          </p>
          <ul className="space-y-1.5">
            {['Sadece masalar', 'SQL Server bağlantısı', 'Garson ekranı'].map(f => (
              <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                <Monitor className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </button>
      </div>

      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors mx-auto">
        <ArrowLeft className="w-4 h-4" />
        Geri Dön
      </button>
    </div>
  );
}

interface ResellerStepProps {
  isReseller: boolean | null;
  setIsReseller: (v: boolean | null) => void;
  resellerCode: string;
  setResellerCode: (v: string) => void;
  resellerCodeStatus: 'idle' | 'checking' | 'ok' | 'error';
  onCheckCode: () => void;
  resellerForm: { company_name: string; contact_name: string; email: string; phone: string; city: string; message: string; };
  setResellerForm: (v: any) => void;
  resellerSubmitting: boolean;
  resellerSubmitted: boolean;
  onSubmitApplication: () => void;
  onContinue: () => void;
  onBack: () => void;
}

function ResellerStep({
  isReseller, setIsReseller,
  resellerCode, setResellerCode, resellerCodeStatus, onCheckCode,
  resellerForm, setResellerForm,
  resellerSubmitting, resellerSubmitted, onSubmitApplication,
  onContinue, onBack,
}: ResellerStepProps) {
  const [showApplyForm, setShowApplyForm] = useState(false);

  return (
    <div className="w-full max-w-xl">
      <StepIndicator steps={['Hoş Geldiniz', 'Bağlantı', 'Bayi', 'Tamamlandı']} current={2} />

      <div className="text-center mb-7">
        <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Handshake className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Bayi Bilgisi</h2>
        <p className="text-slate-400 text-sm">Bu yazılımı bir bayiden mi aldınız?</p>
      </div>

      {isReseller === null && (
        <div className="space-y-3 mb-6">
          <button
            onClick={() => setIsReseller(true)}
            className="w-full bg-white/5 hover:bg-amber-500/10 border border-white/10 hover:border-amber-500/30 rounded-xl p-5 text-left transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-500/15 group-hover:bg-amber-500/25 rounded-xl flex items-center justify-center transition-colors">
                <Key className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Evet, bayi kodum var</p>
                <p className="text-slate-400 text-xs mt-0.5">Bayi kodum ile sistemi aktive edeceğim</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 ml-auto" />
            </div>
          </button>

          <button
            onClick={() => setIsReseller(false)}
            className="w-full bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/30 rounded-xl p-5 text-left transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-blue-500/15 group-hover:bg-blue-500/25 rounded-xl flex items-center justify-center transition-colors">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Hayır, direkt kullanacağım</p>
                <p className="text-slate-400 text-xs mt-0.5">Bayi kodu olmadan devam edeceğim</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-500 ml-auto" />
            </div>
          </button>
        </div>
      )}

      {isReseller === true && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Bayi Kodu</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={resellerCode}
                onChange={e => { setResellerCode(e.target.value.toUpperCase()); }}
                placeholder="BAYİ-XXXX"
                className="flex-1 bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors font-mono tracking-wider"
              />
              <button
                onClick={onCheckCode}
                disabled={!resellerCode.trim() || resellerCodeStatus === 'checking'}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                {resellerCodeStatus === 'checking' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Doğrula
              </button>
            </div>
            {resellerCodeStatus === 'ok' && (
              <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />Bayi kodu doğrulandı</p>
            )}
            {resellerCodeStatus === 'error' && (
              <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />Geçersiz bayi kodu</p>
            )}
          </div>
          <button onClick={() => setIsReseller(null)} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            Geri dön
          </button>
        </div>
      )}

      {isReseller === false && !showApplyForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <p className="text-slate-300 text-sm text-center mb-4">
            Bayi ağımıza katılmak ister misiniz? Müşterilerinize SefPOS satarak gelir elde edin.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowApplyForm(true)}
              className="flex-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-400 rounded-xl py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Handshake className="w-4 h-4" />
              Bayi Ol
            </button>
            <button
              onClick={onContinue}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              Devam Et
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {isReseller === false && showApplyForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6 space-y-4">
          {resellerSubmitted ? (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-white font-bold text-lg mb-2">Başvurunuz Alındı!</h3>
              <p className="text-slate-400 text-sm">En kısa sürede sizinle iletişime geçeceğiz.</p>
            </div>
          ) : (
            <>
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <Handshake className="w-5 h-5 text-amber-400" />
                Bayi Başvurusu
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Firma Adı *</label>
                  <input type="text" value={resellerForm.company_name} onChange={e => setResellerForm({ ...resellerForm, company_name: e.target.value })}
                    placeholder="Firma Adı" className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">İletişim Kişisi</label>
                  <input type="text" value={resellerForm.contact_name} onChange={e => setResellerForm({ ...resellerForm, contact_name: e.target.value })}
                    placeholder="Ad Soyad" className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">E-posta *</label>
                  <input type="email" value={resellerForm.email} onChange={e => setResellerForm({ ...resellerForm, email: e.target.value })}
                    placeholder="email@firma.com" className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Telefon *</label>
                  <input type="tel" value={resellerForm.phone} onChange={e => setResellerForm({ ...resellerForm, phone: e.target.value })}
                    placeholder="05XX XXX XXXX" className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Şehir</label>
                  <input type="text" value={resellerForm.city} onChange={e => setResellerForm({ ...resellerForm, city: e.target.value })}
                    placeholder="İstanbul" className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Mesaj</label>
                  <input type="text" value={resellerForm.message} onChange={e => setResellerForm({ ...resellerForm, message: e.target.value })}
                    placeholder="Kısa tanıtım..." className="w-full bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm outline-none" />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowApplyForm(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Geri
                </button>
                <button
                  onClick={onSubmitApplication}
                  disabled={resellerSubmitting || !resellerForm.company_name || !resellerForm.email || !resellerForm.phone}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                >
                  {resellerSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Başvuruyu Gönder
                </button>
              </div>
            </>
          )}
          {resellerSubmitted && (
            <button onClick={onContinue} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
              Kuruluma Devam Et
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {(isReseller === true) && (
        <div className="flex gap-3">
          <button onClick={() => setIsReseller(null)} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Geri
          </button>
          <button
            onClick={onContinue}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            Kuruluma Devam Et
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {isReseller === null && (
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors mx-auto">
          <ArrowLeft className="w-4 h-4" />
          Geri Dön
        </button>
      )}
    </div>
  );
}

interface SqlServerStepProps {
  config: SqlServerConfig;
  setConfig: (c: SqlServerConfig) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  importStatus: 'idle' | 'importing' | 'ok' | 'error';
  importMessage: string;
  onImport: () => void;
  onBack: () => void;
  onContinue: () => void;
}

function SqlServerStep({ config, setConfig, showPassword, setShowPassword, importStatus, importMessage, onImport, onBack, onContinue }: SqlServerStepProps) {
  const inputCls = 'w-full bg-white/5 border border-white/10 focus:border-emerald-500/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none transition-colors';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5';

  return (
    <div className="w-full max-w-lg">
      <StepIndicator steps={['Hoş Geldiniz', 'Bağlantı', 'SQL Server', 'Tamamlandı']} current={2} />

      <div className="text-center mb-7">
        <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Server className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">SQL Server Kurulumu</h2>
        <p className="text-slate-400 text-sm">Yerel SQL Server bağlantı bilgilerini girin</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 mb-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Sunucu Adresi</label>
            <input type="text" value={config.host} onChange={e => setConfig({ ...config, host: e.target.value })}
              placeholder="localhost veya 192.168.1.100" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Port</label>
            <input type="text" value={config.port} onChange={e => setConfig({ ...config, port: e.target.value })}
              placeholder="1433" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Kullanıcı Adı</label>
          <input type="text" value={config.username} onChange={e => setConfig({ ...config, username: e.target.value })}
            placeholder="sa" autoComplete="off" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Şifre</label>
          <div className="relative">
            <input type={showPassword ? 'text' : 'password'} value={config.password}
              onChange={e => setConfig({ ...config, password: e.target.value })}
              placeholder="••••••••" autoComplete="new-password" className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Şifresiz bağlantı için boş bırakın (Windows Auth kullanılır)</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <p className="text-amber-300 text-xs font-medium mb-1">Veritabanı Adı</p>
          <p className="text-white text-sm font-mono font-bold">sefpos45</p>
          <p className="text-slate-400 text-xs mt-1">Veritabanı otomatik olarak oluşturulacak</p>
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Otomatik Veritabanı Kurulumu</p>

          {importStatus !== 'idle' && (
            <div className={`flex items-start gap-2.5 p-3 rounded-xl text-xs mb-3 ${
              importStatus === 'importing' ? 'bg-blue-500/10 text-blue-300 border border-blue-500/20' :
              importStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
              'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {importStatus === 'importing' && <RefreshCw className="w-4 h-4 mt-0.5 animate-spin flex-shrink-0" />}
              {importStatus === 'ok' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {importStatus === 'error' && <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>{importStatus === 'importing' ? 'Veritabanı oluşturuluyor...' : importMessage}</span>
            </div>
          )}

          <button
            onClick={onImport}
            disabled={importStatus === 'importing'}
            className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${importStatus === 'importing' ? 'animate-bounce' : ''}`} />
            {importStatus === 'importing' ? 'Kuruluyor...' : 'sefpos45 Veritabanını Oluştur'}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-3 text-slate-400 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20 rounded-xl">
          <ArrowLeft className="w-4 h-4" />
          Geri
        </button>
        <button
          onClick={onContinue}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 text-sm font-bold transition-all flex items-center justify-center gap-2"
        >
          Kaydet ve Devam Et
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
