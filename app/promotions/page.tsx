"use client";
import React, { useState, useEffect } from 'react';
import MasterPage from '@/components/MasterPage';
import { usePromotionsLogic } from './promotions_logic';
import RawasiSmartTable from '@/components/rawasismarttable';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import { THEME } from '@/lib/theme';
import { FaPlus, FaEdit, FaTrash, FaGift } from 'react-icons/fa';

export default function PromotionsPage() {
    const logic = usePromotionsLogic();

    const columns = [
        { 
            header: 'العرض الترويجي', 
            accessor: 'name', 
            render: (row: any) => <div style={{ fontWeight: 900, color: THEME.primary }}>{row.name}</div> 
        },
        { 
            header: 'النوع', 
            accessor: 'type', 
            render: (row: any) => {
                const types: any = {
                    'BOGO': '🎁 اشترِ كمية واحصل على مجاني',
                    'QUANTITY': '📦 خصم كمية عند تجاوز حد معين',
                    'TIERED': '📊 خصم كمية متدرج',
                    'PARTNER_TIER': '👑 خصم فئات الشركاء (خيل/إبل/عيادات)',
                    'THRESHOLD': '💰 خصم عند بلوغ حد معين للفاتورة',
                    'CROSS_SELLING': '🔗 شراء صنف مع صنف',
                    'BUNDLE': '📦 باقة منتجات'
                };
                return types[row.type] || row.type;
            }
        },
        { 
            header: 'الحالة', 
            accessor: 'status', 
            render: (row: any) => (
                <span style={{ 
                    background: row.status === 'active' ? '#dcfce7' : '#f1f5f9', 
                    color: row.status === 'active' ? '#16a34a' : '#64748b', 
                    padding: '4px 8px', 
                    borderRadius: '8px', 
                    fontWeight: 'bold', 
                    fontSize: '12px' 
                }}>
                    {row.status === 'active' ? 'نشط' : (row.status === 'inactive' ? 'غير نشط' : row.status)}
                </span>
            )
        },
        { 
            header: 'تاريخ البداية', 
            accessor: 'start_date', 
            render: (row: any) => row.start_date ? new Date(row.start_date).toLocaleDateString('ar-SA') : '-' 
        },
        { 
            header: 'تاريخ النهاية', 
            accessor: 'end_date', 
            render: (row: any) => row.end_date ? new Date(row.end_date).toLocaleDateString('ar-SA') : '-' 
        },
        { 
            header: 'إجراءات', 
            key: 'actions', 
            render: (row: any) => (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button onClick={() => logic.handleEdit(row)} className="btn-icon" style={{ color: THEME.primary, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px' }}><FaEdit /></button>
                    <button onClick={() => logic.handleDelete(row.id)} className="btn-icon" style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px' }}><FaTrash /></button>
                </div>
            )
        }
    ];

    return (
        <MasterPage
            title="العروض الترويجية والخصومات"
            subtitle="إدارة الخصومات الذكية وعروض الترويج على المبيعات"
            icon="🎁"
            onSearch={logic.setSearchQuery}
            actions={
                <button 
                    className="btn-main-glass" 
                    onClick={() => { logic.setEditingItem(null); logic.setIsFormOpen(true); }}
                >
                    <FaPlus />
                    <span>عرض ترويجي جديد</span>
                </button>
            }
        >
            <div className="glass-container" style={{ padding: '20px' }}>
                <RawasiSmartTable
                    data={logic.promotions}
                    columns={columns}
                    isLoading={logic.isLoading}
                />
            </div>

            {logic.isFormOpen && (
                <PromotionFormModal 
                    isOpen={logic.isFormOpen} 
                    onClose={() => logic.setIsFormOpen(false)}
                    initialData={logic.editingItem}
                    onSave={logic.saveMutation.mutate}
                    isSaving={logic.saveMutation.isPending}
                    inventoryItems={logic.inventoryItems}
                />
            )}
        </MasterPage>
    );
}

function PromotionFormModal({ isOpen, onClose, initialData, onSave, isSaving, inventoryItems }: any) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: 'BOGO',
        status: 'active',
        start_date: '',
        end_date: '',
        priority: 1,
        conditions: {} as any,
        rewards: {} as any
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                description: initialData.description || '',
                type: initialData.type || 'BOGO',
                status: initialData.status || 'active',
                start_date: initialData.start_date ? initialData.start_date.split('T')[0] : '',
                end_date: initialData.end_date ? initialData.end_date.split('T')[0] : '',
                priority: initialData.priority || 1,
                conditions: initialData.conditions || {},
                rewards: initialData.rewards || {}
            });
        }
    }, [initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, id: initialData?.id });
    };

    return (
        <AquaModalWrapper isOpen={isOpen} onClose={onClose} title={initialData ? "تعديل العرض الترويجي" : "عـرض تـرويـجـي جـديـد"} icon="🎁">
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                        <label>اسم العرض الترويجي</label>
                        <input required type="text" className="glass-input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>نوع العرض</label>
                        <select className="glass-input-field" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value, conditions: {}, rewards: {}})}>
                            <option value="BOGO">🎁 اشترِ كمية واحصل على مجاني (أو بخصم)</option>
                            <option value="QUANTITY">📦 خصم كمية عند تجاوز حد أدنى للعدد</option>
                            <option value="PARTNER_TIER">👑 خصم فئات الشركاء (مربي خيل، مربي إبل، عيادات بيطرية)</option>
                            <option value="THRESHOLD">💰 خصم عند بلوغ حد معين من المشتريات</option>
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>الوصف (اختياري)</label>
                    <textarea className="glass-input-field" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={2} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div className="form-group">
                        <label>تاريخ البداية (اختياري)</label>
                        <input type="date" className="glass-input-field" value={formData.start_date} onChange={e => setFormData({...formData, start_date: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>تاريخ النهاية (اختياري)</label>
                        <input type="date" className="glass-input-field" value={formData.end_date} onChange={e => setFormData({...formData, end_date: e.target.value})} />
                    </div>
                    <div className="form-group">
                        <label>الحالة</label>
                        <select className="glass-input-field" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                            <option value="active">نشط</option>
                            <option value="inactive">غير نشط</option>
                        </select>
                    </div>
                </div>

                <div style={{ background: '#FDFBF7', padding: '16px', borderRadius: '16px', border: '1.5px solid rgba(194, 155, 98, 0.35)' }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#1E130B', fontWeight: 900 }}>
                        ⚙️ إعدادات وتفاصيل العرض ({formData.type})
                    </h4>
                    
                    {formData.type === 'BOGO' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label>صنف الشراء (Buy)</label>
                                <select required className="glass-input-field" value={formData.conditions.buy_item_id || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, buy_item_id: e.target.value}})}>
                                    <option value="">-- اختر الصنف --</option>
                                    {inventoryItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>كمية الشراء المطلوبة</label>
                                <input required type="number" min="1" className="glass-input-field" value={formData.conditions.buy_qty || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, buy_qty: Number(e.target.value)}})} />
                            </div>
                            <div className="form-group">
                                <label>الكمية المجانية (Get)</label>
                                <input required type="number" min="1" className="glass-input-field" value={formData.rewards.get_qty || ''} onChange={e => setFormData({...formData, rewards: {...formData.rewards, get_qty: Number(e.target.value)}})} />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 3' }}>
                                <label>نسبة الخصم على الكمية المجانية (100 = مجاني بالكامل)</label>
                                <input required type="number" min="1" max="100" className="glass-input-field" value={formData.rewards.discount_percentage || 100} onChange={e => setFormData({...formData, rewards: {...formData.rewards, discount_percentage: Number(e.target.value)}})} />
                            </div>
                        </div>
                    )}

                    {formData.type === 'QUANTITY' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label>الصنف المستهدف (اختياري: اتركه فارغاً لكل الأصناف)</label>
                                <select className="glass-input-field" value={formData.conditions.item_id || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, item_id: e.target.value}})}>
                                    <option value="">-- كافة الأصناف في السلة --</option>
                                    {inventoryItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>الحد الأدنى للكمية المستحقة للخصم</label>
                                <input required type="number" min="2" className="glass-input-field" value={formData.conditions.min_qty || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, min_qty: Number(e.target.value)}})} placeholder="مثلاً: 5 حبات" />
                            </div>
                            <div className="form-group">
                                <label>نسبة الخصم على السطر %</label>
                                <input required type="number" min="1" max="100" className="glass-input-field" value={formData.rewards.discount_percentage || ''} onChange={e => setFormData({...formData, rewards: {...formData.rewards, discount_percentage: Number(e.target.value)}})} placeholder="مثلاً: 10%" />
                            </div>
                        </div>
                    )}

                    {formData.type === 'PARTNER_TIER' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label>فئة الشريك المستهدفة</label>
                                <select required className="glass-input-field" value={formData.conditions.category || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, category: e.target.value}})}>
                                    <option value="">-- اختر فئة العميل / الشريك --</option>
                                    <option value="مربي خيل">🐎 مربي خيل (إسطبلات وخيول)</option>
                                    <option value="مربي إبل">🐫 مربي إبل (هجن وعزب)</option>
                                    <option value="عيادة بيطرية">🏥 عيادات ومستشفيات بيطرية</option>
                                    <option value="صيدلية بيطرية">💊 صيدليات بيطرية</option>
                                    <option value="تاجر جملة">📦 تجار الجملة والموزعين</option>
                                    <option value="عميل">👤 كافة العملاء المسجلين</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>نسبة الخصم التلقائي %</label>
                                <input required type="number" min="1" max="100" className="glass-input-field" value={formData.rewards.discount_percentage || ''} onChange={e => setFormData({...formData, rewards: {...formData.rewards, discount_percentage: Number(e.target.value)}})} placeholder="مثلاً: 15%" />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>تطبيق الخصم على صنف محدد (اختياري - اتركه فارغاً ليُطبق على كل الفاتورة)</label>
                                <select className="glass-input-field" value={formData.conditions.item_id || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, item_ids: e.target.value ? [e.target.value] : []}})}>
                                    <option value="">-- كافة الأصناف والخدمات في الفاتورة --</option>
                                    {inventoryItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {formData.type === 'THRESHOLD' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div className="form-group">
                                <label>الحد الأدنى لقيمة الفاتورة (الشرط بالريال)</label>
                                <input required type="number" min="0" step="any" className="glass-input-field" value={formData.conditions.min_cart_value || ''} onChange={e => setFormData({...formData, conditions: {...formData.conditions, min_cart_value: Number(e.target.value)}})} placeholder="مثلاً: 500 ريال" />
                            </div>
                            <div className="form-group">
                                <label>نسبة الخصم % أو المبلغ الثابت</label>
                                <input type="number" min="0" max="100" className="glass-input-field" value={formData.rewards.discount_percentage || ''} onChange={e => setFormData({...formData, rewards: {...formData.rewards, discount_percentage: Number(e.target.value), discount_amount: null}})} placeholder="مثلاً: 5%" />
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                    <button type="button" onClick={onClose} className="btn-secondary" style={{ minHeight: '44px', borderRadius: '12px', padding: '10px 20px' }}>إلغاء</button>
                    <button type="submit" disabled={isSaving} className="btn-primary" style={{ minHeight: '44px', borderRadius: '12px', padding: '10px 24px', background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', border: 'none', color: '#fff', fontWeight: 900 }}>
                        {isSaving ? '⏳ جاري الحفظ...' : '💾 حفظ العرض الترويجي'}
                    </button>
                </div>
            </form>
        </AquaModalWrapper>
    );
}
