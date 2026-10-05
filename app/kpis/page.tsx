"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { formatCurrency } from '@/lib/helpers';
import { useKpisLogic } from './kpis_logic';

export default function KpisPage() {
    const {
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        setQuickDateRange,
        totalSales,
        invoicesCount,
        totalCollections,
        receiptsCount,
        totalOutstandingDebts,
        collectionRate,
        debtToSalesRatio,
        isLoading
    } = useKpisLogic();

    return (
        <MasterPage 
            title="مؤشرات الأداء الرئيسية (KPIs)" 
            subtitle="التحليلات الرقمية السريعة للمبيعات، كفاءة التحصيل، وسيولة الصيدلية - ريال سعودي"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', paddingBottom: '50px' }}>
                
                {/* 1. لوحة تحديد الفترة والتصفية السريعة */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    padding: '20px 24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>🎯</span>
                            <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#1E130B' }}>
                                الفترة الزمنية للمؤشرات
                            </span>
                        </div>

                        {/* فترات سريعة */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setQuickDateRange('today')} className="kpi-chip">اليوم</button>
                            <button type="button" onClick={() => setQuickDateRange('this_month')} className="kpi-chip">هذا الشهر</button>
                            <button type="button" onClick={() => setQuickDateRange('quarter')} className="kpi-chip">الربع الحالي</button>
                            <button type="button" onClick={() => setQuickDateRange('year')} className="kpi-chip">هذا العام</button>
                            <button type="button" onClick={() => setQuickDateRange('all')} className="kpi-chip">كل الفترات</button>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px',
                        alignItems: 'end'
                    }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                📅 من تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={dateFrom} 
                                onChange={e => setDateFrom(e.target.value)}
                                className="royal-kpi-input" 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                📅 إلى تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={dateTo} 
                                onChange={e => setDateTo(e.target.value)}
                                className="royal-kpi-input" 
                            />
                        </div>
                    </div>
                </div>

                {/* 2. شبكة المؤشرات التنفيذية الملكية */}
                {isLoading ? (
                    <LoadingScreen message="جاري احتساب مؤشرات الأداء ومطابقة التحصيلات..." fullScreen={false} />
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '20px'
                    }}>
                        {/* 1. إجمالي المبيعات */}
                        <div className="kpi-royal-card" style={{ borderBottom: '4px solid #059669' }}>
                            <div className="kpi-card-header">
                                <span className="kpi-icon bg-emerald-50 text-emerald-700">💰</span>
                                <span className="kpi-tag tag-green">المبيعات المعتمدة</span>
                            </div>
                            <div className="kpi-value text-emerald-700">
                                {formatCurrency(totalSales)}
                            </div>
                            <div className="kpi-subtitle">
                                إجمالي حجم المبيعات ({invoicesCount} فاتورة)
                            </div>
                        </div>

                        {/* 2. إجمالي التحصيلات (السيولة المقبوضة) */}
                        <div className="kpi-royal-card" style={{ borderBottom: '4px solid #C29B62' }}>
                            <div className="kpi-card-header">
                                <span className="kpi-icon bg-amber-50 text-[#C29B62]">💵</span>
                                <span className="kpi-tag tag-gold">التحصيلات النقدية</span>
                            </div>
                            <div className="kpi-value text-[#1E130B]">
                                {formatCurrency(totalCollections)}
                            </div>
                            <div className="kpi-subtitle">
                                السيولة المقبوضة فعلياً ({receiptsCount} سند قبض)
                            </div>
                        </div>

                        {/* 3. ديون العملاء بالسوق (الذمم المدينة) */}
                        <div className="kpi-royal-card" style={{ borderBottom: '4px solid #A8573C' }}>
                            <div className="kpi-card-header">
                                <span className="kpi-icon bg-rose-50 text-[#A8573C]">⚠️</span>
                                <span className="kpi-tag tag-red">ديون السوق المتبقية</span>
                            </div>
                            <div className="kpi-value text-[#A8573C]">
                                {formatCurrency(totalOutstandingDebts)}
                            </div>
                            <div className="kpi-subtitle">
                                إجمالي المستحقات والذمم المدينة طرف العملاء
                            </div>
                        </div>

                        {/* 4. كفاءة ونسبة التحصيل */}
                        <div className="kpi-royal-card highlight-kpi-card" style={{ borderBottom: '4px solid #1E130B' }}>
                            <div className="kpi-card-header">
                                <span className="kpi-icon bg-[#1E130B] text-white">📈</span>
                                <span className="kpi-tag tag-royal">كفاءة التحصيل</span>
                            </div>
                            <div className="kpi-value text-[#1E130B]">
                                {collectionRate}%
                            </div>
                            <div className="kpi-subtitle">
                                نسبة السيولة المحصلة مقارنة بإجمالي المبيعات
                            </div>

                            {/* شريط التقدم الفاخر */}
                            <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '10px', marginTop: '14px', overflow: 'hidden' }}>
                                <div style={{ 
                                    height: '100%', 
                                    width: `${Math.min(Number(collectionRate), 100)}%`, 
                                    background: 'linear-gradient(90deg, #C29B62 0%, #059669 100%)',
                                    borderRadius: '10px'
                                }}></div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            <style>{`
                .kpi-chip {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 800;
                    color: #786b59; cursor: pointer; transition: 0.2s;
                }
                .kpi-chip:hover {
                    background: #C29B62; color: #FFFFFF; border-color: #C29B62;
                }
                .royal-kpi-input {
                    width: 100%; min-height: 44px; padding: 10px 14px; border-radius: 12px;
                    border: 1px solid rgba(194, 155, 98, 0.3); background: #FDFBF7;
                    color: #1E130B; outline: none; font-size: 13px; font-weight: 800;
                    transition: 0.2s;
                }
                .royal-kpi-input:focus {
                    border-color: #C29B62; background: #FFFFFF;
                    box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.15);
                }
                .kpi-royal-card {
                    background: #FFFFFF; border-radius: 18px; padding: 24px;
                    border: 1px solid rgba(194, 155, 98, 0.25);
                    box-shadow: 0 4px 16px rgba(30, 19, 11, 0.04);
                    display: flex; flex-direction: column; justify-content: space-between;
                    transition: 0.2s;
                }
                .kpi-royal-card:hover { transform: translateY(-2px); }
                .highlight-kpi-card {
                    background: linear-gradient(135deg, #FFFFFF 0%, #FDFBF7 100%);
                    border: 1.5px solid #C29B62;
                }
                .kpi-card-header {
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
                }
                .kpi-icon {
                    width: 40px; height: 40px; border-radius: 12px; display: flex;
                    align-items: center; justify-content: center; font-size: 20px;
                }
                .kpi-tag {
                    font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;
                }
                .tag-green { background: #ecfdf5; color: #059669; }
                .tag-gold { background: #fef3c7; color: #92400e; }
                .tag-red { background: #fef2f2; color: #A8573C; }
                .tag-royal { background: #1E130B; color: #FFFFFF; }
                .kpi-value {
                    font-size: 28px; font-weight: 900; font-family: monospace; margin-bottom: 6px;
                }
                .kpi-subtitle {
                    font-size: 12px; font-weight: 700; color: #9ca3af;
                }
            `}</style>
        </MasterPage>
    );
}
