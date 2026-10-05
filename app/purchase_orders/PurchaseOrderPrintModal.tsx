"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, tafqeet } from '@/lib/helpers';
import { QRCodeSVG } from 'qrcode.react';

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: any;
}

export default function PurchaseOrderPrintModal({ isOpen, onClose, record }: PurchaseOrderPrintModalProps) {
  const [mounted, setMounted] = useState(false);
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted || !record) return null;

  const printDocument = () => {
    const originalTitle = document.title;
    document.title = record?.transaction_number ? `Taj_PO_${record.transaction_number}` : 'Purchase_Order';
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  };

  const linesToPrint = record.items || [];
  const subtotal = linesToPrint.reduce((sum: number, item: any) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)), 0);
  const taxTotal = linesToPrint.reduce((sum: number, item: any) => sum + (Number(item.tax_amount) || 0), 0);
  const totalAmount = Number(record.total_amount) || (subtotal + taxTotal);
  const tafqeetText = tafqeet(totalAmount);

  const qrPayload = `TAJ-PO|Num:${record.transaction_number}|Supplier:${record.partners?.name || 'مورد عام'}|Total:${totalAmount.toFixed(2)}|VAT:${taxTotal.toFixed(2)}|Date:${record.transaction_date}|ZATCA:300078945600003`;

  return createPortal(
    <div className="po-print-overlay">
      <style>{`
        .po-print-overlay {
          position: fixed !important;
          inset: 0 !important;
          background: rgba(30, 19, 11, 0.75) !important;
          z-index: 99999999 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
          padding: 24px 16px !important;
          overflow-y: auto !important;
          direction: rtl !important;
          font-family: var(--font-cairo), 'Segoe UI', Tahoma, sans-serif !important;
        }

        .po-print-toolbar {
          display: flex !important;
          gap: 12px !important;
          margin-bottom: 20px !important;
          background: #FFFFFF !important;
          padding: 12px 24px !important;
          border-radius: 40px !important;
          box-shadow: 0 10px 30px rgba(30, 19, 11, 0.25) !important;
          border: 1px solid rgba(194, 155, 98, 0.35) !important;
          position: sticky !important;
          top: 16px !important;
          z-index: 100000000 !important;
        }

        .po-tool-btn {
          padding: 10px 20px;
          border-radius: 12px;
          border: none;
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .po-tool-btn.primary {
          background: linear-gradient(135deg, #C29B62 0%, #A88348 100%);
          color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(194, 155, 98, 0.3);
        }
        .po-tool-btn.toggle {
          background: #FDFBF7;
          color: #1E130B;
          border: 1px solid rgba(194, 155, 98, 0.4);
        }
        .po-tool-btn.close {
          background: rgba(168, 87, 60, 0.1);
          color: #A8573C;
          border: 1px solid rgba(168, 87, 60, 0.3);
        }

        /* 🖨️ A4 Preview */
        .po-a4-box {
          width: 210mm;
          min-height: 297mm;
          background: #FFFFFF;
          padding: 18mm 16mm;
          border-radius: 8px;
          color: #1E130B;
          box-shadow: 0 10px 40px rgba(30, 19, 11, 0.2);
          box-sizing: border-box;
          position: relative;
        }

        /* 🧾 Thermal Preview */
        .po-thermal-box {
          width: 80mm;
          background: #FFFFFF;
          padding: 8mm 5mm;
          border-radius: 6px;
          color: #000000;
          font-size: 11px;
          font-family: 'Courier New', Courier, monospace;
          box-shadow: 0 10px 30px rgba(30, 19, 11, 0.15);
          box-sizing: border-box;
          line-height: 1.4;
        }

        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #FFFFFF !important;
            overflow: visible !important;
          }
          body > *:not(.po-print-overlay) {
            display: none !important;
          }
          .no-print, .po-print-toolbar {
            display: none !important;
          }
          .po-print-overlay {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
        }
      `}</style>

      {/* A4 Print Rules */}
      {printFormat === 'a4' && (
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            .po-a4-box {
              width: 100% !important;
              min-height: auto !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
              page-break-inside: avoid !important;
            }
          }
        `}</style>
      )}

      {/* Thermal Print Rules */}
      {printFormat === 'thermal' && (
        <style>{`
          @media print {
            @page {
              size: 80mm auto;
              margin: 2mm;
            }
            .po-thermal-box {
              width: 76mm !important;
              padding: 0 !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
        `}</style>
      )}

      {/* Action Bar */}
      <div className="po-print-toolbar no-print">
        <button onClick={printDocument} className="po-tool-btn primary">
          <span>🖨️ طباعة المستند</span>
        </button>
        <button
          onClick={() => setPrintFormat(f => f === 'a4' ? 'thermal' : 'a4')}
          className="po-tool-btn toggle"
        >
          <span>{printFormat === 'a4' ? '🧾 التحويل للطباعة الحرارية (80mm)' : '📄 التحويل لطباعة A4 الرسمية'}</span>
        </button>
        <button onClick={onClose} className="po-tool-btn close">
          <span>✕ إغلاق</span>
        </button>
      </div>

      {/* Format 1: A4 Official Purchase Order */}
      {printFormat === 'a4' ? (
        <div className="po-a4-box">
          
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '2.5px solid #1E130B',
            paddingBottom: '16px',
            marginBottom: '20px'
          }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#1E130B' }}>
                شركة صيدلية تاج المودة البيطرية
              </h1>
              <div style={{ fontSize: '13px', color: '#8c6b32', fontWeight: 800, marginTop: '2px' }}>
                Taj Al-Mawadah Veterinary Pharmacy LLC
              </div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '4px' }}>
                السجل التجاري: 1010892341 | ترخيص وزارة البيئة والمياه والزراعة: 440219
              </div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>
                الرقم الضريبي الموحد: <strong style={{ color: '#1E130B' }}>300078945600003</strong>
              </div>
            </div>

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div style={{
                background: '#FDFBF7',
                border: '1.5px solid #C29B62',
                borderRadius: '10px',
                padding: '6px 14px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>أمر شراء وتوريد بضاعة</div>
                <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 800 }}>Purchase Order (PO)</div>
              </div>
              <div style={{ background: '#FFFFFF', padding: '4px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)' }}>
                <QRCodeSVG value={qrPayload} size={70} level="M" />
              </div>
            </div>
          </div>

          {/* Metadata Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '22px' }}>
            {/* Supplier Box */}
            <div style={{
              background: '#FDFBF7',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              borderRadius: '12px',
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#8c6b32', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '4px', marginBottom: '6px' }}>
                بيانات المورد والشريك:
              </div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                {record.partners?.name || 'مورد عام معتمد'}
              </div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '3px' }}>
                النوع: مورد مستلزمات وأدوية بيطرية
              </div>
              {record.partners?.tax_number && (
                <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>
                  الرقم الضريبي للمورد: {record.partners.tax_number}
                </div>
              )}
            </div>

            {/* PO Info Box */}
            <div style={{
              background: '#FDFBF7',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              borderRadius: '12px',
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#8c6b32', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '4px', marginBottom: '6px' }}>
                تفاصيل أمر التوريد:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span style={{ color: '#6e5d4f' }}>رقم الأمر:</span>
                <strong style={{ color: '#1E130B', fontFamily: 'monospace' }}>{record.transaction_number}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                <span style={{ color: '#6e5d4f' }}>تاريخ الأمر:</span>
                <strong style={{ color: '#1E130B' }}>{new Date(record.transaction_date).toLocaleDateString('ar-SA')}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#6e5d4f' }}>مستودع الاستلام:</span>
                <strong style={{ color: '#059669' }}>المستودع المركزي الرئيسي</strong>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div style={{ marginBottom: '22px', border: '1px solid rgba(194, 155, 98, 0.3)', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#FDFBF7', borderBottom: '1.5px solid #C29B62' }}>
                  <th style={{ padding: '10px 12px', width: '35px', textAlign: 'center', color: '#8c6b32' }}>#</th>
                  <th style={{ padding: '10px 12px', color: '#1E130B', fontWeight: 900 }}>الصنف والبيان</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#1E130B', fontWeight: 900 }}>الكمية</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#1E130B', fontWeight: 900 }}>سعر الوحدة</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#8c6b32', fontWeight: 900 }}>ضريبة 15%</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', color: '#1E130B', fontWeight: 900 }}>الإجمالي (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {linesToPrint.map((item: any, idx: number) => {
                  const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
                  const lineTax = Number(item.tax_amount) || 0;
                  const lineGross = lineTotal + lineTax;
                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#FCFAF7'
                      }}
                    >
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#8c6b32', fontWeight: 800 }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 900, color: '#1E130B' }}>{item.inventory_items?.name || 'صنف غير محدد'}</div>
                        {item.inventory_items?.unit && (
                          <div style={{ fontSize: '10px', color: '#6e5d4f' }}>الوحدة: {item.inventory_items.unit}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 900, color: '#1E130B' }}>
                        {item.quantity}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                        {formatCurrency(item.unit_price)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: '#8c6b32', fontWeight: 800 }}>
                        {formatCurrency(lineTax)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 900, color: '#059669' }}>
                        {formatCurrency(lineGross)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals & Tafqeet Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '26px', alignItems: 'flex-start' }}>
            {/* Tafqeet & Notes Box */}
            <div style={{
              background: '#FDFBF7',
              border: '1px solid rgba(194, 155, 98, 0.3)',
              borderRadius: '12px',
              padding: '14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#8c6b32', marginBottom: '4px' }}>
                المبلغ الإجمالي بالحروف العربية:
              </div>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '10px' }}>
                فقط {tafqeetText}
              </div>

              {record.notes && (
                <div style={{ borderTop: '1px dashed rgba(194, 155, 98, 0.3)', paddingTop: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#6e5d4f' }}>ملاحظات التوريد:</div>
                  <div style={{ fontSize: '12px', color: '#1E130B', marginTop: '2px' }}>{record.notes}</div>
                </div>
              )}
            </div>

            {/* Financial Summary Box */}
            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid #C29B62',
              borderRadius: '12px',
              padding: '14px 18px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', color: '#6e5d4f' }}>
                <span>الإجمالي قبل الضريبة:</span>
                <span style={{ fontWeight: 800, color: '#1E130B' }}>{formatCurrency(subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '8px', color: '#6e5d4f' }}>
                <span>ضريبة القيمة المضافة (15%):</span>
                <span style={{ fontWeight: 800, color: '#8c6b32' }}>{formatCurrency(taxTotal)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '15px',
                borderTop: '2px solid #1E130B',
                paddingTop: '8px',
                color: '#1E130B'
              }}>
                <span style={{ fontWeight: 900 }}>الإجمالي المستحق للمورد:</span>
                <span style={{ fontWeight: 900, color: '#059669' }}>{formatCurrency(totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Official Signatures */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            marginTop: '36px',
            textAlign: 'center'
          }}>
            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, color: '#1E130B' }}>أمين المستودع والمستلم</div>
              <div style={{ fontSize: '10px', color: '#6e5d4f' }}>مطابقة الأصناف والكميات</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '10px', color: '#8c6b32', fontWeight: 800 }}>التوقيع والتاريخ</div>
            </div>

            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, color: '#1E130B' }}>مسؤول المشتريات والتوريد</div>
              <div style={{ fontSize: '10px', color: '#6e5d4f' }}>مطابقة عروض الأسعار</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '10px', color: '#8c6b32', fontWeight: 800 }}>التوقيع والتاريخ</div>
            </div>

            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '10px', padding: '10px' }}>
              <div style={{ fontSize: '11px', fontWeight: 900, color: '#1E130B' }}>المدير المالي والاعتماد العام</div>
              <div style={{ fontSize: '10px', color: '#6e5d4f' }}>المصادقة والتسجيل الدفتري</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '10px', color: '#8c6b32', fontWeight: 800 }}>الختم والاعتماد</div>
            </div>
          </div>

          {/* Footer note */}
          <div style={{
            position: 'absolute',
            bottom: '12mm',
            left: '16mm',
            right: '16mm',
            textAlign: 'center',
            fontSize: '10px',
            color: '#8c6b32',
            borderTop: '1px solid rgba(194, 155, 98, 0.2)',
            paddingTop: '6px'
          }}>
            تم إصدار وتوثيق هذا المستند آلياً عبر نظام تاج المودة ERP & POS | الرقم المرجعي: {record.transaction_number}
          </div>
        </div>
      ) : (
        /* Format 2: Thermal 80mm Receipt */
        <div className="po-thermal-box">
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '15px', fontWeight: 900 }}>صيدلية تاج المودة البيطرية</div>
            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>أمر شراء وتوريد | PO</div>
            <div style={{ fontSize: '9px' }}>الرقم الضريبي: 300078945600003</div>
          </div>

          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

          <div style={{ fontSize: '10px', marginBottom: '6px' }}>
            <div>رقم الأمر: {record.transaction_number}</div>
            <div>التاريخ: {record.transaction_date}</div>
            <div>المورد: {record.partners?.name || 'مورد عام'}</div>
          </div>

          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <th style={{ textAlign: 'right', padding: '2px 0' }}>الصنف</th>
                <th style={{ textAlign: 'center', padding: '2px 0' }}>كمية</th>
                <th style={{ textAlign: 'left', padding: '2px 0' }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {linesToPrint.map((line: any, idx: number) => {
                const lTot = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) + (Number(line.tax_amount) || 0);
                return (
                  <tr key={idx} style={{ borderBottom: '1px dashed #ddd' }}>
                    <td style={{ textAlign: 'right', padding: '3px 0' }}>{line.inventory_items?.name}</td>
                    <td style={{ textAlign: 'center', padding: '3px 0' }}>{line.quantity}</td>
                    <td style={{ textAlign: 'left', padding: '3px 0' }}>{lTot.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

          <div style={{ fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الإجمالي قبل الضريبة:</span>
              <span>{subtotal.toFixed(2)} ر.س</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ضريبة القيمة المضافة (15%):</span>
              <span>{taxTotal.toFixed(2)} ر.س</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px', marginTop: '4px', borderTop: '1px solid #000', paddingTop: '4px' }}>
              <span>الصافي المستحق:</span>
              <span>{totalAmount.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div style={{ fontSize: '9px', textAlign: 'center', margin: '8px 0', fontStyle: 'italic' }}>
            فقط {tafqeetText}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <QRCodeSVG value={qrPayload} size={85} level="M" />
          </div>

          <div style={{ fontSize: '9px', textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '6px' }}>
            المستلم: أمين المستودع<br />
            نظام إدارة المشتريات - تاج المودة
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
