/**
 * دالات مساعدة لطباعة ومشاركة الفواتير (A4 والحرارية وواتساب)
 * Taj Al-Mawadah Vet Pharmacy - Invoice Utilities
 */

export interface NormalizedInvoiceLine {
    index: number;
    name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    discount?: number;
    tax: number;
    total: number;
    batch_number?: string;
    expiry_date?: string;
}

/**
 * تطبيع واستخراج أصناف الفاتورة من كافة الهياكل المحتملة في النظام:
 * lines_data (JSON string or array), lines, items, or single header item
 */
export function normalizeInvoiceLines(record: any): NormalizedInvoiceLine[] {
    if (!record) return [];

    const result: NormalizedInvoiceLine[] = [];

    const parseIfJson = (val: any) => {
        if (!val) return null;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed : [parsed];
            } catch (e) {
                return null;
            }
        }
        if (Array.isArray(val)) return val;
        return null;
    };

    const rawLines = parseIfJson(record.lines);
    const rawLinesData = parseIfJson(record.lines_data);
    const rawItems = parseIfJson(record.items);

    // Prefer array with items
    const sourceArray = (rawLines && rawLines.length > 0)
        ? rawLines
        : (rawLinesData && rawLinesData.length > 0)
            ? rawLinesData
            : (rawItems && rawItems.length > 0)
                ? rawItems
                : null;

    if (sourceArray && sourceArray.length > 0) {
        sourceArray.forEach((item: any, idx: number) => {
            const name = item.item_name || item.name || item.description || item.title || `صنف #${idx + 1}`;
            const quantity = Number(item.quantity ?? item.qty ?? 1);
            const unit = item.unit || 'حبة';
            const unit_price = Number(item.unit_price ?? item.price ?? item.selected_price ?? 0);
            const discount = Number(item.discount ?? item.discount_amount ?? 0);
            const total = Number(item.total_price ?? item.total ?? ((quantity * unit_price) - discount));
            const tax = Number(item.tax ?? item.tax_amount ?? (total * 0.15));
            const batch_number = item.batch_number || item.batch || item.batch_no || '';
            const expiry_date = item.expiry_date || item.expiry || item.exp_date || '';
            result.push({
                index: idx + 1,
                name,
                quantity,
                unit,
                unit_price,
                discount,
                tax,
                total,
                batch_number: batch_number ? String(batch_number) : undefined,
                expiry_date: expiry_date ? String(expiry_date) : undefined
            });
        });
    }

    // Fallback: If no items array, check header single item
    if (result.length === 0) {
        const hasHeaderItem = record.description || Number(record.quantity || 0) > 0 || Number(record.unit_price || 0) > 0;
        if (hasHeaderItem) {
            const name = record.description || 'مبيعات أدوية ومستلزمات بيطرية';
            const quantity = Number(record.quantity) > 0 ? Number(record.quantity) : 1;
            const unit = record.unit || 'حبة';
            const unit_price = Number(record.unit_price) > 0 
                ? Number(record.unit_price) 
                : (Number(record.taxable_amount || record.total_amount || 0) / quantity);
            const total = quantity * unit_price;
            const batch_number = record.batch_number || '';
            const expiry_date = record.expiry_date || '';
            result.push({
                index: 1,
                name,
                quantity,
                unit,
                unit_price,
                tax: total * 0.15,
                total,
                batch_number: batch_number ? String(batch_number) : undefined,
                expiry_date: expiry_date ? String(expiry_date) : undefined
            });
        }
    }

    return result;
}

/**
 * تنسيق أرقام الهواتف وإضافة مفتاح الدولة (السعودية 966)
 */
export function formatPhoneForWhatsApp(phone: string): string {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    
    if (clean.startsWith('00966')) {
        clean = clean.substring(2);
    } else if (clean.startsWith('05')) {
        clean = '966' + clean.substring(1);
    } else if (clean.startsWith('5') && clean.length === 9) {
        clean = '966' + clean;
    }
    
    return clean;
}

/**
 * تجهيز رسالة واتساب أنيقة ومفصلة للفاتورة
 */
export function generateInvoiceWhatsAppMessage(record: any, customer: any, lines: NormalizedInvoiceLine[]): string {
    const clientName = customer?.name || record.client_name || 'عميلنا العزيز';
    const invoiceNum = record.invoice_number || record.id?.substring(0, 8) || '---';
    const dateStr = record.date ? new Date(record.date).toLocaleDateString('ar-SA') : new Date().toLocaleDateString('ar-SA');
    const paymentMethod = record.payment_method || 'نقدي';
    const totalAmount = Number(record.total_amount || 0).toFixed(2);
    const taxableAmount = Number(record.taxable_amount || (Number(record.total_amount || 0) / 1.15)).toFixed(2);
    const taxAmount = Number(record.tax_amount || (Number(record.total_amount || 0) - Number(taxableAmount))).toFixed(2);

    let itemsList = '';
    lines.forEach((line, i) => {
        itemsList += `${i + 1}. *${line.name}* (الكمية: ${line.quantity} | السعر: ${line.unit_price.toFixed(2)} | المجموع: ${line.total.toFixed(2)} ر.س)\n`;
    });

    const msg = 
`💧 *صيدلية تاج المودة البيطرية | Taj Al-Mawadah Pharmacy*
---------------------------------------
مرحباً بك عزيزنا: *${clientName}*
يسعدنا تزويدكم بتفاصيل فاتورتكم:

📄 *رقم الفاتورة:* #${invoiceNum}
📅 *تاريخ الإصدار:* ${dateStr}
💳 *طريقة الدفع:* ${paymentMethod}
🏢 *الرقم الضريبي:* 312487477800003

📦 *تفاصيل الأصناف:*
${itemsList || '- تفاصيل المبيعات\n'}
---------------------------------------
💵 *المبلغ الخاضع للضريبة:* ${taxableAmount} ر.س
🧾 *ضريبة القيمة المضافة (15%):* ${taxAmount} ر.س
💎 *الإجمالي النهائي:* ${totalAmount} ر.س

شكراً لتعاملكم مع صيدلية تاج المودة 🐎🐪
خدمة العملاء: info@taj-mawadah.com`;

    return msg;
}
