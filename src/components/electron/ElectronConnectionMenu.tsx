import { useState } from 'react';
import {
  Cloud,
  HardDrive,
  Server,
  Monitor,
  ChevronRight,
  ChevronDown,
  Shield,
  Headphones,
} from 'lucide-react';
import { publicAsset } from '../../lib/assetUrl';

export type ElectronConnectMode = 'cloud' | 'sqlserver' | 'postgres' | 'terminal' | 'local';

type Props = {
  onSelect: (mode: ElectronConnectMode) => void;
  /** Bağlantı modu değiştirme (giriş ekranından) */
  variant?: 'setup' | 'switch';
  onBack?: () => void;
};

const PRIMARY: {
  key: ElectronConnectMode;
  icon: typeof Cloud;
  title: string;
  subtitle: string;
  badge?: string;
}[] = [
  {
    key: 'cloud',
    icon: Cloud,
    title: 'Bulut bağlantı',
    subtitle: 'ŞefPOS merkezi sunucu · çoklu şube · otomatik yedekleme',
    badge: 'Önerilen',
  },
  {
    key: 'local',
    icon: HardDrive,
    title: 'Yerel kasa',
    subtitle: 'İnternet gerekmez · tek bilgisayar · hızlı kurulum',
  },
  {
    key: 'sqlserver',
    icon: Server,
    title: 'SQL Server (şube sunucusu)',
    subtitle: 'Kendi veritabanınız · çoklu kasa · internet gerekmez',
    badge: 'Offline şube',
  },
];

const ADVANCED: {
  key: ElectronConnectMode;
  icon: typeof Server;
  title: string;
  hint: string;
}[] = [
  {
    key: 'terminal',
    icon: Monitor,
    title: 'Garson terminali',
    hint: 'Ana kasaya bağlı ikinci ekran (aynı SQL Server)',
  },
];

export function ElectronConnectionMenu({ onSelect, variant = 'setup', onBack }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hovered, setHovered] = useState<ElectronConnectMode | null>(null);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Üst kurumsal şerit */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={publicAsset('sefpos-round.png')}
            alt="ŞefPOS"
            className="h-11 w-11 rounded-full object-cover ring-2 ring-orange-100"
            onError={(e) => {
              (e.target as HTMLImageElement).src = publicAsset('logo.png');
            }}
          />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600">ŞefPOS</p>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              {variant === 'switch' ? 'Bağlantı modu' : 'Masaüstü kurulum'}
            </h1>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            Kurumsal POS
          </span>
          <span className="inline-flex items-center gap-1">
            <Headphones className="w-3.5 h-3.5 text-slate-400" />
            0544 244 90 80
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
              Veri bağlantısını seçin
            </h2>
            <p className="text-slate-600 text-sm md:text-base max-w-lg mx-auto">
              Restoranınızın çalışma şekline uygun modu belirleyin. Seçimi daha sonra Ayarlar
              bölümünden değiştirebilirsiniz.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {PRIMARY.map((item) => {
              const Icon = item.icon;
              const active = hovered === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  onMouseEnter={() => setHovered(item.key)}
                  onMouseLeave={() => setHovered(null)}
                  className={`relative text-left rounded-2xl border-2 bg-white p-6 transition-all duration-200 shadow-sm hover:shadow-md ${
                    active
                      ? 'border-orange-500 ring-2 ring-orange-500/20'
                      : 'border-slate-200 hover:border-orange-300'
                  }`}
                >
                  {item.badge && (
                    <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                      item.key === 'cloud' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed pr-6">{item.subtitle}</p>
                  <span
                    className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${
                      active ? 'text-orange-600' : 'text-slate-400'
                    }`}
                  >
                    Seç
                    <ChevronRight className={`w-4 h-4 transition ${active ? 'translate-x-0.5' : ''}`} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition"
            >
              <span className="text-sm font-semibold text-slate-700">Gelişmiş seçenekler</span>
              {advancedOpen ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {advancedOpen && (
              <ul className="border-t border-slate-100 divide-y divide-slate-100">
                {ADVANCED.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.key)}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-orange-50/50 transition text-left"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <Icon className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{item.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{item.hint}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onBack && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onBack}
                className="text-sm font-semibold text-slate-500 hover:text-orange-600 transition"
              >
                ← Giriş ekranına dön
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="shrink-0 py-4 text-center text-xs text-slate-400 border-t border-slate-200 bg-white">
        © {new Date().getFullYear()} ŞefPOS · www.sefpos.com.tr
      </footer>
    </div>
  );
}
