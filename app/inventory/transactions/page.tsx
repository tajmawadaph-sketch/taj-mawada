"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useInventoryTransactionsLogic } from './transactions_logic';
import MasterPage from '@/components/MasterPage';
import Link from 'next/link';
import SecureAction from '@/components/SecureAction';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import RawasiSmartTable from '@/components/rawasismarttable';
import LoadingScreen from '@/components/LoadingScreen';

import { useExpensesLogic } from '../../expenses/expenses_logic'; 
import ExpenseFormModal from '../../expenses/ExpenseFormModal'; 

import { THEME } from '@/lib/theme';
import { syncAllWarehouseBalances } from '@/lib/inventory_engine';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import InventoryActionModal from '@/components/InventoryActionModal';

const generateBatchNumber = () => {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `BATCH-${ymd}-${rand}`;
};

export default function InventoryTransactionsPage() {
  const router = useRouter();
  const logic = useInventoryTransactionsLogic();
  const expLogic = useExpensesLogic();
  const [mounted, setMounted] = useState(false);

  // 📦 Modals state for inbound goods receipt and expiry details
  const [isInboundModalOpen, setIsInboundModalOpen] = useState(false);
  const [receivingTx, setReceivingTx] = useState<any>(null);
  const [receiptBatchNumber, setReceiptBatchNumber] = useState('');
  const [receiptExpiryDate, setReceiptExpiryDate] = useState('');
  const [receiptProductionDate, setReceiptProductionDate] = useState('');
  const [isReceiptSaving, setIsReceiptSaving] = useState(false);

  useEffect(() => setMounted(true), []);

  const openReceiptModal = (row: any) => {
    setReceivingTx(row);
    setReceiptBatchNumber(row.batch_number || generateBatchNumber());
    setReceiptExpiryDate(row.expiry_date || '');
    setReceiptProductionDate(row.production_date || '');
  };

  const handleConfirmGoodsReceipt = async () => {
    if (!receivingTx) return;
    setIsReceiptSaving(true);
    try {
      await logic.handleConfirmReceipt(receivingTx, {
        batch_number: receiptBatchNumber,
        expiry_date: receiptExpiryDate,
        production_date: receiptProductionDate
      });
      setReceivingTx(null);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsReceiptSaving(false);
    }
  };

  const columns = [
    { key: 'transaction_number', label: 'رقم الحركة', type: 'text',
      render: (row: any) => <span style={{ fontWeight: 900, color: THEME.coffeeDark }}>{row.transaction_number || '-'}</span>
    },
    { key: 'transaction_date', label: 'تاريخ الحركة', type: 'text' },
    { key: 'type', label: 'نوع الحركة', type: 'badge',
      render: (row: any) => {
        if (row.type === 'waste' || row.type === 'damage') {
          return (
            <span style={{ 
              background: '#fee2e2', color: '#991b1b', 
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 
            }}>
              🗑️ تالف / هدر
            </span>
          );
        }
        if (row.type === 'empty_return') {
          return (
            <span style={{ 
              background: '#e0f2fe', color: '#0369a1', 
              border: '1px solid rgba(2, 132, 199, 0.4)',
              padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 
            }}>
              🔄 إرجاع فوارغ
            </span>
          );
        }
        return (
          <span style={{ 
            background: ['in', 'transfer_in'].includes(row.type) ? '#dcfce7' : '#fee2e2', 
            color: ['in', 'transfer_in'].includes(row.type) ? '#166534' : '#991b1b', 
            padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 900 
          }}>
            {['in', 'transfer_in'].includes(row.type) ? '🟢 استلام (In)' : '🔴 صرف (Out)'}
          </span>
        );
      }
    },
    { key: 'item_name', label: 'الصنف', type: 'text',
      render: (row: any) => <span style={{ fontWeight: 900, color: THEME.primary }}>📦 {row.item_name || '-'}</span>
    },
    { key: 'quantity', label: 'الكمية', type: 'number',
      render: (row: any) => (
        <span style={{ fontWeight: 900, color: ['in', 'transfer_in'].includes(row.type) ? '#16a34a' : '#dc2626' }}>
          {['in', 'transfer_in'].includes(row.type) ? '+' : '-'}{row.quantity || 0} <span style={{ fontSize: '10px', color: '#475569' }}>{row.unit || ''}</span>
        </span>
      )
    },
    { key: 'batch_and_expiry', label: 'الدفعة والصلاحية ⏳', type: 'text',
      render: (row: any) => {
        if (!row.batch_number && !row.expiry_date) {
          return <span style={{ color: '#94a3b8', fontSize: '11px' }}>-</span>;
        }

        let daysLeft: number | null = null;
        if (row.expiry_date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const exp = new Date(row.expiry_date);
          exp.setHours(0, 0, 0, 0);
          daysLeft = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              {row.batch_number && (
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#1E130B', background: 'rgba(194, 155, 98, 0.18)', border: '1px solid rgba(194, 155, 98, 0.35)', padding: '1px 6px', borderRadius: '4px', width: 'fit-content' }}>
                  🏷️ {row.batch_number}
                </span>
              )}
              {daysLeft !== null && (
                daysLeft <= 0 ? (
                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#dc2626', background: '#fee2e2', border: '1px solid #f87171', padding: '1px 5px', borderRadius: '4px' }}>
                    ⛔ منتهي
                  </span>
                ) : daysLeft <= 60 ? (
                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#b45309', background: '#fef3c7', border: '1px solid #f59e0b', padding: '1px 5px', borderRadius: '4px' }}>
                    ⏳ {daysLeft} يوم
                  </span>
                ) : (
                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#059669', background: 'rgba(5, 150, 105, 0.12)', border: '1px solid rgba(5, 150, 105, 0.25)', padding: '1px 5px', borderRadius: '4px' }}>
                    ساري ({daysLeft} ي)
                  </span>
                )
              )}
            </div>
            {row.expiry_date && (
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#A8573C' }}>
                📅 انتهاء: {row.expiry_date}
              </span>
            )}
            {row.production_date && (
              <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                🏭 إنتاج: {row.production_date}
              </span>
            )}
          </div>
        );
      }
    },
    { key: 'unit_price', label: 'السعر الإفرادي', type: 'number',
      render: (row: any) => row.unit_price ? <span style={{ fontWeight: 800 }}>{row.unit_price}</span> : '-'
    },
    { key: 'partner', label: 'العميل / المورد', type: 'text',
      render: (row: any) => {
        if (row.partner) {
           let color = '#3b82f6';
           let typeLabel = '';
           if (row.partner_type === 'عميل') { color = '#ef4444'; typeLabel = ' (عميل)'; }
           else if (row.partner_type === 'مورد') { color = '#10b981'; typeLabel = ' (مورد)'; }
           else if (row.partner_type === 'عامل يومية' || row.partner_type === 'مندوب') { color = '#f59e0b'; typeLabel = ` (${row.partner_type})`; }
           else { typeLabel = row.partner_type ? ` (${row.partner_type})` : ''; }
           return <span style={{ color, fontWeight: 900 }}>{row.partner} <span style={{ fontSize: '10px', opacity: 0.8 }}>{typeLabel}</span></span>;
        } else if (row.driver_name && row.driver_name !== 'بدون مندوب') {
           return <span style={{ color: '#f59e0b', fontWeight: 900 }}>{row.driver_name} <span style={{ fontSize: '10px', opacity: 0.8 }}>(مندوب)</span></span>;
        } else {
           return <span style={{ color: '#475569', fontStyle: 'italic' }}>غير محدد</span>;
        }
      }
    },
    { key: 'notes', label: 'ملاحظات', type: 'text',
      render: (row: any) => <span style={{ fontSize: '11px', color: '#64748b' }}>{row.notes || '-'}</span>
    },
    { key: 'fleet_operation', label: 'الرحلة / السيارة', type: 'text',
      render: (row: any) => row.fleet_operation ? <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#0ea5e9' }}>🚚 {row.fleet_operation}</span> : <span style={{ color: '#94a3b8' }}>-</span>
    },
    { key: 'status', label: 'الحالة', type: 'badge',
      render: (row: any) => (
        <span style={{ 
          background: ['approved', 'معتمد', 'مرحل'].includes(row.status) ? '#dcfce7' : '#fef08a', 
          color: ['approved', 'معتمد', 'مرحل'].includes(row.status) ? '#166534' : '#854d0e', 
          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 900 
        }}>
          {['approved', 'معتمد', 'مرحل'].includes(row.status) ? '✅ معتمد' : '⏳ معلق'}
        </span>
      )
    },
    { key: 'actions', label: 'إجراءات', type: 'actions',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['pending', 'مسودة', 'قيد الانتظار'].includes(row.status) && (
            <>
              <button 
                onClick={() => {
                  if (['in', 'transfer_in'].includes(row.type)) {
                    openReceiptModal(row);
                  } else {
                    logic.handleApproveTransaction(row);
                  }
                }}
                className="btn-main-glass"
                style={{ width: 'auto', padding: '5px 12px', fontSize: '11px', margin: 0, background: '#16a34a', color: 'white' }}
              >
                ☑ الاستلام والتوريد للمخزون
              </button>
              <button 
                onClick={() => logic.handleDeleteTransaction(row.id)}
                className="btn-main-glass red"
                style={{ width: 'auto', padding: '5px 12px', fontSize: '11px', margin: 0 }}
              >
                🗑️ حذف
              </button>
            </>
          )}
          {['approved', 'معتمد', 'مرحل'].includes(row.status) && (
            <button 
              onClick={() => logic.handleUnapproveTransaction(row)}
              className="btn-main-glass"
              style={{ background: '#eab308', color: 'white', width: 'auto', padding: '5px 12px', fontSize: '11px', margin: 0 }}
            >
              ↩ إلغاء الاستلام
            </button>
          )}

          

          <button 
            onClick={() => {
               const printWindow = window.open('', '_blank');
               if (printWindow) {
                   printWindow.document.write(`
                       <html dir="rtl">
                       <head>
                           <title>طباعة حركة مستودع</title>
                           <style>
                               body { font-family: 'Tajawal', sans-serif; padding: 40px; color: #0f172a; }
                               .header { text-align: center; border-bottom: 2px solid #ca8a04; padding-bottom: 20px; margin-bottom: 30px; }
                               table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                               th, td { border: 1px solid rgba(40, 145, 200, 0.2); padding: 12px; text-align: right; }
                               th { background: rgba(255, 255, 255, 0.6); color: #451a03; }
                           </style>
                       </head>
                       <body>
                           <div class="header">
                               <h1>سند ${['in', 'transfer_in'].includes(row.type) ? 'استلام (توريد)' : 'صرف'} بضاعة</h1>
                               <h3>رقم الحركة: ${row.transaction_number || '-'}</h3>
                           </div>
                           <table>
                               <tr><th>تاريخ الحركة</th><td>${row.transaction_date || '-'}</td></tr>
                               <tr><th>العميل / المورد</th><td>${row.partner || 'غير محدد'}</td></tr>
                               <tr><th>الصنف</th><td>${row.item_name || '-'}</td></tr>
                               <tr><th>الكمية</th><td>${row.quantity || 0} ${row.unit || ''}</td></tr>
                           </table>
                           <div style="margin-top: 50px; display: flex; justify-content: space-between;">
                               <div>توقيع المستلم: .....................</div>
                               <div>توقيع أمين المستودع: .....................</div>
                           </div>
                           <script>window.print(); setTimeout(() => window.close(), 500);</script>
                       </body>
                       </html>
                   `);
                   printWindow.document.close();
               }
            }}
            className="btn-main-glass white"
            style={{ width: 'auto', padding: '5px 12px', fontSize: '11px', margin: 0 }}
          >
            🖨️ طباعة
          </button>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>إجمالي الحركات:</span>
              <span style={{ fontWeight: 900 }}>{logic.stats?.totalTransactions || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#b45309' }}>
              <span>بانتظار الاعتماد:</span>
              <span style={{ fontWeight: 900 }}>{logic.stats?.pendingCount || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#15803d' }}>
              <span>حركات معتمدة:</span>
              <span style={{ fontWeight: 900 }}>{logic.stats?.approvedCount || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#b91c1c' }}>
              <span>تالف وهدر:</span>
              <span style={{ fontWeight: 900 }}>{logic.stats?.wasteCount || 0}</span>
            </div>
          </div>
        }
        actions={
          <>
            <SecureAction module="inventory" action="create">
              <button 
                type="button" 
                className="btn-main-glass"
                onClick={() => setIsInboundModalOpen(true)}
                style={{ 
                  width: '100%', 
                  background: 'linear-gradient(135deg, #16a34a, #059669)', 
                  color: 'white',
                  fontWeight: 900,
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
              >
                <span>➕</span>
                <span>استلام بضاعة جديدة (توريد)</span>
              </button>
            </SecureAction>

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

            <Link href="/inventory" style={{ textDecoration: 'none', width: '100%' }}>
              <button 
                type="button" 
                className="btn-main-glass"
                style={{ width: '100%' }}
              >
                <span>📦</span>
                <span>دليل الأصناف والمخزون</span>
              </button>
            </Link>
          </>
        }
        watchDeps={[logic.rawRecords?.length, logic.stats?.pendingCount]}
      />

      <MasterPage 
        title="سجل حركة المستودع" 
        subtitle="تتبع كافة عمليات الاستلام والصرف للأصناف"
      >
        {logic.isLoading ? (
          <LoadingScreen message="جاري تحميل سجل الحركات..." fullScreen={false} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ⏳ Pending Alert Banner */}
            {logic.stats?.pendingCount > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.95) 0%, rgba(255, 237, 213, 0.95) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '16px',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>⏳</span>
                  <div>
                    <div style={{ fontWeight: 900, color: '#92400e', fontSize: '14px' }}>
                      تنبيه العمليات: يوجد ({logic.stats.pendingCount}) حركة مخزنية بانتظار الاعتماد وتوليد القيود المالية!
                    </div>
                    <div style={{ fontSize: '12px', color: '#b45309', fontWeight: 700 }}>
                      يُرجى مراجعة الحركات وتأكيد الاعتماد لتحديث أرصدة المستودعات وترحيل اليومية تلقائياً.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logic.handleBulkApprove}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontWeight: 900,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
                    transition: '0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>⚡</span>
                  <span>اعتماد جميع الحركات المعلقة ({logic.stats?.pendingCount})</span>
                </button>
              </div>
            )}

            {/* 📊 Summary Stats Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px'
            }}>
              {/* بطاقة التوالف */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b' }}>خسائر التوالف والهدر</span>
                  <span style={{ fontSize: '20px' }}>🗑️</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#dc2626' }}>
                  {(logic.stats?.wasteCost || 0).toLocaleString()} ر.س
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                  إجمالي الكميات التالفة: {logic.stats?.wasteQty || 0} وحدة
                </div>
              </div>

              {/* بطاقة الفوارغ المسترجعة */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(2, 132, 199, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0369a1' }}>فوارغ الجالونات المسترجعة</span>
                  <span style={{ fontSize: '20px' }}>🔄</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0284c7' }}>
                  {(logic.stats?.emptyReturnQty || 0).toLocaleString()} جالون / عبوة
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                  تم استلامها وإعادتها لدورة التعبئة
                </div>
              </div>

              {/* بطاقة الحركات المعلقة */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '16px',
                padding: '16px',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#92400e' }}>حركات قيد الانتظار</span>
                  <span style={{ fontSize: '20px' }}>⏳</span>
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706' }}>
                  {logic.stats?.pendingCount || 0} حركة
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                  تحتاج اعتماد لتوليد القيود المحاسبية
                </div>
              </div>
            </div>

            {/* لوحة الفلاتر */}
            <div className="apple-glass-filter-bar">
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '11px', color: '#475569', marginBottom: '6px', display: 'block', fontWeight: 900 }}>بحث عام</label>
                <input 
                  type="text"
                  placeholder="بحث برقم الحركة، الصنف، المورد..." 
                  className="glass-input-field" 
                  value={logic.globalSearch} 
                  onChange={e => logic.setGlobalSearch(e.target.value)} 
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#475569', marginBottom: '6px', display: 'block', fontWeight: 900 }}>نوع الحركة</label>
                <select 
                  className="glass-input-field" 
                  value={logic.filterType} 
                  onChange={e => logic.setFilterType(e.target.value)}
                >
                  <option value="all">الكل</option>
                  <option value="in">🟢 استلام (In)</option>
                  <option value="out">🔴 صرف (Out)</option>
                  <option value="waste">🗑️ توالف وهدر (Waste)</option>
                  <option value="empty_return">🔄 استرجاع فوارغ (Empty Return)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#475569', marginBottom: '6px', display: 'block', fontWeight: 900 }}>من تاريخ</label>
                <input 
                  type="date" 
                  className="glass-input-field" 
                  value={logic.dateFrom} 
                  onChange={e => logic.setDateFrom(e.target.value)} 
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#475569', marginBottom: '6px', display: 'block', fontWeight: 900 }}>إلى تاريخ</label>
                <input 
                  type="date" 
                  className="glass-input-field" 
                  value={logic.dateTo} 
                  onChange={e => logic.setDateTo(e.target.value)} 
                />
              </div>
            </div>

            {/* الجدول */}
            <RawasiSmartTable 
              columns={columns}
              data={logic.data}
              pageSize={20}
            />
          </div>
        )}

        {mounted && expLogic.isEditModalOpen && (
            <ExpenseFormModal 
              isOpen={expLogic.isEditModalOpen}
              onClose={() => expLogic.setIsEditModalOpen(false)}
              record={expLogic.currentExpense}
              setRecord={expLogic.setCurrentExpense}
              onSave={expLogic.handleSaveExpense}
              isSaving={expLogic.isLoading}
              historicalData={expLogic.historicalData}
            />
        )}

        {/* 📦 Modal for Confirming Inbound Goods Receipt with Batch & Expiry */}
        {mounted && receivingTx && (
          <AquaModalWrapper
            isOpen={Boolean(receivingTx)}
            onClose={() => setReceivingTx(null)}
            title={`📦 تأكيد استلام وتوريد للمخزون - حركة #${receivingTx.transaction_number || ''}`}
            subtitle="تسجيل رقم التشغيلة وتواريخ الصلاحية وتحديث رصيد الصنف والإنذارات"
            width="560px"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>الصنف:</span>
                  <span style={{ fontWeight: 900, color: '#2C1A12' }}>📦 {receivingTx.item_name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>الكمية المستلمة:</span>
                  <span style={{ fontWeight: 900, color: '#16a34a' }}>{receivingTx.quantity} {receivingTx.unit || ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>الجهة / المورد:</span>
                  <span style={{ fontWeight: 800, color: '#2C1A12' }}>{receivingTx.partner || 'غير محدد'}</span>
                </div>
              </div>

              {/* Batch Number */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 800, color: '#2C1A12' }}>
                    🏷️ رقم الدفعة / التشغيلة (Batch Number)
                  </label>
                  <button
                    type="button"
                    onClick={() => setReceiptBatchNumber(generateBatchNumber())}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#C29B62',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    🔄 توليد رقم تلقائي جديد
                  </button>
                </div>
                <input
                  type="text"
                  className="glass-input-field"
                  value={receiptBatchNumber}
                  onChange={(e) => setReceiptBatchNumber(e.target.value)}
                  placeholder="مثال: BATCH-20260914-1234"
                  dir="ltr"
                  style={{ textAlign: 'left', fontWeight: 900, letterSpacing: '0.5px' }}
                />
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  * تم توليد رقم التشغيلة تلقائياً ويمكنك تعديله يدوياً حسب شحنة التوريد.
                </div>
              </div>

              {/* Expiry Date */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#2C1A12', marginBottom: '6px' }}>
                  ⏳ تاريخ انتهاء الصلاحية (Expiry Date)
                </label>
                <input
                  type="date"
                  className="glass-input-field"
                  value={receiptExpiryDate}
                  onChange={(e) => setReceiptExpiryDate(e.target.value)}
                />
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                  سيتم إدراج هذا التاريخ في منظومة إنذارات الصلاحية التلقائية وتنبيهات الكاشير.
                </div>
              </div>

              {/* Production Date (Optional) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#2C1A12', marginBottom: '6px' }}>
                  📅 تاريخ الإنتاج (اختياري يدوي)
                </label>
                <input
                  type="date"
                  className="glass-input-field"
                  value={receiptProductionDate}
                  onChange={(e) => setReceiptProductionDate(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  disabled={isReceiptSaving}
                  onClick={handleConfirmGoodsReceipt}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: isReceiptSaving ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isReceiptSaving ? '⏳ جاري الحفظ والاعتماد...' : '✅ تأكيد الاستلام والتوريد للمخزون'}
                </button>
                <button
                  type="button"
                  onClick={() => setReceivingTx(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    color: '#64748b',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '12px',
                    padding: '12px 18px',
                    fontWeight: 800,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </AquaModalWrapper>
        )}

        {/* ➕ Modal for Creating New Inbound Movement */}
        {mounted && isInboundModalOpen && (
          <InventoryActionModal
            isOpen={isInboundModalOpen}
            onClose={() => setIsInboundModalOpen(false)}
            actionType="in"
            items={logic.items}
            onSuccess={() => {
              logic.fetchTransactions();
            }}
          />
        )}

        <style>{`
          .apple-glass-filter-bar {
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 20px;
            padding: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            align-items: flex-end;
            box-shadow: 0 8px 32px rgba(0,0,0,0.05);
          }
          .glass-input-field { 
            width: 100%; 
            padding: 10px 12px; 
            border-radius: 12px; 
            background: rgba(255, 255, 255, 0.65); 
            border: 1px solid rgba(255, 255, 255, 0.8); 
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
            outline: none; 
            font-weight: 700; 
            color: #1e293b; 
            transition: all 0.2s; 
          }
          .glass-input-field:focus { 
            background: #ffffff; 
            border-color: ${THEME.accent}; 
            box-shadow: 0 0 0 4px rgba(202, 138, 4, 0.15); 
          }
        `}</style>
      </MasterPage>
    </>
  );
}


