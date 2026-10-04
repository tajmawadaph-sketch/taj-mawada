"use client";
import React, { useState, useRef, useEffect } from 'react';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import { THEME } from '@/lib/theme';
import SmartCombo from '@/components/SmartCombo';
import { formatCurrency } from '@/lib/helpers';
import { useToast , showGlobalToast} from '@/lib/toast-context'; 
import { supabase } from '@/lib/supabase'; 

const EXPENSE_CATEGORIES = [
    "مشتريات بضائع",
    "شراء بضاعة",
    "إعاشة وتغذية",
    "محروقات وانتقالات",
    "عدد ومعدات",
    "مستهلكات ومواد تشغيل",
    "صيانة وإصلاحات",
    "مصاريف إدارية",
    "عمولات وبقشيش",
    "سكن وأثاث",
    "أدوات نظافة",
    "مواد إنشائية"
];

// 🚀 مصفوفة طرق السداد
const PAYMENT_METHODS = [
    "آجل",
    "نقدي",
    "تحويل"
];

export default function ExpenseFormModal({ 
    isOpen, 
    onClose, 
    record, 
    setRecord, 
    onSave, 
    isSaving, 
    historicalData
}: any) {
    const { showToast } = useToast();
    const [mounted, setMounted] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
        
    useEffect(() => {
        setMounted(true);
    }, []);

    // 📷 دوال التقاط الصور
    const startCamera = async () => {
        setIsCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) { 
            showGlobalToast("خطأ في تشغيل الكاميرا", 'warning'); 
            setIsCameraOpen(false); 
        }
    };

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context?.drawImage(videoRef.current, 0, 0);
            const imageDataUrl = canvasRef.current.toDataURL('image/jpeg');
            setImagePreview(imageDataUrl);
            setRecord({ ...record, invoice_image: imageDataUrl });
            stopCamera();
        }
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) { 
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop()); 
        }
        setIsCameraOpen(false);
    };

    // 🧮 الحسابات اللحظية
    let safeAddedLines: any[] = [];
    if (record?.lines_data) {
        if (typeof record.lines_data === 'string') {
            try { safeAddedLines = JSON.parse(record.lines_data); } catch (e) { console.error("JSON Parse Error", e); }
        } else if (Array.isArray(record.lines_data)) {
            safeAddedLines = record.lines_data;
        }
    }

    const currentQty = Number(record?.quantity || 0);
    const currentPrice = Number(record?.unit_price || 0);
    const currentVat = Number(record?.vat_amount || 0);
    const currentDiscount = Number(record?.discount_amount || 0);

    const linesSubtotal = safeAddedLines.reduce((sum: number, line: any) => sum + (Number(line.quantity) * Number(line.unit_price)), 0);
    const linesVat = safeAddedLines.reduce((sum: number, line: any) => sum + Number(line.vat_amount || 0), 0);
    const linesDiscount = safeAddedLines.reduce((sum: number, line: any) => sum + Number(line.discount_amount || 0), 0);

    const finalSubtotal = (currentQty * currentPrice) + linesSubtotal;
    const finalVat = currentVat + linesVat;
    const finalDiscount = currentDiscount + linesDiscount;
    const finalTotal = finalSubtotal + finalVat - finalDiscount;

    const isSettlement = record?.payment_method === 'تسوية داخلية';

    const handleAddStatement = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!record.description) return showToast("يرجى إدخال اسم الصنف أو البيان أولاً ⚠️", "warning");
        if (currentQty <= 0 || currentPrice <= 0) return showToast("الكمية والسعر يجب أن يكونا أكبر من صفر ⚠️", "warning");

        const newLine = {
            description: record.description,
            quantity: currentQty,
            unit_price: currentPrice,
            vat_amount: currentVat,
            discount_amount: currentDiscount,
            total_price: (currentQty * currentPrice) + currentVat - currentDiscount
        };

        setRecord({
            ...record,
            lines_data: [...safeAddedLines, newLine],
            description: '', quantity: '', unit_price: '', vat_amount: '', discount_amount: ''
        });
        showToast("تمت إضافة الصنف للجدول بنجاح ✅", "success");
    };

    const handleRemoveLine = (indexToRemove: number) => {
        const newLines = safeAddedLines.filter((_: any, idx: number) => idx !== indexToRemove);
        setRecord({ ...record, lines_data: newLines });
    };

    // 🛡️ معترض الحفظ النهائي
    const handleValidateAndSave = () => {
        if (!record.exp_date) return showToast("تاريخ المصروف مطلوب ⚠️", "warning");
        if (!record.main_category) return showToast("يرجى اختيار التصنيف الرئيسي للمصروف ⚠️", "warning"); 
        if (!record.creditor_account) return showToast("حساب المصروف المدين مطلوب ⚠️", "warning");
        
        if (!record.payment_account) {
            return showToast("يرجى تحديد الحساب الدائن ⚠️", "warning");
        }
        
        let finalLinesToSave = safeAddedLines;

        if (record.description && currentQty > 0 && currentPrice > 0) {
            finalLinesToSave = [...finalLinesToSave, {
                description: record.description,
                quantity: currentQty,
                unit_price: currentPrice,
                vat_amount: currentVat,
                discount_amount: currentDiscount
            }];
        }

        if (finalLinesToSave.length === 0) {
            return showToast("يرجى إدخال صنف أو بيان واحد على الأقل للمصروف ⚠️", "error");
        }

        onSave({
            ...record,
            lines_data: finalLinesToSave, 
            quantity: 1, 
            unit_price: finalSubtotal,
            vat_amount: finalVat,
            discount_amount: finalDiscount,
            payment_method: record.payment_method || 'آجل',
        });
    };

    if (!isOpen || !mounted) return null;

    const totalDisplay = (
        <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 900 }}>الصافي النهائي</div>
            <div style={{ color: THEME.accent, fontWeight: 900, fontSize: '28px' }}>{formatCurrency(finalTotal)}</div>
        </div>
    );

    return (
        <AquaModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title={record?.id ? 'تعديل المصروف' : 'إنشاء مصروف جديد'}
            icon="📝"
            width="1000px"
            headerExtra={totalDisplay}
        >

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '15px', background: isSettlement ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.6)', padding: '15px', borderRadius: '16px', border: isSettlement ? '1px dashed #10b981' : '1px solid rgba(40, 145, 200, 0.15)' }}>
                    <div style={{ zIndex: 90, position: 'relative' }}>
                        <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>🔢 رقم الإذن</label>
                        <input type="text" className="glass-input-field" value={record?.expense_number || 'يُولد تلقائياً (Auto-Generated)'} disabled style={{ background: 'rgba(0,0,0,0.05)', color: '#64748b', cursor: 'not-allowed' }} />
                    </div>
                    <div style={{ zIndex: 85, position: 'relative' }}>
                        <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>📅 التاريخ *</label>
                        <input type="date" className="glass-input-field" value={record?.exp_date || ''} onChange={e => setRecord({...record, exp_date: e.target.value})} />
                    </div>
                    <div style={{ zIndex: 80, position: 'relative' }}>
                        <SmartCombo 
                            label="👤 المستفيد المباشر" 
                            icon="👤" 
                            options={historicalData?.payees || []}
                            displayCol="name" 
                            initialDisplay={record?.payee_name} 
                            onSelect={(val:any) => {
                                if (typeof val === 'object' && val !== null) {
                                    setRecord({...record, payee_name: val.name, payee_id: val.id});
                                } else {
                                    setRecord({...record, payee_name: val, payee_id: null});
                                }
                            }} 
                        />
                    </div>
                    <div style={{ zIndex: 78, position: 'relative' }}>
                        <SmartCombo 
                            label="🚚 رحلة التوزيع (أمر تشغيل)" 
                            icon="🚚" 
                            options={historicalData?.fleetOperations || []}
                            displayCol="name" 
                            initialDisplay={historicalData?.fleetOperations?.find((op: any) => op.id === record?.fleet_operation_id)?.name || ''} 
                            onSelect={(val:any) => setRecord({...record, fleet_operation_id: typeof val === 'object' && val !== null ? val.id : null})} 
                            strict={true}
                        />
                    </div>
                    <div style={{ zIndex: 77, position: 'relative' }}>
                        <SmartCombo 
                            label="🚗 السيارة المرتبطة بالمصروف" 
                            icon="🚗" 
                            options={historicalData?.fleetVehicles || []}
                            displayCol="plate_number" 
                            initialDisplay={historicalData?.fleetVehicles?.find((v: any) => v.id === record?.site_ref)?.plate_number || record?.site_ref || ''} 
                            onSelect={(val:any) => setRecord({...record, site_ref: typeof val === 'object' && val !== null ? val.id : val})} 
                            strict={false}
                        />
                    </div>
                    <div style={{ zIndex: 76, position: 'relative' }}>
                        <SmartCombo 
                            label="🏢 مركز التكلفة (Cost Center)" 
                            icon="🏢" 
                            options={[
                                { id: 'CC-MAIN', name: 'الإدارة العامة والمقر الرئيسي' },
                                { id: 'CC-PHARMACY', name: 'صيدلية تاج المودة (الفرع الرئيسي)' },
                                { id: 'CC-CLINIC', name: 'العيادة البيطرية والاستشارات' },
                                { id: 'CC-FLEET', name: 'أسطول سيارات وفانات التوزيع' },
                                { id: 'CC-WAREHOUSE', name: 'المستودع المركزي للأدوية' },
                            ]}
                            displayCol="name" 
                            initialDisplay={record?.cost_center_name || record?.cost_center || ''} 
                            onSelect={(val:any) => {
                                const ccName = typeof val === 'object' && val !== null ? val.name : val;
                                const ccId = typeof val === 'object' && val !== null ? val.id : '';
                                setRecord({...record, cost_center: ccName, cost_center_id: ccId, cost_center_name: ccName});
                            }} 
                            strict={false}
                        />
                    </div>
                    <div style={{ zIndex: 75, position: 'relative' }}>
                        <SmartCombo label="📁 التصنيف الرئيسي *" icon="📁" options={EXPENSE_CATEGORIES} initialDisplay={record?.main_category} onSelect={(val:any) => {
                            const selectedCategory = typeof val === 'object' && val !== null ? val.name : val;
                            let newCreditor = record.creditor_account;
                            let newPayment = record.payment_account;
                            if (!record?.id) {
                                if (selectedCategory === 'شراء بضاعة' || selectedCategory === 'مشتريات بضائع') {
                                    newCreditor = 'فواتير قيد الاستلام';
                                    newPayment = 'الموردين';
                                } else if (selectedCategory === 'مصاريف إدارية') {
                                    newCreditor = 'مصاريف إدارية وعمومية';
                                } else {
                                    newCreditor = 'مصاريف تشغيل';
                                }
                            }
                            setRecord({...record, main_category: selectedCategory, creditor_account: newCreditor, payment_account: newPayment});
                        }} strict={true} />
                    </div>
                    <div style={{ zIndex: 70, position: 'relative' }}>
                        <SmartCombo label="💳 طريقة السداد *" icon="⚙️" options={PAYMENT_METHODS} initialDisplay={record?.payment_method || 'آجل'} onSelect={(val:any) => setRecord({...record, payment_method: typeof val === 'object' && val !== null ? val.name : val})} strict={true} />
                    </div>
                    <div style={{ zIndex: 65, position: 'relative' }}>
                        <SmartCombo label="🧾 حساب المصروف (مدين)*" icon="📂" options={historicalData?.accounts || []} displayCol="name" initialDisplay={record?.creditor_account} onSelect={(val:any) => setRecord({...record, creditor_account: typeof val === 'object' && val !== null ? val.name : val})} strict={true} />
                    </div>
                    <div style={{ zIndex: 60, position: 'relative' }}>
                        <SmartCombo label={isSettlement ? "📈 الإيراد / التسوية (دائن)*" : "🤝 الحساب الدائن *"} icon={isSettlement ? "📈" : "🤝"} options={historicalData?.accounts || []} displayCol="name" initialDisplay={record?.payment_account} onSelect={(val:any) => setRecord({...record, payment_account: typeof val === 'object' && val !== null ? val.name : val})} strict={true} />
                    </div>
                </div>
                
                <div style={{ background: 'rgba(202, 138, 4, 0.05)', padding: '10px 15px', borderRadius: '16px', marginBottom: '10px', border: `1px dashed ${THEME.accent}` }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: THEME.brand.coffee, marginBottom: '10px' }}>🛒 إضافة أصناف المصروف</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 0.5fr', gap: '15px', alignItems: 'end' }}>
                        <div style={{ zIndex: 40 }}>
                            <SmartCombo label="البيان / الصنف *" icon="🛠️" freeText={true} initialDisplay={record.description} onSelect={(val: any) => setRecord({...record, description: typeof val === 'object' && val !== null ? val.name : val})} options={historicalData?.descriptions || []} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, display: 'block', marginBottom: '8px' }}>الكمية *</label>
                            <input type="number" value={record.quantity || ''} onChange={e => setRecord({...record, quantity: e.target.value})} className="glass-input-field" style={{ textAlign: 'center' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, display: 'block', marginBottom: '8px' }}>سعر الوحدة *</label>
                            <input type="number" value={record.unit_price || ''} onChange={e => setRecord({...record, unit_price: e.target.value})} className="glass-input-field" style={{ textAlign: 'center' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, display: 'block', marginBottom: '8px' }}>قيمة الضريبة</label>
                            <input type="number" value={record.vat_amount || ''} onChange={e => setRecord({...record, vat_amount: e.target.value})} className="glass-input-field" style={{ textAlign: 'center' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 900, color: THEME.ruby, display: 'block', marginBottom: '8px' }}>الخصم (-)</label>
                            <input type="number" value={record.discount_amount || ''} onChange={e => setRecord({...record, discount_amount: e.target.value})} className="glass-input-field" style={{ border: `1px solid ${THEME.ruby}50`, color: THEME.ruby, textAlign: 'center' }}/>
                        </div>
                        <button onClick={handleAddStatement} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', height: '42px', borderRadius: '12px', cursor: 'pointer', fontWeight: 900, fontSize: '18px', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)', marginTop: 'auto' }}>➕</button>
                    </div>

                    {safeAddedLines.length > 0 && (
                        <div className="lines-table-container">
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                                <thead style={{ background: THEME.primary, color: 'white' }}>
                                    <tr>
                                        <th style={{ padding: '12px', fontSize: '11px', textAlign: 'right' }}>البيان</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>الكمية</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>السعر</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>الضريبة</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>الخصم</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>الإجمالي</th>
                                        <th style={{ padding: '12px', fontSize: '11px' }}>حذف</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {safeAddedLines.map((line: any, idx: number) => (
                                        <tr key={idx} className="item-row">
                                            <td style={{ padding: '12px', fontWeight: 700, color: '#1e293b', textAlign: 'right' }}>{line.description}</td>
                                            <td style={{ padding: '12px', fontWeight: 800 }}>{line.quantity}</td>
                                            <td style={{ padding: '12px', fontWeight: 700 }}>{formatCurrency(line.unit_price)}</td>
                                            <td style={{ padding: '12px', fontWeight: 700 }}>{formatCurrency(line.vat_amount)}</td>
                                            <td style={{ padding: '12px', fontWeight: 700, color: THEME.ruby }}>{formatCurrency(line.discount_amount)}</td>
                                            <td style={{ padding: '12px', fontWeight: 900, color: THEME.primary }}>{formatCurrency(line.total_price)}</td>
                                            <td style={{ padding: '12px' }}><button onClick={() => handleRemoveLine(idx)} style={{ background: 'none', border: 'none', color: THEME.ruby, cursor: 'pointer', fontSize: '16px' }}>🗑️</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '15px', marginBottom: '10px' }}>
                    <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '12px', background: 'rgba(255, 255, 255, 0.6)', border: '2px dashed rgba(40, 145, 200, 0.2)', borderRadius: '12px', fontWeight: 900, cursor: 'pointer', color: '#475569', transition: '0.2s' }}>📁 إرفاق مستند (صورة / PDF)</button>
                    <button onClick={isCameraOpen ? takePhoto : startCamera} style={{ flex: 1, padding: '12px', background: '#1e293b', color: 'white', borderRadius: '12px', border: 'none', fontWeight: 900, cursor: 'pointer', boxShadow: '0 10px 20px rgba(0,0,0,0.1)' }}>{isCameraOpen ? '📸 التقاط الصورة' : '📷 فتح الكاميرا'}</button>
                </div>
                {isCameraOpen && <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '16px', marginBottom: '15px', border: `4px solid ${THEME.accent}` }} />}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <input type="file" ref={fileInputRef} hidden accept="image/*,.pdf" onChange={(e) => { const file = e.target.files?.[0]; if(file) { const r = new FileReader(); r.onload = () => setImagePreview(r.result as string); r.readAsDataURL(file); } }} />

                <div className="responsive-summary-grid" style={{ marginTop: '10px', padding: '10px', background: 'linear-gradient(135deg, #1e293b, #0f172a)', borderRadius: '16px', color: 'white', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 800 }}>إجمالي العمليات</div>
                        <div style={{ fontSize: '20px', fontWeight: 900 }}>{formatCurrency(finalSubtotal)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 800 }}>إجمالي الضريبة</div>
                        <div style={{ fontSize: '20px', fontWeight: 900 }}>{formatCurrency(finalVat)}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ fontSize: '11px', color: '#475569', fontWeight: 800 }}>إجمالي الخصم</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: THEME.ruby }}>{formatCurrency(finalDiscount)}</div>
                    </div>
                    <div style={{ background: `linear-gradient(135deg, ${THEME.accent}40, transparent)`, padding: '10px', borderRadius: '12px', border: `1px solid ${THEME.accent}80`, boxShadow: `0 0 20px ${THEME.accent}20` }}>
                        <div style={{ fontSize: '12px', fontWeight: 900, color: THEME.accentLight }}>الصافي المستحق</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>{formatCurrency(finalTotal)}</div>
                    </div>
                </div>

                <div className="responsive-actions" style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                    <button onClick={handleValidateAndSave} disabled={isSaving} className="btn-glass-save" style={{ flex: 2 }}>
                        {isSaving ? '⏳ جاري الحفظ...' : '✅ حفظ واعتماد المصروف'}
                    </button>
                    <button onClick={onClose} className="btn-glass-cancel" style={{ flex: 1 }}>إغلاق وإلغاء</button>
                </div>
        </AquaModalWrapper>
    );
}
