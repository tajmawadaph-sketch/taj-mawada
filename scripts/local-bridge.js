#!/usr/bin/env node
/**
 * Taj Al-Mawadah Local Hardware Bridge
 * يعمل على جهاز الكاشير نفسه (127.0.0.1:7788) ليقرأ كروت الشبكة الحقيقية
 * ويفحص الشبكة المحلية (Ping / TCP 9100) لصالح النظام المستضاف على HTTPS.
 * التشغيل: node scripts/local-bridge.js
 */
const http = require('http');
const os = require('os');
const net = require('net');
const { exec } = require('child_process');

const PORT = Number(process.env.BRIDGE_PORT) || 7788;
const isWin = process.platform === 'win32';

const run = (cmd, timeout = 3500) =>
  new Promise((resolve) => exec(cmd, { timeout }, (err, stdout) => resolve(err ? '' : String(stdout))));

function subnetRange(ip, mask) {
  const i = ip.split('.').map(Number);
  const m = (mask || '255.255.255.0').split('.').map(Number);
  const net4 = i.map((p, k) => p & m[k]);
  const br = i.map((p, k) => p | (~m[k] & 255));
  const start = Math.max(1, net4[3] + 1);
  const end = Math.min(254, br[3] - 1);
  return start <= end ? { startHost: start, endHost: end } : { startHost: 1, endHost: 30 };
}

const typeOf = (name) => {
  const n = name.toLowerCase();
  if (/wi-?fi|wlan|wireless|wl/.test(n)) return 'wifi';
  return 'ethernet';
};

async function parseGateways() {
  const map = {};
  if (isWin) {
    const out = await run('ipconfig');
    let cur = null;
    for (const line of out.split(/\r?\n/)) {
      const h = line.match(/^(?:Ethernet adapter|Wireless LAN adapter)\s+(.+?):$/i);
      if (h) { cur = h[1].trim(); continue; }
      const g = line.match(/Default Gateway[.\s]+:\s*([0-9.]+)/i);
      if (cur && g) map[cur] = g[1];
    }
  } else {
    const out = await run('ip route');
    for (const line of out.split('\n')) {
      const m = line.match(/^default via ([0-9.]+) dev (\S+)/);
      if (m) map[m[2]] = m[1];
    }
  }
  return map;
}

async function detect() {
  const gws = await parseGateways();
  const ifaces = os.networkInterfaces();
  const adapters = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (/bluetooth|loopback|virtual|vethernet|vmware|vbox|\*/i.test(name)) continue;
    const v4 = (addrs || []).find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'));
    const type = typeOf(name);
    const base = {
      id: `${type}-${name}`, type, name,
      displayName: type === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
    };
    if (v4) {
      const p = v4.address.split('.');
      const prefix = `${p[0]}.${p[1]}.${p[2]}`;
      const gw = gws[name] || null;
      adapters.push({
        ...base, status: 'connected', ip: v4.address, netmask: v4.netmask, gateway: gw,
        subnetPrefix: prefix,
        gatewaySubnet: gw ? gw.split('.').slice(0, 3).join('.') : prefix,
        ...subnetRange(v4.address, v4.netmask), currentHost: Number(p[3]),
      });
    } else {
      adapters.push({ ...base, status: 'disconnected', ip: null, netmask: null, gateway: null });
    }
  }
  for (const type of ['ethernet', 'wifi']) {
    if (!adapters.some((a) => a.type === type)) {
      adapters.push({
        id: type, type,
        name: type === 'wifi' ? 'Wi-Fi' : 'Ethernet',
        displayName: type === 'wifi' ? 'كرت الواي فاي اللاسلكي (Wi-Fi)' : 'كرت الشبكة السلكية (Ethernet LAN)',
        status: 'disconnected', ip: null, netmask: null, gateway: null,
      });
    }
  }
  adapters.sort((a) => (a.type === 'ethernet' ? -1 : 1));
  const primary = adapters.find((a) => a.status === 'connected') || adapters[0];
  return {
    success: true, bridge: true, adapters,
    primary: primary && primary.ip ? primary : null,
    all: adapters.filter((a) => a.ip),
  };
}

function ping(ip, ms = 600) {
  const cmd = isWin ? `ping -n 1 -w ${ms} ${ip}` : `ping -c 1 -W ${Math.ceil(ms / 1000)} ${ip}`;
  const t = Date.now();
  return run(cmd, ms + 400).then((out) => ({ alive: /ttl=/i.test(out) && !/unreachable/i.test(out), latency: Date.now() - t }));
}

function tcp(ip, port, ms = 800) {
  return new Promise((resolve) => {
    const t = Date.now();
    const s = new net.Socket();
    s.setTimeout(ms);
    s.connect(port, ip, () => { s.destroy(); resolve({ open: true, latency: Date.now() - t }); });
    s.on('error', () => { s.destroy(); resolve({ open: false, latency: Date.now() - t }); });
    s.on('timeout', () => { s.destroy(); resolve({ open: false, latency: Date.now() - t }); });
  });
}

async function handlePing({ ip, port }) {
  const icmp = await ping(ip, 700);
  const t = port ? await tcp(ip, Number(port), 900) : { open: false, latency: 0 };
  const reachable = icmp.alive || t.open;
  const latency = t.open ? t.latency : icmp.latency;
  let message = 'الجهاز غير متاح على الشبكة أو مفصول';
  if (t.open) message = `الجهاز متصل والمنفذ ${port} مفتوح وجاهز للعمل (${latency}ms) 🟢`;
  else if (icmp.alive) message = port ? `الجهاز متصل (Ping OK) لكن المنفذ ${port} مغلق 🟡` : `الجهاز متصل ومستجيب (${latency}ms) 🟢`;
  return { success: true, reachable, hostAlive: icmp.alive, portOpen: t.open, latency, message };
}

async function handleScan({ subnetPrefix, startHost, endHost, port }) {
  const prefix = subnetPrefix || '192.168.1';
  const s = Math.max(1, Number(startHost) || 1);
  const e = Math.min(254, Number(endHost) || 30);
  const p = Number(port) || 9100;
  const hosts = [];
  for (let h = s; h <= e; h++) hosts.push(h);
  const discovered = [];
  for (let i = 0; i < hosts.length; i += 10) {
    await Promise.all(hosts.slice(i, i + 10).map(async (h) => {
      const ip = `${prefix}.${h}`;
      const icmp = await ping(ip, 500);
      const t = await tcp(ip, p, 600);
      if (icmp.alive || t.open) {
        discovered.push({ ip, port: p, hostAlive: true, portOpen: t.open, latency: t.open ? t.latency : icmp.latency });
      }
    }));
  }
  return { success: true, scannedCount: hosts.length, discovered };
}

const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    let out;
    if (req.method === 'GET') out = await detect();
    else {
      const b = await readBody(req);
      out = b.action === 'scan' ? await handleScan(b) : b.action === 'ping' && b.ip ? await handlePing(b) : { success: false };
    }
    res.writeHead(200); res.end(JSON.stringify(out));
  } catch (err) {
    res.writeHead(500); res.end(JSON.stringify({ success: false, error: String(err.message || err) }));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`✅ Taj Local Bridge يعمل على http://127.0.0.1:${PORT} — اترك هذه النافذة مفتوحة`);
});
