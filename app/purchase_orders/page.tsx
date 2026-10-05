"use client";

import React, { useState, useMemo } from 'react';
import MasterPage from '@/components/MasterPage';
import SecureAction from '@/components/SecureAction';
import LoadingScreen from '@/components/LoadingScreen';
import { useConfirm } from '@/components/ConfirmContext';
import PurchaseOrderModal from './PurchaseOrderModal';
import { usePurchaseOrdersLogic } from './purchase_orders_logic';
import { supabase } from '@/lib/supabase';
import { showGlobalToast } from '@/lib/toast-context';
import { useQuery } from '@tanstack/react-query';
import PurchaseOrderPrintModal from './PurchaseOrderPrintModal';

export default function PurchaseOrdersPage() {
  const logic = usePurchaseOrdersLogic();
  const { showConfirm } = useConfirm();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');

  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['inventory_items_for_po'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory_items').select('*').order('name');
      return data || [];
    }
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(amount || 0);
  };

  // KPIs
  const { totalOrders, pendingOrders, approvedOrders, totalApprovedAmount, totalPendingAmount } = useMemo(() => {
    const list = logic.transactions || [];
    let pending = 0;
    let approved = 0;
    let approvedAmt = 0;
    let pendingAmt = 0;

    list.forEach(t => {
      const isApp = ['approved', 'معتمد', 'مرحل'].includes(t.status);
      if (isApp) {
        approved++;
        approvedAmt += Number(t.total_amount || 0);
      } else {
        pending++;
        pendingAmt += Number(t.total_amount || 0);
      }
    });

    return {
      totalOrders: list.length,
      pendingOrders: pending,
      approvedOrders: approved,
      totalApprovedAmount: approvedAmt,
      totalPendingAmount: pendingAmt
    };
  }, [logic.transactions]);

  // Filtered by status tab
  const displayedTransactions = useMemo(() => {
    return logic.transactions.filter(t => {
      if (statusFilter === 'all') return true;
      const isApp = ['approved', 'معتمد', 'مرحل'].includes(t.status);
      return statusFilter === 'approved' ? isApp : !isApp;
    });
  }, [logic.transactions, statusFilter]);

  return (
    <MasterPage 
      title="إدارة المشتريات وأوامر التوريد وفواتير الموردين" 
      subtitle="دورة المشتريات الكاملة: طلبات الشراء، الاستلام المخزني ومطابقة الكميات، وتحديث متوسط التكلفة المرجح (WAC)" 
      icon="🛒"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '60px' }}>
        
        {/* Responsive style & Luxury Tokens */}
        <style>{`
          .po-kpi-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
            gap: 14px;
          }
          .po-card-luxury {
            background: #FFFFFF;
            border: 1px solid rgba(194, 155, 98, 0.25);
            border-radius: 18px;
            padding: 20px 24px;
            box-shadow: 0 4px 20px rgba(30, 19, 11, 0.04);
            transition: all 0.25s ease;
          }
          .po-card-luxury:hover {
            transform: translateY(-2px);
            border-color: rgba(194, 155, 98, 0.45);
          }
          .po-btn-primary {
            background: linear-gradient(135deg, #C29B62 0%, #A88348 100%);
            color: #FFFFFF;
            border: none;
            padding: 10px 22px;
            border-radius: 12px;
            font-weight: 900;
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 14px rgba(194, 155, 98, 0.28);
            min-height: 44px;
            transition: all 0.2s;
          }
          .po-btn-primary:hover {
            transform: translateY(-1.5px);
            filter: brightness(1.05);
          }
          .po-action-btn {
            padding: 6px 12px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 800;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            min-height: 34px;
            transition: all 0.2s;
            border: 1px solid transparent;
          }
          .po-action-btn:hover {
            transform: translateY(-1px);
          }
          @media (max-width: 768px) {
            .po-kpi-grid { grid-template-columns: 1fr 1fr !important; }
            .po-toolbar { flex-direction: column !important; align-items: stretch !important; }
          }
        `}</style>

        {/* 1. Header Toolbar */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '20px',
          padding: '18px 24px',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }} className="po-toolbar">
          {/* Search box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="ابحث برقم الأمر، المورد، أو اسم الصنف..."
              value={logic.searchQuery}
              onChange={(e) => logic.setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 700,
                fontSize: '13px',
                minHeight: '44px',
                outline: 'none'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <SecureAction module="inventory" action="create">
              <button
                onClick={() => {
                  logic.setEditingTransaction(null);
                  logic.setIsActionModalOpen(true);
                }}
                className="po-btn-primary"
              >
                <span>➕ إنشاء أمر شراء جديد</span>
              </button>
            </SecureAction>
          </div>
        </div>

        {/* 2. Top Luxury KPI Cards */}
        <div className="po-kpi-grid">
          {/* Total POs */}
          <div className="po-card-luxury">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي أوامر الشراء</span>
              <span style={{ fontSize: '20px' }}>📦</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
              {totalOrders}
            </div>
            <div style={{ fontSize: '11px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
              سجلات التوريد المسجلة
            </div>
          </div>

          {/* Pending / Under Receiving */}
          <div className="po-card-luxury" style={{ borderColor: 'rgba(194, 155, 98, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#8c6b32' }}>قيد الاستلام والمطابقة</span>
              <span style={{ fontSize: '20px' }}>⏳</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#C29B62', marginTop: '8px' }}>
              {pendingOrders}
            </div>
            <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
              بقيمة {formatCurrency(totalPendingAmount)}
            </div>
          </div>

          {/* Approved & Received in Warehouse */}
          <div className="po-card-luxury" style={{ borderColor: 'rgba(5, 150, 105, 0.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>مستلم ومعتمد بالمستودع</span>
              <span style={{ fontSize: '20px' }}>✅</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '8px' }}>
              {approvedOrders}
            </div>
            <div style={{ fontSize: '11px', color: '#047857', marginTop: '4px', fontWeight: 700 }}>
              مرحل للمخزون والقيود المحاسبية
            </div>
          </div>

          {/* Total Approved Spend */}
          <div className="po-card-luxury" style={{ borderColor: 'rgba(30, 19, 11, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1E130B' }}>إجمالي المشتريات المعتمدة</span>
              <span style={{ fontSize: '20px' }}>💰</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
              {formatCurrency(totalApprovedAmount)}
            </div>
            <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
              محدث لمتوسط التكلفة (WAC)
            </div>
          </div>
        </div>

        {/* 3. Filter Status Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          borderBottom: '2px solid rgba(194, 155, 98, 0.2)',
          paddingBottom: '10px'
        }}>
          {[
            { id: 'all', label: `كافة الأوامر (${totalOrders})`, icon: '📋' },
            { id: 'pending', label: `قيد الاستلام بالمستودع (${pendingOrders})`, icon: '⏳' },
            { id: 'approved', label: `أوامر مستلمة ومعتمدة (${approvedOrders})`, icon: '✅' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              style={{
                padding: '8px 18px',
                borderRadius: '12px',
                border: 'none',
                background: statusFilter === tab.id ? '#1E130B' : '#FDFBF7',
                color: statusFilter === tab.id ? '#FFFFFF' : '#6e5d4f',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '40px',
                transition: 'all 0.2s'
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 4. Table Section */}
        {logic.isLoading ? (
          <LoadingScreen message="جاري تحميل سجلات أوامر الشراء..." fullScreen={false} />
        ) : (
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
          }}>
            <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                  <tr>
                    <th style={{ padding: '14px 16px', color: '#8c6b32', fontWeight: 900 }}>رقم الأمر</th>
                    <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>تاريخ التوريد</th>
                    <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>المورد (الشريك)</th>
                    <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>الأصناف والكميات</th>
                    <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>الإجمالي (شامل الضريبة)</th>
                    <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>حالة الاستلام</th>
                    <th style={{ padding: '14px 16px', color: '#8c6b32', fontWeight: 900, textAlign: 'center' }}>إجراءات دورة الشراء</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                        لا توجد أوامر شراء تطابق معايير البحث الحالية.
                      </td>
                    </tr>
                  ) : (
                    displayedTransactions.map((row: any, idx: number) => {
                      const isApproved = ['approved', 'معتمد', 'مرحل'].includes(row.status);
                      return (
                        <tr
                          key={row.id || idx}
                          style={{
                            borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                            background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                          }}
                        >
                          {/* Transaction Number */}
                          <td style={{ padding: '14px 16px', fontWeight: 800, color: '#8c6b32', fontFamily: 'monospace', fontSize: '13px' }}>
                            {row.transaction_number}
                          </td>

                          {/* Date */}
                          <td style={{ padding: '14px 16px', color: '#6e5d4f', fontWeight: 700 }}>
                            {new Date(row.transaction_date).toLocaleDateString('ar-SA')}
                          </td>

                          {/* Supplier */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ fontWeight: 900, color: '#1E130B' }}>{row.partners?.name || 'مورد عام'}</div>
                          </td>

                          {/* Items */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {row.items?.map((item: any, i: number) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 800, color: '#1E130B' }}>{item.inventory_items?.name}</span>
                                  <span style={{ fontSize: '11px', color: '#8c6b32', background: 'rgba(194, 155, 98, 0.12)', padding: '1px 6px', borderRadius: '6px' }}>
                                    {item.quantity} {item.inventory_items?.unit || 'حبة'} × {formatCurrency(item.unit_price)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Total Amount */}
                          <td style={{ padding: '14px 16px', fontWeight: 900, color: '#059669', fontSize: '14px' }}>
                            {formatCurrency(row.total_amount)}
                          </td>

                          {/* Status Badge */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 12px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 900,
                              background: isApproved ? 'rgba(5, 150, 105, 0.12)' : 'rgba(194, 155, 98, 0.15)',
                              color: isApproved ? '#059669' : '#8c6b32',
                              border: isApproved ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(194, 155, 98, 0.35)'
                            }}>
                              {isApproved ? 'مستلم ومعتمد ✅' : 'قيد الاستلام ⏳'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              
                              {/* If Pending: Approve & Intake, Edit, Print, Delete */}
                              {!isApproved && (
                                <>
                                  <SecureAction module="inventory" action="post">
                                    <button
                                      onClick={() => {
                                        showConfirm({
                                          title: 'اعتماد واستلام أمر الشراء بالمستودع',
                                          message: `هل تؤكد استلام بضاعة أمر الشراء #${row.transaction_number}؟ سيتم إضافة الكميات للمستودع، وتحديث متوسط التكلفة المرجح (WAC)، وتوليد قيد اليومية آلياً.`,
                                          type: 'warning',
                                          confirmText: 'اعتماد واستلام ✅',
                                          cancelText: 'إلغاء',
                                          onConfirm: () => logic.handleApproveTransaction(row)
                                        });
                                      }}
                                      className="po-action-btn"
                                      style={{ background: '#059669', color: '#FFFFFF', fontWeight: 900 }}
                                      title="اعتماد استلام البضاعة في المستودع وتحديث متوسط التكلفة المرجح وقيد اليومية"
                                    >
                                      ✅ استلام واعتماد
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="edit">
                                    <button
                                      onClick={() => {
                                        logic.setEditingTransaction(row);
                                        logic.setIsActionModalOpen(true);
                                      }}
                                      className="po-action-btn"
                                      style={{ background: '#FDFBF7', color: '#1E130B', border: '1px solid rgba(194, 155, 98, 0.35)' }}
                                    >
                                      ✏️ تعديل
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="view">
                                    <button
                                      onClick={() => logic.setPrintingTransaction(row)}
                                      className="po-action-btn"
                                      style={{ background: '#FDFBF7', color: '#1E130B', border: '1px solid rgba(194, 155, 98, 0.35)' }}
                                    >
                                      🖨️ طباعة
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="delete">
                                    <button
                                      onClick={() => {
                                        showConfirm({
                                          title: 'تأكيد حذف أمر الشراء',
                                          message: `هل أنت متأكد من حذف أمر الشراء #${row.transaction_number} نهائياً؟`,
                                          type: 'danger',
                                          confirmText: 'حذف نهائي',
                                          cancelText: 'تراجع',
                                          onConfirm: async () => {
                                            await supabase.from('inventory_transactions').delete().in('id', row.ids);
                                            logic.fetchTransactions();
                                            showGlobalToast('تم حذف أمر الشراء بنجاح', 'info');
                                          }
                                        });
                                      }}
                                      className="po-action-btn"
                                      style={{ background: 'rgba(168, 87, 60, 0.1)', color: '#A8573C', border: '1px solid rgba(168, 87, 60, 0.3)' }}
                                    >
                                      🗑️ حذف
                                    </button>
                                  </SecureAction>
                                </>
                              )}

                              {/* If Approved: Print, Entitlement, Payment Voucher, Unapprove */}
                              {isApproved && (
                                <>
                                  <SecureAction module="inventory" action="view">
                                    <button
                                      onClick={() => logic.setPrintingTransaction(row)}
                                      className="po-action-btn"
                                      style={{ background: '#FDFBF7', color: '#1E130B', border: '1px solid rgba(194, 155, 98, 0.35)' }}
                                    >
                                      🖨️ طباعة
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="post">
                                    <button
                                      onClick={() => logic.handleCreateEntitlement(row)}
                                      className="po-action-btn"
                                      style={{ background: 'rgba(194, 155, 98, 0.15)', color: '#8c6b32', border: '1px solid rgba(194, 155, 98, 0.35)' }}
                                      title="إنشاء سند استحقاق مالي لمورد البضاعة في قيود المصروفات"
                                    >
                                      🧾 استحقاق مصروف
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="create">
                                    <button
                                      onClick={() => window.location.href = '/PaymentVouchers'}
                                      className="po-action-btn"
                                      style={{ background: 'rgba(5, 150, 105, 0.12)', color: '#059669', border: '1px solid rgba(5, 150, 105, 0.3)' }}
                                      title="صرف دفعة نقدية أو بنكية للمورد عبر سندات الصرف"
                                    >
                                      💸 سند صرف
                                    </button>
                                  </SecureAction>

                                  <SecureAction module="inventory" action="post">
                                    <button
                                      onClick={() => {
                                        showConfirm({
                                          title: 'تأكيد إلغاء استلام أمر الشراء',
                                          message: `هل أنت متأكد من إلغاء الاستلام لأمر الشراء #${row.transaction_number}؟ سيتم خصم الكميات من المستودع وعكس القيد المحاسبي.`,
                                          type: 'danger',
                                          confirmText: 'إلغاء الاستلام',
                                          cancelText: 'تراجع',
                                          onConfirm: () => logic.handleUnapproveTransaction(row)
                                        });
                                      }}
                                      className="po-action-btn"
                                      style={{ background: 'rgba(168, 87, 60, 0.1)', color: '#A8573C', border: '1px solid rgba(168, 87, 60, 0.3)' }}
                                    >
                                      ↩ إلغاء الاستلام
                                    </button>
                                  </SecureAction>
                                </>
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
          </div>
        )}

        {/* Purchase Order Create/Edit Modal */}
        <PurchaseOrderModal 
          isOpen={logic.isActionModalOpen}
          onClose={() => {
            logic.setIsActionModalOpen(false);
            logic.setEditingTransaction(null);
          }}
          items={inventoryItems}
          initialData={logic.editingTransaction}
          onSuccess={() => logic.fetchTransactions()}
        />

        {/* Purchase Order Official Print Modal */}
        <PurchaseOrderPrintModal
          isOpen={!!logic.printingTransaction}
          onClose={() => logic.setPrintingTransaction(null)}
          record={logic.printingTransaction}
        />
      </div>
    </MasterPage>
  );
}