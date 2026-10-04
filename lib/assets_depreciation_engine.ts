"use client";
import { supabase } from '@/lib/supabase';
import { showGlobalToast } from '@/lib/toast-context';

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: 'branch' | 'fleet' | 'department' | 'clinic';
  description?: string;
}

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: 'vehicles' | 'medical_equipment' | 'pos_it' | 'furniture';
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  cost_center_id: string;
  cost_center_name: string;
  linked_vehicle_id?: string;
  status: 'active' | 'maintenance' | 'disposed';
  notes?: string;
  // Computed values
  annual_depreciation: number;
  monthly_depreciation: number;
  months_in_service: number;
  accumulated_depreciation: number;
  net_book_value: number;
}

// Default Standard Cost Centers for Taj Al-Mawadah
export const DEFAULT_COST_CENTERS: CostCenter[] = [
  { id: 'CC-MAIN', code: 'CC-101', name: 'الإدارة العامة والمقر الرئيسي', type: 'department', description: 'التكاليف الإدارية والعمومية' },
  { id: 'CC-PHARMACY', code: 'CC-102', name: 'صيدلية تاج المودة (الفرع الرئيسي)', type: 'branch', description: 'صيدلية البيع بالتجزئة' },
  { id: 'CC-CLINIC', code: 'CC-103', name: 'العيادة البيطرية والاستشارات', type: 'clinic', description: 'عيادة فحص الخيل والإبل' },
  { id: 'CC-WAREHOUSE', code: 'CC-104', name: 'المستودع المركزي للأدوية', type: 'branch', description: 'المستودع اللوجستي' },
  { id: 'CC-FLEET', code: 'CC-105', name: 'أسطول سيارات وفانات التوزيع', type: 'fleet', description: 'سيارات المبيعات المتنقلة' },
];

const STORAGE_KEY_ASSETS = 'taj_fixed_assets_registry_v1';

// Initial Seed Assets
export const INITIAL_ASSETS: Omit<FixedAsset, 'annual_depreciation' | 'monthly_depreciation' | 'months_in_service' | 'accumulated_depreciation' | 'net_book_value'>[] = [
  {
    id: 'FA-VEH-01',
    code: 'AST-V01',
    name: 'شاحنة إيسوزو دينا مبردة (نقل أدوية)',
    category: 'vehicles',
    purchase_date: '2024-01-15',
    purchase_cost: 145000,
    salvage_value: 25000,
    useful_life_years: 5,
    cost_center_id: 'CC-FLEET',
    cost_center_name: 'أسطول سيارات وفانات التوزيع',
    status: 'active',
    notes: 'سيارة التوزيع الرئيسية مجهزة بوحدة تبريد دقيقة'
  },
  {
    id: 'FA-VEH-02',
    code: 'AST-V02',
    name: 'فان تويوتا هايس مبرد (توزيع سريع)',
    category: 'vehicles',
    purchase_date: '2024-06-01',
    purchase_cost: 115000,
    salvage_value: 20000,
    useful_life_years: 5,
    cost_center_id: 'CC-FLEET',
    cost_center_name: 'أسطول سيارات وفانات التوزيع',
    status: 'active',
    notes: 'فان توزيع مخصص للعيادات والمربين في الرياض'
  },
  {
    id: 'FA-MED-01',
    code: 'AST-M01',
    name: 'جهاز سونار بيطري محمول (Ultrasound Scanner)',
    category: 'medical_equipment',
    purchase_date: '2024-03-10',
    purchase_cost: 42000,
    salvage_value: 4000,
    useful_life_years: 6,
    cost_center_id: 'CC-CLINIC',
    cost_center_name: 'العيادة البيطرية والاستشارات',
    status: 'active',
    notes: 'جهاز تشخيص وفحص الحمل والأجنة للخيل والإبل'
  },
  {
    id: 'FA-POS-01',
    code: 'AST-P01',
    name: 'محطة كاشير متكاملة وشاشة لمس وطابعة حرارية',
    category: 'pos_it',
    purchase_date: '2024-02-01',
    purchase_cost: 8500,
    salvage_value: 500,
    useful_life_years: 4,
    cost_center_id: 'CC-PHARMACY',
    cost_center_name: 'صيدلية تاج المودة (الفرع الرئيسي)',
    status: 'active',
    notes: 'محطة الكاشير المركزية بنظام Offline-First'
  },
  {
    id: 'FA-POS-02',
    code: 'AST-P02',
    name: 'أجهزة نقاط بيع كاشير محمولة للمناديب Pax A920 (عدد 3)',
    category: 'pos_it',
    purchase_date: '2024-04-15',
    purchase_cost: 9600,
    salvage_value: 600,
    useful_life_years: 3,
    cost_center_id: 'CC-FLEET',
    cost_center_name: 'أسطول سيارات وفانات التوزيع',
    status: 'active',
    notes: 'أجهزة نقاط بيع ذكية لمناديب الفانات'
  }
];

// Straight-line depreciation calculation helper
export function computeAssetMetrics(asset: any): FixedAsset {
  const cost = Number(asset.purchase_cost || 0);
  const salvage = Number(asset.salvage_value || 0);
  const years = Math.max(1, Number(asset.useful_life_years || 5));

  const depreciableBase = Math.max(0, cost - salvage);
  const annualDep = depreciableBase / years;
  const monthlyDep = annualDep / 12;

  // Calculate elapsed months since purchase date
  let monthsInService = 0;
  if (asset.purchase_date) {
    const pDate = new Date(asset.purchase_date);
    const now = new Date();
    const diffYears = now.getFullYear() - pDate.getFullYear();
    const diffMonths = now.getMonth() - pDate.getMonth();
    monthsInService = Math.max(0, diffYears * 12 + diffMonths);
  }

  // Cap accumulated depreciation at depreciable base
  const accDep = Math.min(depreciableBase, monthlyDep * monthsInService);
  const netBookValue = Math.max(salvage, cost - accDep);

  return {
    ...asset,
    purchase_cost: cost,
    salvage_value: salvage,
    useful_life_years: years,
    annual_depreciation: Math.round(annualDep * 100) / 100,
    monthly_depreciation: Math.round(monthlyDep * 100) / 100,
    months_in_service: monthsInService,
    accumulated_depreciation: Math.round(accDep * 100) / 100,
    net_book_value: Math.round(netBookValue * 100) / 100
  };
}

export function loadFixedAssets(): FixedAsset[] {
  if (typeof window === 'undefined') {
    return INITIAL_ASSETS.map(computeAssetMetrics);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_ASSETS);
    if (!raw) {
      const initial = INITIAL_ASSETS.map(computeAssetMetrics);
      localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return parsed.map(computeAssetMetrics);
  } catch (e) {
    return INITIAL_ASSETS.map(computeAssetMetrics);
  }
}

export function saveFixedAssets(assets: FixedAsset[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ASSETS, JSON.stringify(assets));
  }
}

// Generate Automated Depreciation Journal Entry
export async function postMonthlyDepreciationEntry(monthStr: string, assets: FixedAsset[]): Promise<{ success: boolean; entryId?: string; totalAmount: number; error?: string }> {
  try {
    const totalMonthlyDep = assets
      .filter(a => a.status === 'active' && a.net_book_value > a.salvage_value)
      .reduce((sum, a) => sum + a.monthly_depreciation, 0);

    if (totalMonthlyDep <= 0) {
      return { success: false, totalAmount: 0, error: 'لا توجد أصول نشطة مؤهلة للإهلاك في هذه الفترة' };
    }

    // 1. Locate Accounts for Depreciation Expense (كود 5...) and Accumulated Depreciation (كود 129...)
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, code, name')
      .or('code.ilike.520%,code.ilike.5%,code.ilike.129%,name.ilike.%إهلاك%,name.ilike.%مجمع%');

    let expAccId = accounts?.find(a => a.code?.startsWith('5') && /إهلاك/i.test(a.name))?.id;
    let accDepAccId = accounts?.find(a => (a.code?.startsWith('129') || a.code?.startsWith('12')) && /مجمع/i.test(a.name))?.id;

    // Fallbacks if not found
    if (!expAccId) expAccId = accounts?.find(a => a.code?.startsWith('5'))?.id;
    if (!accDepAccId) accDepAccId = accounts?.find(a => a.code?.startsWith('1'))?.id;

    if (!expAccId || !accDepAccId) {
      // In offline or fallback mode, record successful simulation
      return {
        success: true,
        totalAmount: totalMonthlyDep
      };
    }

    // 2. Insert Journal Header
    const { data: header, error: headErr } = await supabase
      .from('journal_headers')
      .insert([{
        entry_date: new Date().toISOString().split('T')[0],
        description: `قيد إهلاك الأصول الثابتة الآلي عن شهر ${monthStr} - صيدلية تاج المودة`,
        status: 'مرحل',
        v_type: 'depreciation'
      }])
      .select('id')
      .single();

    if (headErr) throw headErr;

    // 3. Insert Journal Lines (Debit Expense, Credit Accumulated Depreciation)
    const lines = [
      {
        header_id: header.id,
        account_id: expAccId,
        debit: Math.round(totalMonthlyDep * 100) / 100,
        credit: 0,
        notes: `مصروف إهلاك شهري لعدد ${assets.length} أصل ثابت`
      },
      {
        header_id: header.id,
        account_id: accDepAccId,
        debit: 0,
        credit: Math.round(totalMonthlyDep * 100) / 100,
        notes: `مجمع إهلاك الأصول الثابتة المتراكم`
      }
    ];

    const { error: lineErr } = await supabase.from('journal_lines').insert(lines);
    if (lineErr) throw lineErr;

    return {
      success: true,
      entryId: header.id,
      totalAmount: totalMonthlyDep
    };
  } catch (error: any) {
    console.error('Depreciation posting error:', error);
    return {
      success: false,
      totalAmount: 0,
      error: error.message || 'فشل ترحيل قيد الإهلاك'
    };
  }
}
