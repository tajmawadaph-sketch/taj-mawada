const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('taj:sync-queue:renderer-recovered', () => {
  window.dispatchEvent(new Event('tajmawadah-sync-queue-recovered'));
});

// واجهة آمنة متكاملة بين واجهة المتصفح ومحرك ويندوز المدمج
contextBridge.exposeInMainWorld('tajDesktop', {
  isDesktop: true,
  getInfo: () => ipcRenderer.invoke('taj:get-info'),
  chooseDataDirectory: () => ipcRenderer.invoke('taj:data-location:choose'),
  cancelDataDirectory: () => ipcRenderer.invoke('taj:data-location:cancel'),
  applyDataDirectory: () => ipcRenderer.invoke('taj:data-location:apply'),
  setAppUrl: (url) => ipcRenderer.invoke('taj:set-app-url', url),
  detectNetwork: () => ipcRenderer.invoke('taj:detect-network'),
  pingHost: (ip, port, timeoutMs) => ipcRenderer.invoke('taj:ping', { ip, port, timeoutMs }),
  scanSubnet: (params) => ipcRenderer.invoke('taj:scan-subnet', params || {}),
  printRaw: (params) => ipcRenderer.invoke('taj:print-raw', params),
  kickDrawer: (params) => ipcRenderer.invoke('taj:kick-drawer', params),
  backupExport: (params) => ipcRenderer.invoke('taj:backup-export', params),
  backupList: () => ipcRenderer.invoke('taj:backup-list'),
  syncQueueAdd: (item) => ipcRenderer.invoke('taj:sync-queue:add', item),
  syncQueueListPending: () => ipcRenderer.invoke('taj:sync-queue:list-pending'),
  syncQueueCountPending: () => ipcRenderer.invoke('taj:sync-queue:count-pending'),
  syncQueueDiagnostics: () => ipcRenderer.invoke('taj:sync-queue:diagnostics'),
  syncQueueSetStatus: (params) => ipcRenderer.invoke('taj:sync-queue:set-status', params),
  syncQueueMarkFailed: (params) => ipcRenderer.invoke('taj:sync-queue:mark-failed', params),
  syncQueueRemove: (id) => ipcRenderer.invoke('taj:sync-queue:remove', id),
  syncQueueClear: () => ipcRenderer.invoke('taj:sync-queue:clear'),
});

