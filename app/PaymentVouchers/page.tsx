// @ts-nocheck
"use client";
import React, { useState, useEffect, useMemo } from 'react'; 
import { createPortal } from 'react-dom'; 
import { usePaymentVouchersLogic } from './payment_vouchers_logic';
import SmartCombo from '@/components/SmartCombo'; 
import { formatCurrency, formatDate } from '@/lib/helpers';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import RawasiSmartTable from '@/components/rawasismarttable';
import { useConfirm } from '@/components/ConfirmContext';
import PaymentVoucherModal from './PaymentVoucherModal'; 
import PaymentPrintModal from './PaymentPrintModal'; 
import LoadingScreen from '@/components/LoadingScreen';

export default function PaymentVouchersPage() {
  const { showConfirm } = useConfirm();
  const logic = usePaymentVouchersLogic();

  // Keyboard shortcut: Alt+N for new voucher
  useEffect(() => {
    const handleAddShortcut = (e: KeyboardEvent) => {
      if (!logic.state.isEditModalOpen && e.altKey && (e.code === 'KeyN' || e.key.toLowerCase() === 'n' || e.key === 'ى')) {
        e.preventDefault();
        logic.actions.handleAddNew();
      }
    };
    window.addEventListener('keydown', handleAddShortcut);
    return () => window.removeEventListener('keydown', handleAddShortcut);
  }, [logic.state.isEditModalOpen]);

  const [mounted, setMounted] = useState(false); 
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printData, setPrintData] = useState(null);

  useEffect(() => setMounted(true), []);

  const allFilteredIds = useMemo(() => {
    return logic.data.map((v: any) => String(v.id));
  }, [logic.data]);

  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id: string) => logic.state.selectedIds.includes(id));

  // Table Columns
  const voucherColumns = useMemo(() => [
    {
      header: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input 
                  type="checkbox" 
                  checked={isAllSelected}
                  title="تحديد كل السجلات"
                  onChange={() => {
                      if (isAllSelected) {
                          logic.actions.setSelectedIds(logic.state.selectedIds.filter((id: string) => !allFilteredIds.includes(id)));
                      } else {
                          logic.actions.setSelectedIds([...new Set([...logic.state.selectedIds, ...allFilteredIds])]);
                      }
                  }}
                  style={{ width: '16px', height: '16px', accentColor: '#C29B62', cursor: 'pointer' }}
              />
          </div>
      ), 
      accessor: 'id',
      render: (row: any) => {
        if (!row) return null;
        const isSelected = logic.state.selectedIds.includes(String(row.id));
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center' }}>
              <input 
                  type="checkbox" 
                  checked={isSelected} 
                  onChange={(e) => {
                      e.stopPropagation();
                      if (isSelected) logic.actions.setSelectedIds(logic.state.selectedIds.filter((i: any) => i !== String(row.id))); 
                      else logic.actions.setSelectedIds([...logic.state.selectedIds, String(row.id)]); 
                  }} 
                  style={{ width: '16px', height: '16px', accentColor: '#C29B62', cursor: 'pointer' }}
              />
          </div>
        );
      }
    },
    { 
      header: 'رقم السند', 
      accessor: 'voucher_number', 
      render: (row: any) => row ? (
        <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
          #{row.voucher_number}
        </div>
      ) : null 
    },
    { 
      header: 'التاريخ', 
      accessor: 'date', 
      render: (row: any) => row ? <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 700 }}>{formatDate(row.date)}</span> : null 
    },
    { 
      header: 'المستفيد / جهة الصرف', 
      accessor: 'payee_name', 
      render: (row: any) => row ? (
        <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
          👤 {row.payee?.name || row.payee_name || 'جهة غير محددة'}
        </div>
      ) : null 
    },
    { 
      header: 'طريقة الصرف', 
      accessor: 'payment_method', 
      render: (row: any) => {
        if (!row) return null;
        const method = row.payment_method || 'نقدي';
        const isBank = method.includes('بنك') || method.includes('تحويل') || method.includes('شبكة') || method.includes('مدى');
        return (
          <span style={{
            background: isBank ? 'rgba(30, 19, 11, 0.06)' : 'rgba(194, 155, 98, 0.12)',
            color: isBank ? '#1E130B' : '#8c6b32',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 800
          }}>
            {isBank ? '🏦 ' : '💵 '}{method}
          </span>
        );
      }
    },
    { 
      header: 'حساب الخزينة (دائن)', 
      accessor: 'credit_account_id', 
      render: (row: any) => row ? (
        <span style={{ fontSize: '11px', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', padding: '4px 8px', borderRadius: '6px', color: '#1E130B', fontWeight: 800 }}>
          🏦 {row.credit_account?.name || 'الخزينة الرئيسية'} 
        </span>
      ) : null 
    },
    { 
      header: 'حساب التوجيه (مدين)', 
      accessor: 'debit_account_id', 
      render: (row: any) => row ? (
        <span style={{ fontSize: '11px', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', padding: '4px 8px', borderRadius: '6px', color: '#1E130B', fontWeight: 800 }}>
          🧾 {row.debit_account?.name || 'حساب المصروف/المورد'}
        </span>
      ) : null 
    },
    { 
      header: 'البيان', 
      accessor: 'description', 
      render: (row: any) => row ? (
        <span style={{ fontSize: '12px', color: '#64748b', maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>
          {row.description || row.notes || '---'}
        </span>
      ) : null 
    },
    { 
      header: 'المبلغ المصروف', 
      accessor: 'amount', 
      render: (row: any) => row ? <span style={{ color: '#A8573C', fontWeight: 900, fontSize: '15px' }}>{formatCurrency(row.amount)}</span> : null 
    },
    {
      header: 'الحالة',
      accessor: 'is_posted',
      render: (row: any) => {
        if (!row) return null;
        const isPosted = row.is_posted === true || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(row.status || '').trim().toLowerCase());
        return (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 900,
            background: isPosted ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)',
            color: isPosted ? '#059669' : '#b45309',
            border: isPosted ? '1px solid rgba(5, 150, 105, 0.25)' : '1px solid rgba(217, 119, 6, 0.25)'
          }}>
            <span>{isPosted ? '● مرحل بالدفاتر' : '○ مسودة قيد التدقيق'}</span>
          </div>
        );
      }
    },
    {
      header: 'الإجراءات',
      accessor: 'actions',
      render: (row: any) => {
        if (!row) return null;
        const isPosted = row.is_posted === true || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(row.status || '').trim().toLowerCase());
        return (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            {/* Quick Print button */}
            <button 
              type="button"
              onClick={() => { setPrintData(row); setIsPrintModalOpen(true); }} 
              style={{ 
                background: '#FFFFFF', 
                border: '1px solid rgba(194, 155, 98, 0.35)', 
                color: '#1E130B',
                padding: '5px 10px', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                fontSize: '11px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="طباعة السند"
            >
              <span>🖨️ طباعة</span>
            </button>

            {/* Quick Post / Unpost button */}
            {isPosted ? (
              <button
                type="button"
                disabled={logic.actions.isProcessing}
                onClick={() => logic.actions.handleUnpostSingle(row.id)}
                style={{
                  background: 'rgba(217, 119, 6, 0.1)',
                  color: '#b45309',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                title="فك الترحيل"
              >
                ↩️ فك
              </button>
            ) : (
              <button
                type="button"
                disabled={logic.actions.isProcessing}
                onClick={() => logic.actions.handlePostSingle(row.id)}
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                title="اعتماد وترحيل"
              >
                🚀 ترحيل
              </button>
            )}

            {/* Edit */}
            {!isPosted && (
              <button 
                type="button"
                style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.25)',
                  color: '#8c6b32',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                onClick={() => logic.actions.handleEditRow(row)}
                title="تعديل السند"
              >
                ✏️
              </button>
            )}

            {/* Delete */}
            {!isPosted && (
              <button 
                type="button"
                style={{
                  background: '#fef2f2',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  showConfirm({
                    title: 'حذف سند الصرف',
                    message: `هل أنت متأكد من حذف سند الصرف رقم (#${row.voucher_number}) بمبلغ (${formatCurrency(row.amount)}) نهائياً؟`,
                    type: 'danger',
                    onConfirm: () => logic.actions.handleDeleteSingle(row.id)
                  });
                }}
                title="حذف السند"
              >
                🗑️
              </button>
            )}
          </div>
        );
      }
    }
  ], [logic.state.selectedIds, isAllSelected, allFilteredIds, logic.actions]);

  return (
    <MasterPage
      icon="📤"
      title="إدارة سندات الصرف والمدفوعات (Payment Vouchers)"
      subtitle="توثيق المدفوعات النقدية والبنكية للموردين والمصروفات والعهد، وترحيل القيود آلياً"
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
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
          }
          .filter-pill-btn {
            padding: 8px 16px;
            border-radius: 50px;
            font-weight: 800;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
          }
          @media (max-width: 768px) {
            .pv-kpi-grid { grid-template-columns: 1fr !important; }
            .pv-toolbar-row { flex-direction: column !important; }
          }
        `}</style>

        <PrintHeader
          title="كشف سندات الصرف والمدفوعات المالية"
          subtitle={`تاريخ الكشف: ${new Date().toLocaleDateString('ar-SA')}`}
        />

        {/* 1. Header Toolbar */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '22px 26px',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #A8573C 0%, #C29B62 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: '24px',
                boxShadow: '0 4px 14px rgba(168, 87, 60, 0.35)'
              }}>
                📤
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                  سندات الصرف والمدفوعات
                </h2>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  صرف مستحقات الموردين، تسليم سلف وعهد العمل، والمصروفات الإدارية والتشغيلية
                </p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={logic.actions.handleAddNew}
                style={{
                  padding: '10px 22px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(194, 155, 98, 0.35)',
                  minHeight: '44px'
                }}
              >
                <span>➕ إصدار سند صرف جديد</span>
                <span style={{ fontSize: '10px', opacity: 0.8 }}>(Alt+N)</span>
              </button>

              <button
                type="button"
                onClick={logic.actions.exportToExcel}
                disabled={logic.data.length === 0}
                style={{
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(194, 155, 98, 0.35)',
                  background: '#FFFFFF',
                  color: '#1E130B',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '44px'
                }}
              >
                <span>تصدير إكسيل</span>
                <span>📑</span>
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="pv-toolbar-row" style={{
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
                placeholder="بحث برقم السند، المستفيد، الحساب، أو البيان..."
                value={logic.state.globalSearch}
                onChange={(e) => logic.actions.setGlobalSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 18px 11px 38px',
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

            {/* Status Tabs */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {['الكل', 'معتمد', 'معلق'].map(type => (
                <button
                  key={type}
                  type="button"
                  className="filter-pill-btn"
                  onClick={() => logic.actions.setFilterStatus(type)}
                  style={{
                    background: logic.state.filterStatus === type ? '#1E130B' : '#FDFBF7',
                    color: logic.state.filterStatus === type ? '#FDFBF7' : '#1E130B',
                    border: logic.state.filterStatus === type ? '1px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.3)'
                  }}
                >
                  {type === 'معتمد' ? 'معتمد ✅' : (type === 'معلق' ? 'معلق ⏳' : 'كافة السندات')}
                </button>
              ))}
            </div>
          </div>

          {/* Batch Actions Bar (When rows selected) */}
          {logic.state.selectedIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 18px',
              borderRadius: '12px',
              background: '#FDFBF7',
              border: '1.5px solid #C29B62',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                تم تحديد ({logic.state.selectedIds.length}) سند صرف
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={logic.actions.handlePostSelected}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#059669',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🚀 اعتماد وترحيل للدفاتر
                </button>
                <button
                  type="button"
                  onClick={logic.actions.handleUnpostSelected}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '8px',
                    border: '1px solid #b45309',
                    background: '#FFFFFF',
                    color: '#b45309',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  ↩️ فك الترحيل
                </button>
                <button
                  type="button"
                  onClick={() => logic.actions.setIsBulkFixModalOpen(true)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '8px',
                    border: '1px solid #8c6b32',
                    background: '#FFFFFF',
                    color: '#8c6b32',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🛠️ تصحيح التوجيه
                </button>
                <button
                  type="button"
                  onClick={() => {
                    showConfirm({
                      title: 'حذف السجلات نهائياً',
                      message: `هل أنت متأكد من حذف عدد (${logic.state.selectedIds.length}) سند صرف بشكل نهائي؟`,
                      type: 'danger',
                      onConfirm: () => logic.actions.handleDeleteSelected()
                    });
                  }}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '8px',
                    border: '1px solid #ef4444',
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ حذف نهائي
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. Luxury KPI Cards */}
        <div className="pv-kpi-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px'
        }}>
          {/* KPI 1: Total Amount */}
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
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>إجمالي المدفوعات 📤</span>
              <span style={{ fontSize: '20px' }}>💸</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#A8573C', margin: '8px 0 4px 0' }}>
              {formatCurrency(logic.totals.totalAmount)}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              إجمالي {logic.totals.count} سند صرف مسجل
            </div>
          </div>

          {/* KPI 2: Server Posted Amount */}
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
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>المعتمد والمرحل للدفاتر ✅</span>
              <span style={{ fontSize: '20px' }}>📖</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', margin: '8px 0 4px 0' }}>
              {formatCurrency(logic.totals.serverTotalPosted)}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              مقيد ومخصوم من الخزينة والبنوك
            </div>
          </div>

          {/* KPI 3: Server Pending Amount */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '18px',
            padding: '20px 22px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#b45309' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#b45309' }}>سندات معلقة قيد التدقيق ⏳</span>
              <span style={{ fontSize: '20px' }}>⚖️</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#b45309', margin: '8px 0 4px 0' }}>
              {formatCurrency(logic.totals.serverTotalPending)}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              بانتظار الاعتماد المالي النهائي
            </div>
          </div>

          {/* KPI 4: Fleet Operations & Custody */}
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
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#8c6b32' }}>رحلات الأسطول المفتوحة 🚚</span>
              <span style={{ fontSize: '20px' }}>🚐</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
              {logic.state.fleetOperations.length} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>رحلة</span>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
              متاحة لربط عهد ومصروفات الوقود
            </div>
          </div>
        </div>

        {/* 3. Table Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
          overflow: 'hidden'
        }}>
          {logic.isLoading ? (
            <LoadingScreen message="جاري مزامنة سندات الصرف..." fullScreen={false} />
          ) : (
            <div>
              <RawasiSmartTable 
                data={logic.data}
                columns={voucherColumns} 
                onRowClick={(row) => { setPrintData(row); setIsPrintModalOpen(true); }}
                enablePagination={true}
                currentPage={logic.state.currentPage}
                totalItems={logic.data.length}
                rowsPerPage={logic.state.rowsPerPage}
                onPageChange={logic.actions.setCurrentPage}
                onRowsChange={logic.actions.setRowsPerPage}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bulk Fix Modal */}
      {mounted && logic.state.isBulkFixModalOpen && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(30, 19, 11, 0.7)', backdropFilter: 'blur(8px)', padding: '20px', direction: 'rtl' }}>
              <div style={{ background: '#FFFFFF', borderRadius: '24px', width: '100%', maxWidth: '550px', padding: '35px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', border: '1px solid rgba(194, 155, 98, 0.3)' }}>
                  <h3 style={{ margin: '0 0 10px 0', color: '#1E130B', fontWeight: 900, fontSize: '20px' }}>
                    🛠️ تصحيح التوجيه المحاسبي لـ ({logic.state.selectedIds.length}) سند
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '25px', fontWeight: 700 }}>
                    تعديل الحساب المدين أو الدائن للسندات غير المرحلة دفعة واحدة
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <SmartCombo 
                          label="🧾 الحساب المدين الجديد (الطرف المستفيد / المصروف)" 
                          table="accounts" 
                          displayCol="name" 
                          initialDisplay={logic.state.bulkFixAccounts.debit_account_name} 
                          onSelect={(val: any) => {
                              logic.actions.setBulkFixAccounts({
                                  ...logic.state.bulkFixAccounts, 
                                  debit_account_name: val?.name || '',
                                  debit_account_id: val?.id || null 
                              });
                          }} 
                          strict={true} 
                      />
                      <SmartCombo 
                          label="🏦 الحساب الدائن الجديد (الخزينة أو البنك)" 
                          table="accounts" 
                          displayCol="name" 
                          initialDisplay={logic.state.bulkFixAccounts.credit_account_name} 
                          onSelect={(val: any) => {
                              logic.actions.setBulkFixAccounts({
                                  ...logic.state.bulkFixAccounts, 
                                  credit_account_name: val?.name || '',
                                  credit_account_id: val?.id || null 
                              });
                          }} 
                          strict={true} 
                      />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '35px' }}>
                      <button 
                        onClick={logic.actions.handleBulkFixSave} 
                        disabled={logic.isLoading} 
                        style={{ 
                          flex: 2, 
                          padding: '14px', 
                          borderRadius: '12px', 
                          background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', 
                          color: '#FFFFFF', 
                          fontWeight: 900, 
                          border: 'none', 
                          cursor: 'pointer' 
                        }}
                      >
                          {logic.isLoading ? '⏳ جاري الحفظ...' : '✅ تطبيق التعديلات'}
                      </button>
                      <button 
                        onClick={() => logic.actions.setIsBulkFixModalOpen(false)} 
                        style={{ 
                          flex: 1, 
                          padding: '14px', 
                          borderRadius: '12px', 
                          border: '1px solid rgba(194, 155, 98, 0.25)', 
                          background: '#FDFBF7', 
                          color: '#64748b', 
                          fontWeight: 900, 
                          cursor: 'pointer' 
                        }}
                      >
                        إلغاء
                      </button>
                  </div>
              </div>
          </div>,
          document.body
      )}

      {/* Edit / Add Modal */}
      {mounted && logic.state.isEditModalOpen && (
          <PaymentVoucherModal 
              isOpen={logic.state.isEditModalOpen} 
              onClose={() => logic.actions.setIsEditModalOpen(false)} 
              record={logic.state.currentVoucher} 
              setRecord={logic.actions.setCurrentVoucher}
              onSave={logic.actions.handleSaveVoucher}
              isSaving={logic.isLoading}
              partnerBalance={logic.state.partnerBalance}
              isBalanceLoading={logic.state.isBalanceLoading}
              fleetOperations={logic.state.fleetOperations}
          />
      )}

      {/* Print Modal with QR */}
      {mounted && isPrintModalOpen && (
          <PaymentPrintModal 
            isOpen={isPrintModalOpen} 
            onClose={() => setIsPrintModalOpen(false)} 
            record={printData} 
          />
      )}
    </MasterPage>
  );
}
