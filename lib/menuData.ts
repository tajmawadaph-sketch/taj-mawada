export const menuGroups = [
    { 
        group: "الرئيسية والملخصات", 
        items: [
            { id: 'dashboard', title: 'لوحة القيادة', icon: '🖥️', path: '/Dashboard' },
            { id: 'global_summary', title: 'الملخص العام', icon: '📊', path: '/GlobalSummary' }
        ] 
    },
    { 
        group: "التشغيل والمبيعات", 
        items: [
            { id: 'pos', title: 'شاشة الكاشير (POS)', icon: '🛍️', path: '/pos' },
            { id: 'pos_dashboard', title: 'أرباح منافذ البيع', icon: '📈', path: '/pos/dashboard' },
            { id: 'pos_settlements', title: 'تسوية عهد منافذ البيع', icon: '🏪', path: '/pos-settlements' },
            { id: 'fleet_operations', title: 'رحلات التشغيل', icon: '🚚', path: '/fleet_operations' },
            { id: 'service_operations', title: 'إيرادات الخدمات والتشغيل', icon: '💼', path: '/service-operations' },
            { id: 'invoices', title: 'الفواتير والمبيعات', icon: '🧾', path: '/invoices' }
        ] 
    },
    { 
        group: "المستودع", 
        items: [
            { id: 'inventory', title: 'الأصناف', icon: '📦', path: '/inventory' },
            { id: 'expiry_alerts', title: 'مراقبة الصلاحيات ⏳', icon: '⏳', path: '/expiry-alerts' },
            { id: 'purchase_orders', title: 'أوامر الشراء', icon: '🛒', path: '/purchase_orders' },
            { id: 'warehouses', title: 'المستودعات', icon: '🏢', path: '/inventory/warehouses' },
            { id: 'inventory_transactions', title: 'حركات المخزون', icon: '🔄', path: '/inventory/transactions' }
        ] 
    },
    { 
        group: "الحسابات والمالية", 
        items: [
            { id: 'receipts', title: 'سندات القبض', icon: '📥', path: '/ReceiptVouchers' }, 
            { id: 'payments', title: 'سندات الصرف', icon: '📤', path: '/PaymentVouchers' }, 
            { id: 'expenses', title: 'المصروفات', icon: '💸', path: '/expenses' }, 
            { id: 'journal', title: 'دفتر اليومية', icon: '📓', path: '/journal' }, 
            { id: 'manual_journals', title: 'القيود اليدوية', icon: '📝', path: '/ManualJournals' },
            { id: 'accounts', title: 'شجرة الحسابات', icon: '🌳', path: '/accounts' },
            { id: 'ledger', title: 'دفتر الأستاذ', icon: '📒', path: '/ledger' }, 
            { id: 'trialbalance', title: 'ميزان المراجعة', icon: '⚖️', path: '/trialbalance' },
            { id: 'financial_center', title: 'المركز المالي', icon: '🏛️', path: '/financial-center' },
            { id: 'financial_statements', title: 'القوائم المالية', icon: '📑', path: '/financial-statements' },
            { id: 'cashflows', title: 'التدفقات النقدية', icon: '🌊', path: '/cashflows' }
        ] 
    },
    { 
        group: "العملاء والمندوبين", 
        items: [
            { id: 'partners', title: 'دليل العملاء', icon: '👥', path: '/partners' },
            { id: 'partner_balances', title: 'أرصدة العملاء', icon: '⚖️', path: '/PartnerBalances' },
            { id: 'delegate_debts', title: 'ذمم المناديب', icon: '💰', path: '/delegate-debts' },
            { id: 'delegate_settlements', title: 'تسويات العهد', icon: '🤝', path: '/delegate-settlements' },
            { id: 'statement', title: 'كشف حساب', icon: '📜', path: '/statement' }
        ] 
    },
    { 
        group: "النظام والتقارير", 
        items: [
            { id: 'reports', title: 'التقارير الشاملة', icon: '📊', path: '/reports' }, 
            { id: 'import', title: 'استيراد البيانات', icon: '⬆️', path: '/import' },
            { id: 'promotions', title: 'العروض الترويجية', icon: '🎁', path: '/promotions' },
            { id: 'audit', title: 'المراجعة والتدقيق', icon: '🔍', path: '/audit' },
            { id: 'fleet', title: 'إدارة السيارات', icon: '🚙', path: '/fleet' },
            { id: 'payroll', title: 'الرواتب والأجور', icon: '💵', path: '/payroll' },
            { id: 'devices', title: 'الأجهزة والطرفيات (Hardware)', icon: '🖨️', path: '/settings/devices' },
            { id: 'settings', title: 'إعدادات النظام', icon: '⚙️', path: '/settings' }
        ] 
    }
];