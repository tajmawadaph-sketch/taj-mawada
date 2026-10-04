"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useVATReturnLogic } from './vat_logic';

export default function VATReturnPage() {
  const {
    isLoading,
    dateRange,
    handleDateChange,
    setQuarterPreset,
    setMonthPreset,
    activeTab,
    setActiveTab,
    transactions,
    zatcaSummary,
    handleRefresh,
    exportToExcel
  } = useVATReturnLogic();

  return (
    <MasterPage
      title="إقرار ضريبة القيمة المضافة (ZATCA VAT Return 15%)"
      subtitle="نموذج الإقرار الضريبي الرسمي المعتمد من هيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية"
      icon="🏛️"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: #1E130B !important; }
            table { width: 100% !important; border-collapse: collapse !important; }
            th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
            .zatca-print-box { border: 2px solid #1E130B !important; padding: 15px !important; margin-top: 20px !important; }
          }
          @media (max-width: 768px) {
            .vat-kpi-grid { grid-template-columns: 1fr !important; }
            .vat-filter-row { flex-direction: column !important; }
          }
        `}</style>

        <PrintHeader title="إقرار ضريبة القيمة المضافة - هيئة الزكاة والضريبة والجمارك" subtitle={`عن الفترة الضريبية من ${dateRange.start} إلى ${dateRange.end}`} />

        {/* 1. Header Toolbar */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '20px',
          padding: '20px 24px',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Presets & Dates */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', borderRadius: '12px', padding: '3px' }}>
              <button
                onClick={() => setQuarterPreset(1)}
                style={{ padding: '6px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#6e5d4f', fontWeight: 800, fontSize: '12px', cursor: 'pointer', minHeight: '38px' }}
              >
                الربع الأول Q1
              </button>
              <button
                onClick={() => setQuarterPreset(2)}
                style={{ padding: '6px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#6e5d4f', fontWeight: 800, fontSize: '12px', cursor: 'pointer', minHeight: '38px' }}
              >
                الربع الثاني Q2
              </button>
              <button
                onClick={() => setQuarterPreset(3)}
                style={{ padding: '6px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#6e5d4f', fontWeight: 800, fontSize: '12px', cursor: 'pointer', minHeight: '38px' }}
              >
                الربع الثالث Q3
              </button>
              <button
                onClick={() => setQuarterPreset(4)}
                style={{ padding: '6px 12px', borderRadius: '9px', border: 'none', background: '#C29B62', color: '#FFFFFF', fontWeight: 800, fontSize: '12px', cursor: 'pointer', minHeight: '38px' }}
              >
                الربع الرابع Q4
              </button>
              <button
                onClick={setMonthPreset}
                style={{ padding: '6px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#6e5d4f', fontWeight: 800, fontSize: '12px', cursor: 'pointer', minHeight: '38px' }}
              >
                الشهر الحالي
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>من:</span>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateChange('start', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إلى:</span>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => handleDateChange('end', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleRefresh}
              style={{
                background: '#FDFBF7',
                color: '#1E130B',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                padding: '10px 16px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px'
              }}
            >
              <span>تحديث الإقرار</span>
              <span>🔄</span>
            </button>
            <button
              onClick={() => window.print()}
              style={{
                background: '#FDFBF7',
                color: '#1E130B',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                padding: '10px 16px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px'
              }}
            >
              <span>طباعة الإقرار A4</span>
              <span>🖨️</span>
            </button>
            <button
              onClick={exportToExcel}
              style={{
                background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.25)',
                minHeight: '44px'
              }}
            >
              <span>تصدير نموذج ZATCA</span>
              <span>📑</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingScreen message="جاري مطابقة الفواتير والقيود واحتساب إقرار ضريبة القيمة المضافة..." />
        ) : (
          <>
            {/* 2. Top Luxury KPI Cards Grid */}
            <div className="vat-kpi-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '14px'
            }}>
              {/* Output VAT */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(5, 150, 105, 0.35)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>ضريبة المخرجات (المبيعات)</span>
                  <span style={{ fontSize: '18px' }}>🟢</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '8px' }}>
                  {formatCurrency(zatcaSummary.box6_totalOutputVAT)}
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  المبيعات الخاضعة: {formatCurrency(zatcaSummary.box6_totalSales)}
                </div>
              </div>

              {/* Input VAT */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(168, 87, 60, 0.35)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(168, 87, 60, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>ضريبة المدخلات (المشتريات)</span>
                  <span style={{ fontSize: '18px' }}>🔴</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#A8573C', marginTop: '8px' }}>
                  {formatCurrency(zatcaSummary.box11_totalInputVAT)}
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  المشتريات الخاضعة: {formatCurrency(zatcaSummary.box11_totalPurchases)}
                </div>
              </div>

              {/* Net Tax Due */}
              <div style={{
                background: '#FFFFFF',
                border: `1.5px solid ${zatcaSummary.box15_finalTaxDue >= 0 ? 'rgba(194, 155, 98, 0.4)' : 'rgba(5, 150, 105, 0.4)'}`,
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: zatcaSummary.box15_finalTaxDue >= 0 ? '#8c6b32' : '#059669' }}>
                    {zatcaSummary.box15_finalTaxDue >= 0 ? 'صافي الضريبة واجبة السداد' : 'رصيد ضريبة مستردة'}
                  </span>
                  <span style={{ fontSize: '18px' }}>⚖️</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: zatcaSummary.box15_finalTaxDue >= 0 ? '#1E130B' : '#059669', marginTop: '8px' }}>
                  {formatCurrency(Math.abs(zatcaSummary.box15_finalTaxDue))}
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  {zatcaSummary.box15_finalTaxDue >= 0 ? 'مستحقة لهيئة الزكاة والضريبة (ZATCA)' : 'تُرَحَّل كرصيد دائن للفترة القادمة'}
                </div>
              </div>

              {/* Operations Count */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid rgba(194, 155, 98, 0.25)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي الفواتير والعمليات</span>
                  <span style={{ fontSize: '18px' }}>🧾</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                  {transactions.length} <span style={{ fontSize: '14px', color: '#8c6b32' }}>عملية مسجلة</span>
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  نسبة الضريبة القياسية: 15%
                </div>
              </div>
            </div>

            {/* 3. Navigation Tabs */}
            <div className="no-print" style={{
              display: 'flex',
              gap: '10px',
              borderBottom: '2px solid rgba(194, 155, 98, 0.2)',
              paddingBottom: '8px'
            }}>
              <button
                onClick={() => setActiveTab('form')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: activeTab === 'form' ? '#1E130B' : '#FDFBF7',
                  color: activeTab === 'form' ? '#FFFFFF' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                النموذج الرسمي المعتمد (ZATCA Schedule) 📋
              </button>
              <button
                onClick={() => setActiveTab('chart')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: activeTab === 'chart' ? '#C29B62' : '#FDFBF7',
                  color: activeTab === 'chart' ? '#FFFFFF' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                التحليل والمقارنة البيانية (Chart) 📊
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: activeTab === 'transactions' ? '#8c6b32' : '#FDFBF7',
                  color: activeTab === 'transactions' ? '#FFFFFF' : '#6e5d4f',
                  fontWeight: 900,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                سجل الفواتير والعمليات الضريبية (Audit Log) 🔍
              </button>
            </div>

            {/* 4. Tab Contents */}

            {/* TAB 1: ZATCA Official Form */}
            {activeTab === 'form' && (
              <div style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(194, 155, 98, 0.25)',
                padding: '24px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', paddingBottom: '14px' }}>
                  <div>
                    <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                      نموذج إقرار ضريبة القيمة المضافة (ZATCA VAT Return Schedule)
                    </h2>
                    <span style={{ fontSize: '13px', color: '#6e5d4f', fontWeight: 600 }}>
                      الرقم الضريبي للمنشأة: 300000000000003 | صيدلية تاج المودة البيطرية
                    </span>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, padding: '6px 14px', borderRadius: '12px', background: 'rgba(194, 155, 98, 0.15)', color: '#8c6b32' }}>
                    المطابقة لمعايير الزكاة والضريبة 15% ✓
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                        <th style={{ padding: '12px 16px', color: '#8c6b32', fontWeight: 900, width: '90px' }}>الخانة</th>
                        <th style={{ padding: '12px 16px', color: '#1E130B', fontWeight: 900 }}>بيان ضريبة القيمة المضافة</th>
                        <th style={{ padding: '12px 16px', color: '#1E130B', fontWeight: 900, textAlign: 'left', width: '220px' }}>المبلغ الخاضع للضريبة (SAR)</th>
                        <th style={{ padding: '12px 16px', color: '#1E130B', fontWeight: 900, textAlign: 'left', width: '180px' }}>مبلغ الضريبة 15% (SAR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Section 1: Sales / Output VAT */}
                      <tr style={{ background: 'rgba(194, 155, 98, 0.08)', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                        <td colSpan={4} style={{ padding: '10px 16px', fontWeight: 900, color: '#8c6b32', fontSize: '14px' }}>
                          أولاً: ضريبة القيمة المضافة على المبيعات (المخرجات)
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>1</td>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#1E130B' }}>المبيعات الخاضعة للنسبة الأساسية (15%)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(zatcaSummary.box1_stdSales)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 900, color: '#059669' }}>{formatCurrency(zatcaSummary.box1_stdSalesVAT)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: '#FDFBF7' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>2</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>المبيعات للمواطنين (خدمات صحية خاصة)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>3</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>المبيعات المحلية الخاضعة لنسبة الصفر</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>{formatCurrency(zatcaSummary.box3_zeroSales)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: '#FDFBF7' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>4</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>الصادرات</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>5</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>المبيعات المعفاة من الضريبة</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>{formatCurrency(zatcaSummary.box5_exemptSales)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.3)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#8c6b32' }}>6</td>
                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#1E130B' }}>إجمالي المبيعات وضريبة المخرجات</td>
                        <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(zatcaSummary.box6_totalSales)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 900, color: '#059669', fontSize: '15px' }}>{formatCurrency(zatcaSummary.box6_totalOutputVAT)}</td>
                      </tr>

                      {/* Section 2: Purchases / Input VAT */}
                      <tr style={{ background: 'rgba(194, 155, 98, 0.08)', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                        <td colSpan={4} style={{ padding: '10px 16px', fontWeight: 900, color: '#8c6b32', fontSize: '14px' }}>
                          ثانياً: ضريبة القيمة المضافة على المشتريات والمصروفات (المدخلات)
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>7</td>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#1E130B' }}>المشتريات الخاضعة للنسبة الأساسية (15%)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(zatcaSummary.box7_stdPurchases)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 900, color: '#A8573C' }}>{formatCurrency(zatcaSummary.box7_stdPurchasesVAT)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: '#FDFBF7' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>8</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>الاستيرادات الخاضعة للضريبة بالنسبة الأساسية (تدفع في الجمارك)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>9</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>المشتريات الخاضعة لنسبة الصفر</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>{formatCurrency(zatcaSummary.box9_zeroPurchases)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: '#FDFBF7' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>10</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>المشتريات المعفاة من الضريبة</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>{formatCurrency(zatcaSummary.box10_exemptPurchases)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.3)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#8c6b32' }}>11</td>
                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#1E130B' }}>إجمالي المشتريات وضريبة المدخلات القابلة للخصم</td>
                        <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(zatcaSummary.box11_totalPurchases)}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 900, color: '#A8573C', fontSize: '15px' }}>{formatCurrency(zatcaSummary.box11_totalInputVAT)}</td>
                      </tr>

                      {/* Section 3: Net Tax Due */}
                      <tr style={{ background: 'rgba(194, 155, 98, 0.08)', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                        <td colSpan={4} style={{ padding: '10px 16px', fontWeight: 900, color: '#8c6b32', fontSize: '14px' }}>
                          ثالثاً: احتساب صافي ضريبة القيمة المضافة
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>12</td>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#1E130B' }}>إجمالي الضريبة المستحقة للفترة (ضريبة المخرجات - ضريبة المدخلات)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>-</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 900, color: zatcaSummary.box12_netTax >= 0 ? '#1E130B' : '#059669' }}>
                          {formatCurrency(zatcaSummary.box12_netTax)}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: '#FDFBF7' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>13</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>تصحيحات من فترات سابقة (&lt; 5000 ر.س)</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>-</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 800, color: '#8c6b32' }}>14</td>
                        <td style={{ padding: '10px 16px', color: '#6e5d4f' }}>رصيد ضريبة القيمة المضافة المرحل من فترات سابقة</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>-</td>
                        <td style={{ padding: '10px 16px', textAlign: 'left', color: '#6e5d4f' }}>0.00 ر.س</td>
                      </tr>
                      <tr style={{ background: '#FFFFFF', borderTop: '2px solid #C29B62' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 900, color: '#8c6b32', fontSize: '15px' }}>15</td>
                        <td style={{ padding: '14px 16px', fontWeight: 900, color: '#1E130B', fontSize: '15px' }}>
                          {zatcaSummary.box15_finalTaxDue >= 0 ? 'صافي الضريبة واجبة السداد للهيئة' : 'صافي رصيد الضريبة المستردة'}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'left', color: '#6e5d4f' }}>-</td>
                        <td style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 900, fontSize: '18px', color: zatcaSummary.box15_finalTaxDue >= 0 ? '#1E130B' : '#059669' }}>
                          {formatCurrency(Math.abs(zatcaSummary.box15_finalTaxDue))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ZATCA Official Declaration Notice */}
                <div style={{
                  marginTop: '25px',
                  padding: '16px 20px',
                  borderRadius: '14px',
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  fontSize: '12px',
                  color: '#6e5d4f',
                  lineHeight: '1.8'
                }}>
                  <strong style={{ color: '#1E130B' }}>إقرار المكلف:</strong> أقر أنا المفوض عن المنشأة بأن جميع البيانات والمعلومات المذكورة أعلاه صحيحة ومكتملة ومطابقة للفواتير والدفاتر المحاسبية المعتمدة ومطابقة لأحكام نظام ضريبة القيمة المضافة ولائحته التنفيذية الصادرة عن هيئة الزكاة والضريبة والجمارك بالمملكة العربية السعودية.
                </div>
              </div>
            )}

            {/* TAB 2: Comparison Chart */}
            {activeTab === 'chart' && (
              <div style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(194, 155, 98, 0.25)',
                padding: '24px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
              }}>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                    📊 مقارنة مدخلات ومخرجات الضريبة وصافي المستحق
                  </h3>
                </div>
                <div style={{ height: '360px', width: '100%' }} dir="ltr">
                  <ResponsiveContainer>
                    <BarChart
                      data={[
                        { name: 'المدخلات (مشتريات ومصروفات)', amount: zatcaSummary.box11_totalInputVAT, fill: '#A8573C' },
                        { name: 'الصافي المستحق (Net VAT)', amount: Math.abs(zatcaSummary.box15_finalTaxDue), fill: '#C29B62' },
                        { name: 'المخرجات (مبيعات)', amount: zatcaSummary.box6_totalOutputVAT, fill: '#059669' }
                      ]}
                      margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#1E130B', fontSize: 12, fontWeight: 700 }} />
                      <YAxis tick={{ fill: '#6e5d4f', fontSize: 11 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                      <Tooltip
                        cursor={{ fill: 'rgba(194, 155, 98, 0.06)' }}
                        contentStyle={{ background: '#FFFFFF', border: '1px solid #C29B62', borderRadius: '12px', color: '#1E130B', textAlign: 'right', fontWeight: 700 }}
                        formatter={(val: any) => [formatCurrency(Number(val) || 0), 'قيمة الضريبة']}
                      />
                      <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                        <Cell fill="#A8573C" />
                        <Cell fill="#C29B62" />
                        <Cell fill="#059669" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* TAB 3: Transactions Audit Log */}
            {activeTab === 'transactions' && (
              <div style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(194, 155, 98, 0.25)',
                padding: '24px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                    🔍 سجل العمليات والفواتير الضريبية التفصيلية
                  </h3>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#8c6b32' }}>
                    {transactions.length} عمليات
                  </span>
                </div>

                <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                    <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                      <tr>
                        <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>#</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>التاريخ</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>النوع</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>رقم المرجع</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>اسم الطرف / العميل</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>البيان</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>المبلغ الخاضع</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>الضريبة 15%</th>
                        <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                            لا توجد فواتير أو حركات ضريبية مسجلة خلال الفترة المحددة.
                          </td>
                        </tr>
                      ) : (
                        transactions.map((t, idx) => (
                          <tr
                            key={t.id || idx}
                            style={{
                              borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                              background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                            }}
                          >
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#8c6b32' }}>{idx + 1}</td>
                            <td style={{ padding: '10px 14px', color: '#6e5d4f' }}>{t.date}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 900,
                                background: t.type === 'output' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                                color: t.type === 'output' ? '#059669' : '#A8573C'
                              }}>
                                {t.type === 'output' ? 'مخرجات (مبيعات)' : 'مدخلات (مشتريات)'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#1E130B', fontWeight: 700, fontFamily: 'monospace' }}>{t.ref_number}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#1E130B' }}>{t.party_name}</td>
                            <td style={{ padding: '10px 14px', color: '#6e5d4f' }}>{t.description}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#1E130B' }}>{formatCurrency(t.taxable_amount)}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 900, color: t.type === 'output' ? '#059669' : '#A8573C' }}>{formatCurrency(t.vat_amount)}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(t.total_amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MasterPage>
  );
}
