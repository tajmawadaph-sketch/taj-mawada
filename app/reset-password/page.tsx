"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Handle Hash fragments automatically for Supabase auth
  useEffect(() => {
    // Supabase will automatically parse the hash and set the session.
    // If there is no session after parsing, maybe the link is invalid.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // setError('رابط الاستعادة غير صالح أو منتهي الصلاحية. يرجى طلب رابط جديد.');
      }
    });
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        throw updateError;
      }

      setMessage('تم تحديث كلمة المرور بنجاح! جاري تحويلك إلى النظام...');
      setTimeout(() => {
        router.push('/Dashboard');
      }, 2500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحديث كلمة المرور.');
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
          background: linear-gradient(135deg, #4E734F 0%, #2e4a2e 100%);
          color: #FFFFFF;
          font-size: 16px;
          font-weight: 900;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 6px 18px rgba(78, 115, 79, 0.3);
          font-family: inherit;
          margin-top: 6px;
        }

        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 24px rgba(78, 115, 79, 0.4);
        }
        .submit-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>

      <div className="glass-card">
        <h1 className="cinematic-title">تعيين كلمة المرور الجديدة</h1>
        <p className="cinematic-subtitle">
          الرجاء إدخال كلمة المرور الجديدة لحسابك.
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

        <form onSubmit={handleUpdatePassword}>
          <div className="input-group">
            <input 
              type="password" 
              className="cinematic-input" 
              placeholder=" " 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              minLength={6}
            />
            <label className={`floating-label ${password ? 'forced-float' : ''}`}>🔒 كلمة المرور الجديدة</label>
          </div>

          <div className="input-group">
            <input 
              type="password" 
              className="cinematic-input" 
              placeholder=" " 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required 
              minLength={6}
            />
            <label className={`floating-label ${confirmPassword ? 'forced-float' : ''}`}>🔐 تأكيد كلمة المرور</label>
          </div>

          <button type="submit" className="submit-btn" disabled={isLoading || !!message}>
            {isLoading ? '⏳ جاري الحفظ...' : 'حفظ كلمة المرور والدخول 💾'}
          </button>
        </form>
      </div>
    </div>
  );
}
