// app/reports/page.tsx
"use client";
import React from 'react';
import Link from 'next/link';
import { useReportsLogic } from './reports_logic';
import MasterPage from '@/components/MasterPage';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import { THEME } from '@/lib/theme';
import { formatCurrency } from '@/lib/helpers';

export default function ReportsPage() {
  const logic = useReportsLogic();

  const sidebarActions = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      <button 
        className="btn-main-glass blue" 
        onClick={logic.handleRefresh}
        disabled={logic.isLoading}
      >
        {logic.isLoading ? '⏳ جاري التحديث...' : '🔄 تحديث البيانات اللحظية'}
      </button>
      <button 
        className="btn-main-glass white" 
        onClick={() => window.print()}
      >
        🖨️ طباعة التقرير
      </button>
    </div>
  );

  return (
    <div className="clean-page">
      <MasterPage icon="📊" 
        title="مركز التقارير المحاسبية والتحليلية" 
        subtitle="لوحة تحكم مالية وإدارية شاملة لجميع أقسام الشركة"
      >
        <RawasiSidebarManager 
          actions={sidebarActions}
          summary={
            <div className="summary-glass-card">
              <span style={{fontSize:'12px', fontWeight:800, color:'#64748b'}}>نطاق التقرير 📅</span>
              <div style={{fontSize:'11px', color: THEME.primary, fontWeight:900, marginTop:'5px'}}>
                من: {logic.dateRange.start} <br/> إلى: {logic.dateRange.end}
              </div>
            </div>
          }
        />

        {/* شريط الفلاتر */}
        <div className="filter-bar">
          <div className="filter-group">
            <label>من تاريخ:</label>
            <input 
              type="date" 
              value={logic.dateRange.start} 
              onChange={(e) => logic.handleDateChange('start', e.target.value)} 
            />
          </div>
          <div className="filter-group">
            <label>إلى تاريخ:</label>
            <input 
              type="date" 
              value={logic.dateRange.end} 
              onChange={(e) => logic.handleDateChange('end', e.target.value)} 
            />
          </div>
        </div>

        {/* 1. التقارير المالية والمحاسبية */}
        <h2 className="section-title">
          <span>📒</span> 1. التقارير المالية والمحاسبية (Core Financials)
        </h2>
        <div className="reports-grid">
          <ReportLinkCard href="/trialbalance" icon="⚖️" title="ميزان المراجعة (Trial Balance)" desc="عرض أرصدة الحسابات (مدين/دائن) للتأكد من توازن النظام." />
          <ReportLinkCard href="/ledger" icon="📓" title="دفتر الأستاذ العام (General Ledger)" desc="كشف تفصيلي لحركة أي حساب في شجرة الحسابات." />
          <ReportLinkCard href="/journal" icon="📝" title="دفتر اليومية (Journal Entries)" desc="سجل يعرض كل القيود المحاسبية التي ولدها النظام يومياً بتفاصيلها." />
          <ReportLinkCard href="/financial-statements" icon="📉" title="قائمة الدخل (Income Statement)" desc="الإيرادات - تكلفة المبيعات - المصروفات، لمعرفة صافي الربح." />
          <ReportLinkCard href="/financial-statements" icon="🏛️" title="المركز المالي (Balance Sheet)" desc="عرض الأصول، الخصوم، وحقوق الملكية لمعرفة قوة الشركة." />
          <ReportLinkCard href="/vat-return" icon="📜" title="الإقرار الضريبي (VAT Return)" desc="تقرير جاهز لهيئة الزكاة يفصل ضريبة المدخلات والمخرجات." />
          <ReportLinkCard href="/fixed-assets" icon="🏗️" title="سجل الأصول الثابتة والإهلاك الآلي" desc="إدارة الأصول الرأسمالية (الشاحنات، الأجهزة، الكاشير) واحتساب وترحيل قيود الإهلاك." />
          <ReportLinkCard href="/financial-center" icon="💎" title="غرفة القيادة والتحكم بالسيولة (Liquidity)" desc="متابعة فورية لأرصدة البنوك والصناديق ورأس المال العامل ونسب الملاءة." />
        </div>

        {/* 2. تقارير التشغيل وحركة المناديب */}
        <h2 className="section-title" style={{ marginTop: '50px' }}>
          <span>🚚</span> 2. تقارير التشغيل وحركة المناديب (Van Sales)
        </h2>
        <div className="reports-grid">
          <ReportLinkCard href="/trip-profitability" icon="🚚" title="ربحية الرحلات (Trip Profitability)" desc="المبيعات والتكلفة وصافي الربح لكل رحلة." />
          <ReportLinkCard href="/delegate-settlements" icon="🤝" title="تسوية عهد المناديب" desc="المطابقة اليومية للبضاعة والنقدية لمعرفة العهد المتبقية في ذمة كل مندوب." />
          <ReportLinkCard href="/delegate-debts" icon="🎯" title="كشف عهدة التحصيل" desc="الديون المتأخرة في السوق والمطلوب من كل مندوب تحصيلها." />
          <ReportLinkCard href="/vehicle-expenses" icon="⛽" title="مصروفات السيارات" desc="تجميع تكاليف الديزل والصيانة لكل سيارة على حدة." />
        </div>

        {/* 3. تقارير المبيعات والعملاء */}
        <h2 className="section-title" style={{ marginTop: '50px' }}>
          <span>🤝</span> 3. تقارير المبيعات والعملاء (Sales & Receivables)
        </h2>
        <div className="reports-grid">
          <ReportLinkCard href="/statement" icon="🧾" title="كشف حساب عميل" desc="حركة فواتير وسدادات عميل معين والرصيد المتبقي عليه." />
          <ReportLinkCard href="/statement" icon="📦" title="كشف حساب مورد" desc="متابعة فواتير المشتريات والدفعات لموردي البضاعة." />
          <ReportLinkCard href="/ar-aging" icon="⏳" title="أعمار الديون (AR Aging)" desc="الديون غير المحصلة مقسمة حسب مدة التأخير (30-60-90 يوم)." />
          <ReportLinkCard href="/sales-analysis" icon="📊" title="تحليل المبيعات الشامل" desc="مبيعات الشركة مقسمة حسب العملاء، المناديب، والأصناف." />
        </div>

        {/* 4. تقارير المخازن والمستودعات */}
        <h2 className="section-title" style={{ marginTop: '50px' }}>
          <span>📦</span> 4. تقارير المخازن والمستودعات (Inventory)
        </h2>
        <div className="reports-grid">
          <ReportLinkCard href="/item-card" icon="🏷️" title="بطاقة / كارت الصنف" desc="تتبع مسار صنف معين (الوارد والمنصرف بالتفصيل)." />
          <ReportLinkCard href="/inventory-valuation" icon="💵" title="تقييم المخزون (Inventory Valuation)" desc="يعرض قيمة البضاعة الحالية كرقم مالي (الكمية × متوسط التكلفة)." />
          <ReportLinkCard href="/inventory/warehouses" icon="🏢" title="أرصدة المستودعات والسيارات" desc="مقارنة كميات الأصناف الموجودة بالمستودع والسيارات." />
          <ReportLinkCard href="/reorder-alerts" icon="⚠️" title="نواقص المخزون (Reorder Alerts)" desc="الأصناف التي وصل رصيدها للحد الأدنى ويجب شراؤها." />
          <ReportLinkCard href="/dead-stock" icon="🐢" title="المخزون الراكد" desc="بضاعة لم يتم سحبها أو بيعها منذ فترة طويلة." />
        </div>

        {/* 5. لوحات الإدارة العليا */}
        <h2 className="section-title" style={{ marginTop: '50px' }}>
          <span>📈</span> 5. لوحات الإدارة العليا (Executive Dashboards)
        </h2>
        <div className="reports-grid">
          <ReportLinkCard href="/financialplan" icon="🎯" title="الموازنة مقابل الفعلي" desc="هل تجاوزت الشركة المصروفات المخطط لها هذا الشهر؟" />
          <ReportLinkCard href="/cashflows" icon="🌊" title="التدفقات النقدية (Cash Flows)" desc="حركة الكاش الداخل مقابل الكاش الخارج للشركة." />
          <ReportLinkCard href="/kpis" icon="✨" title="مؤشرات الأداء الرئيسية (KPIs)" desc="شاشة تعرض إجمالي المبيعات والتحصيل ونسبة الديون." />
        </div>

        <style>{`
          .filter-bar { display: flex; gap: 15px; margin-bottom: 25px; background: rgba(255,255,255,0.6); backdrop-filter: blur(15px); padding: 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.9); align-items: center; box-shadow: 0 4px 15px rgba(28, 115, 171, 0.05); }
          .filter-group { display: flex; flex-direction: column; gap: 5px; }
          .filter-group label { font-size: 12px; font-weight: 900; color: #122946; }
          .filter-group input { padding: 10px 15px; border-radius: 12px; border: 1px solid rgba(28, 115, 171, 0.2); outline: none; font-weight: 800; background: white; color: #122946; transition: 0.3s; }
          .filter-group input:focus { border-color: #1C73AB; box-shadow: 0 0 0 3px rgba(28, 115, 171, 0.1); }
          
          .section-title { color: #122946; font-weight: 900; margin-bottom: 25px; border-bottom: 2px solid rgba(40,145,200,0.15); padding-bottom: 12px; display: flex; align-items: center; font-size: 20px; }
          .section-title span { font-size: 26px; margin-left: 12px; }
          
          .reports-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
          
          .report-link-card {
            background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.55) 100%);
            backdrop-filter: blur(24px) saturate(160%);
            -webkit-backdrop-filter: blur(24px) saturate(160%);
            padding: 24px;
            border-radius: 20px;
            border: 1px solid rgba(194, 155, 98, 0.3);
            box-shadow: 0 4px 15px rgba(44, 26, 18, 0.05);
            text-decoration: none;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            position: relative;
            overflow: hidden;
          }
          .report-link-card:not(.disabled):hover {
            transform: translateY(-5px);
            background: #FFFFFF;
            box-shadow: 0 15px 35px rgba(168, 87, 60, 0.15);
            border-color: #C29B62;
          }
          .report-link-card.disabled {
            opacity: 0.6;
            cursor: not-allowed;
            filter: grayscale(100%);
          }
          .report-link-card.disabled .report-link-title::after {
            content: '(⏳ قريباً)';
            font-size: 11px;
            color: #d97706;
            margin-right: 8px;
            background: rgba(217, 119, 6, 0.1);
            padding: 3px 6px;
            border-radius: 8px;
            vertical-align: middle;
          }
          .report-link-icon { font-size: 36px; margin-bottom: 5px; }
          .report-link-title { font-size: 15px; font-weight: 900; color: #2C1A12; margin: 0; display: flex; align-items: center; }
          .report-link-desc { font-size: 12px; color: rgba(44, 26, 18, 0.65); font-weight: 700; line-height: 1.6; margin: 0; }
          .report-link-arrow { position: absolute; top: 24px; left: 24px; color: #C29B62; font-size: 18px; opacity: 0; transition: 0.3s; transform: translateX(10px); }
          .report-link-card:not(.disabled):hover .report-link-arrow { opacity: 1; transform: translateX(0); }
          
          .btn-main-glass { width: 100%; padding: 14px; border-radius: 16px; border: 1px solid rgba(194,155,98,0.3); backdrop-filter: blur(15px); font-weight: 900; cursor: pointer; transition: 0.2s; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 10px rgba(44, 26, 18, 0.05); }
          .btn-main-glass.blue { background: linear-gradient(135deg, #C29B62, #A8573C); color: white; border: none; }
          .btn-main-glass.white { background: white; color: #2C1A12; border: 1px solid rgba(194,155,98,0.3); }
          .btn-main-glass:hover { transform: translateY(-3px); filter: brightness(1.05); box-shadow: 0 8px 18px rgba(168, 87, 60, 0.2); }
          .summary-glass-card { background: rgba(255, 253, 250, 0.75); backdrop-filter: blur(10px); padding: 20px; border-radius: 20px; border: 1px solid rgba(194, 155, 98, 0.3); margin-bottom: 25px; box-shadow: 0 4px 15px rgba(44, 26, 18, 0.05); }

          @media (max-width: 768px) {
            .filter-bar { flex-direction: column !important; align-items: stretch !important; padding: 12px 10px !important; gap: 10px !important; }
            .filter-group { width: 100% !important; }
            .filter-group input { width: 100% !important; }
            .reports-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
            .section-title { font-size: 16px !important; margin-top: 25px !important; }
            .report-link-card { padding: 16px !important; border-radius: 16px !important; }
            .report-link-icon { font-size: 28px !important; margin-bottom: 2px !important; }
            .report-link-title { font-size: 14px !important; }
          }
        `}</style>
      </MasterPage>
    </div>
  );
}

// 🔗 مكون فرعي لكروت روابط التقارير
function ReportLinkCard({ title, desc, icon, href, disabled }: { title: string, desc: string, icon: string, href: string, disabled?: boolean }) {
  const content = (
    <>
      <div className="report-link-icon">{icon}</div>
      <h3 className="report-link-title">{title}</h3>
      <p className="report-link-desc">{desc}</p>
      {!disabled && <div className="report-link-arrow">←</div>}
    </>
  );
  
  if (disabled) {
    return (
      <div className="report-link-card disabled">
        {content}
      </div>
    );
  }
  
  return (
    <Link href={href} className="report-link-card">
      {content}
    </Link>
  );
}
