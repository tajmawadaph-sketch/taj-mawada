const { contextBridge, ipcRenderer } = require('electron');

// واجهة آمنة متكاملة بين واجهة المتصفح ومحرك ويندوز المدمج
contextBridge.exposeInMainWorld('tajDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('taj:get-info'),
  setAppUrl: (url) => ipcRenderer.invoke('taj:set-app-url', url),
  detectNetwork: () => ipcRenderer.invoke('taj:detect-network'),
  pingHost: (ip, port, timeoutMs) => ipcRenderer.invoke('taj:ping', { ip, port, timeoutMs }),
  scanSubnet: (params) => ipcRenderer.invoke('taj:scan-subnet', params || {}),
  printRaw: (params) => ipcRenderer.invoke('taj:print-raw', params),
  kickDrawer: (params) => ipcRenderer.invoke('taj:kick-drawer', params),
  backupExport: (params) => ipcRenderer.invoke('taj:backup-export', params),
  backupList: () => ipcRenderer.invoke('taj:backup-list'),
});

