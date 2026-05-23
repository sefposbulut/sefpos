import { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, Mail, Building2, Handshake, FileText } from 'lucide-react';
import { fetchPublicDealers, type PublicDealerPin } from '../../../lib/fetchPublicDealers';
import { provinceDisplayName } from '../../../lib/resellerProvince';
import { TurkeySvgMap } from './TurkeySvgMap';

type Props = {
  onApply?: () => void;
};

export function TurkeyResellerMap({ onApply }: Props) {
  const [dealers, setDealers] = useState<PublicDealerPin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const rows = await fetchPublicDealers();
      if (mounted) {
        setDealers(rows);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const byProvince = useMemo(() => {
    const map = new Map<string, PublicDealerPin[]>();
    for (const d of dealers) {
      if (!d.province_slug) continue;
      const list = map.get(d.province_slug) ?? [];
      list.push(d);
      map.set(d.province_slug, list);
    }
    return map;
  }, [dealers]);

  const coveredSlugs = useMemo(() => new Set(byProvince.keys()), [byProvince]);
  const selectedDealers = selectedSlug ? byProvince.get(selectedSlug) ?? [] : [];

  return (
    <div className="landing-dealer-map">
      <div className="landing-dealer-map-header">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-1">Türkiye bayi haritası</p>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900">İlinize tıklayın</h2>
          <p className="text-slate-600 mt-2 text-sm md:text-base max-w-2xl">
            Turuncu illerde yetkili bayilerimiz var. İle tıklayın veya üzerine gelin — il adı haritanın içinde görünür.
          </p>
        </div>
        <div className="landing-dealer-map-legend">
          <span className="landing-dealer-map-legend-item">
            <span className="landing-dealer-map-dot is-active" /> Bayi var ({coveredSlugs.size} il)
          </span>
          <span className="landing-dealer-map-legend-item">
            <span className="landing-dealer-map-dot" /> Bayi yok
          </span>
        </div>
      </div>

      <div className="landing-dealer-map-sheet">
        <div className="landing-dealer-map-visual">
          {loading ? (
            <div className="landing-dealer-map-loading">Harita yükleniyor…</div>
          ) : (
            <TurkeySvgMap
              coveredSlugs={coveredSlugs}
              selectedSlug={selectedSlug}
              onSelectSlug={setSelectedSlug}
            />
          )}
        </div>

        <div className="landing-dealer-map-detail">
          {selectedSlug ? (
            <>
              <div className="landing-dealer-map-detail-head">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                    {provinceDisplayName(selectedSlug)}
                  </p>
                  <h3 className="text-lg font-black text-slate-900 mt-0.5">
                    {selectedDealers.length > 0
                      ? `${selectedDealers.length} yetkili bayi`
                      : 'Bu ilde henüz bayimiz yok'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSlug(null)}
                  className="text-sm font-semibold text-slate-500 hover:text-orange-600"
                >
                  Seçimi temizle
                </button>
              </div>

              {selectedDealers.length > 0 ? (
                <ul className="landing-dealer-map-detail-grid">
                  {selectedDealers.map((d) => (
                    <li key={d.id} className="landing-dealer-card">
                      <p className="font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-orange-500 shrink-0" />
                        {d.company_name}
                      </p>
                      {d.contact_name && (
                        <p className="text-sm text-slate-600 mt-1 flex items-center gap-1.5">
                          <Handshake className="w-3.5 h-3.5 text-slate-400" />
                          {d.contact_name}
                        </p>
                      )}
                      {d.phone && (
                        <a
                          href={`tel:${d.phone.replace(/\s/g, '')}`}
                          className="text-sm text-orange-600 font-semibold mt-2 flex items-center gap-1.5 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {d.phone}
                        </a>
                      )}
                      {d.email && (
                        <a
                          href={`mailto:${d.email}`}
                          className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 hover:text-orange-600"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {d.email}
                        </a>
                      )}
                      {d.license_count > 0 && (
                        <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 inline-block mt-2">
                          {d.license_count} aktif lisans
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-600">
                  Bu bölgede bayilik için aşağıdaki başvuru formunu kullanabilirsiniz.
                </p>
              )}
            </>
          ) : (
            <div className="landing-dealer-map-detail-empty">
              <MapPin className="w-8 h-8 text-orange-400 shrink-0" />
              <div>
                <p className="font-bold text-slate-800">Haritadan bir il seçin</p>
                <p className="text-sm text-slate-600 mt-1">
                  {dealers.length > 0 ? (
                    <>
                      Türkiye genelinde <strong className="text-orange-600">{dealers.length}</strong> aktif bayi
                      kayıtlı — turuncu illere tıklayın.
                    </>
                  ) : (
                    'Turuncu renkli illerde yetkili bayilerimiz listelenir.'
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {onApply && (
        <div className="landing-dealer-map-apply">
          <div className="landing-dealer-map-apply-inner">
            <FileText className="w-10 h-10 text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-black text-slate-900 text-lg">Bayilik başvurusu</p>
              <p className="text-sm text-slate-600 mt-1">
                Bölgenizde ŞefPOS bayisi olmak veya iş ortaklığı için formu doldurun; ekibimiz sizi arar.
              </p>
            </div>
            <button type="button" onClick={onApply} className="landing-btn-primary shrink-0 text-sm py-3 px-6">
              Başvuru formu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
