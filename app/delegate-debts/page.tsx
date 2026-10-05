"use client";
import React, { useState } from 'react';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { useDelegateDebtsLogic } from './delegate_debts_logic';

export default function DelegateDebtsPage() {
  const {
    isLoading,
    filteredDelegates,
    kpis,
    searchTerm,
    setSearchTerm,
    selectedAgingFilter,
    setSelectedAgingFilter,
    exportToExcel,
    handleRefresh
  } = useDelegateDebtsLogic();

  const [expandedDelegates, setExpandedDelegates] = useState<Record<string, boolean>>({});

  const toggleDelegate = (id: string) => {
    setExpandedDelegates(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    filteredDelegates.forEach(d => { all[d.delegate_id] = true; });
    setExpandedDelegates(all);
  };

  const collapseAll = () => {
    setExpandedDelegates({});
  };

  const getAgingBadge = (bucket: 'current' | '30_to_60' | 'over_60', days: number) => {
    if (bucket === 'over_60') {
      return (
        <span style={{
          background: 'rgba(168, 87, 60, 0.12)',
          color: '#A8573C',
          border: '1px solid rgba(168, 87, 60, 0.3)',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 800,
          whiteSpace: 'nowrap'
        }}>
          متأخر {days} يوم ⚠️
        </span>
      );
    } else if (bucket === '30_to_60') {
      return (
        <span style={{
          background: 'rgba(217, 119, 6, 0.12)',
          color: '#b45309',
          border: '1px solid rgba(217, 119, 6, 0.3)',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 800,
          whiteSpace: 'nowrap'
        }}>
          {days} يوم (معلق)
        </span>
      );
    } else {
      return (
        <span style={{
          background: 'rgba(5, 150, 105, 0.1)',
          color: '#059669',
          border: '1px solid rgba(5, 150, 105, 0.25)',
          padding: '3px 8px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 800,
          whiteSpace: 'nowrap'
        }}>
          حديث ({days} يوم)
        </span>
      );
    }
  };

  return (
    <MasterPage
      icon="🎯"
      title="كشف عهدة تحصيل ديون المناديب (Delegate Debts Collection)"
      subtitle="حصر ومتابعة ديون العملاء المتأخرة في السوق والمطلوب من كل مندوب تحصيلها وتوريدها"
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        direction: 'rtl',
        minHeight: '100vh',
        paddingBottom: '50px'
      }}>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: #1E130B !important; }
            table { width: 100% !important; border-collapse: collapse !important; }
            th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
            .delegate-section { border: 1px solid #C29B62 !important; margin-bottom: 20px !important; page-break-inside: avoid; }
            .delegate-invoices-container { display: block !important; }
          }
          .filter-pill-btn {
            padding: 8px 16px;
            border-radius: 50px;
            font-weight: 800;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          @media (max-width: 768px) {
            .debts-kpi-grid { grid-template-columns: 1fr !important; }
            .debts-toolbar-row { flex-direction: column !important; }
          }
        `}</style>

        <PrintHeader
          title="كشف عهدة تحصيل ديون المناديب والمبيعات الميدانية"
          subtitle={`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`}
        />

        {/* 1. Header Toolbar & Controls */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '22px 26px',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: '24px',
                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.35)'
              }}>
                📋
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                  متابعة تحصيلات السوق والذمم الميدانية
                </h2>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  توزيع الفواتير الآجلة غير المسددة على المناديب لمتابعة تحصيلها وتوريدها
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={exportToExcel}
                disabled={filteredDelegates.length === 0}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)',
                  minHeight: '44px'
                }}
              >
                <span>تصدير إكسيل</span>
                <span>📑</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(194, 155, 98, 0.35)',
                  background: '#FFFFFF',
                  color: '#1E130B',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '44px'
                }}
              >
                <span>طباعة الكشف</span>
                <span>🖨️</span>
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  background: '#FDFBF7',
                  color: '#8c6b32',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '44px'
                }}
              >
                <span>{isLoading ? 'جاري التحديث...' : 'تحديث'}</span>
                <span>🔄</span>
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="debts-toolbar-row" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
            paddingTop: '16px',
            borderTop: '1px solid rgba(194, 155, 98, 0.15)'
          }}>
            {/* Search Input */}
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <input
                type="text"
                placeholder="بحث باسم المندوب، اسم العميل، أو رقم الفاتورة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 18px 11px 40px',
                  borderRadius: '14px',
                  border: '1px solid rgba(194, 155, 98, 0.3)',
                  background: '#FDFBF7',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1E130B',
                  outline: 'none',
                  minHeight: '44px',
                  boxSizing: 'border-box'
                }}
              />
              <span style={{ position: 'absolute', left: '14px', top: '12px', fontSize: '16px', color: '#C29B62' }}>🔍</span>
            </div>

            {/* Aging Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '2px' }}>
              <button
                type="button"
                className="filter-pill-btn"
                onClick={() => setSelectedAgingFilter('all')}
                style={{
                  background: selectedAgingFilter === 'all' ? '#1E130B' : '#FDFBF7',
                  color: selectedAgingFilter === 'all' ? '#FDFBF7' : '#1E130B',
                  border: selectedAgingFilter === 'all' ? '1px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.3)'
                }}
              >
                كافة الديون
              </button>
              <button
                type="button"
                className="filter-pill-btn"
                onClick={() => setSelectedAgingFilter('current')}
                style={{
                  background: selectedAgingFilter === 'current' ? '#059669' : '#FDFBF7',
                  color: selectedAgingFilter === 'current' ? '#FFFFFF' : '#059669',
                  border: selectedAgingFilter === 'current' ? '1px solid #059669' : '1px solid rgba(5, 150, 105, 0.3)'
                }}
              >
                حديثة (&lt; 30 يوم)
              </button>
              <button
                type="button"
                className="filter-pill-btn"
                onClick={() => setSelectedAgingFilter('30_to_60')}
                style={{
                  background: selectedAgingFilter === '30_to_60' ? '#b45309' : '#FDFBF7',
                  color: selectedAgingFilter === '30_to_60' ? '#FFFFFF' : '#b45309',
                  border: selectedAgingFilter === '30_to_60' ? '1px solid #b45309' : '1px solid rgba(217, 119, 6, 0.3)'
                }}
              >
                متوسطة (30 - 60 يوم)
              </button>
              <button
                type="button"
                className="filter-pill-btn"
                onClick={() => setSelectedAgingFilter('over_60')}
                style={{
                  background: selectedAgingFilter === 'over_60' ? '#A8573C' : '#FDFBF7',
                  color: selectedAgingFilter === 'over_60' ? '#FFFFFF' : '#A8573C',
                  border: selectedAgingFilter === 'over_60' ? '1px solid #A8573C' : '1px solid rgba(168, 87, 60, 0.3)'
                }}
              >
                حرجة (&gt; 60 يوم) ⚠️
              </button>
            </div>

            {/* Toggle All Accordions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={expandAll}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  background: '#FDFBF7',
                  color: '#1E130B',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                فتح الكل ▼
              </button>
              <button
                type="button"
                onClick={collapseAll}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  background: '#FDFBF7',
                  color: '#1E130B',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                طي الكل ▲
              </button>
            </div>
          </div>
        </div>

        {/* 2. Market Debts KPI Grid */}
        <div className="debts-kpi-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {/* KPI 1: Grand Total Outstanding Debt */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            padding: '20px 22px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#A8573C' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>إجمالي الديون بالسوق (المطلوب تحصيله) 📉</span>
              <span style={{ fontSize: '20px' }}>⚠️</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#A8573C', margin: '8px 0 4px 0' }}>
              {formatCurrency(kpis.grandTotalDebt)}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              مطلوبة من ذمة المناديب والعملاء
            </div>
          </div>

          {/* KPI 2: Total Paid Amount */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            padding: '20px 22px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#059669' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>المبالغ المسددة سابقاً ✅</span>
              <span style={{ fontSize: '20px' }}>🏦</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', margin: '8px 0 4px 0' }}>
              {formatCurrency(kpis.grandTotalPaid)}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              من أصل {formatCurrency(kpis.grandTotalOriginal)}
            </div>
          </div>

          {/* KPI 3: Collection Rate % */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            padding: '20px 22px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#C29B62' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#8c6b32' }}>نسبة التحصيل المحققة 🎯</span>
              <span style={{ fontSize: '20px' }}>📊</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#8c6b32', margin: '8px 0 4px 0' }}>
              {kpis.collectionRatePct}%
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              معدل استرداد الذمم المدينة
            </div>
          </div>

          {/* KPI 4: Active Delegates & Invoices */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            padding: '20px 22px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#1E130B' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>المناديب النشطين والفواتير 👥</span>
              <span style={{ fontSize: '20px' }}>📦</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
              {kpis.delegatesCount} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>مندوب</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              إجمالي {kpis.totalInvoices} فاتورة غير محصلة
            </div>
          </div>
        </div>

        {/* 3. Delegates List & Accordions */}
        {isLoading ? (
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '80px',
            textAlign: 'center',
            color: '#C29B62',
            fontWeight: 800,
            border: '1px solid rgba(194, 155, 98, 0.25)'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⏳</div>
            جاري حصر الفواتير غير المحصلة وتوزيعها على المناديب...
          </div>
        ) : filteredDelegates.length === 0 ? (
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '70px',
            textAlign: 'center',
            color: '#059669',
            fontWeight: 800,
            fontSize: '16px',
            border: '1px dashed rgba(5, 150, 105, 0.4)'
          }}>
            <div style={{ fontSize: '44px', marginBottom: '12px' }}>🎉</div>
            لا توجد ديون متأخرة أو فواتير غير محصلة مطابقة لخيارات البحث
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredDelegates.map(delegate => {
              const isExpanded = !!expandedDelegates[delegate.delegate_id];

              return (
                <div
                  key={delegate.delegate_id}
                  className="delegate-section"
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                    overflow: 'hidden',
                    transition: 'all 0.2s'
                  }}
                >
                  {/* Delegate Accordion Header */}
                  <div
                    onClick={() => toggleDelegate(delegate.delegate_id)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '18px 24px',
                      cursor: 'pointer',
                      background: isExpanded ? '#FDFBF7' : '#FFFFFF',
                      borderBottom: isExpanded ? '1.5px solid rgba(194, 155, 98, 0.2)' : 'none',
                      flexWrap: 'wrap',
                      gap: '14px'
                    }}
                  >
                    {/* Left: Avatar & Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '14px',
                        background: 'rgba(194, 155, 98, 0.15)',
                        border: '1px solid rgba(194, 155, 98, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px'
                      }}>
                        👨‍💼
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                            {delegate.delegate_name}
                          </h3>
                          <span style={{
                            background: 'rgba(194, 155, 98, 0.12)',
                            color: '#8c6b32',
                            padding: '3px 10px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: 800
                          }}>
                            {delegate.invoice_count} فاتورة
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px', fontWeight: 700 }}>
                          نسبة التحصيل: <b style={{ color: '#059669' }}>{delegate.collection_rate}%</b> | مسدد: {formatCurrency(delegate.total_paid)}
                        </div>
                      </div>
                    </div>

                    {/* Right: Total Debt & Toggle Icon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block' }}>
                          العهدة المطلوب تحصيلها
                        </span>
                        <span style={{
                          fontSize: '20px',
                          fontWeight: 900,
                          color: '#A8573C',
                          display: 'block'
                        }}>
                          {formatCurrency(delegate.total_debt)}
                        </span>
                      </div>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: 'rgba(194, 155, 98, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8c6b32',
                        fontWeight: 900,
                        fontSize: '12px'
                      }}>
                        {isExpanded ? '▲' : '▼'}
                      </div>
                    </div>
                  </div>

                  {/* Delegate Invoices Table (Expanded) */}
                  {isExpanded && (
                    <div className="delegate-invoices-container" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px', color: '#1E130B' }}>
                        <thead style={{ background: '#FDFBF7', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                          <tr>
                            <th style={{ padding: '12px 18px', color: '#1E130B', fontWeight: 900, width: '130px' }}>رقم الفاتورة</th>
                            <th style={{ padding: '12px 18px', color: '#1E130B', fontWeight: 900, width: '110px' }}>التاريخ</th>
                            <th style={{ padding: '12px 18px', color: '#1E130B', fontWeight: 900, width: '110px' }}>الاستحقاق</th>
                            <th style={{ padding: '12px 18px', color: '#1E130B', fontWeight: 900 }}>اسم العميل</th>
                            <th style={{ padding: '12px 18px', color: '#1E130B', fontWeight: 900, textAlign: 'center', width: '130px' }}>إجمالي الفاتورة</th>
                            <th style={{ padding: '12px 18px', color: '#059669', fontWeight: 900, textAlign: 'center', width: '130px' }}>المحصل سابقاً</th>
                            <th style={{ padding: '12px 18px', color: '#A8573C', fontWeight: 900, textAlign: 'center', width: '140px' }}>المتبقي للتحصيل</th>
                            <th style={{ padding: '12px 18px', color: '#8c6b32', fontWeight: 900, textAlign: 'center', width: '130px' }}>عمر الدين</th>
                          </tr>
                        </thead>
                        <tbody>
                          {delegate.invoices.map((inv, iIdx) => (
                            <tr
                              key={inv.id}
                              style={{
                                borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                background: iIdx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                              }}
                            >
                              <td style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B' }}>
                                #{inv.invoice_number}
                              </td>
                              <td style={{ padding: '12px 18px', fontWeight: 700, color: '#64748b' }}>
                                {formatDate(inv.date)}
                              </td>
                              <td style={{ padding: '12px 18px', fontWeight: 700, color: '#64748b' }}>
                                {inv.due_date ? formatDate(inv.due_date) : '---'}
                              </td>
                              <td style={{ padding: '12px 18px', fontWeight: 800, color: '#1E130B' }}>
                                {inv.client_name}
                              </td>
                              <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 800, color: '#1E130B' }}>
                                {formatCurrency(inv.total_amount)}
                              </td>
                              <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>
                                {formatCurrency(inv.paid_amount)}
                              </td>
                              <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 900, color: '#A8573C', fontSize: '14px' }}>
                                {formatCurrency(inv.remaining_amount)}
                              </td>
                              <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                                {getAgingBadge(inv.aging_bucket, inv.days_overdue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot style={{ background: '#FDFBF7', borderTop: '2px solid rgba(194, 155, 98, 0.25)' }}>
                          <tr>
                            <td colSpan={4} style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B' }}>
                              إجمالي عهدة {delegate.delegate_name} ({delegate.invoice_count} فاتورة)
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 900, color: '#1E130B' }}>
                              {formatCurrency(delegate.total_original)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 900, color: '#059669' }}>
                              {formatCurrency(delegate.total_paid)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 900, color: '#A8573C' }}>
                              {formatCurrency(delegate.total_debt)}
                            </td>
                            <td style={{ padding: '12px 18px', textAlign: 'center' }} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MasterPage>
  );
}
