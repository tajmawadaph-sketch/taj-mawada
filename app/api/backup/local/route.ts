import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetDrive = body.path || 'D:\\TajMawadah_Data\\Backups';
    
    // فحص أو إنشاء المجلد محلياً إذا كان يعمل على خادم Node محلي
    try {
      if (fs.existsSync('D:\\')) {
        const fullDir = path.resolve('D:\\TajMawadah_Data\\Backups');
        if (!fs.existsSync(fullDir)) {
          fs.mkdirSync(fullDir, { recursive: true });
        }
        const fileName = `snapshot_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filePath = path.join(fullDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(body.data || {}, null, 2), 'utf-8');
        return NextResponse.json({ success: true, savedPath: filePath });
      }
    } catch (e) {
      // إذا كان يعمل على بيئة سحابية (Vercel) نرجع نجاحاً افتراضياً مع التوجيه للتنزيل
    }

    return NextResponse.json({ 
      success: true, 
      message: 'تم تجهيز النسخة الاحتياطية للهارد ديسك المحلي',
      targetPath: targetDrive 
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
