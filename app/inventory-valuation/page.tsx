"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { useInventoryValuationLogic } from './inventory_valuation_logic';

export default function InventoryValuationPage() {
  const {
    filteredItems,
    warehouses,
    selectedWarehouseId,
    setSelectedWarehouseId,
    globalSearch,
    setGlobalSearch,
    sortBy,
    setSortBy,
    metrics,
    isLoading,
    exportToExcel
  } = useInventoryValuationLogic();

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
  };

  return (
    <MasterPage
      title="تقييم المخزون المالي والأرباح المتوقعة"
      subtitle="حساب قيمة المخزون بمتوسط التكلفة المرجح (WAC) وأسعار البيع وهوامش الربحية"
      icon="💵"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .inv-val-table th, .inv-val-table td { padding: 6px 8px !important; font-size: 11px !important; }
          }
        `}</style>

        {/* 1. Top Luxury KPI Cards (Solid Elegant Cards) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px'
        }}>
          {/* Cost Valuation (WAC) */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(194, 155, 98, 0.3)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>
                قيمة المخزون بالتكلفة (WAC) 💵
              </span>
              <span style={{ fontSize: '22px' }}>📊</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#C29B62', marginTop: '6px' }}>
              {formatMoney(metrics.totalCostValue)}
            </div>
            <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 800, marginTop: '4px' }}>
              محسوب بمتوسط التكلفة المرجح للحركات الواردة
            </div>
          </div>

          {/* Retail Sales Valuation */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(5, 150, 105, 0.3)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>
                القيمة البيعية المتوقعة (Retail) 🏷️
              </span>
              <span style={{ fontSize: '22px' }}>💰</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
              {formatMoney(metrics.totalRetailValue)}
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 800, marginTop: '4px' }}>
              قيمة البضاعة بأسعار البيع والتجزئة المعتمدة
            </div>
          </div>

          {/* Expected Profit */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(168, 87, 60, 0.3)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>
                مجمل الربح المتوقع 📈
              </span>
              <span style={{ fontSize: '22px' }}>💎</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#A8573C', marginTop: '6px' }}>
              {formatMoney(metrics.totalExpectedProfit)}
            </div>
            <div style={{ fontSize: '11px', color: '#A8573C', fontWeight: 800, marginTop: '4px' }}>
              متوسط هامش الربح المحقق: <strong style={{ fontSize: '13px' }}>{metrics.overallMarginPct}%</strong>
            </div>
          </div>

          {/* Stock Count & Units */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                إجمالي الوحدات المتاحة 📦
              </span>
              <span style={{ fontSize: '22px' }}>🏢</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', marginTop: '6px' }}>
              {metrics.totalUnits.toLocaleString('ar-SA')} <span style={{ fontSize: '14px', color: '#786c62' }}>وحدة</span>
            </div>
            <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 800, marginTop: '4px' }}>
              منها {metrics.inStockCount} صنف متوفر في المستودع المحدد
            </div>
          </div>
        </div>

        {/* 2. Controls & Filtering Bar */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
        }}>
          {/* Warehouse Selector */}
          <div style={{ minWidth: '220px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              🏢 نطاق المستودع
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '8px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontSize: '13px',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all">🏢 إجمالي كافة المستودعات والصيدليات</option>
              {warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div style={{ flex: '1 1 240px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              🔍 بحث بالاسم أو الكود
            </label>
            <input
              type="text"
              placeholder="ابحث باسم الدواء البيطري أو الكود أو الباركود..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontSize: '13px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
          </div>

          {/* Sort Tabs */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              📊 ترتيب حسب
            </label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { id: 'value', label: 'أعلى قيمة' },
                { id: 'qty', label: 'الكمية' },
                { id: 'profit', label: 'الربحية' },
                { id: 'margin', label: 'الهامش %' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id as any)}
                  style={{
                    minHeight: '44px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: sortBy === tab.id ? '#1E130B' : 'rgba(30, 19, 11, 0.06)',
                    color: sortBy === tab.id ? '#FFFFFF' : '#1E130B',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Print & Export Buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                minHeight: '44px',
                padding: '10px 18px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FFFFFF',
                color: '#1E130B',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🖨️</span>
              <span>طباعة</span>
            </button>

            <button
              type="button"
              onClick={exportToExcel}
              disabled={filteredItems.length === 0}
              style={{
                minHeight: '44px',
                padding: '10px 18px',
                borderRadius: '12px',
                border: 'none',
                background: '#059669',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 900,
                cursor: filteredItems.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)'
              }}
            >
              <span>📊</span>
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>

        {/* 3. Valuation Details Table */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="inv-val-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
              <thead>
                <tr style={{
                  background: 'rgba(30, 19, 11, 0.03)',
                  borderBottom: '1.5px solid rgba(194, 155, 98, 0.25)',
                  color: '#1E130B'
                }}>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>الصنف والكود</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>الرصيد المتاح</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>تكلفة WAC</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>سعر البيع</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>قيمة التكلفة الإجمالية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>القيمة البيعية الإجمالية</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>الربح المتوقع</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900, textAlign: 'center' }}>الهامش %</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '50px', textAlign: 'center' }}>
                      <LoadingScreen text="جارٍ حساب متوسطات التكلفة وتقييم المخزون..." />
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '50px', textAlign: 'center', color: '#786c62', fontWeight: 800 }}>
                      لا توجد أصناف مطابقة للبحث أو المستودع المحدد
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                        transition: 'background 0.2s'
                      }}
                    >
                      {/* Name & Code */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#786c62', marginTop: '2px', fontWeight: 700 }}>
                          {item.code ? `كود: ${item.code}` : ''} {item.barcode ? `| باركود: ${item.barcode}` : ''}
                        </div>
                      </td>

                      {/* Available Qty */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontWeight: 900, color: item.available_qty > 0 ? '#1E130B' : '#A8573C', fontSize: '13px' }}>
                          {item.available_qty} {item.unit}
                        </span>
                      </td>

                      {/* WAC Cost */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#C29B62' }}>
                        {formatMoney(item.wac_cost)}
                      </td>

                      {/* Retail Price */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#059669' }}>
                        {formatMoney(item.suggested_price)}
                      </td>

                      {/* Total Cost Value */}
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#C29B62', fontSize: '13px' }}>
                        {formatMoney(item.total_cost_value)}
                      </td>

                      {/* Total Retail Value */}
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#059669', fontSize: '13px' }}>
                        {formatMoney(item.total_retail_value)}
                      </td>

                      {/* Expected Profit */}
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: item.expected_profit >= 0 ? '#A8573C' : '#dc2626' }}>
                        {formatMoney(item.expected_profit)}
                      </td>

                      {/* Margin % */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          background: item.margin_percentage >= 20 ? 'rgba(5, 150, 105, 0.12)' : 'rgba(194, 155, 98, 0.15)',
                          color: item.margin_percentage >= 20 ? '#059669' : '#8c6b32',
                          border: item.margin_percentage >= 20 ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(194, 155, 98, 0.3)',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontWeight: 900,
                          fontSize: '11px'
                        }}>
                          {item.margin_percentage}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </MasterPage>
  );
}
