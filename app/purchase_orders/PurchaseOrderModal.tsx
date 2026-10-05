"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showGlobalToast } from '@/lib/toast-context';
import { formatCurrency } from '@/lib/helpers';
import SearchableSelect from '@/components/SearchableSelect';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  initialData?: any;
  onSuccess: () => void;
}

export default function PurchaseOrderModal({
  isOpen,
  onClose,
  items,
  initialData,
  onSuccess
}: PurchaseOrderModalProps) {
  const [transactionNumber, setTransactionNumber] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [notes, setNotes] = useState('');
  const [taxMode, setTaxMode] = useState<'exclusive' | 'inclusive' | 'none'>('exclusive');
  
  const [lines, setLines] = useState<any[]>([
    { item_id: '', quantity: 1, unit_price: 0, tax_amount: 0, include_tax: true }
  ]);
  const [partners, setPartners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTransactionNumber(initialData.transaction_number);
        setTransactionDate(initialData.transaction_date);
        setPartnerId(initialData.partner_id || '');
        setNotes(initialData.notes || '');
        
        let initialTaxMode: 'exclusive' | 'inclusive' | 'none' = 'none';
        
        if (initialData.items && initialData.items.length > 0) {
          const firstItem = initialData.items[0];
          if (firstItem.include_tax) {
            const exclusiveTax = (firstItem.unit_price * firstItem.quantity) * 0.15;
            if (Math.abs(firstItem.tax_amount - exclusiveTax) < 0.1) {
              initialTaxMode = 'exclusive';
            } else {
              initialTaxMode = 'inclusive';
            }
          }
          setTaxMode(initialTaxMode);
          
          setLines(initialData.items.map((it: any) => ({
            id: it.id,
            item_id: it.item_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_amount: it.tax_amount,
            include_tax: it.include_tax
          })));
        } else {
          setTaxMode('exclusive');
          setLines([{ item_id: '', quantity: 1, unit_price: 0, tax_amount: 0, include_tax: true }]);
        }
      } else {
        resetForm();
      }
    }
  }, [isOpen, initialData]);

  const fetchPartners = async () => {
    const { data } = await supabase
      .from('partners')
      .select('*')
      .eq('partner_type', 'مورد')
      .order('name');
    if (data) setPartners(data);
  };

  const resetForm = () => {
    setTransactionNumber(`PO-${Date.now().toString().slice(-6)}`);
    setTransactionDate(new Date().toISOString().split('T')[0]);
    setPartnerId('');
    setNotes('');
    setTaxMode('exclusive');
    setLines([{ item_id: '', quantity: 1, unit_price: 0, tax_amount: 0, include_tax: true }]);
  };

  const recalculateTaxes = (currentLines: any[], mode: string) => {
    return currentLines.map(line => {
      const subtotal = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
      if (mode === 'exclusive') {
        line.tax_amount = Math.round(subtotal * 0.15 * 100) / 100;
        line.include_tax = true;
      } else if (mode === 'inclusive') {
        line.tax_amount = Math.round((subtotal - (subtotal / 1.15)) * 100) / 100;
        line.include_tax = true;
      } else {
        line.tax_amount = 0;
        line.include_tax = false;
      }
      return line;
    });
  };

  const handleTaxModeChange = (mode: string) => {
    setTaxMode(mode as any);
    setLines(recalculateTaxes([...lines], mode));
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    
    if (field === 'item_id') {
      const selectedItem = items.find((i: any) => i.id === value);
      if (selectedItem) {
        newLines[index].unit_price = selectedItem.cost_price || selectedItem.default_price || 0;
      }
    }

    setLines(recalculateTaxes(newLines, taxMode));
  };

  const addLine = () => {
    setLines(recalculateTaxes([
      ...lines,
      { item_id: '', quantity: 1, unit_price: 0, tax_amount: 0, include_tax: true }
    ], taxMode));
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!partnerId) {
      showGlobalToast('يرجى اختيار المورد من القائمة', 'warning');
      return;
    }
    if (lines.some(l => !l.item_id || l.quantity <= 0)) {
      showGlobalToast('يرجى إكمال بيانات الأصناف وتحديد الكميات بدقة', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      if (initialData && initialData.ids && initialData.ids.length > 0) {
        // Delete old items for updated batch
        await supabase.from('inventory_transactions').delete().in('id', initialData.ids);
      }

      const payload = lines.map((l, index) => ({
        transaction_number: lines.length > 1 ? `${transactionNumber}-${index + 1}` : transactionNumber,
        transaction_date: transactionDate,
        type: 'in',
        item_id: l.item_id,
        partner_id: partnerId,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        tax_amount: Number(l.tax_amount) || 0,
        include_tax: Boolean(l.include_tax),
        notes: notes,
        warehouse_id: '11111111-1111-1111-1111-111111111111',
        status: 'pending'
      }));

      const { error } = await supabase.from('inventory_transactions').insert(payload);
      if (error) throw error;

      showGlobalToast('✅ تم حفظ أمر الشراء بنجاح وجاهز للاستلام بالمستودع', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showGlobalToast('حدث خطأ أثناء حفظ أمر الشراء: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalBeforeTax = lines.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.unit_price) || 0)), 0);
  const totalTax = lines.reduce((s, l) => s + (Number(l.tax_amount) || 0), 0);
  const netPayable = taxMode === 'exclusive' ? totalBeforeTax + totalTax : totalBeforeTax;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(30, 19, 11, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px',
      direction: 'rtl'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '24px',
        padding: '28px',
        width: '920px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        overflowY: 'auto',
        border: '1px solid rgba(194, 155, 98, 0.35)',
        boxShadow: '0 20px 50px rgba(30, 19, 11, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)',
          paddingBottom: '14px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
              {initialData ? '✏️ تعديل أمر الشراء والتوريد' : '🛒 إنشاء أمر شراء وتوريد جديد'}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6e5d4f' }}>
              تسجيل طلبية الشراء ومطابقة الأصناف مع المورد قبل التوريد المخزني
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#FDFBF7',
              border: '1px solid rgba(194, 155, 98, 0.3)',
              borderRadius: '10px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              color: '#1E130B'
            }}
          >
            ✕ إغلاق
          </button>
        </div>

        {/* 1. Tax Policy Banner */}
        <div style={{
          background: '#FDFBF7',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '14px',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <label style={{ fontWeight: 800, color: '#1E130B', fontSize: '13px' }}>
            💡 سياسة الضريبة المطبقة على أمر الشراء:
          </label>
          <select
            value={taxMode}
            onChange={(e) => handleTaxModeChange(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              background: '#FFFFFF',
              color: '#1E130B',
              fontWeight: 800,
              fontSize: '12px',
              minHeight: '38px',
              outline: 'none'
            }}
          >
            <option value="exclusive">غير شامل الضريبة (يتم إضافة 15% للإجمالي)</option>
            <option value="inclusive">شامل الضريبة (يتم احتساب 15% ضمن السعر)</option>
            <option value="none">معفي / بدون ضريبة (0%)</option>
          </select>
        </div>

        {/* 2. Order Metadata Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '14px'
        }}>
          {/* Supplier */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              👤 المورد (الشريك) *
            </label>
            <SearchableSelect
              options={partners.map(p => ({ label: p.name, value: p.id }))}
              value={partnerId}
              onChange={(val) => setPartnerId(val)}
              placeholder="🔍 ابحث أو اختر المورد..."
            />
          </div>

          {/* PO Number */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              📝 رقم أمر الشراء
            </label>
            <input
              type="text"
              value={transactionNumber}
              onChange={(e) => setTransactionNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 800,
                fontSize: '13px',
                minHeight: '44px',
                outline: 'none'
              }}
            />
          </div>

          {/* Date */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
              📅 تاريخ أمر الشراء
            </label>
            <input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 800,
                fontSize: '13px',
                minHeight: '44px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* 3. Items Lines Section */}
        <div style={{
          background: '#FDFBF7',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '16px',
          padding: '16px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            borderBottom: '1px solid rgba(194, 155, 98, 0.2)',
            paddingBottom: '8px'
          }}>
            <h4 style={{ margin: 0, fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
              📦 قائمة الأصناف المشتراة ({lines.length} صنف)
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lines.map((line, index) => (
              <div
                key={index}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '14px',
                  border: '1px solid rgba(194, 155, 98, 0.2)',
                  padding: '14px',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 2fr) 1fr 1fr 1fr 1fr 44px',
                  gap: '10px',
                  alignItems: 'end'
                }}
              >
                {/* Item Select */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>
                    الصنف المطلوب ({index + 1}) *
                  </label>
                  <SearchableSelect
                    options={items.map((it: any) => ({
                      label: it.unit ? `${it.name} (${it.unit})` : it.name,
                      value: it.id
                    }))}
                    value={line.item_id}
                    onChange={(val) => handleLineChange(index, 'item_id', val)}
                    placeholder="🔍 اختر الصنف..."
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>
                    الكمية
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(index, 'quantity', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(194, 155, 98, 0.3)',
                      background: '#FDFBF7',
                      color: '#1E130B',
                      fontWeight: 800,
                      textAlign: 'center',
                      minHeight: '40px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Unit Price */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>
                    سعر الوحدة
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={line.unit_price}
                    onChange={(e) => handleLineChange(index, 'unit_price', Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(194, 155, 98, 0.3)',
                      background: '#FDFBF7',
                      color: '#1E130B',
                      fontWeight: 800,
                      textAlign: 'center',
                      minHeight: '40px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* VAT Amount */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>
                    الضريبة (15%)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={Number(line.tax_amount || 0).toFixed(2)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(194, 155, 98, 0.2)',
                      background: '#FDFBF7',
                      color: '#8c6b32',
                      fontWeight: 800,
                      textAlign: 'center',
                      minHeight: '40px'
                    }}
                  />
                </div>

                {/* Line Total */}
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>
                    الإجمالي
                  </label>
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    background: 'rgba(5, 150, 105, 0.08)',
                    color: '#059669',
                    fontWeight: 900,
                    textAlign: 'center',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(5, 150, 105, 0.2)'
                  }}>
                    {((Number(line.unit_price) * Number(line.quantity)) + (taxMode === 'exclusive' ? Number(line.tax_amount || 0) : 0)).toFixed(2)}
                  </div>
                </div>

                {/* Delete Button */}
                <div>
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    disabled={lines.length === 1}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: lines.length === 1 ? 'rgba(0,0,0,0.05)' : 'rgba(168, 87, 60, 0.1)',
                      color: lines.length === 1 ? '#ccc' : '#A8573C',
                      border: '1px solid rgba(168, 87, 60, 0.25)',
                      cursor: lines.length === 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px'
                    }}
                    title="حذف هذا الصنف"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addLine}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(194, 155, 98, 0.4)',
              background: '#FFFFFF',
              color: '#8c6b32',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '38px'
            }}
          >
            <span>➕ إضافة صنف آخر</span>
          </button>
        </div>

        {/* 4. Financial Summary Card */}
        <div style={{
          background: '#FDFBF7',
          borderRadius: '16px',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6e5d4f' }}>
            <span>الإجمالي قبل الضريبة:</span>
            <span style={{ fontWeight: 800, color: '#1E130B' }}>{formatCurrency(totalBeforeTax)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6e5d4f' }}>
            <span>ضريبة القيمة المضافة (15%):</span>
            <span style={{ fontWeight: 800, color: '#8c6b32' }}>{formatCurrency(totalTax)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '16px',
            borderTop: '1.5px dashed rgba(194, 155, 98, 0.3)',
            paddingTop: '8px',
            color: '#1E130B'
          }}>
            <span style={{ fontWeight: 900 }}>الإجمالي المستحق للمورد:</span>
            <span style={{ fontWeight: 900, color: '#059669' }}>{formatCurrency(netPayable)}</span>
          </div>
        </div>

        {/* 5. Notes */}
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>
            📝 ملاحظات وشروط التوريد
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="شروط التسليم، رقم فاتورة المورد، طريقة الدفع المتفق عليها..."
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(194, 155, 98, 0.3)',
              background: '#FDFBF7',
              color: '#1E130B',
              fontWeight: 700,
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* 6. Footer Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '12px',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              background: '#FDFBF7',
              color: '#1E130B',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            style={{
              padding: '10px 26px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)',
              minHeight: '44px'
            }}
          >
            {isLoading ? 'جاري الحفظ... ⏳' : '💾 حفظ وتأكيد أمر الشراء'}
          </button>
        </div>
      </div>
    </div>
  );
}
