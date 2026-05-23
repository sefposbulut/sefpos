import type { ReactNode, FC } from 'react';
import { Bike, Gift, QrCode, Sparkles, Users, Building2 } from 'lucide-react';
import type { FeatureCategory } from '../content/featureCatalog';

const WATERMARK = '/sefpos-round.png';
const BRAND_STRIPE = '/sefpos-brand.png';

type SceneProps = {
  fullPage?: boolean;
};

function SceneShell({
  children,
  label,
  fullPage,
  accent = 'from-orange-500/10 to-amber-100/40',
}: {
  children: ReactNode;
  label: string;
  fullPage?: boolean;
  accent?: string;
}) {
  return (
    <div className={`landing-module-scene ${fullPage ? 'is-full is-light' : ''}`}>
      <img src={WATERMARK} alt="" className="landing-module-scene-watermark" aria-hidden />
      <div className={`landing-module-scene-glow bg-gradient-to-br ${accent}`} aria-hidden />
      <div className="landing-module-scene-inner">{children}</div>
      {fullPage && <p className="landing-module-scene-caption">{label}</p>}
    </div>
  );
}

function UiChrome({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="landing-module-ui-window">
      <div className="landing-module-ui-titlebar">
        <img src={BRAND_STRIPE} alt="" className="h-5 w-auto opacity-90" />
        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider ml-2">{title}</span>
      </div>
      <div className="landing-module-ui-body">{children}</div>
    </div>
  );
}

function PaketScene({ fullPage }: SceneProps) {
  const rows = [
    { id: '#104', name: 'Ahmet Y.', total: '₺186', st: 'Hazırlanıyor' },
    { id: '#105', name: 'Elif K.', total: '₺92', st: 'Yolda' },
    { id: '☎', name: 'Caller ID: 0532…', total: '', st: 'Yeni' },
  ];
  return (
    <SceneShell label="Paket servis ekranı — telefon, müşteri ve açık siparişler" fullPage={fullPage}>
      <UiChrome title="Paket servis">
        {rows.map((r) => (
          <div key={r.id} className="landing-module-ui-row">
            <span className="font-bold text-orange-400">{r.id}</span>
            <span className="flex-1 truncate">{r.name}</span>
            <span className="font-bold tabular-nums">{r.total}</span>
            <span className="text-[10px] text-emerald-400">{r.st}</span>
          </div>
        ))}
      </UiChrome>
    </SceneShell>
  );
}

function KasaScene({ fullPage }: SceneProps) {
  return (
    <SceneShell label="Kasa ve ödeme — parçalı ödeme, geçmiş adisyon" fullPage={fullPage}>
      <UiChrome title="Kasa">
        <div className="text-center py-2">
          <p className="text-slate-400 text-xs">Masa 7 · Toplam</p>
          <p className="text-3xl font-black text-orange-400 tabular-nums">₺428,00</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {['Nakit', 'Kart', 'Parçalı', 'Veresiye'].map((m) => (
            <button key={m} type="button" className="landing-module-ui-chip">
              {m}
            </button>
          ))}
        </div>
      </UiChrome>
    </SceneShell>
  );
}

function MutfakScene({ fullPage }: SceneProps) {
  const tickets = ['Mutfak · 2x Adana', 'Bar · 1x Ayran', 'Mutfak · 1x Lahmacun'];
  return (
    <SceneShell label="Mutfak fişi — kategori bazlı yazıcı yönlendirme" fullPage={fullPage}>
      <UiChrome title="Mutfak yazıcı">
        {tickets.map((t) => (
          <div key={t} className="landing-module-ui-ticket font-mono text-xs">
            {t}
          </div>
        ))}
      </UiChrome>
    </SceneShell>
  );
}

function KuryeScene({ fullPage }: SceneProps) {
  return (
    <SceneShell label="Kurye ekranı — atama ve teslimat durumu" fullPage={fullPage}>
      <UiChrome title="Kurye">
        <div className="landing-module-ui-row">
          <Bike className="w-5 h-5 text-orange-400" />
          <span className="flex-1">Paket #104 · Kadıköy</span>
          <span className="text-[10px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded">Yolda</span>
        </div>
        <div className="landing-module-ui-row opacity-70">
          <Bike className="w-5 h-5 text-slate-500" />
          <span className="flex-1">Paket #98 · Üsküdar</span>
          <span className="text-[10px] text-emerald-400">Teslim</span>
        </div>
      </UiChrome>
    </SceneShell>
  );
}

function QrScene({ fullPage }: SceneProps) {
  const items = ['Izgara Köfte — ₺320', 'Ayran — ₺45', 'Künefe — ₺180'];
  return (
    <SceneShell label="QR menü — dijital menü ve garson çağrısı" fullPage={fullPage}>
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-center w-full max-w-lg mx-auto">
        <div className="landing-module-qr-card shrink-0">
          <QrCode className="w-16 h-16 text-orange-500" strokeWidth={1.25} />
          <p className="text-[10px] text-slate-400 mt-2 font-bold">Masa 12</p>
        </div>
        <UiChrome title="Dijital menü">
          {items.map((item) => (
            <div key={item} className="landing-module-ui-row text-sm">
              {item}
            </div>
          ))}
          <button type="button" className="landing-module-ui-chip w-full mt-2">
            Garson çağır
          </button>
        </UiChrome>
      </div>
    </SceneShell>
  );
}

function StokScene({ fullPage }: SceneProps) {
  return (
    <SceneShell label="Stok sayımı ve maliyet takibi" fullPage={fullPage}>
      <UiChrome title="Stok">
        <div className="landing-module-ui-row">
          <span>Un</span>
          <span className="text-amber-400 text-xs font-bold">Kritik</span>
        </div>
        <div className="landing-module-ui-row">
          <span>Zeytinyağı</span>
          <span className="text-slate-400 text-xs">24 L</span>
        </div>
        <div className="landing-module-ui-row">
          <span>Kıyma</span>
          <span className="text-slate-400 text-xs">18 kg</span>
        </div>
      </UiChrome>
    </SceneShell>
  );
}

function RaporScene({ fullPage }: SceneProps) {
  const bars = [40, 65, 45, 80, 55, 90, 70];
  return (
    <SceneShell label="Satış raporu ve gün sonu özeti" fullPage={fullPage}>
      <UiChrome title="Raporlar">
        <p className="text-xs text-slate-400 mb-2">Bugünkü ciro</p>
        <p className="text-2xl font-black text-orange-400 tabular-nums mb-4">₺24.580</p>
        <div className="flex items-end gap-1.5 h-24">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-orange-600 to-orange-400"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </UiChrome>
    </SceneShell>
  );
}

function PersonelScene({ fullPage }: SceneProps) {
  const staff = [
    { n: 'Garson · Ayşe', r: 'Sipariş' },
    { n: 'Kasa · Mehmet', r: 'Ödeme' },
    { n: 'Yönetici', r: 'Rapor' },
  ];
  return (
    <SceneShell label="Personel rolleri ve PIN girişi" fullPage={fullPage}>
      <UiChrome title="Personel">
        {staff.map((s) => (
          <div key={s.n} className="landing-module-ui-row">
            <Users className="w-4 h-4 text-orange-400" />
            <span className="flex-1 font-semibold">{s.n}</span>
            <span className="text-[10px] text-slate-400">{s.r}</span>
          </div>
        ))}
      </UiChrome>
    </SceneShell>
  );
}

function SadakatScene({ fullPage }: SceneProps) {
  return (
    <SceneShell
      label="Ödeme ekranından puan kazanma ve kullanma"
      fullPage={fullPage}
      accent="from-violet-500/5 to-orange-100/50"
    >
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl mx-auto items-stretch">
        <UiChrome title="Ödeme · Masa 5">
          <div className="text-center py-1 mb-2">
            <p className="text-slate-400 text-xs">Toplam</p>
            <p className="text-2xl font-black text-orange-400 tabular-nums">₺248,00</p>
          </div>
          <div className="rounded-lg border border-violet-500/30 bg-violet-950/40 p-2.5 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Gift className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="font-bold text-violet-200">Sadakat puanı</span>
            </div>
            <div className="landing-module-ui-row text-xs bg-slate-900/50 rounded-md">
              <span className="font-semibold text-slate-200">Ayşe Y.</span>
              <span className="text-violet-300 font-black tabular-nums">120 p</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>Kullan: 80 p</span>
              <span className="text-emerald-400 font-bold">−8 ₺</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {['Nakit', 'Kart'].map((m) => (
              <button key={m} type="button" className="landing-module-ui-chip">
                {m}
              </button>
            ))}
          </div>
        </UiChrome>
        <div className="landing-module-ui-window flex flex-col justify-center p-4 min-w-[9rem] sm:max-w-[10rem]">
          <Sparkles className="w-8 h-8 text-orange-400 mx-auto mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-orange-400 text-center mb-1">
            Bu ödemede
          </p>
          <p className="text-2xl font-black text-emerald-400 text-center tabular-nums">+16</p>
          <p className="text-[10px] text-slate-400 text-center">puan kazanım</p>
        </div>
      </div>
    </SceneShell>
  );
}

function SubeScene({ fullPage }: SceneProps) {
  return (
    <SceneShell label="Çok şube — merkezden canlı izleme" fullPage={fullPage}>
      <div className="grid grid-cols-3 gap-2 w-full max-w-md mx-auto">
        {['Kadıköy', 'Beşiktaş', 'Bostancı'].map((b, i) => (
          <div key={b} className="landing-module-ui-chip flex-col py-3 h-auto">
            <Building2 className="w-5 h-5 text-orange-400 mb-1" />
            <span className="text-[10px] font-bold">{b}</span>
            <span className="text-[9px] text-emerald-400">{i === 0 ? 'Dolu' : 'Açık'}</span>
          </div>
        ))}
      </div>
    </SceneShell>
  );
}

const SCENES: Record<string, FC<SceneProps>> = {
  paket: PaketScene,
  kasa: KasaScene,
  mutfak: MutfakScene,
  kurye: KuryeScene,
  qr: QrScene,
  stok: StokScene,
  rapor: RaporScene,
  personel: PersonelScene,
  sadakat: SadakatScene,
  sube: SubeScene,
};

/** Modüle özel ŞefPOS kurumsal sahne görseli */
export function FeatureModuleScene({ module, fullPage }: { module: FeatureCategory; fullPage?: boolean }) {
  const Scene = SCENES[module.id];
  if (Scene) return <Scene fullPage={fullPage} />;
  return (
    <SceneShell label={`${module.menuLabel} — ŞefPOS`} fullPage={fullPage}>
      <UiChrome title={module.menuLabel}>
        <module.icon className="w-12 h-12 text-orange-400 mx-auto my-4" strokeWidth={1.25} />
        <p className="text-center text-sm text-slate-400">{module.lead}</p>
      </UiChrome>
    </SceneShell>
  );
}
