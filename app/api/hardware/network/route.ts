import { NextRequest, NextResponse } from 'next/server';
import os from 'os';
import net from 'net';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// فحص بقاء الجهاز على قيد الحياة عبر ICMP Ping
async function pingHost(ip: string, timeoutMs: number = 600): Promise<{ alive: boolean; latency: number }> {
  const isWin = process.platform === 'win32';
  const cmd = isWin 
    ? `ping -n 1 -w ${timeoutMs} ${ip}` 
    : `ping -c 1 -W ${Math.ceil(timeoutMs / 1000)} ${ip}`;

  const start = Date.now();
  try {
    const { stdout } = await execPromise(cmd, { timeout: timeoutMs + 300 });
    const latency = Date.now() - start;
    
    if (
      stdout.includes('Destination host unreachable') || 
      stdout.includes('timed out') || 
      stdout.includes('100% loss') ||
      stdout.includes('could not find host')
    ) {
      return { alive: false, latency };
    }

    const isAlive = stdout.includes('TTL=') || stdout.includes('ttl=');
    return { alive: isAlive, latency };
  } catch {
    return { alive: false, latency: Date.now() - start };
  }
}

// فحص منفذ TCP محدد (مثل 9100 للطابعات أو 8080 لمدى أو 80 للويب)
function probeTcpPort(ip: string, port: number, timeoutMs: number = 800): Promise<{ open: boolean; latency: number; error?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(timeoutMs);

    socket.connect(port, ip, () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ open: true, latency });
    });

    socket.on('error', (err: any) => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ open: false, latency, error: err.code || err.message });
    });

    socket.on('timeout', () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ open: false, latency, error: 'TIMEOUT' });
    });
  });
}

// حساب نطاق الهوستات والبرودكاست بدقة من Netmask
function getSubnetRange(ip: string, netmask: string) {
  try {
    const ipParts = ip.split('.').map(Number);
    const maskParts = (netmask || '255.255.255.0').split('.').map(Number);
    const netParts = ipParts.map((p, i) => p & maskParts[i]);
    const broadParts = ipParts.map((p, i) => p | (~maskParts[i] & 255));
    const startHost = Math.max(1, netParts[3] + 1);
    const endHost = Math.min(254, broadParts[3] - 1);
    return {
      startHost: startHost <= endHost ? startHost : 1,
      endHost: startHost <= endHost ? endHost : 30,
      currentHost: ipParts[3],
      network: netParts.join('.'),
      broadcast: broadParts.join('.')
    };
  } catch {
    return { startHost: 1, endHost: 30, currentHost: 1, network: '', broadcast: '' };
  }
}

// استخراج معلومات الشبكة المحلية النشطة
function getLocalNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const activeInterfaces: Array<{
    name: string;
    ip: string;
    netmask: string;
    cidr: string;
    subnetPrefix: string;
    startHost: number;
    endHost: number;
    currentHost: number;
  }> = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        const parts = addr.address.split('.');
        const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        const range = getSubnetRange(addr.address, addr.netmask);
        activeInterfaces.push({
          name,
          ip: addr.address,
          netmask: addr.netmask,
          cidr: addr.cidr || `${addr.address}/24`,
          subnetPrefix,
          startHost: range.startHost,
          endHost: range.endHost,
          currentHost: range.currentHost
        });
      }
    }
  }

  // الواجهة الأساسية المفضلة (Wi-Fi أو Ethernet)
  const primary = activeInterfaces.find(i => 
    i.name.toLowerCase().includes('wi-fi') || 
    i.name.toLowerCase().includes('wlan') || 
    i.name.toLowerCase().includes('ethernet')
  ) || activeInterfaces[0] || {
    name: 'Default Subnet',
    ip: '192.168.1.1',
    netmask: '255.255.255.0',
    cidr: '192.168.1.1/24',
    subnetPrefix: '192.168.1',
    startHost: 1,
    endHost: 30,
    currentHost: 1
  };

  return { primary, all: activeInterfaces };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'detect_network';

    if (action === 'detect_network') {
      const netInfo = getLocalNetworkInfo();
      return NextResponse.json({
        success: true,
        primary: netInfo.primary,
        all: netInfo.all
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, ip, port, subnetPrefix, startHost, endHost } = body;

    // 1. فحص جهاز فردي (Ping & Port Probe)
    if (action === 'ping') {
      if (!ip) {
        return NextResponse.json({ success: false, error: 'IP address is required' }, { status: 400 });
      }

      const targetPort = port ? Number(port) : undefined;
      const icmp = await pingHost(ip, 700);
      
      let tcpResult = { open: false, latency: 0, error: undefined as string | undefined };
      if (targetPort) {
        tcpResult = await probeTcpPort(ip, targetPort, 900);
      }

      // الجهاز متاح إذا استجاب لـ Ping أو إذا كان المنفذ TCP مفتوحاً
      const reachable = icmp.alive || tcpResult.open;
      const finalLatency = tcpResult.open ? tcpResult.latency : icmp.latency;

      let message = 'الجهاز غير متاح على الشبكة أو مفصول';
      if (tcpResult.open) {
        message = `الجهاز متصل والمنفذ ${targetPort} مفتوح وجاهز للعمل (${finalLatency}ms) 🟢`;
      } else if (icmp.alive) {
        message = targetPort 
          ? `الجهاز متصل بالشبكة (Ping OK) لكن المنفذ ${targetPort} مغلق أو غير مستجيب 🟡`
          : `الجهاز متصل بالشبكة ومستجيب (${finalLatency}ms) 🟢`;
      }

      return NextResponse.json({
        success: true,
        reachable,
        hostAlive: icmp.alive,
        portOpen: tcpResult.open,
        latency: finalLatency,
        message,
        details: { icmpAlive: icmp.alive, tcpOpen: tcpResult.open, tcpError: tcpResult.error }
      });
    }

    // 2. فحص نطاق شبكة كامل (Subnet Scan)
    if (action === 'scan') {
      const prefix = subnetPrefix || '192.168.1';
      const start = Math.max(1, Number(startHost) || 1);
      const end = Math.min(254, Number(endHost) || 30);
      const targetPort = port ? Number(port) : 9100;

      const discovered: Array<{
        ip: string;
        port: number;
        hostAlive: boolean;
        portOpen: boolean;
        latency: number;
      }> = [];

      // تجميع العناوين للفحص في مجموعات متزامنة لتوفير الوقت
      const hosts: number[] = [];
      for (let h = start; h <= end; h++) {
        hosts.push(h);
      }

      const batchSize = 10;
      for (let i = 0; i < hosts.length; i += batchSize) {
        const batch = hosts.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (hostNum) => {
            const hostIp = `${prefix}.${hostNum}`;
            
            // محاولة Ping أولاً
            const icmp = await pingHost(hostIp, 500);
            let tcpOpen = false;
            let latency = icmp.latency;

            if (icmp.alive) {
              const tcp = await probeTcpPort(hostIp, targetPort, 600);
              tcpOpen = tcp.open;
              if (tcp.open) latency = tcp.latency;

              discovered.push({
                ip: hostIp,
                port: targetPort,
                hostAlive: true,
                portOpen: tcpOpen,
                latency
              });
            } else {
              // بعض الطابعات تلغي الرد على Ping ولكن تبقي منفذ 9100 مفتوحاً
              const tcp = await probeTcpPort(hostIp, targetPort, 500);
              if (tcp.open) {
                discovered.push({
                  ip: hostIp,
                  port: targetPort,
                  hostAlive: true,
                  portOpen: true,
                  latency: tcp.latency
                });
              }
            }
          })
        );
      }

      return NextResponse.json({
        success: true,
        scannedCount: hosts.length,
        discovered
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
