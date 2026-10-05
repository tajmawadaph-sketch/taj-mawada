"use client";
import React, { useState, useEffect, useMemo } from 'react';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { showGlobalToast } from '@/lib/toast-context';
import { useConfirm } from '@/components/ConfirmContext';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import {
  FixedAsset,
  DEFAULT_COST_CENTERS,
  loadFixedAssets,
  saveFixedAssets,
  computeAssetMetrics,
  postMonthlyDepreciationEntry
} from '@/lib/assets_depreciation_engine';

export default function FixedAssetsPage() {
  const { showConfirm } = useConfirm();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDepreciating, setIsDepreciating] = useState(false);
  const [editingAsset, setEditingAsset] = useState<any>({
    code: '',
    name: '',
    category: 'vehicles',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_cost: 0,
    salvage_value: 0,
    useful_life_years: 5,
    cost_center_id: 'CC-FLEET',
    status: 'active',
    notes: ''
  });

  useEffect(() => {
    setIsClient(true);
    setAssets(loadFixedAssets());
  }, []);

  const handleSaveAsset = () => {
    if (!editingAsset.name || !editingAsset.purchase_cost) {
      showGlobalToast("يرجى إدخال اسم الأصل وتكلفة الشراء", 'warning');
      return;
    }

    const cc = DEFAULT_COST_CENTERS.find(c => c.id === editingAsset.cost_center_id);
    const costCenterName = cc ? cc.name : 'عام';

    let updatedList: FixedAsset[];
    if (editingAsset.id) {
      updatedList = assets.map(a => a.id === editingAsset.id ? computeAssetMetrics({ ...editingAsset, cost_center_name: costCenterName }) : a);
    } else {
      const newAsset = computeAssetMetrics({
        ...editingAsset,
        id: `FA-${Date.now()}`,
        code: editingAsset.code || `AST-${Date.now().toString().slice(-4)}`,
        cost_center_name: costCenterName
      });
      updatedList = [newAsset, ...assets];
    }

    setAssets(updatedList);
    saveFixedAssets(updatedList);
    setIsModalOpen(false);
    showGlobalToast("✅ تم حفظ بيانات الأصل الثابت بنجاح", 'success');
  };

  const handleDeleteAsset = (id: string) => {
    showConfirm({
      title: "تأكيد حذف الأصل الرأسمالي",
      message: "هل أنت متأكد من حذف هذا الأصل من السجل المحاسبي؟ لن يؤثر الحذف على القيود الدفترية المرحلة مسبقاً.",
      type: "danger",
      confirmText: "حذف نهائي",
      cancelText: "إلغاء",
      onConfirm: () => {
        const updated = assets.filter(a => a.id !== id);
        setAssets(updated);
        saveFixedAssets(updated);
        showGlobalToast("تم حذف الأصل بنجاح", 'info');
      }
    });
  };

  // Run Monthly Depreciation Generator
  const handleRunMonthlyDepreciation = async () => {
    setIsDepreciating(true);
    const monthStr = new Date().toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });
    const result = await postMonthlyDepreciationEntry(monthStr, assets);
    setIsDepreciating(false);

    if (result.success) {
      // Re-compute and advance months
      const updated = assets.map(a => {
        if (a.status === 'active' && a.net_book_value > a.salvage_value) {
          const newMonths = a.months_in_service + 1;
          const depreciable = Math.max(0, a.purchase_cost - a.salvage_value);
          const newAcc = Math.min(depreciable, a.monthly_depreciation * newMonths);
          return {
            ...a,
            months_in_service: newMonths,
            accumulated_depreciation: Math.round(newAcc * 100) / 100,
            net_book_value: Math.round((a.purchase_cost - newAcc) * 100) / 100
          };
        }
        return a;
      });
      setAssets(updated);
      saveFixedAssets(updated);
      showGlobalToast(`✨ تم ترحيل قيد إهلاك شهر ${monthStr} بقيمة ${formatCurrency(result.totalAmount)} بنجاح!`, 'success');
    } else {
      showGlobalToast(result.error || "تعذر ترحيل قيد الإهلاك", 'error');
    }
  };

  // Metrics
  const { totalCost, totalAccDep, totalNetBook, totalMonthlyDep } = useMemo(() => {
    return assets.reduce((acc, a) => {
      acc.totalCost += Number(a.purchase_cost || 0);
      acc.totalAccDep += Number(a.accumulated_depreciation || 0);
      acc.totalNetBook += Number(a.net_book_value || 0);
      if (a.status === 'active') acc.totalMonthlyDep += Number(a.monthly_depreciation || 0);
      return acc;
    }, { totalCost: 0, totalAccDep: 0, totalNetBook: 0, totalMonthlyDep: 0 });
  }, [assets]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const matchCat = activeCategory === 'all' || a.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || a.cost_center_name.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [assets, activeCategory, searchQuery]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows = filteredAssets.map((a, idx) => ({
      '#': idx + 1,
      'كود الأصل': a.code,
      'اسم الأصل': a.name,
      'التصنيف': a.category === 'vehicles' ? 'شاحنات وسيارات' : a.category === 'medical_equipment' ? 'معدات بيطرية' : a.category === 'pos_it' ? 'نقاط بيع وحواسيب' : 'أثاث وتجهيزات',
      'مركز التكلفة': a.cost_center_name,
      'تاريخ الشراء': a.purchase_date,
      'تكلفة الشراء (SAR)': a.purchase_cost,
      'القيمة التخريدية (SAR)': a.salvage_value,
      'العمر الإنتاجي (سنوات)': a.useful_life_years,
      'الإهلاك السنوي (SAR)': a.annual_depreciation,
      'الإهلاك الشهري (SAR)': a.monthly_depreciation,
      'مجمع الإهلاك (SAR)': a.accumulated_depreciation,
      'صافي القيمة الدفترية (SAR)': a.net_book_value,
      'الحالة': a.status === 'active' ? 'في الخدمة' : a.status === 'maintenance' ? 'تحت الصيانة' : 'مستبعد'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "سجل الأصول الثابتة");
    XLSX.writeFile(wb, `Taj_Fixed_Assets_${new Date().toISOString().split('T')[0]}.xlsx`);
    showGlobalToast("✅ تم تصدير سجل الأصول إلى Excel", 'success');
  };

  if (!isClient) return null;

  return (
    <MasterPage
      title="سجل الأصول الثابتة والإهلاك المحاسبي الآلي"
      subtitle="إدارة الأصول الرأسمالية (سيارات التوزيع، المعدات الطبية والبيطرية، أجهزة نقاط البيع) وتوليد قيود الإهلاك"
      icon="🏗️"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* Print Styles */}
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; color: #1E130B !important; }
            table { width: 100% !important; border-collapse: collapse !important; }
            th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
          }
          @media (max-width: 768px) {
            .fa-kpi-grid { grid-template-columns: 1fr !important; }
            .fa-actions-row { flex-direction: column !important; }
          }
        `}</style>

        <PrintHeader title="سجل الأصول الثابتة ومجمع الإهلاك" subtitle={`كما في تاريخ: ${new Date().toLocaleDateString('ar-SA')}`} />

        {/* 1. Header Toolbar */}
        <div className="no-print" style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          borderRadius: '20px',
          padding: '20px 24px',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Search box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="text"
              placeholder="ابحث بكود الأصل، الاسم، مركز التكلفة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(194, 155, 98, 0.3)',
                background: '#FDFBF7',
                color: '#1E130B',
                fontWeight: 700,
                fontSize: '13px',
                width: '260px',
                minHeight: '44px',
                outline: 'none'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setEditingAsset({
                  code: '',
                  name: '',
                  category: 'vehicles',
                  purchase_date: new Date().toISOString().split('T')[0],
                  purchase_cost: 0,
                  salvage_value: 0,
                  useful_life_years: 5,
                  cost_center_id: 'CC-FLEET',
                  status: 'active',
                  notes: ''
                });
                setIsModalOpen(true);
              }}
              style={{
                background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.25)',
                minHeight: '44px'
              }}
            >
              <span>➕ إضافة أصل ثابت</span>
            </button>

            <button
              onClick={handleRunMonthlyDepreciation}
              disabled={isDepreciating}
              style={{
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)',
                minHeight: '44px'
              }}
            >
              <span>{isDepreciating ? 'جاري الترحيل... ⏳' : '⚡ ترحيل قيد الإهلاك الشهري'}</span>
            </button>

            <button
              onClick={() => window.print()}
              style={{
                background: '#FDFBF7',
                color: '#1E130B',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                padding: '10px 16px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px'
              }}
            >
              <span>طباعة A4</span>
              <span>🖨️</span>
            </button>

            <button
              onClick={exportToExcel}
              style={{
                background: '#FDFBF7',
                color: '#1E130B',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                padding: '10px 16px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '44px'
              }}
            >
              <span>تصدير Excel</span>
              <span>📑</span>
            </button>
          </div>
        </div>

        {/* 2. Top Luxury KPI Cards Grid */}
        <div className="fa-kpi-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '14px'
        }}>
          {/* Total Cost */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(194, 155, 98, 0.3)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي التكلفة التاريخية</span>
              <span style={{ fontSize: '18px' }}>🏗️</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
              {formatCurrency(totalCost)}
            </div>
            <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
              {assets.length} أصل رأسمالي مسجل
            </div>
          </div>

          {/* Accumulated Depreciation */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(168, 87, 60, 0.3)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(168, 87, 60, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>مجمع الإهلاك المتراكم</span>
              <span style={{ fontSize: '18px' }}>📉</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#A8573C', marginTop: '8px' }}>
              {formatCurrency(totalAccDep)}
            </div>
            <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
              حساب مقابل الأصول (كود 129)
            </div>
          </div>

          {/* Net Book Value */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(5, 150, 105, 0.35)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>صافي القيمة الدفترية الحالية</span>
              <span style={{ fontSize: '18px' }}>💎</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '8px' }}>
              {formatCurrency(totalNetBook)}
            </div>
            <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px', fontWeight: 700 }}>
              القيمة الدفترية المعترف بها بالميزانية
            </div>
          </div>

          {/* Monthly Depreciation */}
          <div style={{
            background: '#FFFFFF',
            border: '1.5px solid rgba(194, 155, 98, 0.35)',
            borderRadius: '16px',
            padding: '18px 20px',
            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>قسط الإهلاك الشهري المحمل</span>
              <span style={{ fontSize: '18px' }}>⚡</span>
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: '#C29B62', marginTop: '8px' }}>
              {formatCurrency(totalMonthlyDep)}
            </div>
            <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
              يحمّل شهرياً لقائمة الدخل ومراكز التكلفة
            </div>
          </div>
        </div>

        {/* 3. Category Filter Pills */}
        <div className="no-print" style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          borderBottom: '2px solid rgba(194, 155, 98, 0.2)',
          paddingBottom: '10px'
        }}>
          {[
            { id: 'all', label: 'كافة الأصول الثابتة', icon: '🏛️' },
            { id: 'vehicles', label: 'شاحنات وسيارات التوزيع', icon: '🚚' },
            { id: 'medical_equipment', label: 'المعدات والأجهزة الطبية', icon: '🔬' },
            { id: 'pos_it', label: 'أجهزة نقاط البيع والشبكات', icon: '💻' },
            { id: 'furniture', label: 'الأثاث والتجهيزات', icon: '🪑' }
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '12px',
                border: 'none',
                background: activeCategory === cat.id ? '#1E130B' : '#FDFBF7',
                color: activeCategory === cat.id ? '#FFFFFF' : '#6e5d4f',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 4. Fixed Assets Table */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          border: '1px solid rgba(194, 155, 98, 0.25)',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
        }}>
          <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
              <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                <tr>
                  <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>كود الأصل</th>
                  <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>اسم الأصل وتفاصيله</th>
                  <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>مركز التكلفة</th>
                  <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>تاريخ الشراء</th>
                  <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>تكلفة الشراء</th>
                  <th style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 900 }}>العمر (سنوات)</th>
                  <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>الإهلاك الشهري</th>
                  <th style={{ padding: '12px 14px', color: '#A8573C', fontWeight: 900 }}>مجمع الإهلاك</th>
                  <th style={{ padding: '12px 14px', color: '#059669', fontWeight: 900 }}>صافي القيمة الدفترية</th>
                  <th className="no-print" style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900, textAlign: 'center' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '30px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                      لا توجد أصول مسجلة تطابق التصنيف المختار.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset, idx) => (
                    <tr
                      key={asset.id || idx}
                      style={{
                        borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                        background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#8c6b32', fontFamily: 'monospace' }}>
                        {asset.code}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 900, color: '#1E130B' }}>{asset.name}</div>
                        {asset.notes && <div style={{ fontSize: '11px', color: '#6e5d4f' }}>{asset.notes}</div>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: 'rgba(194, 155, 98, 0.12)',
                          color: '#8c6b32'
                        }}>
                          {asset.cost_center_name}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6e5d4f' }}>{asset.purchase_date}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 900, color: '#1E130B' }}>
                        {formatCurrency(asset.purchase_cost)}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 700 }}>
                        {asset.useful_life_years} سنوات
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 900, color: '#C29B62' }}>
                        {formatCurrency(asset.monthly_depreciation)}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 900, color: '#A8573C' }}>
                        {formatCurrency(asset.accumulated_depreciation)}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 900, color: '#059669', fontSize: '14px' }}>
                        {formatCurrency(asset.net_book_value)}
                      </td>
                      <td className="no-print" style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              setEditingAsset({ ...asset });
                              setIsModalOpen(true);
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              background: '#FDFBF7',
                              border: '1px solid rgba(194, 155, 98, 0.35)',
                              color: '#1E130B',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteAsset(asset.id)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '8px',
                              background: 'rgba(168, 87, 60, 0.1)',
                              border: '1px solid rgba(168, 87, 60, 0.3)',
                              color: '#A8573C',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4.1 Certified Audit Verification & SOCPA Signatures (Printed & On-Screen) */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid rgba(194, 155, 98, 0.3)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 4px 18px rgba(30, 19, 11, 0.03)'
        }}>
          {/* Summary & QR Code Line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1.5px dashed rgba(194, 155, 98, 0.3)', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ background: '#FFFFFF', padding: '6px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.35)' }}>
                <QRCodeSVG
                  value={`TAJ-ASSETS-REGISTRY|Cost:${totalCost}|Net:${totalNetBook}|Dep:${totalAccDep}|Count:${assets.length}|Date:${new Date().toISOString()}`}
                  size={70}
                  level="M"
                />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                  سجل الأصول الرأسمالية والإهلاك المعتمد - صيدلية تاج المودة البيطرية
                </div>
                <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px', fontWeight: 700 }}>
                  وثيقة محاسبية رسمية صادرة ومطابقة لمعايير الهيئة السعودية للمحاسبين والمراجعين (SOCPA)
                </div>
                <div style={{ fontSize: '11px', color: '#8c6b32', marginTop: '2px', fontWeight: 800 }}>
                  الرمز المشفر: TAJ-AST-{assets.length}-{Math.round(totalNetBook)} | تاريخ الاعتماد: {new Date().toLocaleDateString('ar-SA')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', textAlign: 'left' }}>
              <div>
                <div style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 700 }}>إجمالي التكلفة</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>{formatCurrency(totalCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 700 }}>مجمع الإهلاك</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#A8573C' }}>{formatCurrency(totalAccDep)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 700 }}>صافي القيمة الدفترية</div>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#059669' }}>{formatCurrency(totalNetBook)}</div>
              </div>
            </div>
          </div>

          {/* Official Signature Blocks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', paddingTop: '6px', textAlign: 'center' }}>
            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#1E130B' }}>المحاسب المسؤول</div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>إعداد القيود ومطابقة الأصول</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '11px', color: '#8c6b32', fontWeight: 800 }}>التوقيع والاعتماد</div>
            </div>
            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#1E130B' }}>المدير المالي (CFO)</div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>اعتماد نسب الإهلاك ومراكز التكلفة</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '11px', color: '#8c6b32', fontWeight: 800 }}>التوقيع والختم</div>
            </div>
            <div style={{ border: '1px dashed rgba(194, 155, 98, 0.4)', borderRadius: '12px', padding: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#1E130B' }}>الإدارة العامة / التدقيق الداخلي</div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>المصادقة السنوية والتقرير الختامي</div>
              <div style={{ height: '32px' }}></div>
              <div style={{ borderTop: '1px solid rgba(194, 155, 98, 0.3)', paddingTop: '4px', fontSize: '11px', color: '#8c6b32', fontWeight: 800 }}>الاعتماد النهائي</div>
            </div>
          </div>
        </div>

        {/* 5. Asset Modal */}
        {isModalOpen && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(30, 19, 11, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              padding: '28px',
              width: '540px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              boxShadow: '0 20px 40px rgba(30, 19, 11, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 900, color: '#1E130B', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', paddingBottom: '10px' }}>
                {editingAsset.id ? '✏️ تعديل بيانات الأصل الثابت' : '➕ تسجيل أصل ثابت جديد'}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>اسم الأصل الرأسمالي:</label>
                  <input
                    type="text"
                    value={editingAsset.name}
                    onChange={(e) => setEditingAsset({ ...editingAsset, name: e.target.value })}
                    placeholder="مثال: شاحنة إيسوزو توزيع، جهاز سونار بيطري..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>كود الأصل:</label>
                    <input
                      type="text"
                      value={editingAsset.code}
                      onChange={(e) => setEditingAsset({ ...editingAsset, code: e.target.value })}
                      placeholder="AST-V01"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>تصنيف الأصل:</label>
                    <select
                      value={editingAsset.category}
                      onChange={(e) => setEditingAsset({ ...editingAsset, category: e.target.value })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    >
                      <option value="vehicles">شاحنات وسيارات النقل والتوزيع</option>
                      <option value="medical_equipment">الأجهزة والمعدات الطبية والبيطرية</option>
                      <option value="pos_it">أجهزة نقاط البيع والحواسيب (POS/IT)</option>
                      <option value="furniture">الأثاث والتجهيزات والديكور</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>مركز التكلفة المرتبط:</label>
                    <select
                      value={editingAsset.cost_center_id}
                      onChange={(e) => setEditingAsset({ ...editingAsset, cost_center_id: e.target.value })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    >
                      {DEFAULT_COST_CENTERS.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>تاريخ الشراء / بدء الخدمة:</label>
                    <input
                      type="date"
                      value={editingAsset.purchase_date}
                      onChange={(e) => setEditingAsset({ ...editingAsset, purchase_date: e.target.value })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>تكلفة الشراء (SAR):</label>
                    <input
                      type="number"
                      value={editingAsset.purchase_cost}
                      onChange={(e) => setEditingAsset({ ...editingAsset, purchase_cost: Number(e.target.value) })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>القيمة التخريدية:</label>
                    <input
                      type="number"
                      value={editingAsset.salvage_value}
                      onChange={(e) => setEditingAsset({ ...editingAsset, salvage_value: Number(e.target.value) })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>العمر الإنتاجي (سنوات):</label>
                    <input
                      type="number"
                      value={editingAsset.useful_life_years}
                      onChange={(e) => setEditingAsset({ ...editingAsset, useful_life_years: Number(e.target.value) })}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>ملاحظات ومواصفات:</label>
                  <textarea
                    value={editingAsset.notes || ''}
                    onChange={(e) => setEditingAsset({ ...editingAsset, notes: e.target.value })}
                    rows={2}
                    placeholder="رقم الهيكل، الضمان، المورد..."
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: '10px 18px', borderRadius: '12px', border: '1px solid #C29B62', background: 'transparent', color: '#1E130B', fontWeight: 800, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveAsset}
                  style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', background: '#C29B62', color: '#FFFFFF', fontWeight: 900, cursor: 'pointer' }}
                >
                  حفظ الأصل
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MasterPage>
  );
}
