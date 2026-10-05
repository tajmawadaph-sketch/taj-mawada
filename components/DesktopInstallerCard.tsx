'use client';

import React, { useState, useEffect } from 'react';

interface InstallerInfo {
  available: boolean;
  filename: string;
  version: string;
  sizeBytes: number;
  sizeFormatted: string;
  releaseDate: string;
  targetOs: string;
  isMultiUser: boolean;
}

export default function DesktopInstallerCard() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const [installerInfo, setInstallerInfo] = useState<InstallerInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  useEffect(() => {
    // التحقق هل المتصفح يعمل حالياً داخل تطبيق سطح المكتب
    if (typeof window !== 'undefined' && window.tajDesktop) {
      setIsDesktop(true);
      window.tajDesktop.getInfo().then((info) => {
        if (info?.version) setDesktopVersion(info.version);
      }).catch(() => {});
    }

    // جلب معلومات ملف التثبيت
    fetch('/api/backup/download-installer?info=true')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.available) {
          setInstallerInfo(data);
        }
      })
      .catch((err) => console.warn('Could not fetch installer metadata:', err));
  }, []);

  const handleDownload = () => {
    setIsDownloading(true);
    setDownloadSuccess(false);

    // إنشاء رابط تنزيل مباشر
    const link = document.createElement('a');
    link.href = '/api/backup/download-installer';
    link.download = installerInfo?.filename || 'TajMawadah-Setup-0.1.0.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsDownloading(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 8000);
    }, 1500);
  };

  return (
    <div
      className="bg-white rounded-2xl p-6 transition-all duration-300"
      style={{
        border: '1px solid rgba(194, 155, 98, 0.28)',
        boxShadow: '0 4px 25px rgba(30, 19, 11, 0.06)',
      }}
    >
      {/* رأس البطاقة */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[rgba(194,155,98,0.18)]">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #1E130B 0%, #3A2315 100%)',
              border: '2px solid #C29B62',
              color: '#C29B62',
            }}
          >
            🖥️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-[#1E130B] m-0">
                برنامج تاج المودة لسطح المكتب لويندوز (Windows Desktop App)
              </h3>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-black border"
                style={{
                  background: 'rgba(194, 155, 98, 0.12)',
                  borderColor: '#C29B62',
                  color: '#9E773D',
                }}
              >
                {installerInfo ? `v${installerInfo.version}` : 'v0.1.0'}
              </span>
              <span
                className="text-xs px-2.5 py-0.5 rounded-full font-bold border"
                style={{
                  background: '#FDFBF7',
                  borderColor: '#E5E7EB',
                  color: '#4B5563',
                }}
              >
                🪟 Windows 10 / 11 (64-bit)
              </span>
            </div>
            <p className="text-xs text-[#6B7280] font-medium mt-1 leading-relaxed">
              الحل الهندسي الشامل والنهائي لنقاط البيع (POS): ربط مباشر بدون قيود المتصفح مع طابعات الشبكة (Port 9100)، طابعات USB، الأدراج الإلكترونية، كروت الشبكة السلكية واللاسلكية، وقواعد البيانات مع دعم التشغيل المستقل بدون إنترنت.
            </p>
          </div>
        </div>

        {/* حالة التشغيل الحالية */}
        <div className="flex items-center self-start md:self-center">
          {isDesktop ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border"
              style={{
                background: 'rgba(5, 150, 105, 0.08)',
                borderColor: '#059669',
                color: '#059669',
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-[#059669] animate-pulse" />
              <span>أنت تعمل حالياً داخل البرنامج المثبت (v{desktopVersion || '0.1.0'})</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border"
              style={{
                background: 'rgba(194, 155, 98, 0.08)',
                borderColor: 'rgba(194, 155, 98, 0.3)',
                color: '#9E773D',
              }}
            >
              <span>🌐 متصفح ويب (موصى بتثبيت التطبيق للكاشير)</span>
            </div>
          )}
        </div>
      </div>

      {/* محتوى المميزات الفنية */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-5">
        <div
          className="p-3.5 rounded-xl border flex items-start gap-3"
          style={{ background: '#FDFBF7', borderColor: 'rgba(194, 155, 98, 0.18)' }}
        >
          <span className="text-xl">🖨️</span>
          <div>
            <h4 className="text-xs font-black text-[#1E130B] m-0">طباعة فورية مباشرة</h4>
            <p className="text-[11px] text-[#6B7280] m-0 mt-0.5 leading-snug">
              إرسال مباشر لأوامر ESC/POS وطباعة فورية على منفذ 9100 والـ USB دون شاشات متصفح أو تأخير.
            </p>
          </div>
        </div>

        <div
          className="p-3.5 rounded-xl border flex items-start gap-3"
          style={{ background: '#FDFBF7', borderColor: 'rgba(194, 155, 98, 0.18)' }}
        >
          <span className="text-xl">📶</span>
          <div>
            <h4 className="text-xs font-black text-[#1E130B] m-0">كشف كروت الشبكة والـ Gateway</h4>
            <p className="text-[11px] text-[#6B7280] m-0 mt-0.5 leading-snug">
              اكتشاف حقيقي لكروت Ethernet و Wi-Fi وبوابات الراوتر ومسح تلقائي لشبكة المحل دون حجب أمني.
            </p>
          </div>
        </div>

        <div
          className="p-3.5 rounded-xl border flex items-start gap-3"
          style={{ background: '#FDFBF7', borderColor: 'rgba(194, 155, 98, 0.18)' }}
        >
          <span className="text-xl">👥</span>
          <div>
            <h4 className="text-xs font-black text-[#1E130B] m-0">متعدد المستخدمين للجهاز</h4>
            <p className="text-[11px] text-[#6B7280] m-0 mt-0.5 leading-snug">
              تثبيت رسمي في Program Files يتاح تلقائياً لجميع مستخدمي وحسابات Windows على جهاز الكاشير.
            </p>
          </div>
        </div>
      </div>

      {/* منطقة التحميل والزر الرئيسي */}
      <div
        className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border"
        style={{
          background: 'linear-gradient(135deg, rgba(30, 19, 11, 0.03) 0%, rgba(194, 155, 98, 0.07) 100%)',
          borderColor: 'rgba(194, 155, 98, 0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">📦</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#1E130B]">اسم الملف:</span>
              <code className="text-xs font-mono font-bold text-[#C29B62] bg-white px-2 py-0.5 rounded border border-[#E5E7EB]">
                {installerInfo?.filename || 'TajMawadah-Setup-0.1.0.exe'}
              </code>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-[#6B7280]">
              <span>الحجم: <strong className="text-[#1E130B]">{installerInfo?.sizeFormatted || '214.9 MB'}</strong></span>
              <span>•</span>
              <span>الترخيص: <strong className="text-[#059669]">شامل مدمج بالكامل</strong></span>
              <span>•</span>
              <span>التوافق: <strong className="text-[#1E130B]">Windows 10 / 11</strong></span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #C29B62 0%, #A37F46 100%)',
              color: '#FFFFFF',
              border: 'none',
            }}
          >
            {isDownloading ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                <span>جاري بدء التحميل...</span>
              </>
            ) : (
              <>
                <span className="text-base">⬇️</span>
                <span>تحميل البرنامج الآن (.EXE)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* تنبيه نجاح التحميل */}
      {downloadSuccess && (
        <div
          className="mt-3 p-3 rounded-xl border flex items-center gap-2 text-xs font-bold animate-fadeIn"
          style={{
            background: 'rgba(5, 150, 105, 0.08)',
            borderColor: '#059669',
            color: '#059669',
          }}
        >
          <span>✅</span>
          <span>
            بدأ تحميل ملف التثبيت بنجاح! بمجرد اكتمال التحميل، شغّل الملف (Setup) للتثبيت على جهاز الكمبيوتر.
          </span>
        </div>
      )}

      {/* تعليمات تثبيت سريعة لنظام ويندوز */}
      <div className="mt-4 pt-3 border-t border-[rgba(194,155,98,0.15)] flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-[#6B7280] gap-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold">💡 نصيحة تثبيت:</span>
          <span>إذا ظهرت لك رسالة حماية ويندوز الذكية (Windows SmartScreen)، اضغط على <strong>"مزيد من المعلومات" (More info)</strong> ثم <strong>"تشغيل على أي حال" (Run anyway)</strong>.</span>
        </div>
        <div className="font-semibold text-[#C29B62]">
          نسخة رسمية مستقلة — صيدلية تاج المودة
        </div>
      </div>
    </div>
  );
}
