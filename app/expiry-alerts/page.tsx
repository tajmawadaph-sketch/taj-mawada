"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import { useLanguage } from '@/lib/LanguageContext';
import { useExpiryAlertsLogic, ExpiryItem } from './expiry_alerts_logic';
import { MAIN_WAREHOUSE_ID } from '@/lib/inventory_engine';

export default function ExpiryAlertsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const logic = useExpiryAlertsLogic();

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
  };

  const getStatusBadge = (item: ExpiryItem) => {
    if (item.status === 'expired') {
      return (
        <span style={{
          background: 'rgba(168, 87, 60, 0.12)',
          color: '#A8573C',
          border: '1px solid rgba(168, 87, 60, 0.3)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 900,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span>⛔</span>
          <span>{isEn ? 'Expired' : 'منتهي الصلاحية'}</span>
        </span>
      );
    }
    if (item.status === 'critical') {
      return (
        <span style={{
          background: 'rgba(194, 155, 98, 0.15)',
          color: '#8c6b32',
          border: '1px solid rgba(194, 155, 98, 0.4)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 900,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span>⏳</span>
          <span>{isEn ? `Critical (${item.days_left}d)` : `حرج (${item.days_left} يوم)`}</span>
        </span>
      );
    }
    if (item.status === 'warning') {
      return (
        <span style={{
          background: 'rgba(234, 179, 8, 0.12)',
          color: '#854d0e',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span>⚠️</span>
          <span>{isEn ? `Warning (${item.days_left}d)` : `تنبيه مبكر (${item.days_left} يوم)`}</span>
        </span>
      );
    }
    if (item.status === 'safe') {
      return (
        <span style={{
          background: 'rgba(5, 150, 105, 0.12)',
          color: '#059669',
          border: '1px solid rgba(5, 150, 105, 0.3)',
          padding: '4px 10px',
          borderRadius: '20px',
          fontSize: '11px',
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <span>🟢</span>
          <span>{isEn ? `Safe (${item.days_left}d)` : `آمن (${item.days_left} يوم)`}</span>
        </span>
      );
    }
    return (
      <span style={{
        background: 'rgba(30, 19, 11, 0.05)',
        color: '#786c62',
        border: '1px solid rgba(30, 19, 11, 0.12)',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700
      }}>
        {isEn ? 'Not Set' : 'غير محدد'}
      </span>
    );
  };

  return (
    <MasterPage
      title={isEn ? 'Veterinary Expiry Tracking' : 'مراقبة الصلاحيات وإنذارات الأدوية البيطرية'}
      subtitle={isEn ? 'Smart monitoring of expired and soon-to-expire pharmaceutical batches' : 'نظام الرقابة المبكرة على التشغيلات المنتهية وتلك التي أوشكت على الانتهاء بنظام FEFO'}
      icon="⏳"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>

        {/* 1. Header Alert Banner & Bulk Actions */}
        {(logic.metrics.expiredCount > 0 || logic.metrics.criticalCount > 0) && (
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(168, 87, 60, 0.3)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(168, 87, 60, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px'
              }}>
                🚨
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#A8573C' }}>
                  {isEn ? 'Urgent Alert: Expired or Critical Stock Detected!' : 'إنذار الرقابة الدوائية: أدوية بيطرية منتهية أو وشيكة الانتهاء!'}
                </h4>
                <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#1E130B', fontWeight: 700 }}>
                  {logic.metrics.expiredCount > 0 && (
                    <span style={{ color: '#A8573C', marginLeft: '8px' }}>
                      ⛔ {logic.metrics.expiredCount} صنف منتهي (خسارة محتملة: {formatMoney(logic.metrics.expiredLoss)})
                    </span>
                  )}
                  {logic.metrics.criticalCount > 0 && (
                    <span style={{ color: '#C29B62' }}>
                      ⏳ {logic.metrics.criticalCount} صنف حرج وشيك الانتهاء (قيمة معرضة: {formatMoney(logic.metrics.criticalLoss)})
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Quick Bulk Execution Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {logic.metrics.expiredCount > 0 && (
                <button
                  type="button"
                  disabled={logic.isBulkProcessing}
                  onClick={logic.handleBulkExpiredDisposal}
                  style={{
                    background: '#A8573C',
                    color: '#fff',
                    border: 'none',
                    minHeight: '44px',
                    padding: '8px 18px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 900,
                    cursor: logic.isBulkProcessing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🗑️</span>
                  <span>{logic.isBulkProcessing ? 'جارٍ الإتلاف...' : `إتلاف كافة المنتهي (${logic.metrics.expiredCount})`}</span>
                </button>
              )}

              {logic.metrics.criticalCount > 0 && (
                <button
                  type="button"
                  disabled={logic.isBulkProcessing}
                  onClick={() => logic.handleBulkCriticalPromo(30)}
                  style={{
                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                    color: '#fff',
                    border: 'none',
                    minHeight: '44px',
                    padding: '8px 18px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 900,
                    cursor: logic.isBulkProcessing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🎁</span>
                  <span>{logic.isBulkProcessing ? 'جارٍ التفعيل...' : `تفعيل عروض تصفية للحرجة (${logic.metrics.criticalCount})`}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. Top Luxury KPI Cards (Solid Elegant Design) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}>
          {/* Expired Card */}
          <div 
            onClick={() => logic.setStatusFilter('expired')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'expired' ? '2px solid #A8573C' : '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              padding: '16px 20px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
              transition: 'transform 0.2s',
              transform: logic.statusFilter === 'expired' ? 'translateY(-2px)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>
                {isEn ? '⛔ Expired Batches' : '⛔ منتهية الصلاحية'}
              </span>
              <span style={{ fontSize: '20px' }}>🚨</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#A8573C', marginTop: '6px' }}>
              {logic.metrics.expiredCount} <span style={{ fontSize: '13px', color: '#1E130B' }}>{isEn ? 'items' : 'صنف'}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#A8573C', fontWeight: 800, marginTop: '4px' }}>
              {isEn ? 'Loss: ' : 'الخسارة المحتملة: '}{formatMoney(logic.metrics.expiredLoss)}
            </div>
          </div>

          {/* Critical (Expiring Soon <= 30d) */}
          <div 
            onClick={() => logic.setStatusFilter('critical')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'critical' ? '2px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              padding: '16px 20px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
              transition: 'transform 0.2s',
              transform: logic.statusFilter === 'critical' ? 'translateY(-2px)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>
                {isEn ? '⏳ Critical (<= 30 Days)' : '⏳ أوشكت على الانتهاء (حرج)'}
              </span>
              <span style={{ fontSize: '20px' }}>⏳</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#C29B62', marginTop: '6px' }}>
              {logic.metrics.criticalCount} <span style={{ fontSize: '13px', color: '#1E130B' }}>{isEn ? 'items' : 'صنف'}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 800, marginTop: '4px' }}>
              {isEn ? 'At risk: ' : 'قيمة البضاعة المعرضة: '}{formatMoney(logic.metrics.criticalLoss)}
            </div>
          </div>

          {/* Warning (31 - 90d) */}
          <div 
            onClick={() => logic.setStatusFilter('warning')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'warning' ? '2px solid #eab308' : '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              padding: '16px 20px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
              transition: 'transform 0.2s',
              transform: logic.statusFilter === 'warning' ? 'translateY(-2px)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#854d0e' }}>
                {isEn ? '⚠️ Warning (31-90 Days)' : '⚠️ تنبيه مبكر (31 - 90 يوم)'}
              </span>
              <span style={{ fontSize: '20px' }}>⚠️</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#854d0e', marginTop: '6px' }}>
              {logic.metrics.warningCount} <span style={{ fontSize: '13px', color: '#1E130B' }}>{isEn ? 'items' : 'صنف'}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 800, marginTop: '4px' }}>
              {isEn ? 'Priority for sales' : 'أولوية للبيع والتوزيع بنظام FEFO'}
            </div>
          </div>

          {/* Safe (> 90d) */}
          <div 
            onClick={() => logic.setStatusFilter('safe')}
            style={{
              background: '#FFFFFF',
              border: logic.statusFilter === 'safe' ? '2px solid #059669' : '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              padding: '16px 20px',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
              transition: 'transform 0.2s',
              transform: logic.statusFilter === 'safe' ? 'translateY(-2px)' : 'none'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>
                {isEn ? '🟢 Safe (> 90 Days)' : '🟢 صلاحية آمنة (+90 يوم)'}
              </span>
              <span style={{ fontSize: '20px' }}>🛡️</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
              {logic.metrics.safeCount} <span style={{ fontSize: '13px', color: '#1E130B' }}>{isEn ? 'items' : 'صنف'}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 800, marginTop: '4px' }}>
              {isEn ? 'Safe stock' : 'حالة ممتازة ومطابقة للمعايير'}
            </div>
          </div>
        </div>

        {/* 3. Toolbar & Filters (Solid Luxury Bar) */}
        <div style={{
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
          {/* Search Input */}
          <div style={{ flex: '1 1 260px' }}>
            <input
              type="text"
              placeholder={isEn ? 'Search item name, barcode, batch #...' : 'ابحث باسم الدواء البيطري، الباركود، أو رقم التشغيلة...'}
              value={logic.searchTerm}
              onChange={(e) => logic.setSearchTerm(e.target.value)}
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

          {/* Warehouse Selector */}
          <div style={{ minWidth: '200px' }}>
            <select
              value={logic.selectedWarehouseId}
              onChange={(e) => logic.setSelectedWarehouseId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '10px 14px',
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
              <option value="all">{isEn ? '🏢 All Warehouses' : '🏢 كافة المستودعات والصيدليات'}</option>
              {logic.warehouses.map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: isEn ? 'All' : 'الكل' },
              { id: 'expired', label: isEn ? '⛔ Expired' : '⛔ منتهي' },
              { id: 'critical', label: isEn ? '⏳ Critical' : '⏳ حرج' },
              { id: 'warning', label: isEn ? '⚠️ Warning' : '⚠️ مبكر' },
              { id: 'safe', label: isEn ? '🟢 Safe' : '🟢 آمن' },
              { id: 'no_date', label: isEn ? '⚪ No Date' : '⚪ بدون تاريخ' }
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => logic.setStatusFilter(tab.id as any)}
                style={{
                  minHeight: '44px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: logic.statusFilter === tab.id ? '#C29B62' : 'rgba(194, 155, 98, 0.12)',
                  color: logic.statusFilter === tab.id ? '#FFFFFF' : '#1E130B',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={logic.exportToExcel}
            style={{
              minHeight: '44px',
              padding: '10px 18px',
              borderRadius: '12px',
              border: 'none',
              background: '#059669',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)'
            }}
          >
            <span>📊</span>
            <span>{isEn ? 'Export Excel' : 'تصدير إكسل'}</span>
          </button>
        </div>

        {/* 4. Table Section (Solid Pure White Card) */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
              <thead>
                <tr style={{
                  background: 'rgba(30, 19, 11, 0.03)',
                  borderBottom: '1.5px solid rgba(194, 155, 98, 0.25)',
                  color: '#1E130B'
                }}>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Item Code & Name' : 'كود واسم الدواء البيطري'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Batch #' : 'رقم التشغيلة'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Stock' : 'الرصيد المتاح'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Expiry Date' : 'تاريخ الانتهاء'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Days Left' : 'الأيام المتبقية'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Status' : 'حالة الصلاحية'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Potential Loss' : 'الخسارة المحتملة'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900, textAlign: 'center' }}>{isEn ? 'Quick Actions' : 'إجراءات فورية'}</th>
                </tr>
              </thead>
              <tbody>
                {logic.isLoading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center' }}>
                      <LoadingScreen text={isEn ? 'Loading expiry data...' : 'جارٍ فحص صلاحيات الأدوية والتشغيلات...'} />
                    </td>
                  </tr>
                ) : logic.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#786c62', fontWeight: 800 }}>
                      {isEn ? 'No items found matching the selected filter 🎉' : 'لا توجد أدوية بيطرية مطابقة للفلتر المحدد حالياً 🎉'}
                    </td>
                  </tr>
                ) : (
                  logic.items.map((item) => {
                    const isExp = item.status === 'expired';
                    const isCrit = item.status === 'critical';

                    return (
                      <tr 
                        key={item.id}
                        style={{
                          borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                          background: isExp ? 'rgba(168, 87, 60, 0.04)' : (isCrit ? 'rgba(194, 155, 98, 0.04)' : 'transparent'),
                          transition: 'background 0.2s'
                        }}
                      >
                        {/* Item Code & Name */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                            {item.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700, marginTop: '2px' }}>
                            {item.code ? `كود: ${item.code}` : ''} {item.barcode ? `| باركود: ${item.barcode}` : ''}
                          </div>
                        </td>

                        {/* Batch # */}
                        <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1E130B' }}>
                          {item.batch_number ? (
                            <span style={{
                              background: 'rgba(194, 155, 98, 0.15)',
                              color: '#8c6b32',
                              border: '1px solid rgba(194, 155, 98, 0.3)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 900
                            }}>
                              {item.batch_number}
                            </span>
                          ) : (
                            <span style={{ color: '#786c62' }}>-</span>
                          )}
                        </td>

                        {/* Stock Available */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontWeight: 900, color: item.available_qty > 0 ? '#059669' : '#A8573C', fontSize: '13px' }}>
                            {item.available_qty} {item.unit}
                          </span>
                        </td>

                        {/* Expiry Date */}
                        <td style={{ padding: '14px 16px', fontWeight: 900, color: isExp ? '#A8573C' : (isCrit ? '#C29B62' : '#1E130B') }}>
                          {item.expiry_date || (
                            <span style={{ color: '#786c62', fontWeight: 700 }}>{isEn ? 'Not specified' : 'غير مسجل'}</span>
                          )}
                        </td>

                        {/* Days Left */}
                        <td style={{ padding: '14px 16px' }}>
                          {item.days_left !== null ? (
                            <span style={{
                              fontWeight: 900,
                              color: isExp ? '#A8573C' : (isCrit ? '#C29B62' : (item.days_left <= 90 ? '#854d0e' : '#059669'))
                            }}>
                              {item.days_left <= 0
                                ? (isEn ? `Expired ${Math.abs(item.days_left)}d ago` : `منتهي منذ ${Math.abs(item.days_left)} يوم`)
                                : `${item.days_left} يوم`}
                            </span>
                          ) : '-'}
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: '14px 16px' }}>
                          {getStatusBadge(item)}
                        </td>

                        {/* Potential Loss */}
                        <td style={{ padding: '14px 16px', fontWeight: 900, color: item.potential_loss > 0 ? '#A8573C' : '#786c62' }}>
                          {item.potential_loss > 0 ? formatMoney(item.potential_loss) : '-'}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Edit / Set Date */}
                            <button
                              type="button"
                              onClick={() => logic.openEditModal(item)}
                              title={isEn ? 'Edit Expiry Date & Batch' : 'تعديل تاريخ الصلاحية والتشغيلة'}
                              style={{
                                minHeight: '34px',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid rgba(194, 155, 98, 0.4)',
                                background: 'rgba(194, 155, 98, 0.1)',
                                color: '#1E130B',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              ⏳ {isEn ? 'Edit' : 'تعديل'}
                            </button>

                            {/* Create Promotion (if critical, warning, or safe) */}
                            {item.available_qty > 0 && !isExp && (
                              <button
                                type="button"
                                onClick={() => logic.openPromoModal(item)}
                                title={isEn ? 'Quick Clearance Promotion' : 'تفعيل عرض تصفية فوري بضغطة زر'}
                                style={{
                                  minHeight: '34px',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 8px rgba(194, 155, 98, 0.25)'
                                }}
                              >
                                🎁 {isEn ? 'Promote' : 'عرض تصفية'}
                              </button>
                            )}

                            {/* Disposal / Write-off */}
                            {item.available_qty > 0 && (
                              <button
                                type="button"
                                onClick={() => logic.openDisposalModal(item)}
                                title={isEn ? 'One-Click Disposal' : 'إتلاف مخزني فوري بضغطة زر'}
                                style={{
                                  minHeight: '34px',
                                  padding: '6px 10px',
                                  borderRadius: '8px',
                                  border: 'none',
                                  background: '#A8573C',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 8px rgba(168, 87, 60, 0.25)'
                                }}
                              >
                                🗑️ {isEn ? 'Disposal' : 'إتلاف فوري'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logic.totalPages > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              borderTop: '1px solid rgba(194, 155, 98, 0.2)'
            }}>
              <span style={{ fontSize: '12px', color: '#786c62', fontWeight: 800 }}>
                {isEn ? `Showing ${logic.items.length} of ${logic.allFilteredCount} items` : `عرض ${logic.items.length} من إجمالي ${logic.allFilteredCount} صنف`}
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  disabled={logic.currentPage <= 1}
                  onClick={() => logic.setCurrentPage(p => p - 1)}
                  style={{
                    minHeight: '38px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    background: logic.currentPage <= 1 ? '#f5f5f5' : '#FFFFFF',
                    color: '#1E130B',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: logic.currentPage <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isEn ? 'Previous' : 'السابق'}
                </button>
                <span style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 900, color: '#C29B62' }}>
                  {logic.currentPage} / {logic.totalPages}
                </span>
                <button
                  type="button"
                  disabled={logic.currentPage >= logic.totalPages}
                  onClick={() => logic.setCurrentPage(p => p + 1)}
                  style={{
                    minHeight: '38px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    background: logic.currentPage >= logic.totalPages ? '#f5f5f5' : '#FFFFFF',
                    color: '#1E130B',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: logic.currentPage >= logic.totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isEn ? 'Next' : 'التالي'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5. Edit Expiry Modal */}
        <AquaModalWrapper
          isOpen={logic.isEditModalOpen && !!logic.selectedItemForEdit}
          onClose={() => logic.setIsEditModalOpen(false)}
          title={isEn ? 'Update Expiry Date & Batch' : 'تحديد وتعديل الصلاحية والتشغيلة'}
          icon="⏳"
        >
          {logic.selectedItemForEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
              <div style={{ background: '#FDFBF7', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.25)' }}>
                <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>{logic.selectedItemForEdit.name}</div>
                <div style={{ fontSize: '11px', color: '#786c62', marginTop: '2px' }}>
                  الكود: {logic.selectedItemForEdit.code || '-'} | الرصيد: {logic.selectedItemForEdit.available_qty} {logic.selectedItemForEdit.unit}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Expiry Date *' : 'تاريخ انتهاء الصلاحية *'}
                </label>
                <input
                  type="date"
                  value={logic.editExpiryDate}
                  onChange={(e) => logic.setEditExpiryDate(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.35)',
                    background: '#FDFBF7',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Batch / Lot Number' : 'رقم التشغيلة / الدفعة (Batch Number)'}
                </label>
                <input
                  type="text"
                  placeholder="مثال: BATCH-2026-09"
                  value={logic.editBatchNumber}
                  onChange={(e) => logic.setEditBatchNumber(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Alert Days in Advance' : 'تنبيه مسبق قبل كم يوم؟'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={logic.editAlertDays}
                  onChange={(e) => logic.setEditAlertDays(Number(e.target.value) || 30)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.35)',
                    background: '#FDFBF7',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={logic.isSaving}
                  onClick={logic.handleSaveExpiry}
                  style={{
                    flex: 1,
                    minHeight: '44px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: logic.isSaving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)'
                  }}
                >
                  {logic.isSaving ? (isEn ? 'Saving...' : 'جارٍ الحفظ...') : (isEn ? 'Save Expiry Date ✓' : 'حفظ بيانات الصلاحية والتشغيلة ✓')}
                </button>
                <button
                  type="button"
                  onClick={() => logic.setIsEditModalOpen(false)}
                  style={{
                    minHeight: '44px',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    background: 'transparent',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isEn ? 'Cancel' : 'إلغاء'}
                </button>
              </div>
            </div>
          )}
        </AquaModalWrapper>

        {/* 6. Quick Disposal Modal (Solid Luxury Royal UI) */}
        <AquaModalWrapper
          isOpen={logic.isDisposalModalOpen && !!logic.selectedItemForDisposal}
          onClose={() => logic.setIsDisposalModalOpen(false)}
          title={isEn ? 'Quick Inventory Write-off (Disposal)' : 'إتلاف مخزني فوري وتسجيل التوالف'}
          icon="🗑️"
        >
          {logic.selectedItemForDisposal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
              <div style={{
                background: 'rgba(168, 87, 60, 0.08)',
                padding: '14px 18px',
                borderRadius: '14px',
                border: '1.5px solid rgba(168, 87, 60, 0.3)'
              }}>
                <div style={{ fontWeight: 900, color: '#A8573C', fontSize: '15px' }}>
                  {logic.selectedItemForDisposal.name}
                </div>
                <div style={{ fontSize: '12px', color: '#1E130B', marginTop: '4px', fontWeight: 700 }}>
                  التشغيلة: {logic.selectedItemForDisposal.batch_number || 'غير مسجلة'} | تاريخ الانتهاء: {logic.selectedItemForDisposal.expiry_date || 'غير محدد'}
                </div>
                <div style={{ fontSize: '12px', color: '#A8573C', marginTop: '4px', fontWeight: 800 }}>
                  الرصيد المتاح: {logic.selectedItemForDisposal.available_qty} {logic.selectedItemForDisposal.unit} | التكلفة للوحدة: {formatMoney(logic.selectedItemForDisposal.cost_price)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Disposal Quantity *' : 'الكمية المراد إتلافها *'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={logic.selectedItemForDisposal.available_qty}
                  value={logic.disposalQty}
                  onChange={(e) => logic.setDisposalQty(Number(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.35)',
                    background: '#FDFBF7',
                    color: '#1E130B',
                    fontSize: '14px',
                    fontWeight: 900,
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#A8573C', marginTop: '4px', display: 'block', fontWeight: 800 }}>
                  إجمالي الخسارة الناتجة عن هذا الإتلاف: {formatMoney(logic.disposalQty * logic.selectedItemForDisposal.cost_price)}
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Warehouse' : 'المستودع المعني بالإتلاف'}
                </label>
                <select
                  value={logic.disposalWarehouseId}
                  onChange={(e) => logic.setDisposalWarehouseId(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.35)',
                    background: '#FDFBF7',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                >
                  {logic.warehouses.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Reason / Notes' : 'سبب الإتلاف وملاحظات الضبط'}
                </label>
                <input
                  type="text"
                  value={logic.disposalReason}
                  onChange={(e) => logic.setDisposalReason(e.target.value)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
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

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={logic.isDisposalLoading}
                  onClick={logic.handleExecuteDisposal}
                  style={{
                    flex: 1,
                    minHeight: '44px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#A8573C',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: logic.isDisposalLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)'
                  }}
                >
                  {logic.isDisposalLoading ? (isEn ? 'Executing...' : 'جارٍ تنفيذ الإتلاف...') : (isEn ? 'Confirm Disposal & Post Entry 🗑️' : 'تأكيد الإتلاف وترحيل القيد المحاسبي 🗑️')}
                </button>
                <button
                  type="button"
                  onClick={() => logic.setIsDisposalModalOpen(false)}
                  style={{
                    minHeight: '44px',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    background: 'transparent',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isEn ? 'Cancel' : 'إلغاء'}
                </button>
              </div>
            </div>
          )}
        </AquaModalWrapper>

        {/* 7. Quick Promotion Modal (Solid Luxury Royal UI) */}
        <AquaModalWrapper
          isOpen={logic.isPromoModalOpen && !!logic.selectedItemForPromo}
          onClose={() => logic.setIsPromoModalOpen(false)}
          title={isEn ? 'Quick Clearance Promotion' : 'تفعيل عرض تصفية فوري للأدوية وشيكة الانتهاء'}
          icon="🎁"
        >
          {logic.selectedItemForPromo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
              <div style={{
                background: 'rgba(194, 155, 98, 0.1)',
                padding: '14px 18px',
                borderRadius: '14px',
                border: '1.5px solid rgba(194, 155, 98, 0.35)'
              }}>
                <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '15px' }}>
                  {logic.selectedItemForPromo.name}
                </div>
                <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 800 }}>
                  التشغيلة: {logic.selectedItemForPromo.batch_number || 'غير مسجلة'} | تاريخ الانتهاء: {logic.selectedItemForPromo.expiry_date || 'غير محدد'} ({logic.selectedItemForPromo.days_left} يوم متبقي)
                </div>
                <div style={{ fontSize: '12px', color: '#1E130B', marginTop: '4px', fontWeight: 700 }}>
                  السعر المقترح: {formatMoney(logic.selectedItemForPromo.suggested_price)} | الرصيد المتاح: {logic.selectedItemForPromo.available_qty} {logic.selectedItemForPromo.unit}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Discount Percentage %' : 'نسبة الخصم الترويجي %'}
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    min={5}
                    max={90}
                    value={logic.promoDiscountPercent}
                    onChange={(e) => logic.setPromoDiscountPercent(Number(e.target.value) || 0)}
                    style={{
                      flex: 1,
                      minHeight: '44px',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(194, 155, 98, 0.35)',
                      background: '#FDFBF7',
                      color: '#1E130B',
                      fontSize: '14px',
                      fontWeight: 900,
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[15, 25, 35, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => logic.setPromoDiscountPercent(pct)}
                        style={{
                          minHeight: '44px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: logic.promoDiscountPercent === pct ? '2px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.3)',
                          background: logic.promoDiscountPercent === pct ? '#C29B62' : '#FFFFFF',
                          color: logic.promoDiscountPercent === pct ? '#FFFFFF' : '#1E130B',
                          fontSize: '12px',
                          fontWeight: 900,
                          cursor: 'pointer'
                        }}
                      >
                        %{pct}
                      </button>
                    ))}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: '#059669', marginTop: '6px', display: 'block', fontWeight: 800 }}>
                  السعر بعد الخصم: {formatMoney(logic.selectedItemForPromo.suggested_price * (1 - logic.promoDiscountPercent / 100))} (وفر {formatMoney(logic.selectedItemForPromo.suggested_price * (logic.promoDiscountPercent / 100))})
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Minimum Quantity to trigger' : 'الحد الأدنى للكمية لتطبيق الخصم'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={logic.promoMinQty}
                  onChange={(e) => logic.setPromoMinQty(Number(e.target.value) || 1)}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.35)',
                    background: '#FDFBF7',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={logic.isPromoLoading}
                  onClick={logic.handleExecutePromo}
                  style={{
                    flex: 1,
                    minHeight: '44px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: logic.isPromoLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)'
                  }}
                >
                  {logic.isPromoLoading ? (isEn ? 'Activating...' : 'جارٍ التفعيل...') : (isEn ? 'Activate Promotion in POS 🎁' : 'تفعيل العرض فورياً في الكاشير 🎁')}
                </button>
                <button
                  type="button"
                  onClick={() => logic.setIsPromoModalOpen(false)}
                  style={{
                    minHeight: '44px',
                    padding: '12px 18px',
                    borderRadius: '12px',
                    border: '1px solid rgba(194, 155, 98, 0.3)',
                    background: 'transparent',
                    color: '#1E130B',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {isEn ? 'Cancel' : 'إلغاء'}
                </button>
              </div>
            </div>
          )}
        </AquaModalWrapper>

      </div>
    </MasterPage>
  );
}
