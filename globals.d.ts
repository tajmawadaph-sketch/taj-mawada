// Global types declarations for Taj Al-Mawadah App

declare global {
  function showGlobalToast(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void;

  interface TajDesktopAPI {
    isDesktop: boolean;
    getInfo: () => Promise<{
      version: string;
      platform: string;
      userData: string;
      sessionData: string;
      dataLocationMigrationError?: string | null;
      pendingDataLocation?: string | null;
      appUrl: string | null;
      isDesktop: boolean;
    }>;
    chooseDataDirectory: () => Promise<{
      success: boolean;
      canceled?: boolean;
      path?: string;
      error?: string;
    }>;
    cancelDataDirectory: () => Promise<{ success: boolean }>;
    applyDataDirectory: () => Promise<{
      success: boolean;
      restarting?: boolean;
      error?: string;
    }>;
    setAppUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
    detectNetwork: () => Promise<{
      success: boolean;
      isDesktopNative?: boolean;
      adapters?: any[];
      primary?: any;
      all?: any[];
      error?: string;
    }>;
    pingHost: (ip: string, port?: number, timeoutMs?: number) => Promise<{
      success: boolean;
      reachable: boolean;
      hostAlive?: boolean;
      portOpen?: boolean;
      latency: number;
      message?: string;
      error?: string;
    }>;
    scanSubnet: (params: { subnetPrefix?: string; startHost?: number; endHost?: number; port?: number }) => Promise<{
      success: boolean;
      scannedCount?: number;
      discovered?: Array<{ ip: string; port: number; hostAlive?: boolean; portOpen?: boolean; latency: number }>;
      error?: string;
    }>;
    printRaw: (params: { ip: string; port?: number; data: string | number[] | Uint8Array }) => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    kickDrawer: (params: { ip: string; port?: number }) => Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    backupExport: (params: { fileName?: string; payload: any }) => Promise<{
      success: boolean;
      filePath?: string;
      fileName?: string;
      error?: string;
    }>;
    backupList: () => Promise<{
      success: boolean;
      files: Array<{ name: string; size: number; date: string | Date }>;
      error?: string;
    }>;
    syncQueueAdd: (item: {
      id: string;
      table: string;
      type?: string;
      action: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE';
      payload?: any;
      data?: any;
      status?: 'pending' | 'syncing' | 'failed';
      retry_count?: number;
      created_at?: string;
      error_message?: string;
    }) => Promise<{ success: boolean; id?: string }>;
    syncQueueListPending: () => Promise<Array<{
      id: string;
      table: string;
      type?: string;
      action: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE';
      payload: any;
      data: any;
      status: 'pending' | 'failed';
      retry_count: number;
      created_at: string;
      error_message?: string;
    }>>;
    syncQueueCountPending: () => Promise<number>;
    syncQueueDiagnostics: () => Promise<{
      success: boolean;
      total: number;
      pending: number;
      syncing: number;
      failed: number;
      oldestPendingAt?: string;
      oldestSyncingAt?: string;
      maxFailedRetries: number;
      errorCategories: {
        permission: number;
        rpc: number;
        network: number;
        validation: number;
      };
    }>;
    syncQueueSetStatus: (params: { id: string; status: 'pending' | 'syncing' }) => Promise<{ success: boolean }>;
    syncQueueMarkFailed: (params: { id: string; errorMessage?: string }) => Promise<{ success: boolean }>;
    syncQueueRemove: (id: string) => Promise<{ success: boolean }>;
    syncQueueClear: () => Promise<{ success: boolean }>;
  }

  interface Window {
    showGlobalToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    tajDesktop?: TajDesktopAPI;
  }
}

export {};
