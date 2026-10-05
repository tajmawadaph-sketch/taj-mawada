/**
 * Taj Al-Mawadah Desktop — Main Process (المرحلة 1 و 2)
 * مدمج بالكامل: نافذة آمنة + Single-instance + Tray + تشغيل تلقائي
 * + محرك العتاد وشبكات الإيثرنت والواي فاي والبوابات (Gateway) وفحص المنافذ والطباعة الخام مباشرة
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');

const isWin = process.platform === 'win32';
const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:3000';
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  return next;
}

function resolveAppUrl() {
  if (process.env.TAJ_APP_URL) return process.env.TAJ_APP_URL;
  const cfg = readConfig();
  if (cfg.appUrl) return cfg.appUrl;
  return isDev ? DEV_URL : null;
}

let win = null;
let tray = null;
let quitting = false;

// نسخة واحدة فقط لكل جهاز كمبيوتر
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#FDFBF7',
    title: 'تاج المودة — ERP & POS Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // مطلوب لتمكين الـ Preload من IPC الموسّع
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // الروابط الخارجية تفتح في متصفح النظام
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  loadApp();
}

function loadApp() {
  const url = resolveAppUrl();
  if (!url) {
    win.loadFile(path.join(__dirname, 'setup.html'));
    return;
  }
  win.loadURL(url).catch(() => {
    win.loadFile(path.join(__dirname, 'setup.html'), { query: { error: '1', url } });
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'taj_logo.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('تاج المودة — ERP & POS Desktop');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'فتح البرنامج', click: () => { win.show(); win.focus(); } },
      { label: 'إعادة تحميل', click: () => loadApp() },
      { type: 'separator' },
      {
        label: 'التشغيل التلقائي مع ويندوز',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: 'separator' },
      { label: 'خروج نهائي', click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on('double-click', () => { win.show(); win.focus(); });
}

// --------------------------------------------------------------------------
// 🛠️ محرك العتاد والشبكات المدمج داخل Electron (Hardware & Network Engine)
// --------------------------------------------------------------------------

const runCmd = (cmd, timeout = 3500) =>
  new Promise((resolve) => exec(cmd, { timeout }, (err, stdout) => resolve(err ? '' : String(stdout))));

function subnetRange(ip, mask) {
  try {
    const i = ip.split('.').map(Number);
    const m = (mask || '255.255.255.0').split('.').map(Number);
    const net4 = i.map((p, k) => p & m[k]);
    const br = i.map((p, k) => p | (~m[k] & 255));
    const start = Math.max(1, net4[3] + 1);
    const end = Math.min(254, br[3] - 1);
    return start <= end ? { startHost: start, endHost: end } : { startHost: 1, endHost: 30 };
  } catch {
    return { startHost: 1, endHost: 30 };
  }
}

const typeOf = (name) => {
  const n = name.toLowerCase();
  if (/wi-?fi|wlan|wireless|wl/i.test(n)) return 'wifi';
  return 'ethernet';
};

async function parseGateways() {
  const map = {};
  if (isWin) {
    const out = await runCmd('ipconfig');
    let cur = null;
    for (const line of out.split(/\r?\n/)) {
      const h = line.match(/^(?:Ethernet adapter|Wireless LAN adapter)\s+(.+?):$/i);
      if (h) { cur = h[1].trim(); continue; }
      const g = line.match(/Default Gateway[.\s]+:\s*([0-9.]+)/i);
      if (cur && g && g[1] !== '0.0.0.0') map[cur] = g[1];
    }
  } else {
    const out = await runCmd('ip route');
    for (const line of out.split('\n')) {
      const m = line.match(/^default via ([0-9.]+) dev (\S+)/);
      if (m) map[m[2]] = m[1];
    }
  }
  return map;
}

async function detectSystemNetwork() {
  const gws = await parseGateways();
  const ifaces = os.networkInterfaces();
  const adapters = [];

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/bluetooth|loopback|virtual|vethernet|vmware|vbox|\*/i.test(name)) continue;
    const v4 = (addrs || []).find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    const type = typeOf(name);
    const base = {
      id: `${type}-${name}`,
      type,
      name,
      displayName: type === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
    };

    if (v4) {
      const p = v4.address.split('.');
      const prefix = `${p[0]}.${p[1]}.${p[2]}`;
      const gw = gws[name] || null;
      const range = subnetRange(v4.address, v4.netmask);
      adapters.push({
        ...base,
        status: 'connected',
        ip: v4.address,
        netmask: v4.netmask,
        gateway: gw,
        subnetPrefix: prefix,
        gatewaySubnet: gw ? gw.split('.').slice(0, 3).join('.') : prefix,
        startHost: range.startHost,
        endHost: range.endHost,
        currentHost: Number(p[3]),
      });
    } else {
      adapters.push({
        ...base,
        status: 'disconnected',
        ip: null,
        netmask: null,
        gateway: null,
      });
    }
  }

  // ضمان إبراز كرت الإيثرنت وكرت الواي فاي دائماً في اللوحة
  for (const t of ['ethernet', 'wifi']) {
    if (!adapters.some((a) => a.type === t)) {
      adapters.push({
        id: t,
        type: t,
        name: t === 'wifi' ? 'Wi-Fi' : 'Ethernet',
        displayName: t === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
        status: 'disconnected',
        ip: null,
        netmask: null,
        gateway: null,
      });
    }
  }

  adapters.sort((a) => (a.type === 'ethernet' ? -1 : 1));
  const primary = adapters.find((a) => a.status === 'connected') || adapters[0];

  return {
    success: true,
    isDesktopNative: true,
    adapters,
    primary: primary && primary.ip ? primary : null,
    all: adapters.filter((a) => a.ip),
  };
}

function nativePing(ip, ms = 600) {
  const cmd = isWin ? `ping -n 1 -w ${ms} ${ip}` : `ping -c 1 -W ${Math.ceil(ms / 1000)} ${ip}`;
  const t = Date.now();
  return runCmd(cmd, ms + 400).then((out) => ({
    alive: /ttl=/i.test(out) && !/unreachable|timed out|could not find/i.test(out),
    latency: Date.now() - t,
  }));
}

function nativeTcp(ip, port, ms = 800) {
  return new Promise((resolve) => {
    const t = Date.now();
    const s = new net.Socket();
    s.setTimeout(ms);
    s.connect(port, ip, () => {
      s.destroy();
      resolve({ open: true, latency: Date.now() - t });
    });
    s.on('error', (err) => {
      s.destroy();
      resolve({ open: false, latency: Date.now() - t, error: err.code || err.message });
    });
    s.on('timeout', () => {
      s.destroy();
      resolve({ open: false, latency: Date.now() - t, error: 'TIMEOUT' });
    });
  });
}

// إرسال أوامر ESC/POS وطباعة خام مباشرة عبر منفذ الشبكة (Port 9100 RAW)
function nativeRawPrint(ip, port = 9100, bufferData) {
  return new Promise((resolve, reject) => {
    const s = new net.Socket();
    s.setTimeout(4000);
    s.connect(port, ip, () => {
      const data = Buffer.isBuffer(bufferData) ? bufferData : Buffer.from(bufferData);
      s.write(data, () => {
        s.end();
        resolve({ success: true, message: `تم إرسال أمر الطباعة بنجاح إلى ${ip}:${port}` });
      });
    });
    s.on('error', (err) => {
      s.destroy();
      reject(new Error(`فشل الاتصال بالطابعة على ${ip}:${port} (${err.message})`));
    });
    s.on('timeout', () => {
      s.destroy();
      reject(new Error(`انتهت مهلة الاتصال بالطابعة على ${ip}:${port}`));
    });
  });
}

// --------------------------------------------------------------------------
// 📡 قنوات IPC المتاحة لـ Web App عبر window.tajDesktop
// --------------------------------------------------------------------------

ipcMain.handle('taj:get-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  userData: app.getPath('userData'),
  appUrl: resolveAppUrl(),
  isDesktop: true,
}));

ipcMain.handle('taj:set-app-url', (_e, url) => {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(clean)) return { ok: false, error: 'رابط غير صالح' };
  writeConfig({ appUrl: clean.replace(/\/+$/, '') });
  loadApp();
  return { ok: true };
});

ipcMain.handle('taj:detect-network', async () => {
  try {
    return await detectSystemNetwork();
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:ping', async (_e, { ip, port, timeoutMs }) => {
  try {
    const icmp = await nativePing(ip, timeoutMs || 700);
    const targetPort = port ? Number(port) : undefined;
    let t = { open: false, latency: 0, error: undefined };
    if (targetPort) {
      t = await nativeTcp(ip, targetPort, (timeoutMs || 700) + 200);
    }
    const reachable = icmp.alive || t.open;
    const latency = t.open ? t.latency : icmp.latency;
    let message = 'الجهاز غير متاح على الشبكة أو مفصول';
    if (t.open) message = `الجهاز متصل والمنفذ ${targetPort} مفتوح وجاهز للعمل (${latency}ms) 🟢`;
    else if (icmp.alive) message = targetPort ? `الجهاز متصل (Ping OK) لكن المنفذ ${targetPort} مغلق 🟡` : `الجهاز متصل ومستجيب (${latency}ms) 🟢`;

    return {
      success: true,
      reachable,
      hostAlive: icmp.alive,
      portOpen: t.open,
      latency,
      message,
    };
  } catch (err) {
    return { success: false, reachable: false, error: err.message };
  }
});

ipcMain.handle('taj:scan-subnet', async (_e, { subnetPrefix, startHost, endHost, port }) => {
  try {
    const prefix = subnetPrefix || '192.168.1';
    const s = Math.max(1, Number(startHost) || 1);
    const e = Math.min(254, Number(endHost) || 30);
    const p = Number(port) || 9100;
    const hosts = [];
    for (let h = s; h <= e; h++) hosts.push(h);

    const discovered = [];
    for (let i = 0; i < hosts.length; i += 10) {
      await Promise.all(
        hosts.slice(i, i + 10).map(async (h) => {
          const ip = `${prefix}.${h}`;
          const icmp = await nativePing(ip, 500);
          const t = await nativeTcp(ip, p, 600);
          if (icmp.alive || t.open) {
            discovered.push({
              ip,
              port: p,
              hostAlive: icmp.alive,
              portOpen: t.open,
              latency: t.open ? t.latency : icmp.latency,
            });
          }
        })
      );
    }
    return { success: true, scannedCount: hosts.length, discovered };
  } catch (err) {
    return { success: false, error: err.message, discovered: [] };
  }
});

ipcMain.handle('taj:print-raw', async (_e, { ip, port, data }) => {
  try {
    return await nativeRawPrint(ip, port || 9100, data);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:kick-drawer', async (_e, { ip, port }) => {
  try {
    // أمر فتح الدرج القياسي ESC p 0 25 250
    const kickCmd = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    return await nativeRawPrint(ip, port || 9100, kickCmd);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// إدارة النسخ الاحتياطي في الذاكرة الدائمة المحلية (Offline Backup Storage)
ipcMain.handle('taj:backup-export', async (_e, { fileName, payload }) => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const name = fileName || `TajPOS_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.tajbak`;
    const fullPath = path.join(backupDir, name);
    fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true, filePath: fullPath, fileName: name };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('taj:backup-list', async () => {
  try {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) return { success: true, files: [] };
    const files = fs.readdirSync(backupDir).map((f) => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, date: stat.mtime };
    });
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* يبقى في Tray */ });
