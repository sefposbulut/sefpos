import { useState } from 'react';
import { Cloud, Server, ArrowRight, CheckCircle, Monitor, HardDrive } from 'lucide-react';
import { publicAsset } from '../lib/assetUrl';

interface Props {
  onSelect: (mode: 'cloud' | 'sqlserver' | 'postgres' | 'terminal' | 'local') => void;
}

export function DatabaseModeSelector({ onSelect }: Props) {
  const [hovered, setHovered] = useState<'cloud' | 'sqlserver' | 'postgres' | 'terminal' | 'local' | null>(null);

  const modes = [
    {
      key: 'cloud' as const,
      icon: Cloud,
      color: 'blue',
      title: 'Bulut (Supabase)',
      desc: 'Verileriniz bulutta saklanır. Internet gerektirir.',
      features: ['Otomatik yedekleme', 'Çoklu şube', 'Uzaktan erişim'],
    },
    {
      key: 'local' as const,
      icon: HardDrive,
      color: 'amber',
      title: 'Yerel (Kurulum Gereksiz)',
      desc: 'Veriler bu bilgisayarda tutulur. SQL Server kurmaya gerek yok.',
      features: ['Internet gerektirmez', 'Anında kurulum', 'Kullanıcı adı + şifre ile giriş'],
      recommended: true,
    },
    {
      key: 'postgres' as const,
      icon: Server,
      color: 'emerald',
      title: 'Offline (PostgreSQL)',
      desc: 'Yerel PostgreSQL. Kurulum ve yapılandırma gerektirir.',
      features: ['PostgreSQL gerektirir', 'Tam yerel kontrol', 'Düşük gecikme'],
    },
    {
      key: 'terminal' as const,
      icon: Monitor,
      color: 'cyan',
      title: 'Terminal (2. PC)',
      desc: 'Ana kasaya bağlı masa terminali. Sadece masalar görünür.',
      features: ['Sadece masa ekranı', 'Yerel veritabanına bağlanır', 'Garson ekranı'],
    },
  ];

  const colorMap: Record<string, { bg: string; hover: string; border: string; icon: string; check: string; arrow: string; badge: string }> = {
    blue:    { bg: 'bg-blue-500/20',    hover: 'hover:bg-blue-600/20',    border: 'hover:border-blue-500/60',    icon: 'text-blue-400',    check: 'text-blue-400',    arrow: 'text-blue-400',    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    amber:   { bg: 'bg-amber-500/20',   hover: 'hover:bg-amber-600/20',   border: 'hover:border-amber-500/60',   icon: 'text-amber-400',   check: 'text-amber-400',   arrow: 'text-amber-400',   badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    emerald: { bg: 'bg-emerald-500/20', hover: 'hover:bg-emerald-600/20', border: 'hover:border-emerald-500/60', icon: 'text-emerald-400', check: 'text-emerald-400', arrow: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    cyan:    { bg: 'bg-cyan-500/20',    hover: 'hover:bg-cyan-600/20',    border: 'hover:border-cyan-500/60',    icon: 'text-cyan-400',    check: 'text-cyan-400',    arrow: 'text-cyan-400',    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 55%, #0f2744 100%)' }}>
      <div className="mb-10 text-center">
        <img src={publicAsset('logo.png')} alt="ShefPOS" className="h-14 mx-auto mb-5 drop-shadow-xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <h1 className="text-3xl font-bold text-white mb-2">Bağlantı Modu</h1>
        <p className="text-slate-400 text-base">Veritabanı bağlantı türünü seçin</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-3xl">
        {modes.map((m) => {
          const c = colorMap[m.color];
          const Icon = m.icon;
          const isHov = hovered === m.key;
          return (
            <button
              key={m.key}
              onClick={() => onSelect(m.key)}
              onMouseEnter={() => setHovered(m.key)}
              onMouseLeave={() => setHovered(null)}
              className={`group relative bg-white/5 ${c.hover} border border-white/10 ${c.border} rounded-2xl p-7 text-left transition-all duration-300 cursor-pointer`}
            >
              {m.recommended && (
                <span className={`absolute top-4 right-4 text-xs font-bold px-2.5 py-1 rounded-full border ${c.badge}`}>
                  Önerilen
                </span>
              )}
              <div className="flex items-center justify-between mb-5">
                <div className={`w-13 h-13 ${c.bg} rounded-xl flex items-center justify-center transition-colors p-3`}>
                  <Icon className={`w-7 h-7 ${c.icon}`} />
                </div>
                <ArrowRight className={`w-5 h-5 text-slate-500 transition-all duration-300 ${isHov ? `translate-x-1 ${c.arrow}` : ''}`} />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">{m.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{m.desc}</p>
              <ul className="space-y-2">
                {m.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle className={`w-3.5 h-3.5 ${c.check} flex-shrink-0`} />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <p className="mt-8 text-slate-500 text-sm">Bu seçim daha sonra Ayarlar bölümünden değiştirilebilir</p>
    </div>
  );
}
