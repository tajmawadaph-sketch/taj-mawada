"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { useItemCardLogic, ItemCardTransaction } from './item_card_logic';
import { BarcodeCameraButton } from '@/components/BarcodeScannerWidget';

export default function ItemCardPage() {
  const {
    itemsList,
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    warehouses,
    selectedWarehouseFilter,
    setSelectedWarehouseFilter,
    warehouseBalances,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    transactions,
    totalIn,
    totalOut,
    totalWaste,
    finalBalance,
    isLoading,
    exportToExcel
  } = useItemCardLogic();

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
  };

  return (
    <MasterPage
      title="بطاقة حركة الصنف الدوائي (Item Movement Ledger)"
      subtitle="السجل الزمني والتشغيلي المتكامل لكافة حركات الوارد، المنصرف، التحويل، الإتلاف، والتسويات الجردية"
      icon="🏷️"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: black !important; }
            .item-table th, .item-table td { padding: 6px 8px !important; font-size: 11px !important; }
          }
        `}</style>

        {/* 1. Item Selection & Operational Filters Card */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          border: '1.5px solid rgba(194, 155, 98, 0.3)',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
            
            {/* Item Dropdown & Barcode Camera */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                📦 اختيار الدواء البيطري / الصنف *
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  style={{
                    flex: 1,
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
                  <option value="">-- اختر الدواء البيطري لاستعراض كارت الحركة --</option>
                  {itemsList.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.code ? `[${item.code}] ` : ''}{item.name} ({item.unit || 'حبة'})
                    </option>
                  ))}
                </select>

                <BarcodeCameraButton
                  onScan={(scannedCode) => {
                    const match = itemsList.find((i: any) => 
                      String(i.code).toLowerCase() === scannedCode.toLowerCase() ||
                      String(i.barcode).toLowerCase() === scannedCode.toLowerCase()
                    );
                    if (match) setSelectedItemId(match.id);
                  }}
                  title="مسح باركود الصنف بكاميرا الكاشير"
                  style={{ minHeight: '44px', borderRadius: '12px', minWidth: '44px' }}
                />
              </div>
            </div>

            {/* Warehouse Filter */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                🏢 المستودع
              </label>
              <select
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
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
                <option value="all">🏢 كافة المستودعات والفروع</option>
                {warehouses.map((w: any) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '8px 14px',
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

            {/* Date To */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '8px 14px',
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

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={!selectedItemId}
                style={{
                  minHeight: '44px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1px solid rgba(194, 155, 98, 0.3)',
                  background: '#FFFFFF',
                  color: '#1E130B',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: !selectedItemId ? 'not-allowed' : 'pointer',
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
                disabled={!selectedItemId || transactions.length === 0}
                style={{
                  minHeight: '44px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: (!selectedItemId || transactions.length === 0) ? '#e2e8f0' : '#059669',
                  color: (!selectedItemId || transactions.length === 0) ? '#94a3b8' : '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: (!selectedItemId || transactions.length === 0) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: (!selectedItemId || transactions.length === 0) ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.25)'
                }}
              >
                <span>📊</span>
                <span>تصدير Excel</span>
              </button>
            </div>

          </div>

          {/* Selected Item Stock Distribution Pills */}
          {selectedItem && warehouseBalances.length > 0 && (
            <div style={{
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid rgba(194, 155, 98, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#1E130B' }}>
                توزيع الرصيد الحالي بالمستودعات:
              </span>
              {warehouseBalances.map((wb: any) => (
                <div
                  key={wb.warehouse_id}
                  style={{
                    background: 'rgba(194, 155, 98, 0.1)',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#1E130B',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <span>🏢 {wb.warehouses?.name || 'مستودع'}:</span>
                  <span style={{ color: '#059669', fontWeight: 900 }}>{wb.quantity} {selectedItem.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Loading / Empty States */}
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <LoadingScreen text="جارٍ جلب وتدقيق حركات الصنف وسجلاته التاريخية..." />
          </div>
        ) : !selectedItemId ? (
          <div style={{
            padding: '70px 20px',
            textAlign: 'center',
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1.5px dashed rgba(194, 155, 98, 0.3)',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏷️</div>
            <h3 style={{ color: '#1E130B', margin: '0 0 8px 0', fontSize: '18px', fontWeight: 900 }}>
              الرجاء اختيار دواء بيطري أو مسح باركوده
            </h3>
            <p style={{ color: '#786c62', margin: 0, fontSize: '13px', fontWeight: 700 }}>
              اختر الصنف من القائمة أعلاه لعرض بطاقة حركاته التفصيلية، وأرصدته المتراكمة، وأرقام التشغيلات والقيود المرتبطة.
            </p>
          </div>
        ) : (
          <>
            {/* 3. Luxury Movement KPIs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px'
            }}>
              {/* Total In */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(5, 150, 105, 0.3)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>إجمالي الوارد 📥</span>
                  <span style={{ fontSize: '20px' }}>📦</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
                  {totalIn} <span style={{ fontSize: '13px', color: '#1E130B' }}>{selectedItem?.unit || 'حبة'}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 800, marginTop: '2px' }}>
                  توريدات، مشتريات، وتسويات زيادة
                </div>
              </div>

              {/* Total Out */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(30, 19, 11, 0.2)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>إجمالي المنصرف 📤</span>
                  <span style={{ fontSize: '20px' }}>🚚</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E130B', marginTop: '6px' }}>
                  {totalOut} <span style={{ fontSize: '13px', color: '#786c62' }}>{selectedItem?.unit || 'حبة'}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 800, marginTop: '2px' }}>
                  مبيعات كاشير، صرف لمناديب، وتحويلات
                </div>
              </div>

              {/* Total Waste / Loss */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(168, 87, 60, 0.3)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>التوالف والهدر 🗑️</span>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#A8573C', marginTop: '6px' }}>
                  {totalWaste} <span style={{ fontSize: '13px', color: '#1E130B' }}>{selectedItem?.unit || 'حبة'}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#A8573C', fontWeight: 800, marginTop: '2px' }}>
                  بضائع تالفة ومنتهية الصلاحية
                </div>
              </div>

              {/* Final Balance */}
              <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(194, 155, 98, 0.4)',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>الرصيد التراكمي الفعلي 🏷️</span>
                  <span style={{ fontSize: '20px' }}>⚖️</span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#C29B62', marginTop: '6px' }}>
                  {finalBalance} <span style={{ fontSize: '13px', color: '#1E130B' }}>{selectedItem?.unit || 'حبة'}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#059669', fontWeight: 800, marginTop: '2px' }}>
                  متطابق مع السجلات المخزنية المعتمدة
                </div>
              </div>
            </div>

            {/* 4. Detailed Movement Ledger Table */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="item-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
                  <thead>
                    <tr style={{
                      background: 'rgba(30, 19, 11, 0.03)',
                      borderBottom: '1.5px solid rgba(194, 155, 98, 0.25)',
                      color: '#1E130B'
                    }}>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>التاريخ والرقم</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>نوع الحركة</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>التشغيلة والصلاحية</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>الوارد (+)</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>المنصرف (-)</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>سعر الوحدة</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>الرصيد التراكمي</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>المستودع والجهة</th>
                      <th style={{ padding: '14px 16px', fontWeight: 900 }}>البيان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: '50px', textAlign: 'center', color: '#786c62', fontWeight: 800 }}>
                          لا توجد حركات مسجلة لهذا الصنف خلال الفترة المحددة
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr
                          key={tx.id}
                          style={{
                            borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                            transition: 'background 0.2s'
                          }}
                        >
                          {/* Date & Number */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 900, color: '#1E130B' }}>
                              {tx.transaction_date}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#786c62', fontWeight: 700 }}>
                              {tx.transaction_number}
                            </div>
                          </td>

                          {/* Type Badge */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              background: `${tx.typeBadgeColor}15`,
                              color: tx.typeBadgeColor,
                              border: `1px solid ${tx.typeBadgeColor}35`,
                              padding: '3px 8px',
                              borderRadius: '8px',
                              fontWeight: 900,
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}>
                              {tx.typeLabel}
                            </span>
                          </td>

                          {/* Batch & Expiry */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 800, color: '#1E130B' }}>
                              {tx.batch_number ? `دفعة: ${tx.batch_number}` : '-'}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#8c6b32', fontWeight: 700 }}>
                              {tx.expiry_date ? `انتهاء: ${tx.expiry_date}` : ''}
                            </div>
                          </td>

                          {/* Inbound Qty */}
                          <td style={{ padding: '14px 16px', fontWeight: 900, color: '#059669', fontSize: '13px' }}>
                            {tx.signedQuantity > 0 ? `+${tx.quantity}` : '-'}
                          </td>

                          {/* Outbound Qty */}
                          <td style={{ padding: '14px 16px', fontWeight: 900, color: tx.signedQuantity < 0 ? '#A8573C' : '#786c62', fontSize: '13px' }}>
                            {tx.signedQuantity < 0 ? `-${tx.quantity}` : '-'}
                          </td>

                          {/* Unit Price */}
                          <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1E130B' }}>
                            {tx.unit_price > 0 ? formatMoney(tx.unit_price) : '-'}
                          </td>

                          {/* Running Balance */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              fontWeight: 900,
                              fontSize: '14px',
                              color: tx.runningBalance >= 0 ? '#C29B62' : '#dc2626'
                            }}>
                              {tx.runningBalance} {selectedItem?.unit || 'حبة'}
                            </span>
                          </td>

                          {/* Warehouse & Partner */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 800, color: '#1E130B' }}>
                              🏢 {tx.warehouseName}
                              {tx.destinationWarehouseName && ` ➔ ${tx.destinationWarehouseName}`}
                            </div>
                            {tx.partnerName && (
                              <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700 }}>
                                👤 {tx.partnerName}
                              </div>
                            )}
                          </td>

                          {/* Notes */}
                          <td style={{ padding: '14px 16px', color: '#786c62', fontWeight: 700 }}>
                            {tx.notes || 'حركة مخزنية موثقة'}
                          </td>
                        </tr>
                      ))
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
