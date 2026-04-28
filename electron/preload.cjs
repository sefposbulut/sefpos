const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getZoom: () => ipcRenderer.invoke('get-zoom'),
  setZoom: (factor) => ipcRenderer.invoke('set-zoom', factor),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (opts) => ipcRenderer.invoke('print-receipt', opts),
  registerPrinters: (opts) => ipcRenderer.invoke('register-printers', opts),
  getDbMode: () => ipcRenderer.invoke('get-db-mode'),
  setDbMode: (mode) => ipcRenderer.invoke('set-db-mode', mode),
  getSqlServerConfig: () => ipcRenderer.invoke('get-sqlserver-config'),
  setSqlServerConfig: (config) => ipcRenderer.invoke('set-sqlserver-config', config),
  importSqlServerSchema: (config) => ipcRenderer.invoke('import-sqlserver-schema', config),
  sqlTestConnection: (config) => ipcRenderer.invoke('sql-test-connection', config),
  postgresTestConnection: (config) => ipcRenderer.invoke('postgres-test-connection', config),
  postgresInitDatabase: (config) => ipcRenderer.invoke('postgres-init-database', config),
  sqlLogin: (opts) => ipcRenderer.invoke('sql-login', opts),
  sqlRegister: (opts) => ipcRenderer.invoke('sql-register', opts),
  sqlHashPassword: (password) => ipcRenderer.invoke('sql-hash-password', password),
  sqlFindProfileByUsername: (username) => ipcRenderer.invoke('sql-find-profile-by-username', username),
  sqlQuery: (opts) => ipcRenderer.invoke('sql-query', opts),
  sqlGetBranches: (opts) => ipcRenderer.invoke('sql-get-branches', opts),
  sqlGetTerminalUsers: () => ipcRenderer.invoke('sql-get-terminal-users'),
  localDbLogin: (opts) => ipcRenderer.invoke('local-db-login', opts),
  localDbRegister: (opts) => ipcRenderer.invoke('local-db-register', opts),
  localDbAddUser: (opts) => ipcRenderer.invoke('local-db-add-user', opts),
  localDbChangePassword: (opts) => ipcRenderer.invoke('local-db-change-password', opts),
  localDbGetUsers: (opts) => ipcRenderer.invoke('local-db-get-users', opts),
  localDbGetRoles: (opts) => ipcRenderer.invoke('local-db-get-roles', opts),
  localDbGetBranches: (opts) => ipcRenderer.invoke('local-db-get-branches', opts),
  localDbUpdateProfile: (opts) => ipcRenderer.invoke('local-db-update-profile', opts),
  localDbGetTerminalUsers: (opts) => ipcRenderer.invoke('local-db-get-terminal-users', opts),
  localDbIsEmpty: () => ipcRenderer.invoke('local-db-is-empty'),
  localDbRead: (opts) => ipcRenderer.invoke('local-db-read', opts),
  localDbWrite: (opts) => ipcRenderer.invoke('local-db-write', opts),
  localDbDelete: (opts) => ipcRenderer.invoke('local-db-delete', opts),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateDownloadProgress: (cb) => ipcRenderer.on('update-download-progress', (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  },
  getIpAddress: () => ipcRenderer.invoke('get-ip-address'),
  getDeviceFingerprint: () => ipcRenderer.invoke('get-device-fingerprint'),
  scaleStartWeighing: (opts) => ipcRenderer.invoke('scale-start-weighing', opts),
  scaleStopWeighing: () => ipcRenderer.invoke('scale-stop-weighing'),
  scaleGetWeight: () => ipcRenderer.invoke('scale-get-weight'),
  scaleListPorts: () => ipcRenderer.invoke('scale-list-ports'),
  onScaleWeightUpdate: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('scale-weight-update', listener);
    return () => ipcRenderer.removeListener('scale-weight-update', listener);
  },
  onScaleWeighingError: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('scale-weighing-error', listener);
    return () => ipcRenderer.removeListener('scale-weighing-error', listener);
  },
  isElectron: true,
});
