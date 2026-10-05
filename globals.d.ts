// Global types declarations for Taj Al-Mawadah App

declare global {
  function showGlobalToast(message: string, type?: 'success' | 'error' | 'warning' | 'info'): void;

  interface TajDesktopAPI {
    isDesktop: boolean;
    getInfo: () => Promise<{
      version: string;
      platform: string;
      userData: string;
      appUrl: string | null;
      isDesktop: boolean;
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
  }

  interface Window {
    showGlobalToast?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    tajDesktop?: TajDesktopAPI;
  }
}

export {};
