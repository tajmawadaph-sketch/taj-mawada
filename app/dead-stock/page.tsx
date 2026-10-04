"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import { useLanguage } from '@/lib/LanguageContext';
import { useDeadStockLogic } from './dead_stock_logic';

export default function DeadStockPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const {
    filteredItems,
    globalSearch,
    setGlobalSearch,
    stagnantDays,
    setStagnantDays,
    totalDeadItems,
    totalFrozenCapital,
    isLoading,
    isDisposalModalOpen,
    setIsDisposalModalOpen,
    selectedItemForDisposal,
    disposalQty,
    setDisposalQty,
    disposalReason,
    setDisposalReason,
    openDisposalModal,
    handleExecuteDisposal,
    isDisposalLoading,
    isPromoModalOpen,
    setIsPromoModalOpen,
    selectedItemForPromo,
    promoDiscountPercent,
    setPromoDiscountPercent,
    promoMinQty,
    setPromoMinQty,
    openPromoModal,
    handleExecutePromo,
    isPromoLoading,
    exportToExcel
  } = useDeadStockLogic();

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
  };

  return (
    <MasterPage
      title={isEn ? 'Dead Stock Analytics' : 'إدارة ومراقبة المخزون الراكد'}
      subtitle={isEn ? 'Smart monitoring of slow-moving inventory to liquidate frozen capital' : 'تحليل البضائع بطيئة الحركة وتنشيط رأس المال المجمد بعروض تصفية وإتلاف فوري'}
      icon="🐢"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>

        {/* 1. Top Luxury KPI Cards (Solid White, Gold Borders) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px'
        }}>
          {/* Frozen Capital Card */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(168, 87, 60, 0.3)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>
                {isEn ? '🥶 Total Frozen Capital' : '🥶 إجمالي رأس المال المجمد'}
              </span>
              <span style={{ fontSize: '22px' }}>💰</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#A8573C', marginTop: '8px' }}>
              {formatMoney(totalFrozenCapital)}
            </div>
            <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700, marginTop: '4px' }}>
              {isEn ? 'Capital tied up in non-moving goods' : 'قيمة البضائع المحتجزة بدون حركة بيع أو سحب'}
            </div>
          </div>

          {/* Stagnant Items Count */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.3)',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>
                {isEn ? '🏷️ Stagnant Items Count' : '🏷️ عدد الأصناف الراكدة'}
              </span>
              <span style={{ fontSize: '22px' }}>📦</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#C29B62', marginTop: '8px' }}>
              {totalDeadItems} <span style={{ fontSize: '14px', color: '#1E130B' }}>{isEn ? 'items' : 'صنف'}</span>
            </div>
            <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700, marginTop: '4px' }}>
              {isEn ? `No outward movement for ${stagnantDays}+ days` : `لم تسجل حركة منصرف منذ أكثر من ${stagnantDays} يوماً`}
            </div>
          </div>
        </div>

        {/* 2. Controls & Filter Bar */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
        }}>
          {/* Search Input */}
          <div style={{ flex: '1 1 260px' }}>
            <input
              type="text"
              placeholder={isEn ? 'Search item name, code, barcode...' : 'ابحث باسم الصنف، الكود، أو الباركود...'}
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

          {/* Stagnant Days Selector */}
          <div style={{ minWidth: '220px' }}>
            <select
              value={stagnantDays}
              onChange={(e) => setStagnantDays(Number(e.target.value))}
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
              <option value={30}>⏳ {isEn ? 'Stagnant > 30 Days (1 Month)' : 'ركود أكثر من 30 يوماً (شهر)'}</option>
              <option value={60}>⏳ {isEn ? 'Stagnant > 60 Days (2 Months)' : 'ركود أكثر من 60 يوماً (شهران)'}</option>
              <option value={90}>⏳ {isEn ? 'Stagnant > 90 Days (3 Months)' : 'ركود أكثر من 90 يوماً (3 أشهر)'}</option>
              <option value={180}>⏳ {isEn ? 'Stagnant > 180 Days (6 Months)' : 'ركود أكثر من 180 يوماً (نصف سنة)'}</option>
              <option value={365}>⏳ {isEn ? 'Stagnant > 365 Days (1 Year)' : 'ركود أكثر من سنة كاملة'}</option>
            </select>
          </div>

          {/* Export Excel Button */}
          <button
            type="button"
            onClick={exportToExcel}
            disabled={filteredItems.length === 0}
            style={{
              minHeight: '44px',
              padding: '10px 18px',
              borderRadius: '12px',
              border: 'none',
              background: filteredItems.length === 0 ? '#e2e8f0' : '#059669',
              color: filteredItems.length === 0 ? '#94a3b8' : '#FFFFFF',
              fontSize: '13px',
              fontWeight: 900,
              cursor: filteredItems.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: filteredItems.length === 0 ? 'none' : '0 4px 14px rgba(5, 150, 105, 0.25)'
            }}
          >
            <span>📊</span>
            <span>{isEn ? 'Export Excel' : 'تصدير إكسل'}</span>
          </button>
        </div>

        {/* 3. Table Section */}
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
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Item Code & Name' : 'كود واسم الصنف'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Stagnant Stock' : 'الكمية الراكدة'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Cost Price' : 'متوسط التكلفة'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Frozen Capital' : 'رأس المال المجمد'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Last Movement' : 'تاريخ آخر منصرف'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900 }}>{isEn ? 'Stagnant Days' : 'أيام الركود'}</th>
                  <th style={{ padding: '14px 16px', fontWeight: 900, textAlign: 'center' }}>{isEn ? 'Actions' : 'إجراءات التنشيط'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px', textAlign: 'center' }}>
                      <LoadingScreen text={isEn ? 'Analyzing stagnant stock...' : 'جارٍ تحليل حركات وسجلات الركود...'} />
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '50px', textAlign: 'center' }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🌟</div>
                      <div style={{ color: '#059669', fontWeight: 900, fontSize: '16px' }}>
                        {isEn ? 'Great! No stagnant inventory detected.' : 'مخزونك نشيط جداً!'}
                      </div>
                      <div style={{ color: '#786c62', marginTop: '4px', fontSize: '13px' }}>
                        {isEn ? `No items exceed ${stagnantDays} days without movement.` : `لا توجد أدوية أو بضائع راكدة تتجاوز ${stagnantDays} يوماً.`}
                      </div>
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
                        <div style={{ fontSize: '11px', color: '#786c62', fontWeight: 700, marginTop: '2px' }}>
                          {item.code ? `كود: ${item.code}` : ''} {item.barcode ? `| باركود: ${item.barcode}` : ''}
                        </div>
                      </td>

                      {/* Stock */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                          {item.qty} {item.unit}
                        </span>
                      </td>

                      {/* Cost */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: '#1E130B' }}>
                        {formatMoney(item.cost)}
                      </td>

                      {/* Frozen Capital */}
                      <td style={{ padding: '14px 16px', fontWeight: 900, color: '#A8573C', fontSize: '13px' }}>
                        {formatMoney(item.frozenCapital)}
                      </td>

                      {/* Last Movement */}
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#786c62' }}>
                        {item.lastMovementDate}
                      </td>

                      {/* Days Since Movement */}
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          background: 'rgba(168, 87, 60, 0.1)',
                          color: '#A8573C',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontWeight: 900,
                          fontSize: '12px'
                        }}>
                          {item.daysSinceLastMovement} يوم
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => openPromoModal(item)}
                            title={isEn ? 'Clearance Promotion' : 'تفعيل عرض تصفية فوري في الكاشير'}
                            style={{
                              minHeight: '34px',
                              padding: '6px 12px',
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

                          <button
                            type="button"
                            onClick={() => openDisposalModal(item)}
                            title={isEn ? 'Inventory Disposal' : 'إتلاف مخزني للبضاعة التالفة أو الميتة'}
                            style={{
                              minHeight: '34px',
                              padding: '6px 12px',
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
                            🗑️ {isEn ? 'Dispose' : 'إتلاف'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Quick Disposal Modal */}
        <AquaModalWrapper
          isOpen={isDisposalModalOpen && !!selectedItemForDisposal}
          onClose={() => setIsDisposalModalOpen(false)}
          title={isEn ? 'Disposal of Stagnant Goods' : 'إتلاف مخزني لبضاعة راكدة'}
          icon="🗑️"
        >
          {selectedItemForDisposal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
              <div style={{
                background: 'rgba(168, 87, 60, 0.08)',
                padding: '14px 18px',
                borderRadius: '14px',
                border: '1.5px solid rgba(168, 87, 60, 0.3)'
              }}>
                <div style={{ fontWeight: 900, color: '#A8573C', fontSize: '15px' }}>
                  {selectedItemForDisposal.name}
                </div>
                <div style={{ fontSize: '12px', color: '#1E130B', marginTop: '4px', fontWeight: 700 }}>
                  الكمية الراكدة: {selectedItemForDisposal.qty} {selectedItemForDisposal.unit} | التكلفة: {formatMoney(selectedItemForDisposal.cost)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Disposal Quantity *' : 'الكمية المراد إتلافها *'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedItemForDisposal.qty}
                  value={disposalQty}
                  onChange={(e) => setDisposalQty(Number(e.target.value) || 0)}
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
                  إجمالي الخسارة المقيدة: {formatMoney(disposalQty * selectedItemForDisposal.cost)}
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Reason / Notes' : 'سبب الإتلاف وملاحظات الضبط'}
                </label>
                <input
                  type="text"
                  value={disposalReason}
                  onChange={(e) => setDisposalReason(e.target.value)}
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
                  disabled={isDisposalLoading}
                  onClick={handleExecuteDisposal}
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
                    cursor: isDisposalLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)'
                  }}
                >
                  {isDisposalLoading ? (isEn ? 'Processing...' : 'جارٍ الإتلاف...') : (isEn ? 'Confirm Disposal & Post 🗑️' : 'تأكيد الإتلاف وتخفيض المخزون 🗑️')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDisposalModalOpen(false)}
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

        {/* 5. Quick Promo Modal */}
        <AquaModalWrapper
          isOpen={isPromoModalOpen && !!selectedItemForPromo}
          onClose={() => setIsPromoModalOpen(false)}
          title={isEn ? 'Clearance Promo for Stagnant Stock' : 'تفعيل عرض تصفية للمخزون الراكد'}
          icon="🎁"
        >
          {selectedItemForPromo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', direction: 'rtl' }}>
              <div style={{
                background: 'rgba(194, 155, 98, 0.1)',
                padding: '14px 18px',
                borderRadius: '14px',
                border: '1.5px solid rgba(194, 155, 98, 0.35)'
              }}>
                <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '15px' }}>
                  {selectedItemForPromo.name}
                </div>
                <div style={{ fontSize: '12px', color: '#1E130B', marginTop: '4px', fontWeight: 700 }}>
                  الكمية الراكدة: {selectedItemForPromo.qty} {selectedItemForPromo.unit} | السعر الحالي: {formatMoney(selectedItemForPromo.suggested_price)}
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
                    value={promoDiscountPercent}
                    onChange={(e) => setPromoDiscountPercent(Number(e.target.value) || 0)}
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
                    {[20, 30, 40, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPromoDiscountPercent(pct)}
                        style={{
                          minHeight: '44px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: promoDiscountPercent === pct ? '2px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.3)',
                          background: promoDiscountPercent === pct ? '#C29B62' : '#FFFFFF',
                          color: promoDiscountPercent === pct ? '#FFFFFF' : '#1E130B',
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                  {isEn ? 'Minimum Quantity' : 'الحد الأدنى للكمية لتطبيق الخصم'}
                </label>
                <input
                  type="number"
                  min={1}
                  value={promoMinQty}
                  onChange={(e) => setPromoMinQty(Number(e.target.value) || 1)}
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
                  disabled={isPromoLoading}
                  onClick={handleExecutePromo}
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
                    cursor: isPromoLoading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)'
                  }}
                >
                  {isPromoLoading ? (isEn ? 'Activating...' : 'جارٍ التفعيل...') : (isEn ? 'Activate Clearance Promo 🎁' : 'تفعيل العرض فورياً في الكاشير 🎁')}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPromoModalOpen(false)}
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
