"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { useTripProfitabilityLogic } from './trip_profitability_logic';

export default function TripProfitabilityPage() {
  const logic = useTripProfitabilityLogic();

  const getRatingBadge = (rating: string, netProfit: number) => {
    if (rating === 'excellent') {
      return {
        bg: 'rgba(5, 150, 105, 0.1)',
        color: '#059669',
        border: 'rgba(5, 150, 105, 0.25)',
        label: 'ممتازة 🌟'
      };
    } else if (rating === 'good') {
      return {
        bg: 'rgba(194, 155, 98, 0.15)',
        color: '#8c6b32',
        border: 'rgba(194, 155, 98, 0.35)',
        label: 'جيدة ✓'
      };
    } else if (rating === 'fair') {
      return {
        bg: 'rgba(217, 119, 6, 0.1)',
        color: '#b45309',
        border: 'rgba(217, 119, 6, 0.25)',
        label: 'مقبولة'
      };
    } else {
      return {
        bg: 'rgba(168, 87, 60, 0.12)',
        color: '#A8573C',
        border: 'rgba(168, 87, 60, 0.35)',
        label: 'خسارة ⚠️'
      };
    }
  };

  return (
    <MasterPage
      icon="🚚"
      title="تحليل ربحية رحلات التوزيع ومبيعات الفانات (Van Sales)"
      subtitle="رصد المبيعات النقدية والآجلة، احتساب تكاليف البضاعة ومصروفات التشغيل، وحساب عمولات المناديب"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: #1E130B !important; }
            table { width: 100% !important; border-collapse: collapse !important; }
            th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
          }
          @media (max-width: 768px) {
            .tp-kpi-grid { grid-template-columns: 1fr !important; }
            .tp-filter-row { flex-direction: column !important; }
          }
        `}</style>

        <PrintHeader title="تقرير ربحية رحلات التوزيع ومبيعات الفانات" subtitle={`عن الفترة من ${logic.dateRange.start} إلى ${logic.dateRange.end}`} />

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
          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Search */}
            <input
              type="text"
              placeholder="ابحث برقم الرحلة، المندوب، أو اللوحة..."
              value={logic.searchQuery}
              onChange={(e) => logic.setSearchQuery(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 700,
                fontSize: '13px',
                width: '240px',
                outline: 'none',
                minHeight: '44px'
              }}
            />

            {/* Driver Filter */}
            <select
              value={logic.selectedDriverId}
              onChange={(e) => logic.setSelectedDriverId(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 700,
                fontSize: '13px',
                minHeight: '44px'
              }}
            >
              <option value="all">-- كافة المناديب --</option>
              {logic.driversList.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* Date Pickers */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>من:</span>
              <input
                type="date"
                value={logic.dateRange.start}
                onChange={(e) => logic.handleDateChange('start', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إلى:</span>
              <input
                type="date"
                value={logic.dateRange.end}
                onChange={(e) => logic.handleDateChange('end', e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={logic.handleRefresh}
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
              <span>تحديث الأرقام</span>
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
              <span>طباعة A4</span>
              <span>🖨️</span>
            </button>
            <button
              onClick={logic.exportToExcel}
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
              <span>تصدير Excel</span>
              <span>📑</span>
            </button>
          </div>
        </div>

        {logic.isLoading ? (
          <LoadingScreen message="جاري احتساب مبيعات وتكاليف وعمولات رحلات التوزيع..." />
        ) : (
          <>
            {/* 2. Top Luxury KPI Cards Grid */}
            <div className="tp-kpi-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '14px'
            }}>
              {/* Total Sales */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(194, 155, 98, 0.3)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي مبيعات الرحلات</span>
                  <span style={{ fontSize: '18px' }}>💰</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                  {formatCurrency(logic.summary.totalSales)}
                </div>
                <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
                  نقد: {formatCurrency(logic.summary.cashSales)} | آجل: {formatCurrency(logic.summary.creditSales)}
                </div>
              </div>

              {/* Total Costs & Expenses */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid rgba(194, 155, 98, 0.2)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>تكلفة البضاعة والمصروفات</span>
                  <span style={{ fontSize: '18px' }}>📉</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#6e5d4f', marginTop: '8px' }}>
                  {formatCurrency(logic.summary.totalInventoryCost + logic.summary.totalExpenses)}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>
                  بضاعة: {formatCurrency(logic.summary.totalInventoryCost)} | تشغيل: {formatCurrency(logic.summary.totalExpenses)}
                </div>
              </div>

              {/* Net Profit */}
              <div style={{
                background: '#FFFFFF',
                border: `1.5px solid ${logic.summary.totalNetProfit >= 0 ? 'rgba(5, 150, 105, 0.35)' : 'rgba(168, 87, 60, 0.35)'}`,
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: logic.summary.totalNetProfit >= 0 ? '#059669' : '#A8573C' }}>
                    {logic.summary.totalNetProfit >= 0 ? 'صافي الربح التشغيلي المحقق' : 'صافي الخسارة التشغيلية'}
                  </span>
                  <span style={{ fontSize: '18px' }}>✨</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: logic.summary.totalNetProfit >= 0 ? '#059669' : '#A8573C', marginTop: '8px' }}>
                  {formatCurrency(Math.abs(logic.summary.totalNetProfit))}
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  متوسط هامش الربح: {logic.summary.avgMarginPct.toFixed(1)}% ({logic.summary.tripsCount} رحلة)
                </div>
              </div>

              {/* Commissions */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(194, 155, 98, 0.35)',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>عمولات المناديب المستحقة</span>
                  <span style={{ fontSize: '18px' }}>🎯</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: '#C29B62', marginTop: '8px' }}>
                  {formatCurrency(logic.summary.totalCommission)}
                </div>
                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                  محسوبة تلقائياً بنسبة 2.5%
                </div>
              </div>
            </div>

            {/* 3. Detailed Table */}
            <div style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              border: '1px solid rgba(194, 155, 98, 0.25)',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                  📋 جدول تفاصيل ومؤشرات ربحية كل رحلة
                </h3>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#8c6b32' }}>
                  {logic.filteredTrips.length} رحلة مسجلة
                </span>
              </div>

              <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                  <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                    <tr>
                      <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>رقم وتاريخ الرحلة</th>
                      <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>السيارة والمندوب</th>
                      <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>المبيعات (نقد / آجل)</th>
                      <th style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 900 }}>تكلفة البضاعة</th>
                      <th style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 900 }}>المصاريف</th>
                      <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>العمولة (2.5%)</th>
                      <th style={{ padding: '12px 14px', color: '#059669', fontWeight: 900 }}>صافي الربح</th>
                      <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>كفاءة الرحلة</th>
                      <th style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 900, textAlign: 'center' }}>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logic.filteredTrips.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '30px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                          لا توجد رحلات مسجلة تطابق معايير البحث في الفترة المحددة.
                        </td>
                      </tr>
                    ) : (
                      logic.filteredTrips.map((t, idx) => {
                        const badge = getRatingBadge(t.rating, t.net_profit);
                        return (
                          <tr
                            key={t.id || idx}
                            style={{
                              borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                              background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                            }}
                          >
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 900, color: '#1E130B', fontFamily: 'monospace' }}>{t.operation_number}</div>
                              <div style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 600 }}>{t.operation_date}</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 800, color: '#1E130B' }}>{t.driver_name}</div>
                              <div style={{ fontSize: '11px', color: '#8c6b32' }}>{t.vehicle_name}</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontWeight: 900, color: '#1E130B' }}>{formatCurrency(t.total_sales)}</div>
                              <div style={{ fontSize: '11px', color: '#6e5d4f' }}>
                                نقد: {formatCurrency(t.cash_sales)} | آجل: {formatCurrency(t.credit_sales)}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#6e5d4f' }}>
                              {formatCurrency(t.inventory_cost)}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#6e5d4f' }}>
                              {formatCurrency(t.total_expenses)}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#C29B62' }}>
                              {formatCurrency(t.commission_amount)}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 900, color: t.net_profit >= 0 ? '#059669' : '#A8573C', fontSize: '14px' }}>
                              {formatCurrency(t.net_profit)}
                              <div style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 600 }}>
                                هامش: {t.net_margin_pct.toFixed(1)}%
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 900,
                                background: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`
                              }}>
                                {badge.label}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                background: t.status === 'مغلق' ? 'rgba(100, 116, 139, 0.1)' : 'rgba(5, 150, 105, 0.1)',
                                color: t.status === 'مغلق' ? '#475569' : '#059669'
                              }}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </MasterPage>
  );
}
