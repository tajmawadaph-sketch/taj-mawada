"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (resetError) {
        throw resetError;
      }

      setMessage('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح. يرجى مراجعة صندوق الوارد (أو مجلد المهملات).');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء طلب استعادة كلمة المرور.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .login-wrapper {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          direction: rtl;
          font-family: 'Cairo', sans-serif;
          background: radial-gradient(circle at 50% 30%, rgba(194, 155, 98, 0.25) 0%, rgba(44, 26, 18, 0.95) 75%), #2C1A12;
          position: relative;
          overflow: hidden;
          padding: 20px;
        }

        .login-wrapper::before {
          content: '';
          position: absolute;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(194, 155, 98, 0.2) 0%, transparent 70%);
          top: -100px;
          right: -100px;
          border-radius: 50%;
          pointer-events: none;
        }

        .login-wrapper::after {
          content: '';
          position: absolute;
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(168, 87, 60, 0.25) 0%, transparent 70%);
          bottom: -80px;
          left: -80px;
          border-radius: 50%;
          pointer-events: none;
        }

        .glass-card {
          width: 100%;
          max-width: 460px;
          background: linear-gradient(135deg, rgba(255, 253, 250, 0.92) 0%, rgba(255, 253, 250, 0.65) 100%);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid rgba(194, 155, 98, 0.4);
          border-radius: 28px;
          padding: 44px 36px;
          box-shadow: 0 25px 50px rgba(44, 26, 18, 0.35), 0 0 30px rgba(194, 155, 98, 0.15); 
          animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          position: relative;
          z-index: 10;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .cinematic-title {
          color: #2C1A12;
          font-weight: 900;
          font-size: 24px;
          text-align: center;
          margin-bottom: 6px;
          letter-spacing: -0.3px;
        }

        .cinematic-subtitle {
          color: rgba(44, 26, 18, 0.65);
          text-align: center;
          font-size: 13.5px;
          font-weight: 700;
          margin-bottom: 32px;
          line-height: 1.6;
        }

        .input-group {
          position: relative;
          margin-bottom: 20px;
        }

        .cinematic-input {
          width: 100%;
          padding: 14px 18px;
          border-radius: 14px;
          border: 1px solid rgba(194, 155, 98, 0.35);
          background: rgba(255, 253, 250, 0.85);
          color: #2C1A12;
          font-size: 15px;
          font-weight: 700;
          outline: none;
          transition: all 0.25s ease;
          font-family: inherit;
        }

        .cinematic-input:focus {
          background: #FFFFFF;
          border-color: #C29B62;
          box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.25);
        }

        .floating-label {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(44, 26, 18, 0.5);
          font-size: 13.5px;
          font-weight: 700;
          pointer-events: none;
          transition: 0.2s ease all;
        }

        .cinematic-input:focus ~ .floating-label,
        .cinematic-input:not(:placeholder-shown) ~ .floating-label,
        .forced-float {
          top: -10px;
          right: 12px;
          font-size: 11.5px;
          font-weight: 800;
          color: #A8573C;
          background: #FDFBF7;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid rgba(194, 155, 98, 0.3);
        }

        .submit-btn {
          width: 100%;
          padding: 14px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #C29B62 0%, #A8573C 100%);
          color: #FFFFFF;
          font-size: 16px;
          font-weight: 900;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 6px 18px rgba(168, 87, 60, 0.3);
          font-family: inherit;
          margin-top: 6px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(168, 87, 60, 0.4);
        }
        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .toggle-btn {
          width: 100%;
          background: none;
          border: none;
          color: rgba(44, 26, 18, 0.7);
          font-family: inherit;
          font-size: 13.5px;
          font-weight: 700;
          margin-top: 18px;
          cursor: pointer;
          transition: 0.2s;
          text-align: center;
          display: block;
          text-decoration: none;
        }
        .toggle-btn:hover { color: #2C1A12; }
      `}</style>

      <div className="glass-card">
        <h1 className="cinematic-title">استعادة كلمة المرور</h1>
        <p className="cinematic-subtitle">
          أدخل بريدك الإلكتروني المسجل لدينا وسنرسل لك رابطاً لإعادة تعيين كلمة المرور الخاصة بك.
        </p>

        {message && (
          <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '13px', fontWeight: 700, border: '1px solid #bbf7d0' }}>
            ✅ {message}
          </div>
        )}

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '12px', marginBottom: '16px', fontSize: '13px', fontWeight: 700, border: '1px solid #fecaca' }}>
            ❌ {error}
          </div>
        )}

        {!message && (
          <form onSubmit={handleResetPassword}>
            <div className="input-group">
              <input 
                type="email" 
                className="cinematic-input" 
                placeholder=" " 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              <label className={`floating-label ${email ? 'forced-float' : ''}`}>✉️ البريد الإلكتروني</label>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? '⏳ جاري الإرسال...' : 'إرسال رابط الاستعادة 📧'}
            </button>
          </form>
        )}

        <Link href="/login" className="toggle-btn">
          العودة إلى صفحة تسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
