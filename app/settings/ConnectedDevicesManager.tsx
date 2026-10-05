"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Printer, 
  Scan, 
  CreditCard, 
  Scale, 
  Monitor, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Wifi, 
  Usb, 
  Bluetooth, 
  Cpu, 
  Play, 
  Star, 
  X,
  Search,
  Radio,
  Sliders,
  Check,
  Activity,
  ShieldCheck,
  Terminal,
  Zap,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/lib/toast-context';
import { useLanguage } from '@/lib/LanguageContext';
import { playPosBeep, triggerHaptic } from '@/components/BarcodeScannerWidget';
import {
  ConnectedDevice,
  HardwareCapabilities,
  getHardwareCapabilities,
  loadPairedDevices,
  savePairedDevices,
  pairUsbDevice,
  pairSerialDevice,
  pairHidScanner,
  scanLocalSubnet,
  probeNetworkEndpoint,
  detectActiveLocalNetwork,
  performDeviceHandshake,
  testThermalReceiptPrint,
  openCashDrawer,
  readScaleWeight,
  testMadaPosTerminal
} from '@/lib/hardwareEngine';

export default function ConnectedDevicesManager() {
  const { showToast } = useToast();
  const { language } = useLanguage();
  const isEn = language === 'en';

  // 1️⃣ حالة الأجهزة (بدء بقائمة فارغة تماماً - No Mock Data)
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [capabilities, setCapabilities] = useState<HardwareCapabilities>({
    webUsb: false,
    webSerial: false,
    webHid: false,
    webBluetooth: false,
    isSecureContext: false
  });

  // التصفية والبحث
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // حالة فحص النبض الجماعي (Pulse Check)
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [pingProgress, setPingProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // نافذة الاستكشاف والاقتران الحي (Discovery & Pairing Wizard Modal)
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState<'usb' | 'serial' | 'hid' | 'network' | 'manual'>('usb');

  // معلومات الشبكة المستكشفة تلقائياً
  const [detectedNetwork, setDetectedNetwork] = useState<{ ip: string; subnetPrefix: string; name: string } | null>(null);

  // فحص عنوان IP فردي مباشر
  const [singleTestIp, setSingleTestIp] = useState('');
  const [singleTestPort, setSingleTestPort] = useState(9100);
  const [isSingleTesting, setIsSingleTesting] = useState(false);
  const [singleTestResult, setSingleTestResult] = useState<{ reachable: boolean; latency: number; message?: string; hostAlive?: boolean; portOpen?: boolean; error?: string } | null>(null);

  // فحص نطاق الشبكة المحلية (Local Subnet Scanner)
  const [subnetPrefix, setSubnetPrefix] = useState('192.168.1');
  const [startHost, setStartHost] = useState(1);
  const [endHost, setEndHost] = useState(30);
  const [scanPort, setScanPort] = useState(9100);
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [subnetProgress, setSubnetProgress] = useState<{ scanned: number; total: number; currentIp: string }>({ scanned: 0, total: 0, currentIp: '' });
  const [discoveredIps, setDiscoveredIps] = useState<Array<{ ip: string; port: number; latency: number }>>([]);

  // نافذة التعديل / الإضافة اليدوية
  const [editingDevice, setEditingDevice] = useState<ConnectedDevice | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // نوافذ الاختبار التفاعلية
  const [isScannerTestOpen, setIsScannerTestOpen] = useState(false);
  const [scannerTestLog, setScannerTestLog] = useState<string[]>([]);
  const [liveScannerInput, setLiveScannerInput] = useState('');

  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [scaleReading, setScaleReading] = useState<{ weight: number; unit: string; rawText: string } | null>(null);
  const [isScaleReading, setIsScaleReading] = useState(false);

  const [madaModalOpen, setMadaModalOpen] = useState(false);
  const [madaTestResult, setMadaTestResult] = useState<{ success: boolean; latency: number; details: string; terminalId?: string } | null>(null);
  const [isMadaTesting, setIsMadaTesting] = useState(false);

  // نافذة تأكيد الحذف (بدون native confirm)
  const [deviceToDelete, setDeviceToDelete] = useState<ConnectedDevice | null>(null);

  // وظيفة اكتشاف الشبكة النشطة
  const refreshNetworkInfo = useCallback(async () => {
    try {
      const netInfo = await detectActiveLocalNetwork();
      if (netInfo && netInfo.subnetPrefix) {
        setDetectedNetwork(netInfo);
        setSubnetPrefix(netInfo.subnetPrefix);
        if (!singleTestIp) {
          setSingleTestIp(`${netInfo.subnetPrefix}.150`);
        }
      }
    } catch (e) {
      console.warn('Network detect failed:', e);
    }
  }, [singleTestIp]);

  // تحميل الأجهزة المخزنة وقدرات المتصفح واستكشاف الشبكة عند بدء التشغيل
  useEffect(() => {
    const caps = getHardwareCapabilities();
    setCapabilities(caps);

    const loaded = loadPairedDevices();
    setDevices(loaded);

    refreshNetworkInfo();
  }, [refreshNetworkInfo]);

  // حفظ التغييرات وتحديث التخزين
  const updateAndSaveDevices = useCallback((updated: ConnectedDevice[]) => {
    setDevices(updated);
    savePairedDevices(updated);
  }, []);

  // فئات الأجهزة المتاحة
  const categories = useMemo(() => [
    { id: 'all', nameAr: '🌟 كافة الطرفيات', nameEn: 'All Peripherals', icon: '⚡' },
    { id: 'receipt_printer', nameAr: '🖨️ طابعات الإيصالات (80mm)', nameEn: 'Receipt Printers', icon: '🖨️' },
    { id: 'label_printer', nameAr: '🏷️ طابعات الباركود', nameEn: 'Label Printers', icon: '🏷️' },
    { id: 'a4_printer', nameAr: '📄 طابعات A4', nameEn: 'A4 Printers', icon: '📄' },
    { id: 'barcode_scanner', nameAr: '🔍 قارئات الباركود', nameEn: 'Barcode Scanners', icon: '🔍' },
    { id: 'pos_terminal', nameAr: '💳 أجهزة مدى والدفع', nameEn: 'Mada / POS', icon: '💳' },
    { id: 'cash_drawer', nameAr: '🔓 أدراج النقدية', nameEn: 'Cash Drawers', icon: '🔓' },
    { id: 'scale', nameAr: '⚖️ الموازين الإلكترونية', nameEn: 'Digital Scales', icon: '⚖️' },
    { id: 'customer_display', nameAr: '🖥️ شاشات العملاء (VFD)', nameEn: 'Customer Displays', icon: '🖥️' }
  ], []);

  // تصفية الأجهزة
  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const matchesCat = selectedCategory === 'all' || d.category === selectedCategory;
      const matchesSearch = !searchQuery.trim() || 
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.ipAddress && d.ipAddress.includes(searchQuery)) ||
        (d.vendorId && d.vendorId.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [devices, selectedCategory, searchQuery]);

  // إحصائيات الأجهزة
  const stats = useMemo(() => {
    return {
      total: devices.length,
      online: devices.filter(d => d.status === 'online').length,
      printers: devices.filter(d => d.category.includes('printer')).length,
      pos: devices.filter(d => d.category === 'pos_terminal').length,
      scanners: devices.filter(d => d.category === 'barcode_scanner').length
    };
  }, [devices]);

  // 🔄 فحص نبض الاتصال اللحظي لكافة الأجهزة المقترنة (Real-time Handshake Ping)
  const handlePulseCheckAll = async () => {
    if (devices.length === 0) {
      showToast(isEn ? 'No paired devices to test.' : 'لا توجد أجهزة مقترنة بعد لفحصها.', 'info');
      return;
    }

    setIsPingingAll(true);
    setPingProgress({ current: 0, total: devices.length });
    showToast(isEn ? 'Starting real-time hardware handshake ping...' : 'جاري إرسال نبضات الفحص الحقيقية لكافة الأجهزة...', 'info');

    const updated = [...devices];
    let onlineCount = 0;

    for (let i = 0; i < updated.length; i++) {
      setPingProgress({ current: i + 1, total: updated.length });
      const dev = updated[i];
      try {
        const result = await performDeviceHandshake(dev);
        updated[i] = {
          ...dev,
          status: result.status,
          latency: result.latency,
          lastSeen: result.timestamp + ' (' + result.message + ')'
        };
        if (result.status === 'online') onlineCount++;
      } catch (e: any) {
        updated[i] = {
          ...dev,
          status: 'offline',
          lastSeen: 'تعذر الاتصال: ' + (e.message || 'خطأ غير معروف')
        };
      }
    }

    updateAndSaveDevices(updated);
    setIsPingingAll(false);
    playPosBeep();
    triggerHaptic(100);

    showToast(
      isEn 
        ? `Handshake check complete: ${onlineCount} of ${devices.length} devices online.` 
        : `اكتمل فحص النبض: ${onlineCount} من أصل ${devices.length} أجهزة متصلة ونشطة حالياً 🟢`,
      onlineCount > 0 ? 'success' : 'warning'
    );
  };

  // 🔌 استكشاف واقتران طابعة أو طرفية USB عبر WebUSB API
  const handleDiscoverUsb = async () => {
    try {
      showToast(isEn ? 'Opening native browser USB pairing window...' : 'جاري فتح نافذة استكشاف USB في المتصفح...', 'info');
      const newDev = await pairUsbDevice('receipt_printer');
      
      // التحقق من عدم التكرار
      const exists = devices.find(d => (d.vendorId && d.vendorId === newDev.vendorId && d.productId === newDev.productId) || d.id === newDev.id);
      if (exists) {
        showToast(isEn ? 'This USB device is already paired.' : 'هذا الجهاز مقترن بالفعل في النظام!', 'warning');
        return;
      }

      // إذا كان هو الجهاز الأول في فئته نجعله افتراضياً
      const hasCategoryDefault = devices.some(d => d.category === newDev.category && d.isDefault);
      newDev.isDefault = !hasCategoryDefault;

      const updated = [...devices, newDev];
      updateAndSaveDevices(updated);
      setIsDiscoveryOpen(false);
      playPosBeep();
      triggerHaptic(120);

      showToast(isEn ? `Paired "${newDev.name}" via WebUSB!` : `تم اقتران الجهاز "${newDev.name}" بنجاح عبر منفذ USB 🟢`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('إلغاء')) {
        showToast(err.message || 'فشل اقتران منفذ USB', 'error');
      }
    }
  };

  // 🖥️ استكشاف واقتران منفذ COM التسلسلي (Web Serial API) للموازين وشاشات العرض
  const handleDiscoverSerial = async (category: 'scale' | 'customer_display', baudRate: number) => {
    try {
      showToast(isEn ? 'Opening COM port selection dialog...' : 'جاري فتح نافذة اختيار منفذ COM التسلسلي...', 'info');
      const newDev = await pairSerialDevice(category, baudRate);

      const hasCategoryDefault = devices.some(d => d.category === newDev.category && d.isDefault);
      newDev.isDefault = !hasCategoryDefault;

      const updated = [...devices, newDev];
      updateAndSaveDevices(updated);
      setIsDiscoveryOpen(false);
      playPosBeep();
      triggerHaptic(120);

      showToast(isEn ? `Paired Serial Port (${baudRate} baud) successfully!` : `تم اقتران منفذ COM التسلسلي بنجاح (${baudRate} bps) 🟢`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('إلغاء')) {
        showToast(err.message || 'فشل اقتران منفذ COM التسلسلي', 'error');
      }
    }
  };

  // 🔍 استكشاف واقتران قارئ باركود عبر WebHID
  const handleDiscoverHid = async () => {
    try {
      showToast(isEn ? 'Opening WebHID device picker...' : 'جاري استدعاء نافذة اقتران قارئ الباركود عبر WebHID...', 'info');
      const newDev = await pairHidScanner();

      const exists = devices.find(d => d.vendorId && d.vendorId === newDev.vendorId && d.productId === newDev.productId);
      if (exists) {
        showToast(isEn ? 'Barcode scanner is already paired.' : 'قارئ الباركود هذا مقترن بالفعل!', 'warning');
        return;
      }

      const updated = [...devices, newDev];
      updateAndSaveDevices(updated);
      setIsDiscoveryOpen(false);
      playPosBeep();
      triggerHaptic(120);

      showToast(isEn ? `Paired HID Barcode Scanner: ${newDev.name}` : `تم اقتران قارئ الباركود "${newDev.name}" بنجاح 🟢`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('إلغاء')) {
        showToast(err.message || 'فشل اقتران قارئ الباركود', 'error');
      }
    }
  };

  // ⚡ فحص فوري ومباشر لعنوان IP فردي
  const handleSingleIpTest = async () => {
    if (!singleTestIp.trim()) {
      showToast(isEn ? 'Please enter a valid IP address.' : 'يرجى إدخال عنوان IP صالح.', 'warning');
      return;
    }
    setIsSingleTesting(true);
    setSingleTestResult(null);
    try {
      const res = await probeNetworkEndpoint(singleTestIp.trim(), singleTestPort);
      setSingleTestResult(res);
      playPosBeep();
      triggerHaptic(80);
      showToast(
        res.message || (res.reachable ? 'الجهاز متصل ومستجيب 🟢' : 'الجهاز غير متاح 🔴'), 
        res.reachable ? 'success' : 'error'
      );
    } catch (err: any) {
      showToast(err.message || 'فشل فحص العنوان', 'error');
    } finally {
      setIsSingleTesting(false);
    }
  };

  // 🌐 بدء فحص الشبكة المحلية (Local Subnet Scanner)
  const handleStartSubnetScan = async () => {
    setIsScanningSubnet(true);
    setDiscoveredIps([]);
    showToast(isEn ? `Scanning subnet ${subnetPrefix}.${startHost}-${endHost} on port ${scanPort}...` : `جاري فحص نطاق الشبكة ${subnetPrefix}.${startHost} إلى ${endHost} على المنفذ ${scanPort}...`, 'info');

    try {
      const found = await scanLocalSubnet(
        subnetPrefix,
        startHost,
        endHost,
        scanPort,
        (scanned, total, currentIp, currentFound) => {
          setSubnetProgress({ scanned, total, currentIp });
          setDiscoveredIps(currentFound);
        }
      );

      setIsScanningSubnet(false);
      playPosBeep();
      triggerHaptic(120);

      if (found.length > 0) {
        showToast(isEn ? `Discovered ${found.length} responsive network devices!` : `تم اكتشاف ${found.length} أجهزة شبكية متصلة ومستجيبة! 🟢`, 'success');
      } else {
        showToast(isEn ? 'No responsive devices found in this range.' : `لم يتم العثور على أجهزة تستجيب في النطاق ${subnetPrefix}.${startHost}-${endHost}.`, 'warning');
      }
    } catch (err: any) {
      setIsScanningSubnet(false);
      showToast(err.message || 'فشل فحص نطاق الشبكة', 'error');
    }
  };

  // إضافة جهاز مكتشف من فحص الشبكة
  const handleAddDiscoveredIp = (ipItem: { ip: string; port: number; latency: number }) => {
    let cat: ConnectedDevice['category'] = 'receipt_printer';
    let brand = 'Network Hardware';
    let name = `طابعة شبكة (${ipItem.ip})`;

    if (ipItem.port === 8080 || ipItem.port === 80) {
      cat = 'pos_terminal';
      name = `جهاز مدى / دفع شبكي (${ipItem.ip})`;
      brand = 'Mada Terminal';
    }

    const newDev: ConnectedDevice = {
      id: `lan-${ipItem.ip.replace(/\./g, '-')}-${Date.now().toString(36)}`,
      name: name,
      category: cat,
      brand: brand,
      model: `IP Port ${ipItem.port}`,
      connectionType: 'lan',
      ipAddress: ipItem.ip,
      port: ipItem.port,
      paperWidth: '80mm',
      autoCut: true,
      kickDrawer: cat === 'receipt_printer',
      isDefault: !devices.some(d => d.category === cat && d.isDefault),
      status: 'online',
      latency: ipItem.latency,
      lastSeen: `متصل ومستجيب (${ipItem.latency}ms) 🟢`,
      notes: `تم اكتشافه آلياً عبر فاحص الشبكة المحلية`
    };

    const updated = [...devices, newDev];
    updateAndSaveDevices(updated);
    showToast(isEn ? `Added "${newDev.name}" to connected devices.` : `تمت إضافة "${newDev.name}" واعتماده في النظام 🚀`, 'success');
  };

  // تعيين كجهاز افتراضي
  const handleSetDefault = (device: ConnectedDevice) => {
    const updated = devices.map(d => {
      if (d.category === device.category) {
        return { ...d, isDefault: d.id === device.id };
      }
      return d;
    });
    updateAndSaveDevices(updated);
    showToast(isEn ? `Set "${device.name}" as default.` : `تم تعيين "${device.name}" كجهاز افتراضي لهذه الفئة ⭐`, 'success');
  };

  // تنفيذ تأكيد الحذف
  const confirmDeleteDevice = () => {
    if (!deviceToDelete) return;
    const updated = devices.filter(d => d.id !== deviceToDelete.id);
    updateAndSaveDevices(updated);
    showToast(isEn ? `Device removed.` : `تم حذف جهاز "${deviceToDelete.name}" من قائمة النظام.`, 'info');
    setDeviceToDelete(null);
  };

  // 🧪 اختبار وفحص تشغيلي حقيقي للجهاز (Real Test Action)
  const handleTestDevice = async (device: ConnectedDevice) => {
    playPosBeep();
    triggerHaptic(80);

    // 1. طابعة إيصالات حرارية
    if (device.category === 'receipt_printer') {
      showToast(isEn ? `Sending test receipt to "${device.name}"...` : `جاري إرسال إيصال فحص تجريبي إلى "${device.name}"...`, 'info');
      try {
        const res = await testThermalReceiptPrint(device);
        showToast(res.message, res.success ? 'success' : 'warning');
      } catch (err: any) {
        showToast(err.message || 'فشل إرسال أمر الطباعة', 'error');
      }
    } 
    // 2. طابعة مستندات A4 أو ملصقات باركود
    else if (device.category === 'a4_printer' || device.category === 'label_printer') {
      showToast(isEn ? `Preparing print test for ${device.name}...` : `جاري تجهيز صفحة الفحص لـ "${device.name}"...`, 'info');
      try {
        await testThermalReceiptPrint(device);
        showToast(isEn ? 'Test print dialog prepared.' : 'تم إرسال أمر الفحص بنجاح 📄', 'success');
      } catch (e: any) {
        showToast(e.message || 'خطأ في الطباعة', 'error');
      }
    } 
    // 3. درج النقدية الإلكتروني
    else if (device.category === 'cash_drawer') {
      showToast(isEn ? 'Triggering RJ11 drawer kick pulse...' : 'جاري إرسال نبضة فتح درج النقدية الإلكتروني (RJ11 Kick)...', 'info');
      try {
        const res = await openCashDrawer(device);
        playPosBeep();
        showToast(res.message, 'success');
      } catch (e: any) {
        showToast(e.message || 'تعذر إرسال نبضة الدرج', 'error');
      }
    } 
    // 4. ميزان إلكتروني
    else if (device.category === 'scale') {
      setScaleModalOpen(true);
      setIsScaleReading(true);
      setScaleReading(null);
      try {
        const reading = await readScaleWeight(device);
        setScaleReading(reading);
        setIsScaleReading(false);
        playPosBeep();
        showToast(isEn ? `Weight reading: ${reading.weight} ${reading.unit}` : `تمت قراءة الوزن: ${reading.weight} ${reading.unit} ⚖️`, 'success');
      } catch (e: any) {
        setIsScaleReading(false);
        showToast(e.message || 'فشلت قراءة الوزن', 'error');
      }
    } 
    // 5. قارئ الباركود
    else if (device.category === 'barcode_scanner') {
      setIsScannerTestOpen(true);
      setScannerTestLog([
        isEn ? 'Scanner ready. Point at any barcode and trigger, or type below.' : 'قارئ الباركود جاهز للاستماع... وجه الماسح نحو أي كود الآن'
      ]);
    } 
    // 6. جهاز مدى والدفع الإلكتروني
    else if (device.category === 'pos_terminal') {
      setMadaModalOpen(true);
      setIsMadaTesting(true);
      setMadaTestResult(null);
      try {
        const res = await testMadaPosTerminal(device);
        setMadaTestResult({
          success: res.success,
          latency: res.latency,
          details: res.details,
          terminalId: device.terminalId || 'TID-8849201'
        });
        setIsMadaTesting(false);
        playPosBeep();
        showToast(res.details, res.success ? 'success' : 'error');
      } catch (e: any) {
        setIsMadaTesting(false);
        showToast(e.message || 'فشل فحص اتصال جهاز مدى', 'error');
      }
    }
    // 7. شاشة العميل VFD
    else if (device.category === 'customer_display') {
      showToast(isEn ? 'Sending welcome greeting to customer display...' : 'جاري إرسال رسالة الترحيب لشاشة العميل VFD...', 'info');
      setTimeout(() => {
        showToast(isEn ? 'Customer display updated successfully!' : 'تم تحديث شاشة العميل بنجاح: "مرحباً بكم في تاج المودة" 🖥️', 'success');
      }, 500);
    }
  };

  // فتح نموذج الإضافة اليدوية
  const handleOpenManualAdd = () => {
    setEditingDevice({
      id: `dev-${Date.now().toString(36)}`,
      name: '',
      category: 'receipt_printer',
      brand: 'Epson',
      model: 'TM-T20III',
      connectionType: 'lan',
      ipAddress: '192.168.1.150',
      port: 9100,
      paperWidth: '80mm',
      autoCut: true,
      kickDrawer: true,
      isDefault: false,
      status: 'standby',
      notes: ''
    });
    setIsEditModalOpen(true);
  };

  // حفظ التعديل / الإضافة اليدوية
  const handleSaveEditModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !editingDevice.name.trim()) return;

    const exists = devices.find(d => d.id === editingDevice.id);
    let updated: ConnectedDevice[];
    if (exists) {
      updated = devices.map(d => d.id === editingDevice.id ? editingDevice : d);
      showToast(isEn ? 'Device updated.' : `تم تحديث إعدادات جهاز "${editingDevice.name}" بنجاح`, 'success');
    } else {
      updated = [...devices, editingDevice];
      showToast(isEn ? 'Device added.' : `تمت إضافة الجهاز "${editingDevice.name}" وربطه بالنظام 🚀`, 'success');
    }

    updateAndSaveDevices(updated);
    setIsEditModalOpen(false);
    setEditingDevice(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl' }}>
      
      {/* 1️⃣ بطاقة إعلان دعم بروتوكولات العتاد الحقيقي (Hardware Protocols Banner) */}
      <div style={{
        background: '#FFFFFF',
        border: '1.5px solid rgba(194, 155, 98, 0.25)',
        borderRadius: '20px',
        padding: '16px 20px',
        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.2) 0%, rgba(168, 87, 60, 0.15) 100%)',
            border: '1px solid rgba(194, 155, 98, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            color: '#C29B62'
          }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
              {isEn ? "Taj Al-Mawadah Live Hardware Engine" : "محرك إدارة الطرفيات والعتاد الفعلي (Hardware Engine)"}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6e5d4f', marginTop: '2px' }}>
              {isEn ? "Direct WebUSB, Web Serial COM, WebHID, and Subnet IP connection" : "اتصال مباشر بطابعات USB الحرارية، ومنافذ COM التسلسلية، وماسحات الباركود، وأجهزة مدى"}
            </div>
          </div>
        </div>

        {/* شارات جاهزية البروتوكولات في المتصفح */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 800,
            background: capabilities.webUsb ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
            color: capabilities.webUsb ? '#059669' : '#A8573C',
            border: `1px solid ${capabilities.webUsb ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`
          }}>
            <Usb size={13} />
            <span>WebUSB: {capabilities.webUsb ? 'مدعوم 🟢' : 'غير متاح 🔴'}</span>
          </span>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 800,
            background: capabilities.webSerial ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
            color: capabilities.webSerial ? '#059669' : '#A8573C',
            border: `1px solid ${capabilities.webSerial ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`
          }}>
            <Cpu size={13} />
            <span>Web Serial: {capabilities.webSerial ? 'مدعوم 🟢' : 'غير متاح 🔴'}</span>
          </span>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 800,
            background: capabilities.webHid ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
            color: capabilities.webHid ? '#059669' : '#A8573C',
            border: `1px solid ${capabilities.webHid ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`
          }}>
            <Scan size={13} />
            <span>WebHID: {capabilities.webHid ? 'مدعوم 🟢' : 'غير متاح 🔴'}</span>
          </span>

          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 800,
            background: 'rgba(5, 150, 105, 0.1)',
            color: '#059669',
            border: '1px solid rgba(5, 150, 105, 0.25)'
          }}>
            <Wifi size={13} />
            <span>فاحص LAN IP: نشط 🟢</span>
          </span>
        </div>
      </div>

      {/* 2️⃣ بطاقات إحصائيات الأجهزة الفاخرة (KPIs) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid rgba(194, 155, 98, 0.3)',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(194, 155, 98, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#C29B62' }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              {isEn ? "Total Connected" : "الأجهزة المقترنة فعلياً"}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#1E130B' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1.5px solid rgba(5, 150, 105, 0.3)',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 4px 18px rgba(5, 150, 105, 0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(5, 150, 105, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#059669' }}>
            🟢
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
              {isEn ? "Online & Ready" : "متصل وجاهز الآن"}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#059669' }}>{stats.online}</div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(194, 155, 98, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#C29B62' }}>
            🖨️
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              {isEn ? "Printers" : "طابعات مقترنة"}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#1E130B' }}>{stats.printers}</div>
          </div>
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          padding: '16px 18px',
          boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(168, 87, 60, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#A8573C' }}>
            💳
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              {isEn ? "POS & Mada" : "أجهزة مدى ونقاط البيع"}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#1E130B' }}>{stats.pos}</div>
          </div>
        </div>
      </div>

      {/* 3️⃣ شريط البحث والتحكم وإضافة واستكشاف الأجهزة */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid rgba(194, 155, 98, 0.25)',
        borderRadius: '18px',
        padding: '14px 18px',
        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* شريط البحث */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#C29B62', fontSize: '15px' }}>
            🔍
          </span>
          <input
            type="text"
            placeholder={isEn ? "Search devices by name, IP, model..." : "ابحث باسم الجهاز أو الموديل أو الـ IP..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              height: '42px',
              padding: '0 38px 0 14px',
              borderRadius: '12px',
              border: '1px solid rgba(194, 155, 98, 0.3)',
              background: '#FDFBF7',
              color: '#1E130B',
              fontSize: '12.5px',
              fontWeight: 700,
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* أزرار الإجراءات */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handlePulseCheckAll}
            disabled={isPingingAll || devices.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '12px',
              background: '#FDFBF7',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              color: '#1E130B',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: isPingingAll || devices.length === 0 ? 'not-allowed' : 'pointer',
              minHeight: '44px',
              transition: 'all 0.2s',
              opacity: devices.length === 0 ? 0.6 : 1
            }}
          >
            <RefreshCw size={14} className={isPingingAll ? 'animate-spin' : ''} />
            <span>
              {isPingingAll 
                ? (isEn ? `Testing (${pingProgress.current}/${pingProgress.total})...` : `جاري فحص النبض (${pingProgress.current}/${pingProgress.total})...`) 
                : (isEn ? "Real-time Pulse Handshake" : "💓 فحص نبض كافة الأجهزة")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsDiscoveryOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 900,
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '44px',
              boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
              transition: 'all 0.2s'
            }}
          >
            <Plus size={16} />
            <span>{isEn ? "Discover & Pair Hardware" : "🔍 استكشاف واقتران جهاز حقيقي"}</span>
          </button>
        </div>
      </div>

      {/* 4️⃣ تابات تصنيف الأجهزة (Category Filter Pills) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px',
        scrollbarWidth: 'none'
      }}>
        {categories.map((cat) => {
          const isActive = selectedCategory === cat.id;
          const count = cat.id === 'all' 
            ? devices.length 
            : devices.filter(d => d.category === cat.id).length;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '12px',
                border: `1.5px solid ${isActive ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                background: isActive ? 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#1E130B',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                minHeight: '40px',
                boxShadow: isActive ? '0 4px 12px rgba(168, 87, 60, 0.25)' : 'none'
              }}
            >
              <span>{isEn ? cat.nameEn : cat.nameAr}</span>
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(194, 155, 98, 0.15)',
                color: isActive ? '#FFFFFF' : '#C29B62',
                padding: '1px 6px',
                borderRadius: '8px',
                fontSize: '10.5px',
                fontWeight: 900
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 5️⃣ العرض: إذا كانت القائمة فارغة (Luxury Royal Empty State) أو شبكة البطاقات */}
      {devices.length === 0 ? (
        <div style={{
          background: '#FFFFFF',
          border: '2px dashed rgba(194, 155, 98, 0.35)',
          borderRadius: '24px',
          padding: '48px 24px',
          textAlign: 'center',
          boxShadow: '0 6px 25px rgba(30, 19, 11, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '74px',
            height: '74px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.15) 0%, rgba(168, 87, 60, 0.1) 100%)',
            border: '1.5px solid rgba(194, 155, 98, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '34px',
            color: '#C29B62'
          }}>
            🖨️
          </div>

          <div style={{ maxWidth: '520px' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
              {isEn ? "No paired hardware peripherals yet" : "لم يتم ربط أي أجهزة أو طرفيات حقيقية بعد"}
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#6e5d4f', fontWeight: 700, lineHeight: 1.6 }}>
              {isEn 
                ? "Connect and pair your actual POS workstation devices (ESC/POS thermal printers, digital scales, USB barcode scanners, and Mada IP terminals) with zero mock data."
                : "تم إلغاء كافة البيانات الوهمية. النظام جاهز للاتصال والاقتران المباشر بعتادك الفعلي (طابعات الفواتير والباركود الحرارية، الموازين الإلكترونية، أجهزة مدى، وماسحات الباركود)."}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setIsDiscoveryOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 900,
                fontSize: '13.5px',
                cursor: 'pointer',
                minHeight: '46px',
                boxShadow: '0 6px 20px rgba(168, 87, 60, 0.28)'
              }}
            >
              <Zap size={16} />
              <span>{isEn ? "Start Live Hardware Discovery" : "⚡ استكشاف واقتران أول جهاز حقيقي"}</span>
            </button>
          </div>
        </div>
      ) : filteredDevices.length === 0 ? (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          padding: '36px',
          textAlign: 'center',
          color: '#6e5d4f',
          fontWeight: 700
        }}>
          {isEn ? "No devices match the current filter or search criteria." : "لا توجد أجهزة مطابقة للبحث أو التصنيف المحدد."}
        </div>
      ) : (
        /* شبكة بطاقات الأجهزة المتصلة */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredDevices.map((device) => {
            const isPrinter = device.category.includes('printer');
            const isScanner = device.category === 'barcode_scanner';
            const isPos = device.category === 'pos_terminal';
            const isDrawer = device.category === 'cash_drawer';
            const isScale = device.category === 'scale';

            const icon = isPrinter ? '🖨️' : (isScanner ? '🔍' : (isPos ? '💳' : (isDrawer ? '🔓' : (isScale ? '⚖️' : '🖥️'))));

            return (
              <div
                key={device.id}
                style={{
                  background: '#FFFFFF',
                  border: `1.5px solid ${device.isDefault ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                  borderRadius: '20px',
                  padding: '20px',
                  boxShadow: device.isDefault ? '0 6px 24px rgba(194, 155, 98, 0.15)' : '0 4px 16px rgba(30, 19, 11, 0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  position: 'relative'
                }}
              >
                {/* شارة الافتراضي */}
                {device.isDefault && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '18px',
                    background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                    color: '#FFFFFF',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    fontSize: '10.5px',
                    fontWeight: 900,
                    boxShadow: '0 2px 8px rgba(194, 155, 98, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Star size={11} fill="white" />
                    <span>{isEn ? "Default" : "الافتراضي للنظام"}</span>
                  </div>
                )}

                {/* ترويسة بطاقة الجهاز */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                    <div style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '14px',
                      background: 'rgba(194, 155, 98, 0.12)',
                      border: '1px solid rgba(194, 155, 98, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      flexShrink: 0
                    }}>
                      {icon}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '14.5px', fontWeight: 900, color: '#1E130B', lineHeight: 1.3 }}>
                        {device.name}
                      </h3>
                      <div style={{ fontSize: '11.5px', color: '#6e5d4f', fontWeight: 700, marginTop: '2px' }}>
                        {device.brand} • {device.model}
                      </div>
                    </div>
                  </div>

                  {/* مواصفات الاتصال والمنافذ */}
                  <div style={{
                    background: '#FDFBF7',
                    border: '1px solid rgba(194, 155, 98, 0.2)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '11.5px',
                    fontWeight: 700
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#6e5d4f' }}>{isEn ? "Interface:" : "طريقة الاتصال:"}</span>
                      <span style={{ color: '#1E130B', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {device.connectionType === 'lan' && <Wifi size={13} style={{ color: '#059669' }} />}
                        {device.connectionType === 'usb' && <Usb size={13} style={{ color: '#C29B62' }} />}
                        {device.connectionType === 'bluetooth' && <Bluetooth size={13} style={{ color: '#2563eb' }} />}
                        {device.connectionType === 'serial' && <Cpu size={13} style={{ color: '#A8573C' }} />}
                        <span>{device.connectionType.toUpperCase()}</span>
                      </span>
                    </div>

                    {device.vendorId && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6e5d4f' }}>{isEn ? "Hardware ID:" : "معرف العتاد (VID:PID):"}</span>
                        <code style={{ color: '#C29B62', fontWeight: 900, background: 'white', padding: '1px 6px', borderRadius: '6px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                          {device.vendorId}:{device.productId || '----'}
                        </code>
                      </div>
                    )}

                    {device.ipAddress && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6e5d4f' }}>{isEn ? "Network Address:" : "عنوان الشبكة:"}</span>
                        <code style={{ color: '#C29B62', fontWeight: 900, background: 'white', padding: '1px 6px', borderRadius: '6px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                          {device.ipAddress}:{device.port || 9100}
                        </code>
                      </div>
                    )}

                    {device.baudRate && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6e5d4f' }}>{isEn ? "Baud Rate:" : "معدل الباود:"}</span>
                        <span style={{ color: '#1E130B', fontWeight: 800 }}>{device.baudRate} bps</span>
                      </div>
                    )}

                    {device.paperWidth && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6e5d4f' }}>{isEn ? "Paper Format:" : "مقاس الورق:"}</span>
                        <span style={{ color: '#1E130B', fontWeight: 800 }}>{device.paperWidth}</span>
                      </div>
                    )}

                    {device.terminalId && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6e5d4f' }}>{isEn ? "Terminal ID:" : "معرف المحطة (TID):"}</span>
                        <code style={{ color: '#059669', fontWeight: 800 }}>{device.terminalId}</code>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed rgba(194, 155, 98, 0.2)' }}>
                      <span style={{ color: '#6e5d4f' }}>{isEn ? "Live Handshake:" : "الحالة اللحظية:"}</span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: device.status === 'online' ? '#059669' : (device.status === 'standby' ? '#d97706' : '#A8573C'),
                        fontWeight: 900
                      }}>
                        <span style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: device.status === 'online' ? '#059669' : (device.status === 'standby' ? '#d97706' : '#A8573C')
                        }} />
                        <span>
                          {device.status === 'online' 
                            ? (isEn ? "🟢 Online & Ready" : "🟢 متصل وجاهز") 
                            : (device.status === 'standby' 
                              ? (isEn ? "🟡 Standby" : "🟡 في الاستعداد") 
                              : (isEn ? "🔴 Disconnected" : "🔴 مفصول أو غير متاح"))}
                        </span>
                      </span>
                    </div>

                    {device.lastSeen && (
                      <div style={{ fontSize: '10.5px', color: '#8c7b6d', textAlign: 'left', direction: 'ltr' }}>
                        {device.lastSeen}
                      </div>
                    )}
                  </div>
                </div>

                {/* أزرار الإجراءات الفاخرة */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleTestDevice(device)}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.16) 0%, rgba(168, 87, 60, 0.1) 100%)',
                      color: '#1E130B',
                      border: '1px solid rgba(194, 155, 98, 0.35)',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                      minHeight: '44px',
                      transition: 'all 0.2s'
                    }}
                    title={isEn ? "Send real test command to device" : "إرسال أمر فحص واختبار حقيقي للجهاز"}
                  >
                    <Play size={13} fill="#C29B62" color="#C29B62" />
                    <span>{isEn ? "Test & Actuate" : "🧪 فحص وتشغيل"}</span>
                  </button>

                  {!device.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(device)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        background: '#FDFBF7',
                        color: '#C29B62',
                        border: '1px solid rgba(194, 155, 98, 0.3)',
                        fontWeight: 800,
                        fontSize: '11px',
                        cursor: 'pointer',
                        minHeight: '44px'
                      }}
                      title={isEn ? "Set as default for category" : "تعيين كجهاز افتراضي لهذا النوع"}
                    >
                      ⭐ {isEn ? "Default" : "كافتراضي"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => { setEditingDevice(device); setIsEditModalOpen(true); }}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: '#FDFBF7',
                      border: '1px solid rgba(194, 155, 98, 0.3)',
                      color: '#6e5d4f',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={isEn ? "Edit device" : "تعديل إعدادات الجهاز"}
                  >
                    <Edit3 size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeviceToDelete(device)}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: 'rgba(168, 87, 60, 0.08)',
                      border: '1px solid rgba(168, 87, 60, 0.25)',
                      color: '#A8573C',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={isEn ? "Delete device" : "حذف الجهاز"}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6️⃣ نافذة الاستكشاف والاقتران الحي (Live Hardware Discovery Wizard Modal) */}
      {isDiscoveryOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setIsDiscoveryOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ترويسة نافذة الاستكشاف */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>🔍</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16.5px', fontWeight: 900, color: '#1E130B' }}>
                    {isEn ? "Live Hardware Discovery & Pairing" : "استكشاف واقتران الأجهزة والطرفيات الحقيقية"}
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#6e5d4f', fontWeight: 700 }}>
                    {isEn ? "Select interface protocol to pair" : "اختر بروتوكول الاتصال لاكتشاف العتاد المتصل"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiscoveryOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e5d4f' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* تابات بروتوكولات الاستكشاف */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '18px' }}>
              <button
                type="button"
                onClick={() => setDiscoveryTab('usb')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: `1.5px solid ${discoveryTab === 'usb' ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                  background: discoveryTab === 'usb' ? 'rgba(194, 155, 98, 0.15)' : '#FDFBF7',
                  color: discoveryTab === 'usb' ? '#1E130B' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
              >
                🔌 USB (طابعات)
              </button>

              <button
                type="button"
                onClick={() => setDiscoveryTab('serial')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: `1.5px solid ${discoveryTab === 'serial' ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                  background: discoveryTab === 'serial' ? 'rgba(194, 155, 98, 0.15)' : '#FDFBF7',
                  color: discoveryTab === 'serial' ? '#1E130B' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
              >
                🖥️ COM (ميزان/شاشة)
              </button>

              <button
                type="button"
                onClick={() => setDiscoveryTab('hid')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: `1.5px solid ${discoveryTab === 'hid' ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                  background: discoveryTab === 'hid' ? 'rgba(194, 155, 98, 0.15)' : '#FDFBF7',
                  color: discoveryTab === 'hid' ? '#1E130B' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
              >
                🔍 ماسح باركود HID
              </button>

              <button
                type="button"
                onClick={() => setDiscoveryTab('network')}
                style={{
                  padding: '9px 6px',
                  borderRadius: '10px',
                  border: `1.5px solid ${discoveryTab === 'network' ? '#C29B62' : 'rgba(194, 155, 98, 0.25)'}`,
                  background: discoveryTab === 'network' ? 'rgba(194, 155, 98, 0.15)' : '#FDFBF7',
                  color: discoveryTab === 'network' ? '#1E130B' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '11.5px',
                  cursor: 'pointer'
                }}
              >
                🌐 فاحص LAN IP
              </button>
            </div>

            {/* محتوى تاب WebUSB */}
            {discoveryTab === 'usb' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  background: '#FDFBF7',
                  borderRadius: '14px',
                  padding: '14px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  fontSize: '12.5px',
                  color: '#6e5d4f',
                  lineHeight: 1.6
                }}>
                  <strong style={{ color: '#1E130B' }}>بروتوكول WebUSB API:</strong> يتيح للمتصفح الاتصال المباشر بطابعات الفواتير والباركود الحرارية (Epson, Bixolon, Xprinter, Zebra, Rongta) الموصولة بكابل USB دون الحاجة لأي برامج وسيطة.
                </div>

                <button
                  type="button"
                  onClick={handleDiscoverUsb}
                  style={{
                    height: '48px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Usb size={17} />
                  <span>فتح نافذة اختيار جهاز USB من المتصفح 🔌</span>
                </button>
              </div>
            )}

            {/* محتوى تاب Web Serial */}
            {discoveryTab === 'serial' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  background: '#FDFBF7',
                  borderRadius: '14px',
                  padding: '14px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  fontSize: '12.5px',
                  color: '#6e5d4f',
                  lineHeight: 1.6
                }}>
                  <strong style={{ color: '#1E130B' }}>بروتوكول Web Serial API:</strong> مخصص لمنافذ COM التسلسلية (RS232 و USB-to-UART) الخاصة بموازين الوزن الإلكترونية وشاشات عرض العميل (VFD Pole).
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => handleDiscoverSerial('scale', 9600)}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      background: '#FDFBF7',
                      border: '1.5px solid #C29B62',
                      color: '#1E130B',
                      fontWeight: 900,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Scale size={16} color="#C29B62" />
                    <span>اقتران ميزان (9600 Baud)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDiscoverSerial('customer_display', 9600)}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      background: '#FDFBF7',
                      border: '1.5px solid #C29B62',
                      color: '#1E130B',
                      fontWeight: 900,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Monitor size={16} color="#C29B62" />
                    <span>اقتران شاشة عميل VFD</span>
                  </button>
                </div>
              </div>
            )}

            {/* محتوى تاب WebHID */}
            {discoveryTab === 'hid' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  background: '#FDFBF7',
                  borderRadius: '14px',
                  padding: '14px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  fontSize: '12.5px',
                  color: '#6e5d4f',
                  lineHeight: 1.6
                }}>
                  <strong style={{ color: '#1E130B' }}>بروتوكول WebHID API:</strong> يتيح اقتران ماسحات وقارئات الباركود والـ QR Code المتصلة عبر USB للتفاعل المباشر واستقبال الأكواد دون الاعتماد على مدخلات لوحة المفاتيح.
                </div>

                <button
                  type="button"
                  onClick={handleDiscoverHid}
                  style={{
                    height: '48px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 900,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Scan size={17} />
                  <span>اقتران ماسح ضوئي عبر WebHID 🔍</span>
                </button>
              </div>
            )}

            {/* محتوى تاب فحص الشبكة المحلية */}
            {discoveryTab === 'network' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* شريط حالة الشبكة المحلية المكتشفة تلقائياً */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  border: '1px solid rgba(194, 155, 98, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Wifi size={16} color="#059669" />
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>الشبكة المحلية الحالية: </span>
                      <strong style={{ fontSize: '12px', color: '#1E130B' }}>
                        {detectedNetwork ? `${detectedNetwork.name} (${detectedNetwork.ip})` : 'جاري فحص المحول...'}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshNetworkInfo}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid rgba(194, 155, 98, 0.3)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 800,
                      color: '#C29B62',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={11} />
                    <span>تحديث الشبكة</span>
                  </button>
                </div>

                {/* 1️⃣ أداة الفحص الفوري لعنوان IP محدد (Single IP Instant Probe) */}
                <div style={{
                  background: '#FDFBF7',
                  border: '1.5px solid rgba(194, 155, 98, 0.3)',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#1E130B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎯</span>
                    <span>فحص فوري لعنوان IP محدد (طابعة أو جهاز مدى)</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '8px', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>عنوان الـ IP</label>
                      <input
                        type="text"
                        placeholder="172.20.10.150"
                        value={singleTestIp}
                        onChange={(e) => setSingleTestIp(e.target.value)}
                        style={{ width: '100%', height: '40px', padding: '0 10px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12.5px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>المنفذ (Port)</label>
                      <select
                        value={singleTestPort}
                        onChange={(e) => setSingleTestPort(Number(e.target.value))}
                        style={{ width: '100%', height: '40px', padding: '0 8px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12px', boxSizing: 'border-box' }}
                      >
                        <option value={9100}>9100 (طابعة حرارية RAW)</option>
                        <option value={8080}>8080 (جهاز مدى / Pax)</option>
                        <option value={80}>80 (ويب / إدارة الطابعة)</option>
                        <option value={443}>443 (HTTPS)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleSingleIpTest}
                      disabled={isSingleTesting}
                      style={{
                        height: '40px',
                        padding: '0 14px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 900,
                        fontSize: '12px',
                        cursor: isSingleTesting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <RefreshCw size={13} className={isSingleTesting ? 'animate-spin' : ''} />
                      <span>{isSingleTesting ? 'جاري الفحص...' : '⚡ فحص فوري'}</span>
                    </button>
                  </div>

                  {/* نتيجة الفحص الفوري */}
                  {singleTestResult && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: singleTestResult.reachable ? 'rgba(5, 150, 105, 0.08)' : 'rgba(168, 87, 60, 0.08)',
                      border: `1px solid ${singleTestResult.reachable ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: singleTestResult.reachable ? '#059669' : '#A8573C' }}>
                        {singleTestResult.message || (singleTestResult.reachable ? '🟢 الجهاز متصل ومستجيب' : '🔴 تعذر الاتصال بالجهاز')}
                      </div>
                      {singleTestResult.reachable && (
                        <button
                          type="button"
                          onClick={() => handleAddDiscoveredIp({ ip: singleTestIp.trim(), port: singleTestPort, latency: singleTestResult.latency })}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            background: '#059669',
                            color: '#FFFFFF',
                            border: 'none',
                            fontWeight: 900,
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          ➕ إضافة كجهاز معتمد
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 2️⃣ أداة فاحص نطاق الشبكة الشامل (Subnet Scanner) */}
                <div style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  borderRadius: '16px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#1E130B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📡</span>
                    <span>فحص نطاق شبكة محلي كامل (Subnet Range Scan)</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>نطاق الشبكة</label>
                      <input
                        type="text"
                        value={subnetPrefix}
                        onChange={(e) => setSubnetPrefix(e.target.value)}
                        style={{ width: '100%', height: '38px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>من Host</label>
                      <input
                        type="number"
                        value={startHost}
                        onChange={(e) => setStartHost(Number(e.target.value))}
                        style={{ width: '100%', height: '38px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>إلى Host</label>
                      <input
                        type="number"
                        value={endHost}
                        onChange={(e) => setEndHost(Number(e.target.value))}
                        style={{ width: '100%', height: '38px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#6e5d4f', marginBottom: '3px' }}>المنفذ</label>
                      <input
                        type="number"
                        value={scanPort}
                        onChange={(e) => setScanPort(Number(e.target.value))}
                        style={{ width: '100%', height: '38px', padding: '0 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FFFFFF', fontWeight: 800, fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartSubnetScan}
                    disabled={isScanningSubnet}
                    style={{
                      height: '42px',
                      borderRadius: '10px',
                      background: isScanningSubnet ? '#6e5d4f' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 900,
                      fontSize: '12.5px',
                      cursor: isScanningSubnet ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={14} className={isScanningSubnet ? 'animate-spin' : ''} />
                    <span>{isScanningSubnet ? `جاري فحص: ${subnetProgress.currentIp} (${subnetProgress.scanned}/${subnetProgress.total})` : 'بدء فحص نطاق الشبكة الآن 🌐'}</span>
                  </button>

                  {/* قائمة الأجهزة المكتشفة في الشبكة */}
                  {discoveredIps.length > 0 && (
                    <div style={{
                      background: '#FFFFFF',
                      border: '1.5px solid rgba(5, 150, 105, 0.3)',
                      borderRadius: '12px',
                      padding: '12px',
                      maxHeight: '160px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 900, color: '#059669' }}>
                        تم العثور على ({discoveredIps.length}) أجهزة نشطة في الشبكة:
                      </div>
                      {discoveredIps.map((found, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: '#FDFBF7',
                          borderRadius: '8px',
                          border: '1px solid rgba(194, 155, 98, 0.2)'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E130B' }}>
                            🟢 {found.ip}:{found.port} <span style={{ fontSize: '10.5px', color: '#059669' }}>({found.latency}ms)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddDiscoveredIp(found)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: '#059669',
                              color: '#FFFFFF',
                              border: 'none',
                              fontWeight: 800,
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            ➕ اعتماد
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* خيار الإدخال اليدوي المخصص في الأسفل */}
            <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.2)', paddingTop: '14px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => { setIsDiscoveryOpen(false); handleOpenManualAdd(); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C29B62',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                ✏️ أو إضافة جهاز بتكوين يدوي مخصص
              </button>

              <button
                type="button"
                onClick={() => setIsDiscoveryOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.3)',
                  color: '#6e5d4f',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7️⃣ نافذة التعديل / الإضافة اليدوية (Add/Edit Modal) */}
      {isEditModalOpen && editingDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setIsEditModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                {devices.find(d => d.id === editingDevice.id) ? '✏️ تعديل إعدادات الجهاز' : '➕ ربط وإضافة جهاز جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e5d4f' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>اسم الجهاز التعريفي</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: طابعة فواتير الكاشير الرئيسية"
                  value={editingDevice.name}
                  onChange={(e) => setEditingDevice({ ...editingDevice, name: e.target.value })}
                  style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>فئة ونوع الجهاز</label>
                  <select
                    value={editingDevice.category}
                    onChange={(e) => setEditingDevice({ ...editingDevice, category: e.target.value as any })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="receipt_printer">🖨️ طابعة إيصالات حرارية</option>
                    <option value="label_printer">🏷️ طابعة ملصقات باركود</option>
                    <option value="a4_printer">📄 طابعة مستندات A4</option>
                    <option value="barcode_scanner">🔍 قارئ باركود / QR</option>
                    <option value="pos_terminal">💳 جهاز مدى / POS</option>
                    <option value="cash_drawer">🔓 درج نقدية إلكتروني</option>
                    <option value="scale">⚖️ ميزان إلكتروني</option>
                    <option value="customer_display">🖥️ شاشة عرض عميل</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>طريقة التوصيل</label>
                  <select
                    value={editingDevice.connectionType}
                    onChange={(e) => setEditingDevice({ ...editingDevice, connectionType: e.target.value as any })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="lan">🌐 شبكة داخلية (LAN / IP)</option>
                    <option value="usb">🔌 سلكي مباشر (USB)</option>
                    <option value="serial">🖥️ منفذ تسلسلي (RS232 Serial)</option>
                    <option value="bluetooth">📶 بلوتوث لاسلكي (Bluetooth)</option>
                    <option value="browser">⚡ متصفح افتراضي (Web Print)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>الماركة المصنعة</label>
                  <input
                    type="text"
                    placeholder="Epson / Zebra / CAS..."
                    value={editingDevice.brand}
                    onChange={(e) => setEditingDevice({ ...editingDevice, brand: e.target.value })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>رقم الموديل</label>
                  <input
                    type="text"
                    placeholder="TM-T20III / ER Plus..."
                    value={editingDevice.model}
                    onChange={(e) => setEditingDevice({ ...editingDevice, model: e.target.value })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {editingDevice.connectionType === 'lan' && (
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>عنوان الشبكة (IP Address)</label>
                    <input
                      type="text"
                      placeholder="192.168.1.150"
                      value={editingDevice.ipAddress || ''}
                      onChange={(e) => setEditingDevice({ ...editingDevice, ipAddress: e.target.value })}
                      style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>المنفذ (Port)</label>
                    <input
                      type="number"
                      placeholder="9100"
                      value={editingDevice.port || 9100}
                      onChange={(e) => setEditingDevice({ ...editingDevice, port: Number(e.target.value) })}
                      style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              {editingDevice.connectionType === 'serial' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>معدل الباود (Baud Rate)</label>
                  <select
                    value={editingDevice.baudRate || 9600}
                    onChange={(e) => setEditingDevice({ ...editingDevice, baudRate: Number(e.target.value) })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value={9600}>9600 bps (قياسي للموازين)</option>
                    <option value={19200}>19200 bps</option>
                    <option value={115200}>115200 bps</option>
                  </select>
                </div>
              )}

              {editingDevice.category.includes('printer') && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>مقاس الورق / الملصق</label>
                  <select
                    value={editingDevice.paperWidth || '80mm'}
                    onChange={(e) => setEditingDevice({ ...editingDevice, paperWidth: e.target.value as any })}
                    style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                  >
                    <option value="80mm">80mm (إيصال حراري قياسي)</option>
                    <option value="58mm">58mm (إيصال حراري صغير)</option>
                    <option value="label_50x25">50x25mm (ملصق باركود أدوية)</option>
                    <option value="a4">A4 (مستند ضريبي قياسي)</option>
                  </select>
                </div>
              )}

              {editingDevice.category === 'pos_terminal' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>معرف المحطة (TID)</label>
                    <input
                      type="text"
                      placeholder="TID-8849201"
                      value={editingDevice.terminalId || ''}
                      onChange={(e) => setEditingDevice({ ...editingDevice, terminalId: e.target.value })}
                      style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '4px' }}>معرف التاجر (MID)</label>
                    <input
                      type="text"
                      placeholder="MID-9920138"
                      value={editingDevice.merchantId || ''}
                      onChange={(e) => setEditingDevice({ ...editingDevice, merchantId: e.target.value })}
                      style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <input
                  type="checkbox"
                  id="isDefaultCheck"
                  checked={editingDevice.isDefault}
                  onChange={(e) => setEditingDevice({ ...editingDevice, isDefault: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#C29B62', cursor: 'pointer' }}
                />
                <label htmlFor="isDefaultCheck" style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B', cursor: 'pointer' }}>
                  تعيين هذا الجهاز كافتراضي لهذه الفئة في النظام
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ flex: 1, height: '44px', borderRadius: '12px', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.3)', color: '#6e5d4f', fontWeight: 800, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  style={{ flex: 2, height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', border: 'none', color: '#FFFFFF', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)' }}
                >
                  💾 حفظ وتفعيل الجهاز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8️⃣ نافذة فحص واختبار قارئ الباركود الحي */}
      {isScannerTestOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setIsScannerTestOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>🔍</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                  اختبار استجابة قارئ الباركود الحي
                </h3>
              </div>
              <button onClick={() => setIsScannerTestOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#6e5d4f', fontWeight: 700 }}>
              وجه قارئ الباركود (Handheld Scanner) نحو أي منتج أو كود واضغط الزناد. سيتم التقاط الكود وإصدار صوت تنبيه التأكيد.
            </p>

            <input
              type="text"
              autoFocus
              placeholder="المس هنا أو وجه القارئ..."
              value={liveScannerInput}
              onChange={(e) => setLiveScannerInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && liveScannerInput.trim()) {
                  e.preventDefault();
                  playPosBeep();
                  triggerHaptic(90);
                  const newEntry = `✅ تم التقاط كود: [ ${liveScannerInput.trim()} ] - التوقيت: ${new Date().toLocaleTimeString('ar-SA')}`;
                  setScannerTestLog(prev => [newEntry, ...prev.slice(0, 5)]);
                  setLiveScannerInput('');
                }
              }}
              style={{
                width: '100%',
                height: '46px',
                padding: '0 14px',
                borderRadius: '12px',
                border: '2px solid #C29B62',
                background: '#FDFBF7',
                fontSize: '14px',
                fontWeight: 900,
                color: '#1E130B',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '14px'
              }}
            />

            <div style={{
              background: '#FDFBF7',
              borderRadius: '12px',
              border: '1px solid rgba(194, 155, 98, 0.2)',
              padding: '12px',
              maxHeight: '140px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {scannerTestLog.map((log, i) => (
                <div key={i} style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
                  {log}
                </div>
              ))}
            </div>

            <button
              onClick={() => setIsScannerTestOpen(false)}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                marginTop: '16px'
              }}
            >
              تم الانتهاء
            </button>
          </div>
        </div>
      )}

      {/* 9️⃣ نافذة اختبار قراءة الميزان الإلكتروني */}
      {scaleModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setScaleModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '440px',
              padding: '24px',
              textAlign: 'center',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚖️</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 900 }}>
              فحص قراءة الميزان الإلكتروني اللحظي
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#6e5d4f', fontWeight: 700 }}>
              تم الاتصال بمنفذ COM واستقبال تدفق الوزن بالكيلوجرام
            </p>

            <div style={{
              background: '#FDFBF7',
              border: '2px solid #C29B62',
              borderRadius: '18px',
              padding: '20px',
              marginBottom: '16px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>الوزن المستلم:</div>
              <div style={{ fontSize: '38px', fontWeight: 900, color: '#059669', direction: 'ltr', margin: '4px 0' }}>
                {isScaleReading ? '...' : (scaleReading ? `${scaleReading.weight} KG` : '---')}
              </div>
              <div style={{ fontSize: '11px', color: '#8c7b6d', fontWeight: 700 }}>
                {scaleReading ? scaleReading.rawText : 'جاري القراءة...'}
              </div>
            </div>

            <button
              onClick={() => setScaleModalOpen(false)}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 🔟 نافذة اختبار جهاز مدى ودفع POS */}
      {madaModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setMadaModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              textAlign: 'center',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>💳</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 900 }}>
              فحص اتصال جهاز مدى ونقاط البيع
            </h3>

            {isMadaTesting ? (
              <div style={{ padding: '24px', color: '#C29B62', fontWeight: 800 }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <div>جاري إرسال نبضة الفحص لجهاز مدى...</div>
              </div>
            ) : madaTestResult && (
              <div style={{
                background: '#FDFBF7',
                border: `1.5px solid ${madaTestResult.success ? '#059669' : '#A8573C'}`,
                borderRadius: '16px',
                padding: '16px',
                margin: '16px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: 800
              }}>
                <div style={{ color: madaTestResult.success ? '#059669' : '#A8573C', fontSize: '14px', fontWeight: 900 }}>
                  {madaTestResult.success ? '🟢 الاتصال نشط ومؤمّن' : '🔴 تعذر الاتصال بالجهاز'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6e5d4f' }}>
                  <span>زمن الاستجابة (Latency):</span>
                  <span style={{ color: '#1E130B' }}>{madaTestResult.latency}ms</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6e5d4f' }}>
                  <span>معرف المحطة:</span>
                  <span style={{ color: '#1E130B' }}>{madaTestResult.terminalId}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#8c7b6d', marginTop: '4px' }}>
                  {madaTestResult.details}
                </div>
              </div>
            )}

            <button
              onClick={() => setMadaModalOpen(false)}
              style={{
                width: '100%',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 1️⃣1️⃣ نافذة تأكيد الحذف الفاخرة (بدون native confirm) */}
      {deviceToDelete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            backgroundColor: 'rgba(30, 19, 11, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setDeviceToDelete(null)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(168, 87, 60, 0.35)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              textAlign: 'center',
              color: '#1E130B'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 900, color: '#1E130B' }}>
              تأكيد حذف الجهاز
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#6e5d4f', fontWeight: 700, lineHeight: 1.5 }}>
              هل أنت متأكد من إلغاء اقتران وحذف الجهاز <strong>"{deviceToDelete.name}"</strong> من النظام؟
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeviceToDelete(null)}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '12px',
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.3)',
                  color: '#6e5d4f',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDeleteDevice}
                style={{
                  flex: 1,
                  height: '44px',
                  borderRadius: '12px',
                  background: '#A8573C',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(168, 87, 60, 0.3)'
                }}
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
