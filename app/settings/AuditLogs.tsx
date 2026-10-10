"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import RawasiSmartTable from '@/components/rawasismarttable';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/helpers';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { showGlobalToast } from '@/lib/toast-context';

export default function AuditLogs() {
    const router = useRouter();
    const { language, isRtl } = useLanguage();
    const isEn = language === 'en';
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState<any>(null);
    const [mounted, setMounted] = useState(false);

    const [filterUser, setFilterUser] = useState<string>('');
    const [filterTable, setFilterTable] = useState<string>('');
    const [filterAction, setFilterAction] = useState<string>('');
    const [filterDate, setFilterDate] = useState<string>('');

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const processedLogs = useMemo(() => {
        return logs.map(log => {
            let effectiveAction = log.action;
            if (log.action === 'UPDATE' && log.old_data && log.new_data) {
                const o = log.old_data;
                const n = log.new_data;
                if ((o.is_posted === false && n.is_posted === true) || (o.status === 'مسودة' && (n.status === 'مرحل' || n.status === 'معتمد'))) {
                    effectiveAction = 'POST';
                } else if ((o.is_posted === true && n.is_posted === false) || ((o.status === 'مرحل' || o.status === 'معتمد') && n.status === 'مسودة')) {
                    effectiveAction = 'UNPOST';
                }
            }
            return { ...log, effective_action: effectiveAction };
        });
    }, [logs]);

    const uniqueUsers = useMemo(() => Array.from(new Set(processedLogs.map(log => log.profiles?.full_name || 'System / Unknown'))).filter(Boolean) as string[], [processedLogs]);
    const uniqueTables = useMemo(() => Array.from(new Set(processedLogs.map(log => log.table_name))).filter(Boolean) as string[], [processedLogs]);
    const uniqueActions = useMemo(() => Array.from(new Set(processedLogs.map(log => log.effective_action))).filter(Boolean) as string[], [processedLogs]);

    const filteredLogs = useMemo(() => {
        return processedLogs.filter(log => {
            const matchUser = filterUser ? (log.profiles?.full_name || 'System / Unknown') === filterUser : true;
            const matchTable = filterTable ? log.table_name === filterTable : true;
            const matchAction = filterAction ? log.effective_action === filterAction : true;
            const matchDate = filterDate ? log.created_at.startsWith(filterDate) : true;
            return matchUser && matchTable && matchAction && matchDate;
        });
    }, [processedLogs, filterUser, filterTable, filterAction, filterDate]);

    useEffect(() => {
        setMounted(true);
    }, []);

    // ==========================================
    // 🛡️ Security Guard
    // ==========================================
    useEffect(() => {
        const checkAccess = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error || !session?.user) return router.push('/login');

                const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin' && !profile.permissions?.audit_logs?.view)) {
                    showGlobalToast("⛔ ليس لديك صلاحية لمشاهدة سجل المراقبة.", 'warning');
                    router.push('/');
                }
            } catch (err) {
                console.warn("Check access error:", err);
            }
        };
        checkAccess();
    }, [router]);

    // ==========================================
    // 📡 Data Fetching
    // ==========================================
    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*, profiles(full_name, role)')
                .order('created_at', { ascending: false })
                .limit(5000); // إحضار آخر 5000 حركة كحد أقصى للأداء
            
            if (error) throw error;
            setLogs(data || []);
        } catch (error: any) {
            console.error("Fetch Error:", error);
            showGlobalToast("خطأ في جلب السجلات: " + error.message, 'warning');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { 
        // 🛠️ تأخير طفيف لتجنب تداخل الـ Locks مع getSession
        const timer = setTimeout(() => {
            fetchLogs();
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    // ==========================================
    // Table Columns Configuration
    // ==========================================
    const columns = [
        { 
            key: 'created_at', 
            label: 'التاريخ والوقت', 
            sortable: true,
            render: (row: any) => <div style={{ direction: 'ltr', textAlign: 'right', fontWeight: 800 }}>{formatDate(row.created_at, true)}</div>
        },
        { 
            key: 'profiles.full_name', 
            label: 'بواسطة (المستخدم)', 
            sortable: true,
            render: (row: any) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 900, color: THEME.brand.coffee }}>{row.profiles?.full_name || 'System / Unknown'}</span>
                    <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.4)', padding: '2px 6px', borderRadius: '4px' }}>{row.profiles?.role || '---'}</span>
                </div>
            )
        },
        { 
            key: 'action', 
            label: 'نوع العملية', 
            sortable: true,
            render: (row: any) => {
                let actionType = row.action;
                const colors: any = { 'INSERT': '#22c55e', 'UPDATE': '#f59e0b', 'DELETE': '#ef4444', 'LOGIN': '#3b82f6', 'FAILED_POST': '#dc2626', 'FAILED_UNPOST': '#dc2626' };
                const labels: any = { 'INSERT': '➕ إضافة', 'UPDATE': '📝 تعديل', 'DELETE': '🗑️ حذف', 'LOGIN': '🔑 تسجيل دخول', 'FAILED_POST': '⛔ محاولة ترحيل مرفوضة', 'FAILED_UNPOST': '⛔ محاولة فك ترحيل مرفوضة' };
                
                let displayColor = colors[actionType] || '#64748b';
                let displayLabel = labels[actionType] || actionType;

                if (actionType === 'UPDATE' && row.old_data && row.new_data) {
                    const o = row.old_data;
                    const n = row.new_data;
                    if ((o.is_posted === false && n.is_posted === true) || (o.status === 'مسودة' && (n.status === 'مرحل' || n.status === 'معتمد'))) {
                        displayColor = '#10b981'; 
                        displayLabel = '✅ ترحيل';
                        actionType = 'POST'; // for unique tracking if needed
                    } else if ((o.is_posted === true && n.is_posted === false) || ((o.status === 'مرحل' || o.status === 'معتمد') && n.status === 'مسودة')) {
                        displayColor = '#8b5cf6';
                        displayLabel = '⏪ فك ترحيل';
                        actionType = 'UNPOST';
                    }
                }

                return (
                    <span style={{ background: `${displayColor}15`, color: displayColor, padding: '6px 12px', borderRadius: '12px', fontWeight: 900, fontSize: '12px' }}>
                        {displayLabel}
                    </span>
                );
            }
        },
        { 
            key: 'table_name', 
            label: 'الجدول المستهدف', 
            sortable: true,
            render: (row: any) => <span style={{ fontWeight: 800, background: 'rgba(40, 145, 200, 0.15)', padding: '4px 8px', borderRadius: '6px' }}>{row.table_name}</span>
        },
        {
            key: 'actions',
            label: 'التفاصيل',
            render: (row: any) => (
                <button 
                    onClick={() => setSelectedLog(row)}
                    style={{ background: 'white', border: '1px solid rgba(40, 145, 200, 0.2)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, transition: '0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.borderColor = THEME.primary}
                    onMouseOut={(e) => e.currentTarget.style.borderColor = 'rgba(40, 145, 200, 0.2)'}
                >
                    🔍 عرض السجل
                </button>
            )
        }
    ];

    // ==========================================
    // Render JSON Diff
    // ==========================================
    const renderDiff = (oldData: any, newData: any) => {
        const o = oldData || {};
        const n = newData || {};
        const allKeys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)]));

        return (
            <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', direction: 'ltr', textAlign: 'left', minWidth: 'max-content' }}>
                    <thead>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.6)', borderBottom: '2px solid rgba(40, 145, 200, 0.15)' }}>
                            <th style={{ padding: '10px', background: 'rgba(40, 145, 200, 0.15)', position: 'sticky', left: 0, zIndex: 2, borderRight: '1px solid rgba(40, 145, 200, 0.2)' }}>الحالة (State)</th>
                            {allKeys.map(key => {
                                const isChanged = JSON.stringify(o[key] ?? 'null') !== JSON.stringify(n[key] ?? 'null');
                                return (
                                    <th key={key} style={{ padding: '10px', fontWeight: 800, color: isChanged ? '#f59e0b' : '#475569', borderRight: '1px solid rgba(40, 145, 200, 0.15)' }}>
                                        {key} {isChanged && '🔄'}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.4)', background: 'white' }}>
                            <td style={{ padding: '10px', fontWeight: 900, color: '#22c55e', background: '#f0fdf4', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid rgba(40, 145, 200, 0.2)' }}>القيد (New)</td>
                            {allKeys.map(key => {
                                const oldVal = JSON.stringify(o[key] ?? 'null');
                                const newVal = JSON.stringify(n[key] ?? 'null');
                                const isChanged = oldVal !== newVal;
                                return (
                                    <td key={key} style={{ padding: '10px', fontFamily: 'monospace', color: isChanged ? '#22c55e' : '#64748b', fontWeight: isChanged ? 900 : 500, borderRight: '1px solid rgba(255, 255, 255, 0.4)', background: isChanged ? '#fefce8' : 'transparent' }}>
                                        {n[key] !== undefined ? newVal : '-'}
                                    </td>
                                );
                            })}
                        </tr>
                        <tr style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                            <td style={{ padding: '10px', fontWeight: 900, color: '#ef4444', background: '#fef2f2', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid rgba(40, 145, 200, 0.2)' }}>القيد القديم (Old)</td>
                            {allKeys.map(key => {
                                const oldVal = JSON.stringify(o[key] ?? 'null');
                                const newVal = JSON.stringify(n[key] ?? 'null');
                                const isChanged = oldVal !== newVal;
                                return (
                                    <td key={key} style={{ padding: '10px', fontFamily: 'monospace', color: isChanged ? '#ef4444' : '#475569', textDecoration: isChanged ? 'line-through' : 'none', borderRight: '1px solid rgba(255, 255, 255, 0.4)', background: isChanged ? '#fefce8' : 'transparent' }}>
                                        {o[key] !== undefined ? oldVal : '-'}
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeUp 0.4s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '6px' }}>
                <div>
                    <h2 style={{ fontSize: '17px', color: THEME.primary, margin: '0 0 4px 0', fontWeight: 900 }}>
                        {isEn ? '🕵️‍♂️ Audit Logs & System Activity' : '🕵️‍♂️ سجل المراقبة والنشاطات'}
                    </h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                        {isEn ? 'Granular change tracking across all database entities' : 'تتبع دقيق لجميع التعديلات والعمليات في النظام (Audit Logs)'}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid rgba(194, 155, 98, 0.25)', padding: '6px 14px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b' }}>
                            {isEn ? 'Total:' : 'إجمالي الحركات:'}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: THEME.primary }}>{filteredLogs.length}</span>
                    </div>
                    <button 
                        onClick={fetchLogs} 
                        style={{ 
                            background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', 
                            color: 'white', 
                            border: 'none', 
                            minHeight: '44px',
                            padding: '8px 18px', 
                            borderRadius: '12px', 
                            cursor: 'pointer', 
                            fontWeight: 900,
                            fontSize: '12.5px',
                            boxShadow: '0 2px 8px rgba(194, 155, 98, 0.25)'
                        }}
                    >
                        🔄 {isEn ? 'Refresh' : 'تحديث السجل'}
                    </button>
                </div>
            </div>

            {logs.length === 0 && !isLoading && (
                <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFFFFF', borderRadius: '24px', border: '1px solid rgba(194, 155, 98, 0.25)', boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>🛡️</div>
                    <h3 style={{ color: THEME.primary, fontWeight: 900, fontSize: '16px', margin: '0 0 8px' }}>
                        {isEn ? 'No activities recorded yet' : 'لم يتم تسجيل أي نشاط بعد'}
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                        {isEn ? 'Audit logger is active and listening for database operations.' : 'سجل المراقبة مفعل ويترصد الحركات آلياً.'}
                    </p>
                </div>
            )}

            {logs.length > 0 && (
                <>
                    {/* Responsive Filters */}
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                        gap: '10px', 
                        background: '#FFFFFF', 
                        padding: '14px', 
                        borderRadius: '16px', 
                        border: '1px solid rgba(194, 155, 98, 0.22)',
                        boxShadow: '0 4px 16px rgba(30, 19, 11, 0.03)' 
                    }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>
                                {isEn ? 'User' : 'المستخدم'}
                            </label>
                            <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.25)', fontSize: '12px', background: '#FDFBF7' }}>
                                <option value="">{isEn ? 'All Users' : 'الكل (All)'}</option>
                                {uniqueUsers.map((user: string) => <option key={user} value={user}>{user}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>
                                {isEn ? 'Table' : 'الجدول'}
                            </label>
                            <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.25)', fontSize: '12px', background: '#FDFBF7' }}>
                                <option value="">{isEn ? 'All Tables' : 'الكل (All)'}</option>
                                {uniqueTables.map((table: string) => <option key={table} value={table}>{table}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>
                                {isEn ? 'Action' : 'نوع العملية'}
                            </label>
                            <select
                                value={filterAction}
                                onChange={(e) => setFilterAction(e.target.value)}
                                style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.25)', fontSize: '12px', background: '#FDFBF7' }}
                            >
                                <option value="">{isEn ? 'All Actions' : 'الكل (All)'}</option>
                                {uniqueActions.map((action: string) => {
                                    const labels: any = { 'INSERT': isEn ? 'Insert' : 'إضافة', 'UPDATE': isEn ? 'Update' : 'تعديل', 'DELETE': isEn ? 'Delete' : 'حذف', 'LOGIN': isEn ? 'Login' : 'تسجيل دخول', 'POST': isEn ? 'Post' : 'ترحيل', 'UNPOST': isEn ? 'Unpost' : 'فك ترحيل' };
                                    return <option key={action} value={action}>{labels[action] || action}</option>;
                                })}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>
                                {isEn ? 'Date' : 'التاريخ'}
                            </label>
                            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.25)', fontSize: '12px', background: '#FDFBF7', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                        </div>
                        {(filterUser || filterTable || filterAction || filterDate) && (
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button onClick={() => { setFilterUser(''); setFilterTable(''); setFilterAction(''); setFilterDate(''); }} style={{ width: '100%', minHeight: '38px', padding: '8px', borderRadius: '10px', border: 'none', background: '#A8573C', color: 'white', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}>
                                    {isEn ? 'Clear ✕' : 'مسح الفلاتر ✕'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(30, 19, 11, 0.05)', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                        <RawasiSmartTable 
                            data={filteredLogs} 
                            columns={columns} 
                            searchPlaceholder={isEn ? 'Search audit logs...' : 'ابحث في السجل...'}
                            isLoading={isLoading}
                            enablePagination={true}
                            currentPage={currentPage}
                            totalItems={filteredLogs.length}
                            rowsPerPage={rowsPerPage}
                            onPageChange={setCurrentPage}
                            onRowsChange={setRowsPerPage}
                        />
                    </div>
                </>
            )}

            {/* 🔍 Details Modal */}
            {mounted && selectedLog && createPortal(
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(10px)' }} onClick={() => setSelectedLog(null)} />
                    
                    <div style={{ background: 'white', width: '900px', maxWidth: '95vw', maxHeight: '90vh', borderRadius: '24px', zIndex: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
                        <div style={{ padding: '25px', borderBottom: '1px solid rgba(40, 145, 200, 0.15)', background: 'rgba(255, 255, 255, 0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontWeight: 900, color: THEME.primary, fontSize: '20px' }}>تفاصيل العملية 🕵️‍♂️</h3>
                                <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#64748b' }}>معرف السجل: {selectedLog.id}</p>
                            </div>
                            <button onClick={() => setSelectedLog(null)} style={{ background: 'white', border: '1px solid rgba(40, 145, 200, 0.2)', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', fontWeight: 900 }}>✕</button>
                        </div>

                        <div style={{ padding: '25px', overflowY: 'auto', flex: 1 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '25px', background: 'rgba(255, 255, 255, 0.4)', padding: '15px', borderRadius: '16px' }}>
                                <div><span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 800 }}>الجدول:</span><span style={{ fontWeight: 900 }}>{selectedLog.table_name}</span></div>
                                <div><span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 800 }}>العملية:</span><span style={{ fontWeight: 900 }}>{selectedLog.action}</span></div>
                                <div><span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 800 }}>الوقت:</span><span style={{ fontWeight: 900, direction: 'ltr', display: 'inline-block' }}>{formatDate(selectedLog.created_at, true)}</span></div>
                                <div><span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 800 }}>بواسطة:</span><span style={{ fontWeight: 900 }}>{selectedLog.profiles?.full_name || 'System'}</span></div>
                            </div>

                            <h4 style={{ fontWeight: 900, marginBottom: '15px', color: THEME.brand.coffee }}>مقارنة البيانات الدقيقة (Data Diff)</h4>
                            <div style={{ border: '1px solid rgba(40, 145, 200, 0.15)', borderRadius: '12px', overflow: 'hidden' }}>
                                {renderDiff(selectedLog.old_data, selectedLog.new_data)}
                            </div>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
}
