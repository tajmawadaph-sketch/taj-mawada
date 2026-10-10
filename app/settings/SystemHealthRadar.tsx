"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  Warehouse,
  Zap,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import DiagnosticsPanel from './DiagnosticsPanel';

type AuditIssue = {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  data?: any[];
};

export default function SystemHealthRadar() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  // التبديل بين الفحص الفني والسحابي ورادار العمليات المحاسبية
  const [activeView, setActiveView] = useState<'technical' | 'business'>('technical');

  // =========================================================================
  // ⚡ منطق فحص الشذوذ المالي والمخزني (Business & Inventory Audit)
  // =========================================================================
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCleaningZeros, setIsCleaningZeros] = useState(false);

  const t = (ar: string, en: string) => (isEn ? en : ar);

  const runAuditScan = async () => {
    setLoading(true);
    const detectedIssues: AuditIssue[] = [];

    try {
      // 1. Negative Inventory
      const { data: rawNegInv } = await supabase
        .from('warehouse_inventory')
        .select('id, quantity, warehouse_id, item_id')
        .lt('quantity', 0);

      let negInv: any[] = [];
      if (rawNegInv && rawNegInv.length > 0) {
        const [whRes, itemsRes] = await Promise.all([
          supabase.from('warehouses').select('id, name'),
          supabase.from('inventory_items').select('id, name')
        ]);
        const whMap = new Map((whRes.data || []).map((w: any) => [w.id, w]));
        const itMap = new Map((itemsRes.data || []).map((i: any) => [i.id, i]));
        negInv = rawNegInv.map((n: any) => ({
          ...n,
          warehouseName: whMap.get(n.warehouse_id)?.name || t('مستودع غير محدد', 'Unknown Warehouse'),
          itemName: itMap.get(n.item_id)?.name || t('صنف غير محدد', 'Unknown Item'),
        }));
      }

      if (negInv && negInv.length > 0) {
        detectedIssues.push({
          id: 'neg_inv',
          titleAr: 'أرصدة المخزون بالسالب (Negative Stock)',
          titleEn: 'Negative Inventory Balances',
          descriptionAr: 'صرف أو بيع بضاعة غير متوفرة دفترياً بسبب تأخر إثبات فواتير المشتريات أو أخطاء الجرد.',
          descriptionEn: 'Issuing or selling goods not recorded in books due to delayed purchase invoices.',
          count: negInv.length,
          severity: 'high',
          data: negInv,
        });
      }

      // 2. Suspended Transfers
      const { data: suspTransfers } = await supabase
        .from('inventory_transactions')
        .select('id, transaction_number, transaction_date')
        .eq('type', 'transfer_out')
        .eq('status', 'pending');

      if (suspTransfers && suspTransfers.length > 0) {
        detectedIssues.push({
          id: 'susp_transfers',
          titleAr: 'التحويلات المخزنية المعلقة (Pending Transfers)',
          titleEn: 'Suspended Inventory Transfers',
          descriptionAr: 'بضاعة خرجت من المستودع المصدر ولم يتم تأكيد استلامها في المستودع المستلم.',
          descriptionEn: 'Goods issued from source warehouse but not confirmed received at destination.',
          count: suspTransfers.length,
          severity: 'medium',
          data: suspTransfers,
        });
      }

      // 3. Suspended Shifts (> 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: suspShifts } = await supabase
        .from('pos_shifts')
        .select('id, opened_at, expected_cash')
        .eq('status', 'open')
        .lt('opened_at', yesterday);

      if (suspShifts && suspShifts.length > 0) {
        detectedIssues.push({
          id: 'susp_shifts',
          titleAr: 'ورديات كاشير معلقة لم تُغلق منذ 24 ساعة',
          titleEn: 'Suspended POS Shifts (>24h)',
          descriptionAr: 'ورديات بيع مفتوحة تجاوزت 24 ساعة دون ترحيل قيود الإغلاق والمطابقة.',
          descriptionEn: 'Open POS shifts exceeding 24 hours without closure reconciliation.',
          count: suspShifts.length,
          severity: 'high',
          data: suspShifts,
        });
      }

      // 4. Cash Shortages
      const { data: shortages } = await supabase
        .from('pos_shifts')
        .select('id, shortage_overage, closed_at')
        .lt('shortage_overage', 0);

      if (shortages && shortages.length > 0) {
        detectedIssues.push({
          id: 'shortages',
          titleAr: 'عجز نقدي في الصناديق والورديات',
          titleEn: 'Cash Register Shortages',
          descriptionAr: 'فروقات سالبة مسجلة بين المبيعات المسجلة في نقاط البيع والنقدية المستلمة فعلياً.',
          descriptionEn: 'Negative variances between registered sales and collected cash.',
          count: shortages.length,
          severity: 'high',
          data: shortages,
        });
      }

      // 5. Unallocated Payments
      const { data: unallocated } = await supabase
        .from('receipt_vouchers')
        .select('id, receipt_number, amount, date')
        .is('invoice_id', null)
        .in('status', ['معتمد', 'posted', 'approved']);

      if (unallocated && unallocated.length > 0) {
        detectedIssues.push({
          id: 'unallocated',
          titleAr: 'سندات قبض غير مسواة مع فواتير (Unallocated)',
          titleEn: 'Unallocated Receipts',
          descriptionAr: 'مبالغ نقدية محصلة من عملاء دون ربطها بفواتير مبيعات محددة.',
          descriptionEn: 'Receipts collected without allocating against open sales invoices.',
          count: unallocated.length,
          severity: 'medium',
          data: unallocated,
        });
      }

      // 6. Ghost Invoices
      const { data: ghosts } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount')
        .eq('total_amount', 0);

      if (ghosts && ghosts.length > 0) {
        detectedIssues.push({
          id: 'ghost_invoices',
          titleAr: 'فواتير شبحية فارغة (Zero Amount Invoices)',
          titleEn: 'Ghost Invoices (Zero Value)',
          descriptionAr: 'سجلات فواتير قيمتها الإجمالية صفر ولا يوجد لها أثر مالي سليم.',
          descriptionEn: 'Invoice records with zero total value and no financial impact.',
          count: ghosts.length,
          severity: 'low',
          data: ghosts,
        });
      }

      // 7. Zero Journals
      const { data: zeroJournals } = await supabase
        .from('journal_lines')
        .select('id, debit, credit')
        .eq('debit', 0)
        .eq('credit', 0);

      if (zeroJournals && zeroJournals.length > 0) {
        detectedIssues.push({
          id: 'zero_journals',
          titleAr: 'أسطر قيود يومية صفرية وعمياء (Zero Debit/Credit)',
          titleEn: 'Zero & Blind Journal Lines',
          descriptionAr: 'أسطر قيود مسجلة بقيمة مدين 0 ودائن 0 تشغل الذاكرة دون فائدة محاسبية.',
          descriptionEn: 'Journal lines with zero debit and zero credit filling database space.',
          count: zeroJournals.length,
          severity: 'low',
          data: zeroJournals,
        });
      }

      // 8. Orphaned Records
      const { data: orphans } = await supabase
        .from('journal_lines')
        .select('id')
        .is('header_id', null);

      if (orphans && orphans.length > 0) {
        detectedIssues.push({
          id: 'orphaned_lines',
          titleAr: 'أسطر قيود يتيمة بدون رأس (Orphaned Lines)',
          titleEn: 'Orphaned Journal Lines',
          descriptionAr: 'أسطر قيود فقدت ترويستها في جدول journal_headers بسبب حذف غير سليم.',
          descriptionEn: 'Journal lines missing their parent document header.',
          count: orphans.length,
          severity: 'high',
          data: orphans,
        });
      }
    } catch (error) {
      console.error("Audit Scan Error:", error);
      toast.error(t('حدث خطأ أثناء فحص السجلات المحاسبية.', 'Error running audit scan.'));
    }

    setIssues(detectedIssues);
    setLoading(false);
  };

  useEffect(() => {
    if (activeView === 'business') {
      runAuditScan();
    }
  }, [activeView]);

  const deleteZeroJournals = async () => {
    setIsCleaningZeros(true);
    try {
      const { error } = await supabase
        .from('journal_lines')
        .delete()
        .eq('debit', 0)
        .eq('credit', 0);
      if (!error) {
        toast.success(t('تم تطهير وحذف كافة القيود الصفرية بنجاح 🧹', 'Zero entries purged successfully 🧹'));
        runAuditScan();
      } else {
        toast.error(t('تعذر حذف السجلات الصفرية: ' + error.message, 'Failed to purge zero entries'));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCleaningZeros(false);
    }
  };

  const getSeverityBadge = (sev: 'high' | 'medium' | 'low') => {
    if (sev === 'high') {
      return {
        bg: 'bg-red-50 text-[#A8573C] border-red-300',
        label: t('حرج / عالي الخطورة', 'Critical / High'),
        dot: 'bg-[#A8573C]',
      };
    }
    if (sev === 'medium') {
      return {
        bg: 'bg-amber-50 text-amber-800 border-amber-300',
        label: t('متوسط / للمراجعة', 'Medium Warning'),
        dot: 'bg-amber-500',
      };
    }
    return {
      bg: 'bg-slate-100 text-slate-700 border-slate-300',
      label: t('منخفض / تنبيه', 'Low / Notice'),
      dot: 'bg-slate-500',
    };
  };

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="space-y-6 text-[#1E130B]">
      
      {/* ========================================================================= */}
      {/* 👑 شريط التبديل الملكي الرئيسي بين الفحص الفني والرادار المحاسبي             */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-[#C29B62]/20 bg-white p-4 shadow-[0_4px_20px_rgba(30,19,11,0.05)]">
        
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1E130B] text-[#C29B62] shadow-sm">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#1E130B]">
              {t('مركز الفحص والتشخيص الهندسي وسلامة النظام', 'Engineering Diagnostics & System Health')}
            </h2>
            <p className="text-xs font-semibold text-[#6F6257]">
              {t(
                'اختر وضع الفحص: الفحص التقني والسحابي الشامل، أو رادار الشذوذ المالي والمخزني.',
                'Select mode: Technical & Cloud Diagnostics, or Business & Accounting Anomaly Radar.'
              )}
            </p>
          </div>
        </div>

        {/* أزرار التبديل الفاخرة الموحدة */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('technical')}
            className={`dashboard-tab ${activeView === 'technical' ? 'active' : ''}`}
          >
            <Sparkles className="h-4 w-4" />
            <span>{t('الفحص والتشخيص الفني (الرئيسي)', 'Technical Diagnostics')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('business')}
            className={`dashboard-tab ${activeView === 'business' ? 'active' : ''}`}
          >
            <Zap className="h-4 w-4" />
            <span>{t('رادار الشذوذ المالي والمخزني', 'Financial & Stock Radar')}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🩺 1. وضع الفحص الفني والسحابي (DiagnosticsPanel)                          */}
      {/* ========================================================================= */}
      {activeView === 'technical' && (
        <div className="animate-in fade-in duration-300">
          <DiagnosticsPanel />
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚡ 2. وضع رادار الشذوذ المالي والمخزني (Business Radar)                     */}
      {/* ========================================================================= */}
      {activeView === 'business' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* بطاقة رأس رادار الأعمال */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[#C29B62]/20 bg-white p-6 shadow-[0_4px_20px_rgba(30,19,11,0.05)] md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-black text-amber-800">
                  {t('رادار التدقيق المحاسبي والمخزني', 'Accounting & Stock Integrity')}
                </span>
                <span className="text-xs font-semibold text-[#8C7A6B]">
                  {t(`تم اكتشاف ${issues.length} فئات للمراجعة`, `${issues.length} audit categories identified`)}
                </span>
              </div>
              <h3 className="text-lg font-black text-[#1E130B]">
                {t('كشف الاختلالات المحاسبية والمخزنية والسجلات الشبحية', 'Accounting Anomalies & Ghost Records Detection')}
              </h3>
              <p className="text-xs font-medium text-[#6F6257]">
                {t(
                  'فحص متقدم يبحث عن المخزون السالب، التحويلات العالقة، الورديات غير المقفلة، والقيود الصفرية لتطهيرها فوراً.',
                  'Deep audit inspecting negative inventory, suspended shifts, orphaned lines, and zero journal entries.'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={runAuditScan}
              disabled={loading}
              className="btn-main-glass gold"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? t('جاري التدقيق...', 'Scanning...') : t('إعادة فحص العمليات الآن', 'Rescan Financials Now')}</span>
            </button>
          </div>

          {/* حالة التحميل */}
          {loading && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-[#C29B62]/20 bg-white p-8 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FDFBF7] text-[#C29B62]">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
              <h4 className="text-sm font-black text-[#1E130B]">{t('جاري فحص وتدقيق الجداول المالية والمخزنية...', 'Auditing accounting and stock tables...')}</h4>
              <p className="text-xs text-[#6F6257]">{t('يتم فحص أكثر من 8 مؤشرات سلامة في قاعدة البيانات.', 'Inspecting 8+ enterprise health metrics.')}</p>
            </div>
          )}

          {/* حالة النظام سليم 100% */}
          {!loading && issues.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/30 bg-white p-12 text-center shadow-[0_4px_20px_rgba(30,19,11,0.05)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-[#059669] shadow-inner">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <h3 className="mt-4 text-xl font-black text-[#059669]">
                {t('النظام المحاسبي والمخزني سليم 100% 🟢', 'Financial & Stock Engine is 100% Healthy! 🟢')}
              </h3>
              <p className="mt-1 max-w-md text-xs font-semibold text-[#6F6257]">
                {t(
                  'لم يتم اكتشاف أي أرصدة مخزنية سالبة، أو قيود غير متزنة، أو ورديات معلقة، أو سجلات شبحية. كافة العمليات مطابقة للأصول.',
                  'No negative stock, suspended shifts, or ghost entries detected. All business operations are in perfect order.'
                )}
              </p>
            </div>
          )}

          {/* شبكة القضايا المكتشفة */}
          {!loading && issues.length > 0 && (
            <div className="space-y-4">
              {issues.map((issue) => {
                const isExpanded = expandedId === issue.id;
                const badge = getSeverityBadge(issue.severity);

                return (
                  <article
                    key={issue.id}
                    className="overflow-hidden rounded-2xl border border-[#C29B62]/20 bg-white shadow-[0_4px_20px_rgba(30,19,11,0.05)] transition-all hover:-translate-y-0.5"
                  >
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                      className="flex cursor-pointer flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDFBF7] text-[#1E130B] font-black border border-[#C29B62]/20">
                          {issue.count}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-[#1E130B]">
                              {isEn ? issue.titleEn : issue.titleAr}
                            </h4>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black ${badge.bg}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#514438] leading-relaxed">
                            {isEn ? issue.descriptionEn : issue.descriptionAr}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 shrink-0">
                        <button
                          type="button"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#C29B62]/30 bg-[#FDFBF7] px-3 text-xs font-bold text-[#1E130B]"
                        >
                          <span>{isExpanded ? t('إغلاق التفاصيل', 'Collapse') : t('معاينة السجلات', 'Inspect Rows')}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* المحتوى التفصيلي للقضية */}
                    {isExpanded && (
                      <div className="border-t border-[#C29B62]/15 bg-[#FDFBF7]/60 p-5 space-y-4">
                        
                        {/* في حالة المخزون السالب: جدول تفصيلي راقٍ */}
                        {issue.id === 'neg_inv' && Array.isArray(issue.data) && (
                          <div className="overflow-x-auto rounded-xl border border-[#C29B62]/20 bg-white">
                            <table className="w-full text-start text-xs">
                              <thead className="bg-[#1E130B] text-[#C29B62] font-black">
                                <tr>
                                  <th className="p-3 text-start">{t('اسم الصنف', 'Item Name')}</th>
                                  <th className="p-3 text-start">{t('المستودع', 'Warehouse')}</th>
                                  <th className="p-3 text-start">{t('الرصيد الدفتري الحالي', 'Current Stock')}</th>
                                  <th className="p-3 text-start">{t('الإجراء المطلوب', 'Required Action')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#C29B62]/10 font-bold">
                                {issue.data.map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-[#FDFBF7]">
                                    <td className="p-3 text-[#1E130B]">{row.itemName}</td>
                                    <td className="p-3 text-[#6F6257]">{row.warehouseName}</td>
                                    <td className="p-3 text-[#A8573C] font-black dir-ltr">
                                      {row.quantity}
                                    </td>
                                    <td className="p-3 text-emerald-800 text-[11px]">
                                      {t('إثبات فاتورة مشتريات أو تسوية جردية موجبة', 'Post purchase invoice or positive stocktaking')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* في حالة الورديات المعلقة: جدول ورديات */}
                        {issue.id === 'susp_shifts' && Array.isArray(issue.data) && (
                          <div className="overflow-x-auto rounded-xl border border-[#C29B62]/20 bg-white">
                            <table className="w-full text-start text-xs">
                              <thead className="bg-[#1E130B] text-[#C29B62] font-black">
                                <tr>
                                  <th className="p-3 text-start">{t('معرّف الوردية', 'Shift ID')}</th>
                                  <th className="p-3 text-start">{t('تاريخ الفتح', 'Opened At')}</th>
                                  <th className="p-3 text-start">{t('النقدية المتوقعة', 'Expected Cash')}</th>
                                  <th className="p-3 text-start">{t('الحل المقترح', 'Fix')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#C29B62]/10 font-bold">
                                {issue.data.map((row: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-[#FDFBF7]">
                                    <td className="p-3 font-mono text-[11px] text-[#1E130B]">{row.id}</td>
                                    <td className="p-3 text-[#6F6257]">{new Date(row.opened_at).toLocaleString(isEn ? 'en-US' : 'ar-SA')}</td>
                                    <td className="p-3 text-[#1E130B] font-black">{row.expected_cash} ر.س</td>
                                    <td className="p-3 text-amber-800 text-[11px]">
                                      {t('إغلاق الوردية من شاشة نقاط البيع وترحيلها', 'Close shift from POS terminal and reconcile')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* في حالة القيود الصفرية: زر تطهير مباشر */}
                        {issue.id === 'zero_journals' && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50/60 p-4">
                            <div>
                              <h5 className="text-xs font-black text-[#A8573C]">
                                {t(`عُثر على ${issue.count} سطر قيد بقيم صفرية ليس لها أثر مالي.`, `Found ${issue.count} zero-value journal lines.`)}
                              </h5>
                              <p className="mt-0.5 text-[11px] text-[#514438]">
                                {t('يمكنك تطهير هذه الأسطر فوراً بأمان لتحسين سرعة التقارير المالية.', 'You can safely purge these zero rows to optimize query performance.')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={deleteZeroJournals}
                              disabled={isCleaningZeros}
                              className="btn-main-glass red"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span>{isCleaningZeros ? t('جاري التطهير...', 'Purging...') : t('تطهير القيود الصفرية فوراً', 'Purge Zero Entries')}</span>
                            </button>
                          </div>
                        )}

                        {/* عرض ملخص السجلات الأخرى */}
                        {issue.id !== 'neg_inv' && issue.id !== 'susp_shifts' && issue.id !== 'zero_journals' && Array.isArray(issue.data) && (
                          <div className="rounded-xl border border-[#C29B62]/20 bg-white p-3">
                            <div className="text-[11px] font-bold text-[#6F6257] mb-2">
                              {t(`عرض عينة من السجلات (${Math.min(issue.data.length, 10)} من ${issue.data.length}):`, `Sample records (${Math.min(issue.data.length, 10)} of ${issue.data.length}):`)}
                            </div>
                            <div className="space-y-1 font-mono text-[11px] text-[#514438]">
                              {issue.data.slice(0, 10).map((item: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-[#FDFBF7]">
                                  <span className="text-[#C29B62]">#</span>
                                  <span>{item.invoice_number || item.receipt_number || item.transaction_number || item.id}</span>
                                  {item.amount && <span className="ms-auto font-black text-[#1E130B]">{item.amount} ر.س</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
