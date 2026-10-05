import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getLocalExePath() {
  const targetFile = path.join(process.cwd(), 'dist-desktop', 'TajMawadah-Setup-0.1.0.exe');
  if (fs.existsSync(/*turbopackIgnore: true*/ targetFile)) {
    return targetFile;
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const infoOnly = searchParams.get('info') === 'true';

    const localExe = getLocalExePath();
    const githubReleaseUrl = 'https://github.com/tajmawadaph-sketch/taj-mawada/releases/download/v0.1.0/TajMawadah-Setup-0.1.0.exe';

    let stats: fs.Stats | null = null;
    let filename = 'TajMawadah-Setup-0.1.0.exe';

    if (localExe && fs.existsSync(/*turbopackIgnore: true*/ localExe)) {
      stats = fs.statSync(/*turbopackIgnore: true*/ localExe);
      filename = path.basename(localExe);
    }

    // إرجاع معلومات الملف فقط عند الطلب
    if (infoOnly) {
      const sizeBytes = stats ? stats.size : 225332211;
      const sizeFormatted = (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB';

      return NextResponse.json({
        available: true,
        filename,
        version: '0.1.0',
        sizeBytes,
        sizeFormatted,
        releaseDate: stats ? stats.mtime.toISOString().split('T')[0] : '2026-10-05',
        targetOs: 'Windows 10 / 11 (64-bit)',
        isMultiUser: true,
        source: stats ? 'local' : 'cloud',
        directDownloadUrl: '/api/backup/download-installer',
        cloudDownloadUrl: githubReleaseUrl,
      });
    }

    // إذا كان الملف متوفراً على الجهاز الخادم محلياً، يتم تحميله مباشرة
    if (localExe && stats && fs.existsSync(/*turbopackIgnore: true*/ localExe)) {
      const fileBuffer = fs.readFileSync(/*turbopackIgnore: true*/ localExe);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.microsoft.portable-executable',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // في حال الاستضافة السحابية على Vercel، التحويل التلقائي لروابط GitHub Releases
    return NextResponse.redirect(githubReleaseUrl, { status: 302 });
  } catch (error: any) {
    console.error('Download installer error:', error);
    return NextResponse.json(
      { error: 'فشل بدء تحميل مثبت ويندوز', details: error.message },
      { status: 500 }
    );
  }
}
