"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';

export default function PermissionsMatrix() {
    const [profiles, setProfiles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { language, isRtl } = useLanguage();
    const isEn = language === 'en';

    const modules = [
        { key: 'dashboard', nameAr: 'الداشبورد', nameEn: 'Dashboard' },
        { key: 'invoices', nameAr: 'الفواتير', nameEn: 'Invoices' },
        { key: 'pos', nameAr: 'نقاط البيع', nameEn: 'POS' },
        { key: 'fleet_operations', nameAr: 'الأسطول', nameEn: 'Fleet' },
        { key: 'inventory', nameAr: 'المخزون', nameEn: 'Inventory' },
        { key: 'receipts', nameAr: 'سندات القبض', nameEn: 'Receipts' },
        { key: 'payments', nameAr: 'سندات الصرف', nameEn: 'Payments' },
        { key: 'expenses', nameAr: 'المصروفات', nameEn: 'Expenses' },
        { key: 'journal', nameAr: 'القيود', nameEn: 'Journals' },
        { key: 'accounts', nameAr: 'الحسابات', nameEn: 'Accounts' },
        { key: 'partners', nameAr: 'الشركاء', nameEn: 'Partners' },
        { key: 'reports', nameAr: 'التقارير', nameEn: 'Reports' },
        { key: 'settings', nameAr: 'الإعدادات', nameEn: 'Settings' },
    ];

    useEffect(() => {
        const fetchProfiles = async () => {
            const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
            if (!error && data) {
                setProfiles(data);
            }
            setIsLoading(false);
        };
        fetchProfiles();
    }, []);

    if (isLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '50px', background: 'rgba(255,255,255,0.6)', borderRadius: '20px', backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: '32px', animation: 'spin 1s linear infinite', marginBottom: '12px' }}>⏳</div>
                <div style={{ fontWeight: 800, color: THEME.primary, fontSize: '14px' }}>
                    {isEn ? 'Loading permissions matrix...' : 'جاري استدعاء مصفوفة الصلاحيات...'}
                </div>
            </div>
        );
    }

    return (
        <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
            {/* Header info card */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                padding: '16px 20px',
                borderRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '0 4px 20px rgba(28, 115, 171, 0.05)'
            }}>
                <div style={{ minWidth: '240px', flex: '1 1 auto' }}>
                    <h2 style={{ fontSize: '17px', color: THEME.primary, margin: '0 0 4px 0', fontWeight: 900 }}>
                        {isEn ? '🔐 Permissions Matrix' : '🔐 مصفوفة الصلاحيات العامة'}
                    </h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700, lineHeight: 1.4 }}>
                        {isEn 
                            ? 'Overview of user permissions. To manage roles and fine-tune access, visit Team Management.' 
                            : 'عرض ملخص لصلاحيات المستخدمين على الوحدات. لتعديل الصلاحيات بالتفصيل، انتقل لإدارة الفريق.'}
                    </p>
                </div>
                <button 
                    onClick={() => router.push('/team')}
                    style={{
                        background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                        color: 'white',
                        border: 'none',
                        minHeight: '44px',
                        padding: '10px 18px',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: '13px',
                        boxShadow: '0 4px 15px rgba(194, 155, 98, 0.28)',
                        transition: '0.2s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexShrink: 0
                    }}
                >
                    <span>👥</span>
                    <span>{isEn ? 'Team & Roles Management' : 'الانتقال لإدارة الفريق'}</span>
                </button>
            </div>

            {/* Scrollable matrix table */}
            <div style={{
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(194, 155, 98, 0.25)',
                boxShadow: '0 8px 32px rgba(30, 19, 11, 0.05)'
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', minWidth: '750px' }}>
                    <thead style={{ background: 'rgba(194, 155, 98, 0.08)' }}>
                        <tr>
                            <th style={{ padding: '14px', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', textAlign: isRtl ? 'right' : 'left', color: THEME.primary, fontSize: '12.5px', fontWeight: 900, position: 'sticky', [isRtl ? 'right' : 'left']: 0, background: 'rgba(253, 251, 247, 0.98)', zIndex: 2 }}>
                                {isEn ? 'User' : 'المستخدم'}
                            </th>
                            <th style={{ padding: '14px', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', color: THEME.primary, fontSize: '12.5px', fontWeight: 900 }}>
                                {isEn ? 'Role' : 'الدور'}
                            </th>
                            {modules.map(mod => (
                                <th key={mod.key} style={{ padding: '12px 8px', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', color: THEME.primary, fontSize: '11.5px', fontWeight: 900, whiteSpace: 'nowrap' }}>
                                    {isEn ? mod.nameEn : mod.nameAr}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {profiles.map(profile => {
                            const isSuperAdmin = profile.role === 'admin' || profile.role === 'super_admin' || profile.is_admin;
                            return (
                                <tr key={profile.id} style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.1)' }}>
                                    <td style={{ padding: '12px 14px', textAlign: isRtl ? 'right' : 'left', fontWeight: 900, color: '#1E130B', fontSize: '13px', position: 'sticky', [isRtl ? 'right' : 'left']: 0, background: '#FFFFFF', zIndex: 1, boxShadow: isRtl ? '-2px 0 6px rgba(0,0,0,0.03)' : '2px 0 6px rgba(0,0,0,0.03)' }}>
                                        {profile.full_name || profile.username || (isEn ? 'Unknown' : 'مستخدم')}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ 
                                            padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 900,
                                            background: isSuperAdmin ? 'rgba(254, 226, 226, 0.85)' : 'rgba(224, 231, 255, 0.85)',
                                            color: isSuperAdmin ? '#dc2626' : '#4338ca',
                                            border: `1px solid ${isSuperAdmin ? '#fca5a5' : '#c7d2fe'}`
                                        }}>
                                            {isSuperAdmin ? (isEn ? 'Super Admin' : 'مدير نظام') : (isEn ? 'Staff User' : 'مستخدم')}
                                        </span>
                                    </td>
                                    {modules.map(mod => {
                                        const perm = profile.permissions?.[mod.key]?.view;
                                        const hasAccess = isSuperAdmin || perm;
                                        return (
                                            <td key={mod.key} style={{ padding: '10px', fontSize: '15px' }}>
                                                {hasAccess ? (
                                                    <span style={{ color: '#16a34a', filter: 'drop-shadow(0 1px 2px rgba(22,163,74,0.2))' }}>✅</span>
                                                ) : (
                                                    <span style={{ color: '#cbd5e1', opacity: 0.6 }}>➖</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {profiles.length === 0 && (
                            <tr>
                                <td colSpan={modules.length + 2} style={{ padding: '30px', color: '#64748b', fontWeight: 700 }}>
                                    {isEn ? 'No users found' : 'لا يوجد مستخدمين مسجلين'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
