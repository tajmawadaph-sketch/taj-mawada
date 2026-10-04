// ============================================================================
// 🏛️ تعريفات TypeScript المركزية لنظام "تاج المودة" (Taj Al-Mawadah)
// مطابقة بدقة للمخطط المعماري السحابي (Supabase) ومحرك الأوفلاين
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================================
// 1. 📦 الأصناف والمخزون (inventory_items)
// ============================================================================
export interface InventoryItem {
  id: string; // UUID
  name: string; // اسم الصنف / الدواء البيطري
  barcode: string; // باركود فريد
  category_id?: string | null;
  purchase_price: number; // سعر الشراء / التكلفة
  sale_price: number; // سعر البيع الأساسي
  min_sale_price?: number | null; // الحد الأدنى لسعر البيع المسموح به للكاشير
  stock_quantity?: number; // إجمالي الرصيد بالمستودعات
  current_quantity?: number; // توافق عكسي مع current_quantity
  min_quantity?: number; // حد إعادة الطلب
  unit?: string; // الوحدة (عبوة، باكت، حبة، لتر)
  warehouse_id?: string | null; // المستودع الافتراضي
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// 2. ⏳ حركات المخزون، التشغيلات، وتواريخ الصلاحية (inventory_transactions)
// ============================================================================
export type InventoryTransactionType = 'in' | 'out' | 'transfer' | 'adjustment';
export type InventoryTransactionStatus = 'draft' | 'approved' | 'pending' | 'canceled';

export interface InventoryTransaction {
  id: string;
  item_id: string;
  transaction_type?: InventoryTransactionType;
  type?: string; // توافق عكسي مع type
  quantity: number; // الكمية المنقولة / المستلمة
  unit_cost?: number; // تكلفة الوحدة
  batch_number?: string | null; // رقم التشغيلة / الدفعة (إلزامي في حركات الاستلام)
  expiry_date?: string | null; // تاريخ انتهاء الصلاحية (YYYY-MM-DD)
  production_date?: string | null; // تاريخ الإنتاج (اختياري)
  warehouse_id?: string | null; // المستودع المصدر
  destination_warehouse_id?: string | null; // المستودع المستلم
  fleet_operation_id?: string | null; // أمر التوزيع / سيارة النقل
  status: InventoryTransactionStatus;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// 3. 🧾 فواتير المبيعات ونقاط البيع (invoices & invoice_items)
// ============================================================================
export type InvoiceType = 'sale' | 'purchase' | 'return';
export type PaymentMethod = 'cash' | 'card' | 'credit' | 'split';
export type InvoiceStatus = 'paid' | 'pending' | 'canceled' | 'posted';

export interface Invoice {
  id: string;
  invoice_number: string; // رقم الفاتورة التسلسلي (مثال: INV-2026-0001)
  type: InvoiceType;
  partner_id?: string | null; // معرف العميل أو المورد
  total_amount: number; // الإجمالي قبل الخصم والضريبة
  discount_amount?: number; // قيمة الخصم
  tax_amount?: number; // ضريبة القيمة المضافة (15%)
  net_amount: number; // المبلغ الصافي النهائي
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  cashier_id?: string | null; // الموظف المسؤول
  shift_id?: string | null; // معرف وردية الكاشير المرتبطة
  notes?: string | null;
  qr_code?: string | null; // رمز ZATCA المشفر
  created_at?: string;
  updated_at?: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id?: string;
  invoice_id?: string;
  item_id: string;
  item_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  batch_number?: string | null; // التشغيلة المسحوبة
  expiry_date?: string | null; // تاريخ انتهاء البند
  created_at?: string;
}

// ============================================================================
// 4. ⏰ ورديات الكاشير (pos_shifts)
// ============================================================================
export type PosShiftStatus = 'open' | 'closed';

export interface PosShift {
  id: string;
  cashier_id: string;
  cashier_name?: string;
  start_time: string;
  end_time?: string | null;
  opening_cash: number; // النقدية الافتتاحية في الدرج
  closing_cash?: number | null; // النقدية المحتسبة عند الإغلاق
  actual_cash?: number | null; // النقدية الفعلية المحصية
  cash_difference?: number | null; // العجز أو الزيادة
  total_sales?: number; // إجمالي المبيعات المحققة بالشفت
  status: PosShiftStatus;
  notes?: string | null;
  created_at?: string;
}

// ============================================================================
// 5. 💰 شجرة الحسابات والقيود المالية (accounts & journal_entries)
// ============================================================================
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  code: string; // رقم الحساب (مثال: 10101 الصندوق)
  name: string; // اسم الحساب بالعربية
  name_en?: string | null;
  type: AccountType;
  parent_id?: string | null;
  balance?: number;
  is_active: boolean;
  created_at?: string;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description?: string;
  reference_type?: 'invoice' | 'payment' | 'receipt' | 'manual';
  reference_id?: string | null;
  is_posted: boolean;
  created_at?: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id?: string;
  journal_id?: string;
  account_id: string;
  debit: number; // مدين
  credit: number; // دائن
  description?: string;
}

// ============================================================================
// 6. 🤝 الشركاء: العملاء، الموردين، والمناديب (partners)
// ============================================================================
export type PartnerType = 'customer' | 'supplier' | 'delegate';

export interface Partner {
  id: string;
  name: string;
  type: PartnerType;
  phone?: string | null;
  email?: string | null;
  tax_number?: string | null; // الرقم الضريبي
  address?: string | null;
  current_balance?: number; // الرصيد الحالي (مدين / دائن)
  credit_limit?: number | null; // سقف الائتمان
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// 7. 🏬 المستودعات وسيارات التوزيع (warehouses)
// ============================================================================
export interface Warehouse {
  id: string;
  name: string;
  type?: 'central' | 'branch' | 'mobile_vehicle';
  vehicle_id?: string | null;
  location?: string | null;
  is_active: boolean;
  created_at?: string;
}

// ============================================================================
// 8. 🔄 عقد محرك الأوفلاين والمزامنة (Offline Engine Types)
// ============================================================================
export interface OfflineSyncItemContract<T = any> {
  id: string;
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'insert' | 'update' | 'delete';
  data: T;
  status: 'pending' | 'syncing' | 'failed' | 'completed';
  retry_count: number;
  created_at: string;
  error_message?: string;
}
