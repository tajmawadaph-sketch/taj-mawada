import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    const timestamp = new Date().toISOString();
    
    // سحب لقطة حية من الجداول المركزية
    const [
      { data: items },
      { data: invoices },
      { data: transactions },
      { data: partners },
      { data: accounts },
      { data: shifts }
    ] = await Promise.all([
      supabase.from('inventory_items').select('*').limit(5000),
      supabase.from('invoices').select('*').limit(5000),
      supabase.from('inventory_transactions').select('*').limit(5000),
      supabase.from('partners').select('*').limit(2000),
      supabase.from('accounts').select('*').limit(500),
      supabase.from('pos_shifts').select('*').limit(2000)
    ]);

    const backupPayload = {
      app: 'Taj Al-Mawadah ERP & POS',
      version: '2.0.0-offline-first',
      timestamp,
      target_local_drive: 'D:\\TajMawadah_Data\\Backups',
      stats: {
        itemsCount: items?.length || 0,
        invoicesCount: invoices?.length || 0,
        transactionsCount: transactions?.length || 0,
        partnersCount: partners?.length || 0,
        accountsCount: accounts?.length || 0,
        shiftsCount: shifts?.length || 0
      },
      data: {
        inventory_items: items || [],
        invoices: invoices || [],
        inventory_transactions: transactions || [],
        partners: partners || [],
        accounts: accounts || [],
        pos_shifts: shifts || []
      }
    };

    return NextResponse.json(backupPayload, {
      headers: {
        'Content-Disposition': `attachment; filename="taj_mawadah_backup_${new Date().toISOString().slice(0, 10)}.json"`,
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

  } catch (error: any) {
    console.error('❌ خطأ في إنشاء النسخة الاحتياطية:', error);
    return NextResponse.json(
      { error: 'فشل استخراج النسخة الاحتياطية', details: error.message },
      { status: 500 }
    );
  }
}
