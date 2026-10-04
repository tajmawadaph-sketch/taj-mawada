"use client";
import React, { useRef, useEffect } from 'react';
import AquaModalWrapper from './AquaModalWrapper';
import { useStocktakingLogic, StocktakingItem } from '@/app/inventory/stocktaking_logic';
import LoadingScreen from './LoadingScreen';

interface StocktakingModalProps {
  isOpen: boolean;
  onClose: () => void;
  warehouseId?: string;
  onSuccess?: () => void;
}

export default function StocktakingModal({ isOpen, onClose, warehouseId, onSuccess }: StocktakingModalProps) {
  const logic = useStocktakingLogic(warehouseId);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // التركيز التلقائي على حقل الباركود عند فتح النافذة
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && logic.barcodeInput.trim()) {
      e.preventDefault();
      logic.handleScanBarcode(logic.barcodeInput);
    }
  };

  const getStatusBadge = (item: StocktakingItem) => {
    if (item.status === 'matched') {
      return (
        <span style={{
          background: 'rgba(5, 150, 105, 0.12)',
          color: '#059669',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 900,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px'
        }}>
          <span>🟢</span>
          <span>مطابق (0)</span>
        </span>
      );
    }
    if (item.status === 'deficit') {
      return (
        <span style={{
          background: 'rgba(168, 87, 60, 0.12)',
          color: '#A8573C',
          border: '1px solid rgba(168, 87, 60, 0.35)',
          padding: '3px 8px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 900,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px'
        }}>
          <span>🔴</span>
          <span>عجز ({item.variance_qty})</span>
        </span>
      );
    }
    return (
      <span style={{
        background: 'rgba(194, 155, 98, 0.15)',
        color: '#8c6b32',
        border: '1px solid rgba(194, 155, 98, 0.4)',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: 900,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px'
      }}>
        <span>🔵</span>
        <span>فائض (+{item.variance_qty})</span>
      </span>
    );
  };

  return (
    <AquaModalWrapper
      isOpen={isOpen}
      onClose={onClose}
      title={`محضر الجرد الدوري ومطابقة الأرصدة (${logic.sessionNumber || 'جلسة جديدة'})`}
      icon="📋"
      width="1140px"
      headerExtra={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={logic.exportToExcel}
            style={{
              background: '#059669',
              color: '#FFFFFF',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>📊</span>
            <span>تصدير Excel</span>
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', direction: 'rtl' }}>

        {/* 1. Header Configurations (Warehouse, Session, Auditor) */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '14px',
          padding: '14px 18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
        }}>
          {/* Warehouse Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              🏢 المستودع المراد جرده *
            </label>
            <select
              value={logic.selectedWarehouseId}
              onChange={(e) => logic.setSelectedWarehouseId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '40px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontSize: '12px',
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {logic.warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name} ({w.type === 'main' ? 'رئيسي' : (w.type === 'vehicle' ? 'سيارة' : 'فرعي')})</option>
              ))}
            </select>
          </div>

          {/* Count Type */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              🎯 نوع الجرد
            </label>
            <select
              value={logic.countType}
              onChange={(e) => logic.setCountType(e.target.value as any)}
              style={{
                width: '100%',
                minHeight: '40px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontSize: '12px',
                fontWeight: 800,
                outline: 'none'
              }}
            >
              <option value="full">جرد شامل (لكافة أصناف المستودع)</option>
              <option value="partial">جرد جزئي / دوري (دورة عد مستمرة)</option>
            </select>
          </div>

          {/* Auditor Name */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 900, color: '#1E130B', marginBottom: '4px' }}>
              👤 المسؤول عن الجرد
            </label>
            <input
              type="text"
              value={logic.auditorName}
              onChange={(e) => logic.setAuditorName(e.target.value)}
              placeholder="اسم أمين المستودع أو الجارد"
              style={{
                width: '100%',
                minHeight: '40px',
                padding: '6px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
          </div>

          {/* Reset / Pre-fill Options */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
            <button
              type="button"
              onClick={logic.handleSetAllToBook}
              title="تعيين الرصيد الفعلي مساوياً للدفتر للتدقيق بالفروقات فقط"
              style={{
                flex: 1,
                minHeight: '40px',
                padding: '6px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(5, 150, 105, 0.35)',
                background: 'rgba(5, 150, 105, 0.08)',
                color: '#059669',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              مطابقة مع الدفتري
            </button>
            <button
              type="button"
              onClick={logic.handleSetAllToZero}
              title="تصفير الرصيد الفعلي للبدء من الصفر والمسح قطعة قطعة"
              style={{
                flex: 1,
                minHeight: '40px',
                padding: '6px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(168, 87, 60, 0.35)',
                background: 'rgba(168, 87, 60, 0.08)',
                color: '#A8573C',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              تصفير لبدء العد
            </button>
          </div>
        </div>

        {/* 2. Barcode Fast Scanning Bar (Hardware Gun & Mobile Compatible) */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.15) 0%, rgba(168, 87, 60, 0.08) 100%)',
          border: '1.5px solid rgba(194, 155, 98, 0.4)',
          borderRadius: '14px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '24px' }}>📟</div>
          <div style={{ flex: '1 1 300px' }}>
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="امسح الباركود بقارئ الباركود أو اضغط Enter للإضافة السريعة (+1)..."
              value={logic.barcodeInput}
              onChange={(e) => logic.setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: '12px',
                border: '1px solid #C29B62',
                background: '#FFFFFF',
                color: '#1E130B',
                fontSize: '13px',
                fontWeight: 800,
                outline: 'none',
                boxShadow: '0 2px 8px rgba(194, 155, 98, 0.15)'
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => logic.barcodeInput && logic.handleScanBarcode(logic.barcodeInput)}
            style={{
              minHeight: '44px',
              padding: '8px 18px',
              borderRadius: '12px',
              border: 'none',
              background: '#C29B62',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>مسح الصنف</span>
            <span>↵</span>
          </button>
          <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700 }}>
            ⚡ يدعم كافة قارئات الباركود السلكية واللاسلكية USB / Bluetooth
          </div>
        </div>

        {/* 3. Live Variance KPI Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '10px'
        }}>
          {/* Total Items */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            borderRadius: '12px',
            padding: '12px',
            textAlign: 'center',
            boxShadow: '0 2px 10px rgba(30, 19, 11, 0.03)'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#786c62' }}>الأصناف المجرودة 📦</span>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }}>
              {logic.metrics.totalItems} صنف
            </div>
          </div>

          {/* Matched Items */}
          <div 
            onClick={() => logic.setStatusFilter('matched')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'matched' ? '2px solid #059669' : '1px solid rgba(5, 150, 105, 0.25)',
              borderRadius: '12px',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669' }}>أصناف متطابقة 🟢</span>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#059669', marginTop: '3px' }}>
              {logic.metrics.matchedCount} صنف
            </div>
          </div>

          {/* Deficit Items */}
          <div 
            onClick={() => logic.setStatusFilter('deficit')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'deficit' ? '2px solid #A8573C' : '1px solid rgba(168, 87, 60, 0.25)',
              borderRadius: '12px',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#A8573C' }}>أصناف بها عجز 🔴</span>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#A8573C', marginTop: '3px' }}>
              {logic.metrics.deficitCount} صنف
            </div>
            <div style={{ fontSize: '10.5px', color: '#A8573C', fontWeight: 800, marginTop: '2px' }}>
              خسارة: {formatMoney(logic.metrics.totalDeficitValue)}
            </div>
          </div>

          {/* Surplus Items */}
          <div 
            onClick={() => logic.setStatusFilter('surplus')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'surplus' ? '2px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '12px',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#8c6b32' }}>أصناف بها فائض 🔵</span>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#C29B62', marginTop: '3px' }}>
              {logic.metrics.surplusCount} صنف
            </div>
            <div style={{ fontSize: '10.5px', color: '#8c6b32', fontWeight: 800, marginTop: '2px' }}>
              إيراد: {formatMoney(logic.metrics.totalSurplusValue)}
            </div>
          </div>

          {/* Net Variance Value */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            borderRadius: '12px',
            padding: '12px',
            textAlign: 'center',
            boxShadow: '0 2px 10px rgba(30, 19, 11, 0.03)'
          }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#786c62' }}>صافي الفارق المالي ⚖️</span>
            <div style={{
              fontSize: '18px',
              fontWeight: 900,
              color: logic.metrics.netVarianceValue === 0 ? '#059669' : (logic.metrics.netVarianceValue > 0 ? '#C29B62' : '#A8573C'),
              marginTop: '3px'
            }}>
              {formatMoney(logic.metrics.netVarianceValue)}
            </div>
          </div>
        </div>

        {/* 4. Filter and Search Tabs */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Quick Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'كافة الأصناف' },
              { id: 'variance_only', label: `⚠️ الفروقات فقط (${logic.metrics.varianceItemsCount})` },
              { id: 'deficit', label: `🔴 العجز فقط (${logic.metrics.deficitCount})` },
              { id: 'surplus', label: `🔵 الفائض فقط (${logic.metrics.surplusCount})` },
              { id: 'matched', label: `🟢 المتطابقة (${logic.metrics.matchedCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => logic.setStatusFilter(tab.id as any)}
                style={{
                  minHeight: '34px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: logic.statusFilter === tab.id ? '#1E130B' : 'rgba(30, 19, 11, 0.06)',
                  color: logic.statusFilter === tab.id ? '#FFFFFF' : '#1E130B',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ flex: '1 1 220px', maxWidth: '320px' }}>
            <input
              type="text"
              placeholder="ابحث بالاسم أو الكود أو الباركود..."
              value={logic.searchFilter}
              onChange={(e) => logic.setSearchFilter(e.target.value)}
              style={{
                width: '100%',
                minHeight: '36px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FFFFFF',
                color: '#1E130B',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* 5. Items Comparison Table */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '14px',
          overflow: 'hidden',
          maxHeight: '440px',
          overflowY: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: '#FDFBF7' }}>
              <tr style={{
                borderBottom: '1.5px solid rgba(194, 155, 98, 0.25)',
                color: '#1E130B'
              }}>
                <th style={{ padding: '10px 14px', fontWeight: 900 }}>الصنف والكود</th>
                <th style={{ padding: '10px 14px', fontWeight: 900 }}>الرصيد الدفتري</th>
                <th style={{ padding: '10px 14px', fontWeight: 900, textAlign: 'center' }}>الرصيد الفعلي المجرود</th>
                <th style={{ padding: '10px 14px', fontWeight: 900 }}>فارق الكمية</th>
                <th style={{ padding: '10px 14px', fontWeight: 900 }}>التكلفة</th>
                <th style={{ padding: '10px 14px', fontWeight: 900 }}>الفارق المالي</th>
                <th style={{ padding: '10px 14px', fontWeight: 900, textAlign: 'center' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {logic.isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center' }}>
                    <LoadingScreen text="جارٍ تهيئة ومطابقة بنود الجرد..." />
                  </td>
                </tr>
              ) : logic.items.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#786c62', fontWeight: 800 }}>
                    لا توجد أصناف مطابقة للبحث أو الفلتر المحدد
                  </td>
                </tr>
              ) : (
                logic.items.map((item) => {
                  const isRecent = logic.recentScannedId === item.item_id;

                  return (
                    <tr
                      key={item.item_id}
                      style={{
                        borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                        background: isRecent ? 'rgba(194, 155, 98, 0.15)' : (
                          item.status === 'deficit' ? 'rgba(168, 87, 60, 0.03)' : (
                            item.status === 'surplus' ? 'rgba(194, 155, 98, 0.03)' : 'transparent'
                          )
                        ),
                        transition: 'background 0.3s'
                      }}
                    >
                      {/* Name & Code */}
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#786c62', marginTop: '2px' }}>
                          {item.code ? `كود: ${item.code}` : ''} {item.barcode ? `| باركود: ${item.barcode}` : ''}
                        </div>
                      </td>

                      {/* Book Qty */}
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: '#786c62' }}>
                        {item.book_qty} {item.unit}
                      </td>

                      {/* Physical Count with Stepper */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => logic.handleUpdatePhysicalQty(item.item_id, item.physical_qty - 1)}
                            disabled={item.physical_qty <= 0}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid rgba(194, 155, 98, 0.3)',
                              background: '#FFFFFF',
                              color: '#1E130B',
                              fontWeight: 900,
                              cursor: item.physical_qty <= 0 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={item.physical_qty}
                            onChange={(e) => logic.handleUpdatePhysicalQty(item.item_id, Number(e.target.value))}
                            style={{
                              width: '64px',
                              minHeight: '28px',
                              textAlign: 'center',
                              borderRadius: '6px',
                              border: '1.5px solid #C29B62',
                              background: '#FFFFFF',
                              color: '#1E130B',
                              fontSize: '13px',
                              fontWeight: 900,
                              outline: 'none'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => logic.handleUpdatePhysicalQty(item.item_id, item.physical_qty + 1)}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid rgba(194, 155, 98, 0.3)',
                              background: '#FFFFFF',
                              color: '#1E130B',
                              fontWeight: 900,
                              cursor: 'pointer'
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Variance Qty */}
                      <td style={{ padding: '10px 14px', fontWeight: 900, color: item.variance_qty === 0 ? '#059669' : (item.variance_qty > 0 ? '#8c6b32' : '#A8573C') }}>
                        {item.variance_qty > 0 ? `+${item.variance_qty}` : item.variance_qty} {item.unit}
                      </td>

                      {/* Cost */}
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#786c62' }}>
                        {formatMoney(item.cost_price)}
                      </td>

                      {/* Variance Financial Value */}
                      <td style={{ padding: '10px 14px', fontWeight: 900, color: item.variance_value === 0 ? '#059669' : (item.variance_value > 0 ? '#8c6b32' : '#A8573C') }}>
                        {formatMoney(item.variance_value)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {getStatusBadge(item)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 6. Footer Notes & Final Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingTop: '6px'
        }}>
          {/* Notes Input */}
          <div style={{ flex: '1 1 300px' }}>
            <input
              type="text"
              placeholder="ملاحظات محضر الجرد (اختياري)..."
              value={logic.sessionNotes}
              onChange={(e) => logic.setSessionNotes(e.target.value)}
              style={{
                width: '100%',
                minHeight: '42px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                background: '#FFFFFF',
                color: '#1E130B',
                fontSize: '12px',
                fontWeight: 700,
                outline: 'none'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              disabled={logic.isSubmitting || logic.metrics.varianceItemsCount === 0}
              onClick={async () => {
                await logic.handleApproveStocktaking();
                if (onSuccess) onSuccess();
              }}
              style={{
                minHeight: '44px',
                padding: '10px 22px',
                borderRadius: '12px',
                border: 'none',
                background: logic.metrics.varianceItemsCount === 0 ? '#e2e8f0' : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                color: logic.metrics.varianceItemsCount === 0 ? '#94a3b8' : '#FFFFFF',
                fontSize: '13px',
                fontWeight: 900,
                cursor: (logic.isSubmitting || logic.metrics.varianceItemsCount === 0) ? 'not-allowed' : 'pointer',
                boxShadow: logic.metrics.varianceItemsCount === 0 ? 'none' : '0 4px 15px rgba(194, 155, 98, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>📋</span>
              <span>{logic.isSubmitting ? 'جارٍ ترحيل القيود...' : `اعتماد المحضر وتوليد التسويات (${logic.metrics.varianceItemsCount})`}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: '44px',
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: 'transparent',
                color: '#1E130B',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              إغلاق
            </button>
          </div>
        </div>

      </div>
    </AquaModalWrapper>
  );
}
