import { useCallback, useEffect, useState } from 'react';
import { Bike, Link2, Puzzle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import IntegrationPanel from './IntegrationPanel';
import HemenYoldaIntegrationSettings from './HemenYoldaIntegrationSettings';
import PartnerPullApiSettings from './PartnerPullApiSettings';

interface Branch {
  id: string;
  name: string;
}

interface Props {
  tenantId: string;
  branches: Branch[];
  activeBranchId: string | null;
  userId: string | null;
}

type PanelId = 'hemenyolda' | 'partner-pull' | null;

export default function IntegrationsSettings({ tenantId, branches, activeBranchId, userId }: Props) {
  const [openPanel, setOpenPanel] = useState<PanelId>('hemenyolda');
  const [hyActive, setHyActive] = useState(false);
  const [partnerCount, setPartnerCount] = useState(0);
  const [partnerActiveCount, setPartnerActiveCount] = useState(0);

  const loadHyStatus = useCallback(async () => {
    const { data } = await supabase
      .from('henemyolda_integrations')
      .select('is_active, access_token')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setHyActive(!!data?.is_active && !!String(data.access_token || '').trim());
  }, [tenantId]);

  useEffect(() => {
    loadHyStatus();
  }, [loadHyStatus]);

  const togglePanel = (id: PanelId) => {
    setOpenPanel((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 md:p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Puzzle className="w-7 h-7 shrink-0" />
          <h3 className="text-lg md:text-2xl font-bold">Entegrasyonlarımız</h3>
        </div>
        <p className="text-slate-200 text-sm md:text-base leading-relaxed">
          Kurye ve dış firmalarla bağlantıları buradan yönetin. Her entegrasyon için paneli açıp bilgileri girin ve{' '}
          <strong>Kaydet</strong>’e basın.
        </p>
        <ul className="mt-3 text-xs md:text-sm text-slate-300 space-y-1 list-disc list-inside">
          <li>
            <strong>HemenYolda:</strong> ŞefPOS siparişi otomatik gönderir (APP_NAME + token).
          </li>
          <li>
            <strong>Diğer firmalar:</strong> Firma ŞefPOS’tan REST API ile sipariş çeker (API anahtarı siz üretirsiniz).
          </li>
        </ul>
      </div>

      <IntegrationPanel
        title="HemenYolda"
        subtitle="Paket siparişler otomatik webhook ile gider"
        icon={Bike}
        accent="emerald"
        open={openPanel === 'hemenyolda'}
        onToggle={() => togglePanel('hemenyolda')}
        badge={
          hyActive ? { text: 'Aktif', tone: 'ok' } : { text: 'Kurulum gerekli', tone: 'warn' }
        }
      >
        <HemenYoldaIntegrationSettings
          tenantId={tenantId}
          branches={branches}
          activeBranchId={activeBranchId}
          embedded
          onConfiguredChange={setHyActive}
        />
      </IntegrationPanel>

      <IntegrationPanel
        title="Diğer firmalar (REST API)"
        subtitle="Firma siparişi ŞefPOS’tan çeker — her firma için anahtar"
        icon={Link2}
        accent="indigo"
        open={openPanel === 'partner-pull'}
        onToggle={() => togglePanel('partner-pull')}
        badge={
          partnerActiveCount > 0
            ? { text: `${partnerActiveCount} aktif`, tone: 'ok' }
            : partnerCount > 0
              ? { text: `${partnerCount} kayıt`, tone: 'muted' }
              : { text: 'Firma ekle', tone: 'muted' }
        }
      >
        <PartnerPullApiSettings
          tenantId={tenantId}
          branches={branches}
          activeBranchId={activeBranchId}
          userId={userId}
          onClientsChange={(count, active) => {
            setPartnerCount(count);
            setPartnerActiveCount(active);
          }}
        />
      </IntegrationPanel>

      <p className="text-xs text-slate-500 text-center px-2">
        Yeni entegrasyonlar (farklı kurye platformları vb.) bu listeye eklenecek.
      </p>
    </div>
  );
}

