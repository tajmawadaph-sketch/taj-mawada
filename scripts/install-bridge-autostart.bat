@echo off
chcp 65001 >nul
REM تثبيت الجسر المحلي ليعمل تلقائياً (مخفياً) عند تسجيل دخول ويندوز
set "BRIDGE=%~dp0local-bridge.js"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

where node >nul 2>nul
if errorlevel 1 (
  echo [خطأ] Node.js غير مثبت. حمّله من https://nodejs.org ثم أعد تشغيل هذا الملف.
  pause
  exit /b 1
)

> "%STARTUP%\TajBridge.vbs" echo CreateObject("Wscript.Shell").Run "cmd /c node ""%BRIDGE%""", 0, False

REM تشغيله الآن بدون انتظار إعادة التشغيل
wscript "%STARTUP%\TajBridge.vbs"

echo.
echo تم! الجسر المحلي يعمل الآن وسيبدأ تلقائياً مع كل تشغيل للجهاز.
echo لإيقاف التشغيل التلقائي احذف: %STARTUP%\TajBridge.vbs
pause
