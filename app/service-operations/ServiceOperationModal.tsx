"use client";
import React, { useState } from 'react';
import { THEME } from '@/lib/theme';
import { SERVICE_TYPES } from './service_operations_logic';
import { formatCurrency } from '@/lib/helpers';
import { showGlobalToast } from '@/lib/toast-context';

interface ServiceOperationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<any>;
    clients: any[];
    employees: any[];
    isSaving: boolean;
}

export default function ServiceOperationModal({
    isOpen,
    onClose,
    onSave,
    clients,
    employees,
    isSaving
}: ServiceOperationModalProps) {
    const [operationDate, setOperationDate] = useState(new Date().toISOString().split('T')[0]);
    const [operationType, setOperationType] = useState('إدارة وتشغيل');
    const [description, setDescription] = useState('');
    const [clientId, setClientId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [totalAmount, setTotalAmount] = useState<string>('');
    const [hasCommission, setHasCommission] = useState(false);
    const [commissionPercentage, setCommissionPercentage] = useState<string>('20');
    const [paymentChannel, setPaymentChannel] = useState<'cash' | 'bank' | 'credit'>('cash');

    if (!isOpen) return null;

    const numAmount = parseFloat(totalAmount) || 0;
    const numPercent = hasCommission ? (parseFloat(commissionPercentage) || 0) : 0;
    const commissionAmount = hasCommission ? (numAmount * numPercent) / 100 : 0;
    const netProfit = numAmount - commissionAmount;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!description.trim()) {
            showGlobalToast('يرجى كتابة تفاصيل وبيان العملية', 'warning');
            return;
        }
        if (numAmount <= 0) {
            showGlobalToast('يرجى إدخال مبلغ صحيح للعملية', 'warning');
            return;
        }
        if (hasCommission && !employeeId) {
            showGlobalToast('يرجى اختيار الموظف/المندوب المستحق للعمولة', 'warning');
            return;
        }

        await onSave({
            operation_date: operationDate,
            operation_type: operationType,
            description: description.trim(),
            client_id: clientId || null,
            employee_id: employeeId || null,
            total_amount: numAmount,
            commission_percentage: numPercent,
            payment_channel: paymentChannel
        });
    };

    return (
        <div 
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(18, 41, 70, 0.65)',
                backdropFilter: 'blur(16px) saturate(180%)',
                zIndex: 999999,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '16px',
                overflowY: 'auto'
            }}
            onClick={onClose}
        >
            <div 
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(40px) saturate(200%)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    borderRadius: '24px',
                    width: '100%',
                    maxWidth: '720px',
                    direction: 'rtl',
                    boxShadow: '0 25px 60px rgba(28, 115, 171, 0.25)',
                    padding: '28px',
                    position: 'relative',
                    maxHeight: '92vh',
                    overflowY: 'auto'
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '22px',
                    borderBottom: '1px solid rgba(28, 115, 171, 0.15)',
                    paddingBottom: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: '14px',
                            background: 'linear-gradient(135deg, #1C73AB 0%, #2891C8 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '22px',
                            color: '#fff',
                            boxShadow: '0 8px 18px rgba(28, 115, 171, 0.3)'
                        }}>
                            💼
                        </div>
                        <div>
                            <h2 style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 900,
                                color: '#122946',
                                letterSpacing: '-0.3px'
                            }}>
                                تسجيل عملية خدمية / إيراد تشغيلي
                            </h2>
                            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                                توثيق الأعمال الإدارية، التوصيل، أو التشغيل للغير مع القيود المحاسبية التلقائية
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.8)',
                            border: '1px solid rgba(28, 115, 171, 0.2)',
                            width: '36px',
                            height: '36px',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* نوع العملية */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1C73AB', marginBottom: '8px' }}>
                            نوع العملية الخدمية 🏷️
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {SERVICE_TYPES.map(st => {
                                const isSelected = operationType === st.value;
                                return (
                                    <button
                                        type="button"
                                        key={st.value}
                                        onClick={() => setOperationType(st.value)}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '12px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            border: isSelected ? '1px solid #1C73AB' : '1px solid rgba(28, 115, 171, 0.15)',
                                            background: isSelected 
                                                ? 'linear-gradient(135deg, rgba(28, 115, 171, 0.15) 0%, rgba(40, 145, 200, 0.25) 100%)' 
                                                : 'rgba(255, 255, 255, 0.7)',
                                            color: isSelected ? '#1C73AB' : '#475569',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <span>{st.icon}</span>
                                        <span>{st.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* صف التاريخ والعميل */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                                تاريخ العملية 📅
                            </label>
                            <input
                                type="date"
                                value={operationDate}
                                onChange={(e) => setOperationDate(e.target.value)}
                                required
                                style={{
                                    width: '100%',
                                    padding: '11px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                                العميل / الجهة المستفيدة 👤 (اختياري)
                            </label>
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '11px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <option value="">-- عميل عام / بدون تحديد --</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} {c.code ? `(${c.code})` : ''}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* البيان وتفاصيل العملية */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                            بيان وتفاصيل العملية الخدمية 📝 <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <textarea
                            rows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="مثال: إدارة تشغيل موقع لمدة شهر، توصيل أدوية ومستلزمات بيطرية، دور استشاري وإداري..."
                            required
                            style={{
                                width: '100%',
                                padding: '11px 14px',
                                borderRadius: '12px',
                                border: '1px solid rgba(28, 115, 171, 0.2)',
                                background: 'rgba(255, 255, 255, 0.9)',
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#122946',
                                outline: 'none',
                                resize: 'vertical',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* المبلغ وطريقة السداد */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                                إجمالي المبلغ المستحق / المحصل 💰 <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={totalAmount}
                                onChange={(e) => setTotalAmount(e.target.value)}
                                placeholder="0.00"
                                required
                                style={{
                                    width: '100%',
                                    padding: '11px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(28, 115, 171, 0.25)',
                                    background: 'rgba(255, 255, 255, 0.95)',
                                    fontSize: '16px',
                                    fontWeight: 900,
                                    color: '#1C73AB',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                                طريقة التحصيل والطرف المدين 💳
                            </label>
                            <select
                                value={paymentChannel}
                                onChange={(e) => setPaymentChannel(e.target.value as any)}
                                style={{
                                    width: '100%',
                                    padding: '11px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <option value="cash">💵 تحصيل نقدي (الخزينة الرئيسية)</option>
                                <option value="bank">🏦 تحويل بنكي (حسابات البنوك)</option>
                                <option value="credit">📑 آجل على ذمة العميل (ذمم مدينة)</option>
                            </select>
                        </div>
                    </div>

                    {/* الموظف المنفذ */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#122946', marginBottom: '6px' }}>
                            الموظف / المندوب المنفذ للخدمة 👷
                        </label>
                        <select
                            value={employeeId}
                            onChange={(e) => setEmployeeId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '11px 14px',
                                borderRadius: '12px',
                                border: '1px solid rgba(28, 115, 171, 0.2)',
                                background: 'rgba(255, 255, 255, 0.9)',
                                fontSize: '13px',
                                fontWeight: 700,
                                color: '#122946',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        >
                            <option value="">-- اختر الموظف أو المندوب --</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>
                                    {emp.name} {emp.job_role ? `(${emp.job_role})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* قسم العمولة / الأرباح */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.8) 0%, rgba(241, 245, 249, 0.9) 100%)',
                        border: '1px solid rgba(28, 115, 171, 0.2)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="commCheck"
                                    checked={hasCommission}
                                    onChange={(e) => setHasCommission(e.target.checked)}
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        accentColor: '#1C73AB',
                                        cursor: 'pointer'
                                    }}
                                />
                                <label 
                                    htmlFor="commCheck" 
                                    style={{ 
                                        fontSize: '13px', 
                                        fontWeight: 800, 
                                        color: '#122946', 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    هل للموظف نسبة / عمولة من أرباح هذه العملية؟ 🤝
                                </label>
                            </div>

                            {hasCommission && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>النسبة:</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        step="1"
                                        value={commissionPercentage}
                                        onChange={(e) => setCommissionPercentage(e.target.value)}
                                        style={{
                                            width: '65px',
                                            padding: '6px 8px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(28, 115, 171, 0.3)',
                                            fontWeight: 800,
                                            textAlign: 'center',
                                            fontSize: '14px',
                                            color: '#1C73AB'
                                        }}
                                    />
                                    <span style={{ fontSize: '14px', fontWeight: 900, color: '#1C73AB' }}>%</span>
                                </div>
                            )}
                        </div>

                        {/* بطاقة الحسابات المالية اللحظية */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                            gap: '10px',
                            marginTop: '4px'
                        }}>
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.9)',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: '1px solid rgba(28, 115, 171, 0.15)'
                            }}>
                                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'block' }}>إجمالي الإيراد</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#1C73AB' }}>
                                    {formatCurrency(numAmount)}
                                </span>
                            </div>

                            {hasCommission && (
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.6) 0%, rgba(254, 215, 170, 0.6) 100%)',
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(245, 158, 11, 0.3)'
                                }}>
                                    <span style={{ fontSize: '11px', color: '#92400e', fontWeight: 700, display: 'block' }}>عمولة الموظف ({numPercent}%)</span>
                                    <span style={{ fontSize: '15px', fontWeight: 900, color: '#b45309' }}>
                                        {formatCurrency(commissionAmount)}
                                    </span>
                                </div>
                            )}

                            <div style={{
                                background: 'linear-gradient(135deg, rgba(220, 252, 231, 0.6) 0%, rgba(187, 247, 208, 0.6) 100%)',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                border: '1px solid rgba(22, 163, 74, 0.3)'
                            }}>
                                <span style={{ fontSize: '11px', color: '#166534', fontWeight: 700, display: 'block' }}>صافي ربح المؤسسة</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#15803d' }}>
                                    {formatCurrency(netProfit)}
                                </span>
                            </div>
                        </div>

                        {hasCommission && (
                            <div style={{ fontSize: '11px', color: '#0369a1', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>💡</span>
                                <span>ستضاف هذه العمولة آلياً في كشف حساب الموظف كطرف دائن لصالحه في شجرة الحسابات.</span>
                            </div>
                        )}
                    </div>

                    {/* أزرار الإجراءات */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '12px',
                        marginTop: '10px',
                        borderTop: '1px solid rgba(28, 115, 171, 0.1)',
                        paddingTop: '16px'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '12px 20px',
                                borderRadius: '14px',
                                border: '1px solid rgba(148, 163, 184, 0.4)',
                                background: 'rgba(255, 255, 255, 0.8)',
                                color: '#475569',
                                fontWeight: 800,
                                fontSize: '13px',
                                cursor: 'pointer',
                                minHeight: '44px'
                            }}
                        >
                            إلغاء
                        </button>

                        <button
                            type="submit"
                            disabled={isSaving}
                            style={{
                                padding: '12px 28px',
                                borderRadius: '14px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #1C73AB 0%, #2891C8 100%)',
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '14px',
                                cursor: isSaving ? 'wait' : 'pointer',
                                opacity: isSaving ? 0.7 : 1,
                                boxShadow: '0 8px 20px rgba(28, 115, 171, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minHeight: '44px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isSaving ? (
                                <>
                                    <span>⏳</span>
                                    <span>جاري الترحيل المحاسبي...</span>
                                </>
                            ) : (
                                <>
                                    <span>💾</span>
                                    <span>حفظ واعتماد القيد المحاسبي</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
