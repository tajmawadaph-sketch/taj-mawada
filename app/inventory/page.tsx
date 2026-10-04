"use client";
import React, { useState, useEffect } from 'react';
import { useInventoryLogic } from './inventory_logic';
import { THEME } from '@/lib/theme';
import MasterPage from '@/components/MasterPage';
import Link from 'next/link';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import RawasiSmartTable from '@/components/rawasismarttable';
import LoadingScreen from '@/components/LoadingScreen';
import SecureAction from '@/components/SecureAction';
import { useConfirm } from '@/components/ConfirmContext';
import InventoryActionModal from '@/components/InventoryActionModal';
import InventoryItemModal from '@/components/InventoryItemModal';
import StocktakingModal from '@/components/StocktakingModal';

export default function InventoryPage() {
  const logic = useInventoryLogic();
  const { showConfirm } = useConfirm();
  
  const [mounted, setMounted] = useState(false);
  const [actionType, setActionType] = useState<'in' | 'out' | 'waste' | 'empty_return'>('in');
  const [isStocktakingModalOpen, setIsStocktakingModalOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const columns = [
    { key: 'code', label: 'كود الصنف', type: 'text',
      render: (row: any) => <span style={{ fontWeight: 900, color: '#64748b' }}>{row.code || '-'}</span>
    },
    { key: 'name', label: 'اسم الصنف', type: 'text', 
      render: (row: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 900, color: '#0f172a' }}>{row.name}</span>
          {row.is_returnable_bottle && (
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#1C73AB',
              background: 'rgba(40, 145, 200, 0.12)',
              border: '1px solid rgba(40, 145, 200, 0.35)',
              padding: '2px 8px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>🔄</span>
              <span>عهدة فوارغ</span>
            </span>
          )}
          {Number(row.tax_rate) === 0 ? (
            <span style={{
              fontSize: '11px',
              fontWeight: 800,
              color: '#15803d',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              padding: '2px 8px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }} title="معفي من ضريبة القيمة المضافة (0%)">
              <span>🟢</span>
              <span>معفي (0% ضريبة)</span>
            </span>
          ) : (
            <span style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#64748b',
              background: 'rgba(100, 116, 139, 0.08)',
              border: '1px solid rgba(100, 116, 139, 0.2)',
              padding: '1px 6px',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px'
            }} title="خاضع لضريبة القيمة المضافة القياسية 15%">
              <span>🏷️</span>
              <span>15% ضريبة</span>
            </span>
          )}
        </div>
      )
    },
    { key: 'last_purchase_price', label: 'آخر سعر شراء', type: 'number',
      render: (row: any) => (
        <span style={{ fontWeight: 900, color: '#16a34a' }}>
          {row.last_purchase_price > 0 ? `${row.last_purchase_price} ر.س` : <span style={{ color: '#94a3b8' }}>-</span>}
        </span>
      )
    },
    { key: 'reorder_level', label: 'حد إعادة الطلب', type: 'number' },
    { key: 'available_qty', label: 'الكمية المتاحة', type: 'number',
      render: (row: any) => {
        const reorderLvl = Number(row.reorder_level) || 5;
        const isOutOfStock = row.available_qty <= 0;
        const isLowStock = row.available_qty <= reorderLvl;
        const isNearLow = !isLowStock && row.available_qty <= reorderLvl * 1.5;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                fontSize: '15px', fontWeight: 900, 
                color: isOutOfStock ? '#dc2626' : (isLowStock ? '#ea580c' : (isNearLow ? '#d97706' : '#16a34a')) 
              }}>
                {row.available_qty}
              </span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>{row.unit || 'حبة'}</span>
            </div>
            {isOutOfStock ? (
              <span style={{ fontSize: '10px', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '6px', fontWeight: 900, border: '1px solid #f87171' }}>
                ⛔ نفد من المخزون
              </span>
            ) : isLowStock ? (
              <span style={{ fontSize: '10px', background: '#ffedd5', color: '#c2410c', padding: '2px 8px', borderRadius: '6px', fontWeight: 900, border: '1px solid #fb923c' }}>
                ⚠️ وصل حد الطلب ({reorderLvl})
              </span>
            ) : isNearLow ? (
              <span style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>
                ⚡ قارب على النفاد
              </span>
            ) : null}
          </div>
        );
      }
    },
    {
      key: 'expiry_date', label: 'الصلاحية / الدفعة ⏳',
      render: (row: any) => {
        if (!row.expiry_date) {
          return <span style={{ color: '#94a3b8', fontSize: '11px' }}>غير محدد</span>;
        }
        const days = row.days_left;
        const isExp = row.isExpired || (days !== undefined && days !== null && days <= 0);
        const isNear = row.isNearExpiry;
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: '110px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: isExp ? '#dc2626' : (isNear ? '#d97706' : '#2C1A12') }}>
              {row.expiry_date}
            </span>
            {isExp ? (
              <span style={{ fontSize: '9.5px', background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', padding: '1px 6px', borderRadius: '6px', fontWeight: 900, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                ⛔ منتهي الصلاحية
              </span>
            ) : isNear ? (
              <span style={{ fontSize: '9.5px', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', padding: '1px 6px', borderRadius: '6px', fontWeight: 900, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                ⏳ متبقي {days} يوم
              </span>
            ) : (
              <span style={{ fontSize: '9.5px', background: 'rgba(78, 115, 79, 0.12)', color: '#4E734F', padding: '1px 6px', borderRadius: '6px', fontWeight: 800 }}>
                🟢 {days} يوم
              </span>
            )}
            {row.batch_number && (
              <span style={{ fontSize: '9px', color: '#64748b' }}>
                تشغيلة: {row.batch_number}
              </span>
            )}
          </div>
        );
      }
    },
    {
      key: 'actions', label: 'الإجراءات', type: 'actions',
      render: (row: any) => (
        <div className="table-actions-container" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '6px', justifyContent: 'center', alignItems: 'center', minWidth: '125px' }}>
          <SecureAction module="inventory" action="edit">
            <button 
              className="table-action-btn edit-btn" 
              style={{
                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onClick={() => {
                logic.setCurrentRecord(row);
                logic.setIsModalOpen(true);
              }}
              title="تعديل الصنف"
            >
              <span>✏️</span>
              <span>تعديل</span>
            </button>
          </SecureAction>
          <SecureAction module="inventory" action="delete">
            <button 
              className="table-action-btn delete-btn" 
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '5px 9px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onClick={() => {
                showConfirm({
                  title: 'حذف الصنف',
                  message: `هل أنت متأكد من حذف ${row.name}؟`,
                  type: 'danger',
                  onConfirm: () => logic.deleteItem(row.id)
                });
              }}
              title="حذف الصنف"
            >
              <span>🗑️</span>
              <span>حذف</span>
            </button>
          </SecureAction>
        </div>
      )
    }
  ];

  if (!mounted) return null;

  return (
    <>
      <RawasiSidebarManager 
        summary={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="summary-glass-card">
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>إجمالي الأصناف بالمستودع 📦</span>
              <div className="val" style={{ fontSize: '20px', fontWeight: 900, color: '#1C73AB' }}>
                {logic.items?.length || 0} صنف
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="summary-glass-card" style={{ padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#b91c1c' }}>تحت حد الطلب ⚠️</span>
                <div className="val" style={{ fontSize: '17px', fontWeight: 900, color: '#ef4444' }}>
                  {logic.items?.filter((it: any) => (Number(it.available_qty) || 0) <= (Number(it.reorder_level) || 0)).length || 0}
                </div>
              </div>
              <div className="summary-glass-card" style={{ padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#4E734F' }}>معفي ضريبياً 🌿</span>
                <div className="val" style={{ fontSize: '17px', fontWeight: 900, color: '#4E734F' }}>
                  {logic.items?.filter((it: any) => Number(it.tax_rate) === 0).length || 0}
                </div>
              </div>
            </div>
            {logic.items?.some((it: any) => it.isExpired || it.isNearExpiry) && (
              <Link href="/expiry-alerts" style={{ textDecoration: 'none' }}>
                <div className="summary-glass-card" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c' }}>⚠️ سلع بحاجة للمتابعة:</span>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: '#dc2626' }}>
                    {logic.items?.filter((it: any) => it.isExpired || it.isNearExpiry).length} صنف ⏳
                  </span>
                </div>
              </Link>
            )}
          </div>
        }
        actions={
          <>
            <button 
              type="button" 
              className="btn-main-glass"
              onClick={() => logic.setIsModalOpen(true)}
            >
              <span>➕</span>
              <span>إضافة صنف جديد</span>
            </button>
            <button 
              type="button" 
              className="btn-main-glass"
              style={{ width: '100%', borderColor: 'rgba(194, 155, 98, 0.4)', color: '#8c6b32' }}
              onClick={() => setIsStocktakingModalOpen(true)}
            >
              <span>📋</span>
              <span>الجرد الدوري والتسويات</span>
            </button>
            <Link href="/expiry-alerts" style={{ textDecoration: 'none', width: '100%' }}>
              <button 
                type="button" 
                className="btn-main-glass"
                style={{ width: '100%', borderColor: 'rgba(168, 87, 60, 0.4)', color: '#A8573C' }}
              >
                <span>⏳</span>
                <span>مراقبة الصلاحيات والإنذارات</span>
              </button>
            </Link>
            <button 
              type="button" 
              className="btn-main-glass"
              onClick={() => window.location.href = '/inventory/transactions'}
            >
              <span>🔄</span>
              <span>حركات المخزون</span>
            </button>
            <Link href="/inventory/warehouses" style={{ textDecoration: 'none', width: '100%' }}>
              <button 
                type="button" 
                className="btn-main-glass"
                style={{ width: '100%', marginTop: '4px' }}
              >
                <span>🏢</span>
                <span>إدارة المستودعات</span>
              </button>
            </Link>
          </>
        }
        watchDeps={[logic.items?.length]}
      />
      <div className="clean-page">
        <MasterPage 
          icon="📦" 
          title="دليل الأصناف والمخزون" 
          subtitle="إدارة الأصناف، متابعة الكميات المتوفرة في المستودعات وتنبيهات النواقص"
        >
          {logic.isLoading ? (
            <LoadingScreen message="جاري تحميل الأصناف..." fullScreen={false} />
          ) : (
            <>
              {/* Warehouse Selection Cards */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
                gap: '15px', marginBottom: '20px'
              }}>
                {logic.warehouses.map(wh => (
                  <div 
                    key={wh.id} 
                    onClick={() => logic.setSelectedWarehouseId(wh.id)}
                    style={{
                      background: logic.selectedWarehouseId === wh.id ? THEME.primary : 'rgba(255,255,255,0.7)',
                      color: logic.selectedWarehouseId === wh.id ? 'white' : THEME.primary,
                      border: `1px solid ${logic.selectedWarehouseId === wh.id ? 'transparent' : THEME.primary + '50'}`,
                      borderRadius: '16px', padding: '15px', cursor: 'pointer',
                      textAlign: 'center', transition: 'all 0.3s ease',
                      boxShadow: logic.selectedWarehouseId === wh.id ? '0 10px 20px rgba(0,0,0,0.1)' : 'none',
                      transform: logic.selectedWarehouseId === wh.id ? 'translateY(-2px)' : 'none'
                    }}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '5px' }}>
                      {wh.type === 'main' ? '🏢' : (wh.type === 'vehicle' ? '🚚' : (wh.type === 'pos' ? '🏪' : '🏭'))}
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '10px' }}>{wh.name}</div>
                    
                    {wh.summary && (
                      <div style={{ 
                        display: 'flex', flexDirection: 'column', gap: '4px', 
                        fontSize: '11px', 
                        background: logic.selectedWarehouseId === wh.id ? 'rgba(255,255,255,0.15)' : 'rgba(28, 115, 171, 0.05)',
                        padding: '8px', borderRadius: '10px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>عدد الأصناف:</span>
                          <span style={{ fontWeight: 900, fontSize: '12px' }}>{wh.summary.itemCount}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>إجمالي الكميات:</span>
                          <span style={{ fontWeight: 900, fontSize: '12px' }}>{wh.summary.totalQty}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>القيمة التقديرية:</span>
                          <span style={{ fontWeight: 900, fontSize: '12px', color: logic.selectedWarehouseId === wh.id ? '#a7f3d0' : '#16a34a' }}>
                            {wh.summary.totalValue.toLocaleString()} ر.س
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 🚨 Low Stock Warning Banner */}
              {logic.lowStockCount > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(254, 242, 242, 0.95) 0%, rgba(255, 237, 213, 0.95) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '16px',
                  padding: '12px 20px',
                  marginBottom: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 15px rgba(239, 68, 68, 0.08)',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>🚨</span>
                    <div>
                      <div style={{ fontWeight: 900, color: '#991b1b', fontSize: '14px' }}>
                        تنبيه المخزون: يوجد {logic.lowStockCount} أصناف وصلت إلى حد إعادة الطلب أو نفدت!
                      </div>
                      <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>
                        يُنصح بإصدار أوامر شراء أو تعبئة للمستودع المختار لتفادي نفاد الكميات.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => logic.setFilterLowStockOnly(!logic.filterLowStockOnly)}
                    style={{
                      background: logic.filterLowStockOnly ? '#dc2626' : '#ea580c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '8px 16px',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(234, 88, 12, 0.3)',
                      transition: '0.2s'
                    }}
                  >
                    {logic.filterLowStockOnly ? 'إلغاء التصفية' : '🔍 استعراض الأصناف الناقصة فقط'}
                  </button>
                </div>
              )}

              {/* Quick Actions Filter Bar */}
              <div className="apple-glass-filter-bar">
                <div style={{ display: 'flex', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
                  
                  <SecureAction module="inventory" action="create">
                    <button 
                      onClick={() => { setActionType('out'); logic.setIsActionModalOpen(true); }}
                      className="btn-main-glass" 
                      style={{ background: '#ef4444', color: 'white', fontSize: '14px' }}
                    >
                      📤 صرف لمندوب (Out)
                    </button>
                  </SecureAction>
                  
                  <SecureAction module="inventory" action="create">
                    <button 
                      onClick={() => { logic.setCurrentRecord(null); logic.setIsModalOpen(true); }}
                      className="btn-main-glass" 
                      style={{ background: THEME.primary, color: 'white', fontSize: '14px' }}
                    >
                      ➕ تعريف صنف جديد
                    </button>
                  </SecureAction>

                  <SecureAction module="inventory" action="create">
                    <button 
                      onClick={() => { setActionType('waste'); logic.setIsActionModalOpen(true); }}
                      className="btn-main-glass" 
                      style={{ background: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)', color: 'white', fontSize: '13px', fontWeight: 800 }}
                    >
                      🗑️ تسجيل توالف وهدر
                    </button>
                  </SecureAction>

                  <SecureAction module="inventory" action="create">
                    <button 
                      onClick={() => { setActionType('empty_return'); logic.setIsActionModalOpen(true); }}
                      className="btn-main-glass" 
                      style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: 'white', fontSize: '13px', fontWeight: 800 }}
                    >
                      🔄 استرجاع فوارغ
                    </button>
                  </SecureAction>

                  <button 
                    type="button"
                    onClick={() => setIsStocktakingModalOpen(true)}
                    className="btn-main-glass" 
                    style={{ 
                      background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: 800,
                      boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)'
                    }}
                  >
                    📋 الجرد الدوري ومطابقة الأرصدة
                  </button>

                  <button 
                    type="button"
                    onClick={() => logic.handleSyncBalances()}
                    disabled={logic.isSyncing}
                    className="btn-main-glass" 
                    style={{ 
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                      color: 'white', 
                      fontSize: '13px', 
                      fontWeight: 800,
                      cursor: logic.isSyncing ? 'not-allowed' : 'pointer',
                      opacity: logic.isSyncing ? 0.7 : 1
                    }}
                  >
                    {logic.isSyncing ? '⏳ جاري المزامنة...' : '🔄 مزامنة أرصدة المستودعات'}
                  </button>

                  <button 
                    type="button"
                    onClick={() => logic.setFilterLowStockOnly(!logic.filterLowStockOnly)}
                    className="btn-main-glass" 
                    style={{ 
                      background: logic.filterLowStockOnly ? '#dc2626' : 'rgba(254, 226, 226, 0.8)', 
                      color: logic.filterLowStockOnly ? 'white' : '#b91c1c', 
                      border: '1px solid rgba(220, 38, 38, 0.4)',
                      fontSize: '13px',
                      fontWeight: 800
                    }}
                  >
                    ⚠️ النواقص ({logic.lowStockCount})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                  <div style={{ flex: 1, maxWidth: '300px' }}>
                    <input 
                      type="text"
                      placeholder="ابحث بالاسم أو الكود..." 
                      className="glass-input-field" 
                      value={logic.searchQuery} 
                      onChange={e => logic.setSearchQuery(e.target.value)} 
                    />
                  </div>
                  <div>
                    <select 
                      className="glass-input-field" 
                      value={logic.filterCategory} 
                      onChange={e => logic.setFilterCategory(e.target.value)}
                    >
                      <option value="الكل">جميع التصنيفات</option>
                      {logic.categories.map((c: string) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <RawasiSmartTable 
                columns={columns} 
                data={logic.items} 
                keyExtractor={(r: any) => r.id}
                pagination={true}
                itemsPerPage={20}
              />

              <InventoryItemModal 
                isOpen={logic.isModalOpen}
                onClose={() => { logic.setIsModalOpen(false); logic.setCurrentRecord(null); }}
                currentRecord={logic.currentRecord || {}}
                setCurrentRecord={logic.setCurrentRecord}
                handleSave={logic.handleSave}
                isSaving={logic.isSaving}
              />

              <InventoryActionModal 
                isOpen={logic.isActionModalOpen}
                onClose={() => logic.setIsActionModalOpen(false)}
                actionType={actionType}
                onSuccess={logic.refreshData}
                items={logic.items || []}
              />

              <StocktakingModal
                isOpen={isStocktakingModalOpen}
                onClose={() => setIsStocktakingModalOpen(false)}
                warehouseId={logic.selectedWarehouseId}
                onSuccess={logic.fetchData}
              />
            </>
          )}
        </MasterPage>
      </div>
    </>
  );
}