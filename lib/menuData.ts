export interface MenuItem {
    id: string;
    title: string;
    titleEn: string;
    icon: string;
    path: string;
}

export interface MenuGroup {
    group: string;
    groupEn: string;
    items: MenuItem[];
}

export const menuGroups: MenuGroup[] = [
    { 
        group: "الرئيسية والملخصات", 
        groupEn: "Home and Summaries",
        items: [
            { id: 'dashboard', title: 'لوحة القيادة', titleEn: 'Dashboard', icon: '🖥️', path: '/Dashboard' },
            { id: 'global_summary', title: 'الملخص العام', titleEn: 'Global Summary', icon: '📊', path: '/GlobalSummary' }
        ] 
    },
    { 
        group: "التشغيل والمبيعات", 
        groupEn: "Operations and Sales",
        items: [
            { id: 'pos', title: 'شاشة الكاشير (POS)', titleEn: 'POS Cashier', icon: '🛍️', path: '/pos' },
            { id: 'pos_dashboard', title: 'أرباح منافذ البيع', titleEn: 'Outlets Profitability', icon: '📈', path: '/pos/dashboard' },
            { id: 'pos_settlements', title: 'تسوية عهد منافذ البيع', titleEn: 'POS Custody Settlements', icon: '🏪', path: '/pos-settlements' },
            { id: 'fleet_operations', title: 'رحلات التشغيل', titleEn: 'Fleet Operations', icon: '🚚', path: '/fleet_operations' },
            { id: 'service_operations', title: 'إيرادات الخدمات والتشغيل', titleEn: 'Service Operations', icon: '💼', path: '/service-operations' },
            { id: 'invoices', title: 'الفواتير والمبيعات', titleEn: 'Sales Invoices', icon: '🧾', path: '/invoices' }
        ] 
    },
    { 
        group: "المستودع", 
        groupEn: "Inventory and Warehouses",
        items: [
            { id: 'inventory', title: 'الأصناف', titleEn: 'Inventory Items', icon: '📦', path: '/inventory' },
            { id: 'expiry_alerts', title: 'مراقبة الصلاحيات ⏳', titleEn: 'Expiry Tracking', icon: '⏳', path: '/expiry-alerts' },
            { id: 'purchase_orders', title: 'أوامر الشراء', titleEn: 'Purchase Orders', icon: '🛒', path: '/purchase_orders' },
            { id: 'warehouses', title: 'المستودعات', titleEn: 'Warehouses', icon: '🏢', path: '/inventory/warehouses' },
            { id: 'inventory_transactions', title: 'حركات المخزون', titleEn: 'Stock Movements', icon: '🔄', path: '/inventory/transactions' }
        ] 
    },
    { 
        group: "الحسابات والمالية", 
        groupEn: "Accounts and Finance",
        items: [
            { id: 'receipts', title: 'سندات القبض', titleEn: 'Receipt Vouchers', icon: '📥', path: '/ReceiptVouchers' }, 
            { id: 'payments', title: 'سندات الصرف', titleEn: 'Payment Vouchers', icon: '📤', path: '/PaymentVouchers' }, 
            { id: 'expenses', title: 'المصروفات', titleEn: 'Operating Expenses', icon: '💸', path: '/expenses' }, 
            { id: 'journal', title: 'دفتر اليومية', titleEn: 'General Journal', icon: '📓', path: '/journal' }, 
            { id: 'manual_journals', title: 'القيود اليدوية', titleEn: 'Manual Journals', icon: '📝', path: '/ManualJournals' },
            { id: 'accounts', title: 'شجرة الحسابات', titleEn: 'Chart of Accounts', icon: '🌳', path: '/accounts' },
            { id: 'ledger', title: 'دفتر الأستاذ', titleEn: 'General Ledger', icon: '📒', path: '/ledger' }, 
            { id: 'trialbalance', title: 'ميزان المراجعة', titleEn: 'Trial Balance', icon: '⚖️', path: '/trialbalance' },
            { id: 'financial_center', title: 'المركز المالي', titleEn: 'Financial Center', icon: '🏛️', path: '/financial-center' },
            { id: 'financial_statements', title: 'القوائم المالية', titleEn: 'Financial Statements', icon: '📑', path: '/financial-statements' },
            { id: 'cashflows', title: 'التدفقات النقدية', titleEn: 'Cash Flows', icon: '🌊', path: '/cashflows' }
        ] 
    },
    { 
        group: "العملاء والمندوبين", 
        groupEn: "Partners and Delegates",
        items: [
            { id: 'partners', title: 'دليل العملاء', titleEn: 'Partners Directory', icon: '👥', path: '/partners' },
            { id: 'partner_balances', title: 'أرصدة العملاء', titleEn: 'Customer Balances', icon: '⚖️', path: '/PartnerBalances' },
            { id: 'delegate_debts', title: 'ذمم المناديب', titleEn: 'Delegate Debts', icon: '💰', path: '/delegate-debts' },
            { id: 'delegate_settlements', title: 'تسويات العهد', titleEn: 'Delegate Custody Settlements', icon: '🤝', path: '/delegate-settlements' },
            { id: 'statement', title: 'كشف حساب', titleEn: 'Account Statement', icon: '📜', path: '/statement' }
        ] 
    },
    { 
        group: "النظام والتقارير", 
        groupEn: "System and Reports",
        items: [
            { id: 'reports', title: 'التقارير الشاملة', titleEn: 'Comprehensive Reports', icon: '📊', path: '/reports' }, 
            { id: 'import', title: 'استيراد البيانات', titleEn: 'Data Import Center', icon: '⬆️', path: '/import' },
            { id: 'promotions', title: 'العروض الترويجية', titleEn: 'Promotions and Offers', icon: '🎁', path: '/promotions' },
            { id: 'audit', title: 'المراجعة والتدقيق', titleEn: 'Audit and Logs', icon: '🔍', path: '/audit' },
            { id: 'fleet', title: 'إدارة السيارات', titleEn: 'Fleet Management', icon: '🚙', path: '/fleet' },
            { id: 'payroll', title: 'الرواتب والأجور', titleEn: 'Payroll and Salaries', icon: '💵', path: '/payroll' },
            { id: 'devices', title: 'الأجهزة والطرفيات (Hardware)', titleEn: 'Connected Devices and POS', icon: '🖨️', path: '/settings/devices' },
            { id: 'settings', title: 'إعدادات النظام', titleEn: 'System Settings', icon: '⚙️', path: '/settings' }
        ] 
    }
];