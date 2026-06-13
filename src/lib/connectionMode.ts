export type ConnectionModeKey = 'cloud' | 'sqlserver' | 'hybrid' | 'local' | 'terminal' | null;

export interface ConnectionModeDisplay {
  key: ConnectionModeKey;
  label: string;
  shortLabel: string;
  description: string;
  tone: 'cloud' | 'sql' | 'local' | 'terminal';
}

export function readElectronDbMode(): ConnectionModeKey {
  try {
    const raw = localStorage.getItem('dbMode');
    if (raw === 'cloud' || raw === 'sqlserver' || raw === 'hybrid' || raw === 'local' || raw === 'terminal') return raw;
    if (raw === 'postgres') return 'sqlserver';
  } catch {
    /* ignore */
  }
  return null;
}

export function getConnectionModeDisplay(mode: ConnectionModeKey): ConnectionModeDisplay {
  switch (mode) {
    case 'sqlserver':
      return {
        key: 'sqlserver',
        label: 'SQL Server (Offline şube)',
        shortLabel: 'SQL Server',
        description: 'Kendi veritabanınız · internet gerekmez',
        tone: 'sql',
      };
    case 'hybrid':
      return {
        key: 'hybrid',
        label: 'Hibrit (SQL + Bulut)',
        shortLabel: 'Hibrit',
        description: 'Kasa SQL · mobil garson bulut · otomatik senkron',
        tone: 'sql',
      };
    case 'local':
      return {
        key: 'local',
        label: 'Yerel kasa',
        shortLabel: 'Yerel',
        description: 'Tek bilgisayar · hızlı kurulum',
        tone: 'local',
      };
    case 'terminal':
      return {
        key: 'terminal',
        label: 'Garson terminali',
        shortLabel: 'Terminal',
        description: 'Ana kasaya bağlı ikinci ekran',
        tone: 'terminal',
      };
    case 'cloud':
    default:
      return {
        key: 'cloud',
        label: 'Bulut bağlantı',
        shortLabel: 'Bulut',
        description: 'Merkezi sunucu · otomatik yedekleme',
        tone: 'cloud',
      };
  }
}
