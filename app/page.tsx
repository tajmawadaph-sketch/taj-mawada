"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { THEME } from '@/lib/theme';
import { usePermissions } from '@/lib/PermissionsContext';
import LoadingScreen from '@/components/LoadingScreen';
import MasterPage from '@/components/MasterPage';
import { menuGroups } from '@/lib/menuData';
import { supabase } from '@/lib/supabase';

const VET_MOTIVATIONAL_MESSAGES = [
    "أهلاً بك في صيدلية تاج المودة، رواد الرعاية الموثوقة لأصيل الخيل ونفائس الإبل! 🐎🐪",
    "صحة المطيّة والخيل تبدأ من الدقة في الرعاية والعلاج، يومكم مبارك ومثمر! ✨",
    "الجودة والأمانة في صرف الدواء البيطري تصنع الفارق في كل شوط وميدان! 🏆",
    "نخدم ملاك الخيل وهواة الإبل بأعلى معايير الصيدلة البيطرية المعتمدة! 🌿",
    "كل جرعة محسوبة وكل رعاية دقيقة ترسم مسار الفوز والبركة! 💎",
    "نسعى دائماً لتوفير أفضل المكملات والأدوية البيطرية من خيرة المصادر العالمية! 🌟",
    "الدقة في إدارة المخزون والمبيعات هي عنوان احترافية صيدلية تاج المودة! 📊",
];

const DEFAULT_FAVORITES = ['global_summary', 'dashboard', 'invoices', 'inventory', 'receipt_vouchers', 'partners', 'reports', 'payroll'];

export default function WelcomeHomePage() {
    const { role, can, loading: permsLoading, profile } = usePermissions();
    const [greeting, setGreeting] = useState('');
    const [quote, setQuote] = useState('');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [isFavModalOpen, setIsFavModalOpen] = useState(false);
    const [tempFavorites, setTempFavorites] = useState<string[]>([]);

    useEffect(() => {
        const hour = new Date().getHours();
        if (hour < 12) setGreeting('صباح الخير والبركة ☀️');
        else if (hour < 18) setGreeting('طاب مساؤك بكل خير 🌤️');
        else setGreeting('مساء الخير والمسرات 🌙');
        setQuote(VET_MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * VET_MOTIVATIONAL_MESSAGES.length)]);
    }, []);

    useEffect(() => {
        const fetchUserFavs = async () => {
            if (profile?.id) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('quick_links')
                    .eq('id', profile.id)
                    .single();
                
                if (!error && data?.quick_links && Array.isArray(data.quick_links) && data.quick_links.length > 0) {
                    setFavorites(data.quick_links);
                } else {
                    setFavorites(DEFAULT_FAVORITES);
                }
            } else {
                setFavorites(DEFAULT_FAVORITES);
            }
        };
        fetchUserFavs();
    }, [profile?.id]);

    const saveFavorites = async () => {
        setFavorites(tempFavorites);
        setIsFavModalOpen(false);
        if (profile?.id) {
            const { error } = await supabase
                .from('profiles')
                .update({ quick_links: tempFavorites })
                .eq('id', profile.id);
            
            if (error) {
                console.error("Error saving quick links:", error);
                alert("لم يتم حفظ المفضلة في قاعدة البيانات: " + error.message);
            }
        }
    };

    const openFavModal = () => { setTempFavorites(favorites); setIsFavModalOpen(true); };
    const toggleFav = (id: string) =>
        setTempFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

    if (permsLoading) return <LoadingScreen message="جاري تجهيز مساحة عمل تاج المودة..." fullScreen={false} />;

    const userName = profile?.full_name || 'زميلنا العزيز';
    const firstNameOnly = userName.split(' ')[0];
    const roleTitle = role === 'super_admin' ? 'المدير العام 👑' : role === 'admin' ? 'مدير النظام 🛡️' : 'فريق صيدلية تاج المودة 🐎';
    const allItems = menuGroups.flatMap(g => g.items);
    const allowedItems = allItems.filter(item => {
        if (role === 'super_admin' || role === 'admin') return true;
        if (['home','profile','messages','notifications'].includes(item.id)) return true;
        return can(item.id, 'view');
    });
    const favItems = favorites.map(id => allowedItems.find(i => i.id === id)).filter(Boolean);

    return (
        <MasterPage title="الصفحة الرئيسية" subtitle="بوابة الإدارة المركزية لصيدلية تاج المودة" icon="🐎">
        <div className="desert-page">
        <style>{`
            /* ══════════════════════════════════════════════════
               🏜️ DESERT GLASSMORPHISM (سيم الزجاج الصحراوي)
               ══════════════════════════════════════════════════ */
            :global(body) {
                background: #FDFBF7 !important; /* كثبان لؤلؤية */
                color: #2C1A12 !important;     /* بني الخيام الداكن */
                min-height: 100vh;
            }

            /* Master header styling integration */
            :global(.master-header) {
                margin: 12px 16px 0 16px !important;
                border-radius: 24px !important;
                padding: 12px 24px !important;
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.55) 100%) !important;
                backdrop-filter: blur(24px) saturate(160%) !important;
                -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
                border: 1px solid rgba(194, 155, 98, 0.35) !important;
                box-shadow: 0 4px 6px rgba(44, 26, 18, 0.08) !important;
            }

            .desert-page {
                direction: rtl;
                padding: 16px 20px 36px;
                min-height: calc(100vh - 80px);
                display: flex;
                flex-direction: column;
                gap: 26px;
                box-sizing: border-box;
            }

            /* ── Hero Panel ── */
            .desert-hero {
                text-align: center;
                padding: 40px 32px 34px;
                border-radius: 28px;
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.88) 0%, rgba(255, 253, 250, 0.55) 100%);
                backdrop-filter: blur(24px) saturate(160%);
                -webkit-backdrop-filter: blur(24px) saturate(160%);
                border: 1px solid rgba(194, 155, 98, 0.35);
                box-shadow: 0 4px 6px rgba(44, 26, 18, 0.08);
                position: relative;
                overflow: hidden;
                transition: all 0.3s ease;
            }

            .desert-hero:hover {
                box-shadow: 0 10px 15px rgba(168, 87, 60, 0.12);
            }

            .role-badge {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 6px 20px;
                border-radius: 50px;
                margin-bottom: 16px;
                background: linear-gradient(135deg, rgba(194, 155, 98, 0.2) 0%, rgba(168, 87, 60, 0.15) 100%);
                border: 1px solid rgba(194, 155, 98, 0.4);
                color: #2C1A12;
                font-weight: 800;
                font-size: 13.5px;
                box-shadow: 0 2px 6px rgba(44, 26, 18, 0.04);
            }

            .hero-title {
                font-size: 34px;
                font-weight: 900;
                color: #2C1A12;
                margin: 0 0 10px;
                letter-spacing: -0.5px;
            }

            .hero-subtitle {
                color: rgba(44, 26, 18, 0.7);
                font-size: 16px;
                font-weight: 600;
                max-width: 680px;
                margin: 0 auto;
                line-height: 1.8;
            }

            /* ── Section Label ── */
            .section-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 12px;
            }

            .section-title {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .section-title h2 {
                font-size: 19px;
                font-weight: 900;
                color: #2C1A12;
                margin: 0;
            }

            .section-subtitle {
                font-size: 13px;
                color: rgba(44, 26, 18, 0.6);
                font-weight: 600;
            }

            /* ── Cards Grid ── */
            .desert-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
                gap: 18px;
            }

            /* ── Desert Glass Card ── */
            .desert-card-item {
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.8) 0%, rgba(255, 253, 250, 0.45) 100%);
                backdrop-filter: blur(24px) saturate(160%);
                -webkit-backdrop-filter: blur(24px) saturate(160%);
                border: 1px solid rgba(194, 155, 98, 0.3);
                border-radius: 20px;
                padding: 22px 16px;
                text-decoration: none;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                box-shadow: 0 4px 6px rgba(44, 26, 18, 0.08);
                transition: all 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
                position: relative;
                overflow: hidden;
            }

            .desert-card-item:hover {
                transform: translateY(-5px);
                box-shadow: 0 10px 15px rgba(168, 87, 60, 0.15);
                border-color: rgba(194, 155, 98, 0.65);
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.95) 0%, rgba(255, 253, 250, 0.65) 100%);
            }

            .card-icon-box {
                width: 58px;
                height: 58px;
                border-radius: 16px;
                background: linear-gradient(135deg, rgba(194, 155, 98, 0.25) 0%, rgba(168, 87, 60, 0.12) 100%);
                border: 1px solid rgba(194, 155, 98, 0.35);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                box-shadow: 0 4px 10px rgba(44, 26, 18, 0.05);
                transition: transform 0.3s ease;
            }

            .desert-card-item:hover .card-icon-box {
                transform: scale(1.1) rotate(4deg);
                background: linear-gradient(135deg, rgba(194, 155, 98, 0.35) 0%, rgba(168, 87, 60, 0.2) 100%);
            }

            .card-title {
                font-size: 14.5px;
                font-weight: 800;
                color: #2C1A12;
                text-align: center;
                line-height: 1.3;
            }

            .card-desc {
                font-size: 11.5px;
                color: rgba(44, 26, 18, 0.6);
                font-weight: 600;
                text-align: center;
            }

            /* Add Card Button */
            .add-card-btn {
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.5) 0%, rgba(255, 253, 250, 0.25) 100%);
                backdrop-filter: blur(24px) saturate(160%);
                border: 1.5px dashed rgba(194, 155, 98, 0.55);
                border-radius: 20px;
                padding: 22px 16px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                box-shadow: 0 4px 6px rgba(44, 26, 18, 0.05);
                transition: all 0.3s ease;
            }

            .add-card-btn:hover {
                background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.5) 100%);
                border-color: #C29B62;
                transform: translateY(-5px);
                box-shadow: 0 10px 15px rgba(168, 87, 60, 0.15);
            }

            .add-icon-box {
                width: 58px;
                height: 58px;
                border-radius: 16px;
                background: rgba(194, 155, 98, 0.15);
                border: 1px dashed rgba(194, 155, 98, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 26px;
                color: #C29B62;
                transition: transform 0.3s ease;
            }

            .add-card-btn:hover .add-icon-box {
                transform: scale(1.15) rotate(90deg);
                color: #A8573C;
            }


            /* ── Custom Modal ── */
            .fav-overlay {
                position: fixed; inset: 0;
                background: rgba(44, 26, 18, 0.45);
                backdrop-filter: blur(24px) saturate(160%);
                z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                padding: 20px;
                animation: fadeIn .25s ease;
            }

            .fav-modal {
                background: linear-gradient(135deg, #FDFBF7 0%, #F5EFE6 100%);
                border-radius: 28px;
                width: 95vw; max-width: 820px; max-height: 85vh;
                display: flex; flex-direction: column; overflow: hidden;
                box-shadow: 0 25px 60px rgba(44, 26, 18, 0.25);
                border: 1px solid rgba(194, 155, 98, 0.4);
            }

            .fav-modal-header {
                padding: 20px 28px;
                border-bottom: 1px solid rgba(194, 155, 98, 0.25);
                display: flex; justify-content: space-between; align-items: center;
            }

            .fav-modal-body {
                padding: 24px 28px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 22px;
            }

            .fav-group-title {
                font-weight: 900;
                color: #2C1A12;
                margin-bottom: 12px;
                font-size: 16px;
                border-bottom: 2px solid rgba(194, 155, 98, 0.25);
                padding-bottom: 8px;
            }

            .fav-items-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
            }

            .fav-item {
                display: flex; align-items: center; gap: 12px; padding: 12px 14px;
                border: 1px solid rgba(194, 155, 98, 0.3);
                border-radius: 14px;
                cursor: pointer;
                background: rgba(255, 253, 250, 0.7);
                transition: all 0.2s ease;
            }

            .fav-item:hover {
                background: rgba(255, 253, 250, 0.95);
                border-color: #C29B62;
                transform: translateY(-2px);
                box-shadow: 0 4px 10px rgba(168, 87, 60, 0.1);
            }

            .fav-item.selected {
                border-color: #C29B62;
                background: linear-gradient(135deg, rgba(194, 155, 98, 0.25) 0%, rgba(255, 253, 250, 0.9) 100%);
            }

            .fav-modal-footer {
                padding: 16px 28px;
                border-top: 1px solid rgba(194, 155, 98, 0.25);
                display: flex; justify-content: flex-end; gap: 12px;
                background: rgba(255, 253, 250, 0.5);
            }

            .desert-footer {
                text-align: center;
                color: rgba(44, 26, 18, 0.6);
                font-weight: 700;
                font-size: 13px;
                padding-top: 10px;
            }

            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            @media (max-width: 768px) {
                .desert-hero { padding: 24px 18px 20px; border-radius: 20px; }
                .hero-title { font-size: 24px; }
                .desert-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
                .desert-card-item, .add-card-btn { padding: 16px 10px; border-radius: 16px; }
                .card-icon-box, .add-icon-box { width: 48px; height: 48px; font-size: 24px; }
                .card-title { font-size: 13px; }
            }
        `}</style>

            {/* ── لوحة الترحيب الصحراوية (Hero Panel) ── */}
            <div className="desert-hero">
                <div className="role-badge">{roleTitle}</div>
                <h1 className="hero-title">{greeting}، {firstNameOnly}</h1>
                <p className="hero-subtitle">{quote}</p>
            </div>


            {/* ── شبكة الوصول السريع للمفضلة (Desert Glass Favorites) ── */}
            <div>
                <div className="section-header">
                    <div className="section-title">
                        <span style={{ fontSize: '20px' }}>⭐</span>
                        <h2>المفضلة ومساحة العمل السريعة</h2>
                    </div>
                    <span className="section-subtitle">الوصول السريع للشاشات الأكثر استخداماً</span>
                </div>

                <div className="desert-grid">
                    {favItems.map((item: any, idx) => (
                        <Link key={idx} href={item.path} className="desert-card-item">
                            <div className="card-icon-box">{item.icon}</div>
                            <div className="card-title">{item.title}</div>
                            <div className="card-desc">انقر للفتح</div>
                        </Link>
                    ))}
                    
                    <div className="add-card-btn" onClick={openFavModal} title="تخصيص القائمة المفضلة">
                        <div className="add-icon-box">➕</div>
                        <div className="card-title" style={{ color: '#C29B62' }}>تخصيص المفضلة</div>
                        <div className="card-desc">إضافة / حذف روابط</div>
                    </div>
                </div>
            </div>

            {/* ── نافذة تخصيص الروابط المفضلة (Desert Modal) ── */}
            {isFavModalOpen && (
                <div className="fav-overlay" onClick={() => setIsFavModalOpen(false)}>
                    <div className="fav-modal" onClick={e => e.stopPropagation()}>
                        <div className="fav-modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '24px' }}>✨</span>
                                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 900, color: '#2C1A12' }}>تخصيص شاشات مساحة العمل</h2>
                            </div>
                            <button 
                                onClick={() => setIsFavModalOpen(false)} 
                                style={{ background: 'transparent', border: 'none', color: '#A8573C', fontSize: '22px', cursor: 'pointer', fontWeight: 900 }}
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="fav-modal-body">
                            {menuGroups.map((group, gIdx) => {
                                const items = group.items.filter(item => allowedItems.some(ai => ai.id === item.id));
                                if (!items.length) return null;
                                return (
                                    <div key={gIdx}>
                                        <div className="fav-group-title">{group.group}</div>
                                        <div className="fav-items-grid">
                                            {items.map((item, iIdx) => {
                                                const sel = tempFavorites.includes(item.id);
                                                return (
                                                    <div key={iIdx} className={`fav-item ${sel ? 'selected' : ''}`} onClick={() => toggleFav(item.id)}>
                                                        <div style={{ fontSize: '22px' }}>{item.icon}</div>
                                                        <div style={{ fontWeight: 800, color: sel ? '#2C1A12' : 'rgba(44,26,18,0.7)', flex: 1, fontSize: '13.5px' }}>
                                                            {item.title}
                                                        </div>
                                                        <div style={{
                                                            width: '22px', 
                                                            height: '22px', 
                                                            borderRadius: '8px', 
                                                            border: `2px solid ${sel ? '#C29B62' : 'rgba(194, 155, 98, 0.35)'}`, 
                                                            background: sel ? 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)' : 'transparent', 
                                                            display: 'flex', 
                                                            alignItems: 'center', 
                                                            justifyContent: 'center',
                                                            color: 'white',
                                                            fontSize: '12px',
                                                            fontWeight: 900
                                                        }}>
                                                            {sel && '✓'}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        
                        <div className="fav-modal-footer">
                            <button 
                                onClick={() => setIsFavModalOpen(false)} 
                                className="desert-btn-glass"
                            >
                                إلغاء
                            </button>
                            <button 
                                onClick={saveFavorites} 
                                className="desert-btn-primary"
                            >
                                حفظ التغييرات 💾
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── فوتر النظام الصحراوي ── */}
            <div className="desert-footer">
                جلسة آمنة ومحمية 🔒 | صيدلية تاج المودة البيطرية (رعاية الخيول والإبل) © {new Date().getFullYear()}
            </div>
        </div>
        </MasterPage>
    );
}
