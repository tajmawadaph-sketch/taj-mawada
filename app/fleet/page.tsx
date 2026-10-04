"use client";
import React, { useMemo } from 'react';
import { useFleetLogic } from './fleet_logic';
import MasterPage from '@/components/MasterPage';
import RawasiSmartTable from '@/components/rawasismarttable';
import LoadingScreen from '@/components/LoadingScreen';
import SecureAction from '@/components/SecureAction';
import Link from 'next/link';
import { formatCurrency } from '@/lib/helpers';

export default function FleetPage() {
  const logic = useFleetLogic();

  const activeCount = useMemo(() => {
    return logic.vehicles.filter((v: any) => v.status === 'متاح').length;
  }, [logic.vehicles]);

  const columns = [
    {
      key: 'plate_number',
      label: 'رقم اللوحة',
      sortable: true,
      render: (row: any) => (
        <span style={{ fontWeight: 900, color: '#1E130B', background: '#FDFBF7', padding: '4px 10px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.3)', fontFamily: 'monospace' }}>
          {row.plate_number}
        </span>
      )
    },
    {
      key: 'vehicle_model',
      label: 'نوع وموديل السيارة',
      sortable: true,
      render: (row: any) => (
        <span style={{ fontWeight: 800, color: '#1E130B' }}>{row.vehicle_model}</span>
      )
    },
    {
      key: 'driver',
      label: 'المندوب / السائق المسؤول',
      sortable: true,
      render: (row: any) => (
        <span style={{ fontWeight: 700, color: '#6e5d4f' }}>{row.driver?.name || 'غير محدد'}</span>
      )
    },
    {
      key: 'cost_center',
      label: 'مركز التكلفة',
      render: () => (
        <span style={{ padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, background: 'rgba(194, 155, 98, 0.12)', color: '#8c6b32' }}>
          أسطول التوزيع (CC-FLEET)
        </span>
      )
    },
    {
      key: 'status',
      label: 'الحالة التشغيلية',
      sortable: true,
      render: (row: any) => {
        const isAvail = row.status === 'متاح';
        return (
          <span style={{
            padding: '4px 10px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 800,
            background: isAvail ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
            color: isAvail ? '#059669' : '#A8573C',
            border: `1px solid ${isAvail ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`
          }}>
            {row.status}
          </span>
        );
      }
    },
    {
      key: 'actions',
      label: 'إجراءات',
      type: 'actions',
      render: (row: any) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
          <Link
            href={`/vehicle-expenses`}
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              background: '#FDFBF7',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              color: '#8c6b32',
              fontSize: '11px',
              fontWeight: 800,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>مصاريف</span>
            <span>⛽</span>
          </Link>
          <SecureAction module="fleet" action="edit">
            <button
              onClick={() => logic.handleEdit(row)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                color: '#FFFFFF',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '11px'
              }}
            >
              ✏️ تعديل
            </button>
          </SecureAction>
          <SecureAction module="fleet" action="delete">
            <button
              onClick={() => logic.handleDelete(row.id)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(168, 87, 60, 0.12)',
                color: '#A8573C',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: '11px'
              }}
            >
              🗑️
            </button>
          </SecureAction>
        </div>
      )
    }
  ];

  return (
    <>
      <MasterPage 
        title="إدارة الأسطول والأصول المتنقلة" 
        subtitle="متابعة سيارات التوزيع، ربطها بمراكز التكلفة والمناديب، ومراقبة المصروفات والإهلاك"
        icon="🚚"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
          
          {/* Top Luxury KPI Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px'
          }}>
            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي سيارات الأسطول</span>
                <span style={{ fontSize: '18px' }}>🚚</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '6px' }}>
                {logic.vehicles.length} <span style={{ fontSize: '13px', color: '#8c6b32' }}>سيارة وفان</span>
              </div>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid rgba(5, 150, 105, 0.3)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>السيارات المتاحة للخدمة</span>
                <span style={{ fontSize: '18px' }}>🟢</span>
              </div>
              <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
                {activeCount} <span style={{ fontSize: '13px', color: '#059669' }}>جاهزة للتشغيل</span>
              </div>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>مركز التكلفة الموحد</span>
                <span style={{ fontSize: '18px' }}>🏢</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#1E130B', marginTop: '6px' }}>
                CC-FLEET
              </div>
              <div style={{ fontSize: '11px', color: '#6e5d4f', marginTop: '2px' }}>
                مربوط بسجل الأصول الثابتة
              </div>
            </div>

            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}>
              <Link
                href="/fixed-assets"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.35)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  color: '#8c6b32',
                  fontWeight: 900,
                  fontSize: '13px',
                  textDecoration: 'none'
                }}
              >
                <span>سجل الأصول والإهلاك</span>
                <span>🏗️</span>
              </Link>
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <SecureAction module="fleet" action="create">
              <button 
                onClick={logic.handleAddNew} 
                style={{
                  background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                  color: '#FFFFFF',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(194, 155, 98, 0.25)',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <span>➕ إضافة سيارة جديدة</span>
              </button>
            </SecureAction>

            <Link
              href="/vehicle-expenses"
              style={{
                background: '#FDFBF7',
                color: '#1E130B',
                border: '1px solid rgba(194, 155, 98, 0.35)',
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '13px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '44px'
              }}
            >
              <span>تحليل مصروفات المحروقات والصيانة</span>
              <span>⛽</span>
            </Link>
          </div>

          {logic.isLoading ? (
            <LoadingScreen message="جاري استعلام أسطول السيارات والأصول المتنقلة..." fullScreen={false} />
          ) : (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
            }}>
              <RawasiSmartTable 
                columns={columns}
                data={logic.vehicles}
                pageSize={15}
                onSearch={logic.setSearchQuery}
                watchDeps={[logic.vehicles]}
              />
            </div>
          )}
        </div>
      </MasterPage>

      {/* Modal rendered outside MasterPage to prevent stacking issues */}
      {logic.isModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(30, 19, 11, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            padding: '28px',
            width: '480px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            overflowY: 'auto',
            borderRadius: '24px',
            background: '#FFFFFF',
            border: '1px solid rgba(194, 155, 98, 0.35)',
            boxShadow: '0 20px 40px rgba(30, 19, 11, 0.2)'
          }}>
            <h2 style={{ margin: '0 0 20px 0', color: '#1E130B', fontWeight: 900, fontSize: '18px', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', paddingBottom: '10px' }}>
              {logic.currentRecord.id ? '✏️ تعديل بيانات السيارة' : '➕ إضافة سيارة جديدة للأصل المتنقل'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '12px', color: '#6e5d4f' }}>رقم اللوحة:</label>
                <input 
                  type="text" 
                  value={logic.currentRecord.plate_number}
                  onChange={(e) => logic.setCurrentRecord({...logic.currentRecord, plate_number: e.target.value})}
                  placeholder="مثال: أ ب ج 1234"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '12px', color: '#6e5d4f' }}>نوع / موديل السيارة:</label>
                <input 
                  type="text" 
                  value={logic.currentRecord.vehicle_model}
                  onChange={(e) => logic.setCurrentRecord({...logic.currentRecord, vehicle_model: e.target.value})}
                  placeholder="مثال: إيسوزو دينا مبردة 2024"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '12px', color: '#6e5d4f' }}>المندوب / السائق الأساسي:</label>
                <select 
                  value={logic.currentRecord.driver_id}
                  onChange={(e) => logic.setCurrentRecord({...logic.currentRecord, driver_id: e.target.value})}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                >
                  <option value="">-- بدون مندوب (غير محدد) --</option>
                  {logic.drivers.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.partner_type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '12px', color: '#6e5d4f' }}>الحالة التشغيلية:</label>
                <select 
                  value={logic.currentRecord.status}
                  onChange={(e) => logic.setCurrentRecord({...logic.currentRecord, status: e.target.value})}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', fontWeight: 700 }}
                >
                  <option value="متاح">متاح</option>
                  <option value="في الصيانة">في الصيانة</option>
                  <option value="غير متاح">غير متاح</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={logic.handleSave}
                disabled={logic.isSaving}
                style={{ flex: 1, background: '#C29B62', color: '#FFFFFF', fontWeight: 900, padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer' }}
              >
                {logic.isSaving ? '⏳ جاري الحفظ...' : '✅ حفظ السيارة'}
              </button>
              <button 
                onClick={() => logic.setIsModalOpen(false)}
                disabled={logic.isSaving}
                style={{ flex: 1, background: '#FDFBF7', border: '1px solid #C29B62', color: '#1E130B', fontWeight: 800, padding: '12px', borderRadius: '12px', cursor: 'pointer' }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
