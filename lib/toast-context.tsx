"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary';
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// دوال عامة لاستدعائها في أي مكان بدون الحاجة للـ Hook
export let showGlobalToast: (message: string, type?: ToastType, duration?: number) => void = (msg, type) => {
  if (typeof window !== 'undefined' && (window as any)._activeShowToast) {
    (window as any)._activeShowToast(msg, type);
  } else {
    console.warn("ToastProvider is not mounted yet: " + msg);
  }
};

export let showGlobalConfirm: (options: ConfirmOptions) => Promise<boolean> = async (options) => {
  if (typeof window !== 'undefined' && (window as any)._activeShowConfirm) {
    return (window as any)._activeShowConfirm(options);
  }
  return true;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // حالة التوست الملكي
  const [toast, setToast] = useState<{ message: string; type: ToastType; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // حالة نافذة التأكيد الملكية
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    isOpen: false,
    options: { title: '', message: '' },
    resolve: null
  });

  const showToast = useCallback((message: string, type: ToastType = 'success', duration: number = 3800) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type, visible: true });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, duration);
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        isOpen: true,
        options,
        resolve
      });
    });
  }, []);

  const handleConfirmClose = (result: boolean) => {
    if (confirmDialog.resolve) {
      confirmDialog.resolve(result);
    }
    setConfirmDialog({
      isOpen: false,
      options: { title: '', message: '' },
      resolve: null
    });
  };

  React.useEffect(() => {
    showGlobalToast = showToast;
    showGlobalConfirm = showConfirm;
    if (typeof window !== 'undefined') {
      (window as any)._activeShowToast = showToast;
      (window as any).showGlobalToast = showToast;
      (window as any)._activeShowConfirm = showConfirm;
      (window as any).showGlobalConfirm = showConfirm;
    }
  }, [showToast, showConfirm]);

  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* 👑 1. نظام التنبيهات الملكي الفاخر (Luxury Royal Toast) */}
      {toast.visible && (
        <div
          role="alert"
          className="luxury-toast-container"
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1E130B', // القهوة الملكي
            border: `1.5px solid ${
              toast.type === 'success' ? '#059669' :
              toast.type === 'error' ? '#A8573C' :
              toast.type === 'warning' ? '#C29B62' : '#C29B62'
            }`,
            color: '#FDFBF7', // لؤلؤي نقي
            borderRadius: '16px',
            padding: '12px 22px',
            boxShadow: '0 12px 35px rgba(30, 19, 11, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            direction: 'rtl',
            zIndex: 999999999,
            minWidth: '280px',
            maxWidth: '92vw',
            animation: 'slideUpToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            fontWeight: 800,
            fontSize: '13.5px',
            lineHeight: 1.4
          }}
        >
          {/* أيقونات ملونة حسب الحالة */}
          <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {toast.type === 'success' && <CheckCircle2 size={19} style={{ color: '#059669' }} />}
            {toast.type === 'error' && <AlertCircle size={19} style={{ color: '#A8573C' }} />}
            {toast.type === 'warning' && <AlertTriangle size={19} style={{ color: '#C29B62' }} />}
            {toast.type === 'info' && <Info size={19} style={{ color: '#C29B62' }} />}
          </span>

          <span style={{ flex: 1 }}>{toast.message}</span>

          <button
            onClick={() => setToast(prev => ({ ...prev, visible: false }))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(253, 251, 247, 0.6)',
              cursor: 'pointer',
              display: 'flex',
              padding: '4px',
              borderRadius: '6px'
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 👑 2. نافذة التأكيد الملكية الصلبة (Luxury Royal Confirmation Modal) */}
      {confirmDialog.isOpen && (
        <div
          className="luxury-confirm-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999999999,
            backgroundColor: 'rgba(30, 19, 11, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => handleConfirmClose(false)}
        >
          <div
            style={{
              background: '#FFFFFF', // كرت صلب نقي
              borderRadius: '20px',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.3)',
              width: '100%',
              maxWidth: '440px',
              padding: '24px 20px',
              color: '#1E130B',
              animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* أيقونة وعنوان الحوار */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: confirmDialog.options.type === 'danger'
                    ? 'rgba(168, 87, 60, 0.12)'
                    : 'rgba(194, 155, 98, 0.15)',
                  border: `1px solid ${
                    confirmDialog.options.type === 'danger' ? 'rgba(168, 87, 60, 0.3)' : 'rgba(194, 155, 98, 0.3)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: confirmDialog.options.type === 'danger' ? '#A8573C' : '#C29B62',
                  flexShrink: 0
                }}
              >
                {confirmDialog.options.type === 'danger' ? <AlertCircle size={22} /> : <AlertTriangle size={22} />}
              </div>

              <div>
                <h4 style={{ margin: 0, fontSize: '16.5px', fontWeight: 900, color: '#1E130B' }}>
                  {confirmDialog.options.title || 'تأكيد الإجراء'}
                </h4>
              </div>
            </div>

            {/* نص الرسالة */}
            <p style={{ margin: '0 0 20px', fontSize: '13.5px', color: '#4b5563', lineHeight: 1.6, fontWeight: 700 }}>
              {confirmDialog.options.message}
            </p>

            {/* أزرار الإجراءات (ارتفاع لا يقل عن 44px لملاءمة اللمس) */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleConfirmClose(true)}
                type="button"
                style={{
                  flex: 1,
                  minHeight: '44px',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: confirmDialog.options.type === 'danger'
                    ? 'linear-gradient(135deg, #A8573C 0%, #883e28 100%)'
                    : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                  color: '#FFFFFF',
                  fontSize: '13.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {confirmDialog.options.confirmText || 'تأكيد المتابعة'}
              </button>

              <button
                onClick={() => handleConfirmClose(false)}
                type="button"
                style={{
                  minHeight: '44px',
                  padding: '10px 18px',
                  borderRadius: '12px',
                  border: '1.5px solid rgba(194, 155, 98, 0.3)',
                  background: '#FDFBF7',
                  color: '#1E130B',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {confirmDialog.options.cancelText || 'إلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* الستايل والأنيميشن الخاص بنظام التوست */}
      <style>{`
        @keyframes slideUpToast {
          from {
            opacity: 0;
            transform: translate(-50%, 15px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        @keyframes scaleUp {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @media print {
          .luxury-toast-container,
          .luxury-confirm-overlay {
            display: none !important;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}