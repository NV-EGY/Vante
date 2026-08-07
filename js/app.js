// ============================================================
// app.js - تهيئة التطبيق وإدارة الحالة العامة
// ============================================================

import { initializeApp } from "firebase-app";
import { 
    getFirestore, 
    collection, 
    query, 
    onSnapshot, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    increment, 
    serverTimestamp,
    where,
    getDocs,
    addDoc
} from "firebase-firestore";

// ============================================================
// 1. تهيئة Firebase
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyCotT8EP2uy_HsgHknxeGBorKoEUORPtmU",
    authDomain: "vante-orders.firebaseapp.com",
    projectId: "vante-orders",
    storageBucket: "vante-orders.firebasestorage.app",
    messagingSenderId: "842319700646",
    appId: "1:842319700646:web:f6afd78ef7038c3be4ca67",
    measurementId: "G-56ZC1RW0T7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
window.db = db;

// ============================================================
// 2. المتغيرات العامة
// ============================================================

export let allProducts = [];
export let allReviews = [];
export let cart = JSON.parse(localStorage.getItem('vante_cart') || '[]');
export let currentCategory = 'all';
export let currentSort = 'random';
export let displayedProductsCount = 8;
export let currentProduct = null;
export let selectedRating = 0;
export let appliedCoupon = null;
export let discountAmount = 0;

// ============================================================
// 3. تحميل المنتجات
// ============================================================

export function loadProducts() {
    const productsRef = collection(db, "products");
    
    onSnapshot(query(productsRef), (snapshot) => {
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.allProducts = allProducts;
        
        if (typeof renderProducts === 'function') renderProducts();
        if (typeof renderBestSellers === 'function') renderBestSellers();
        if (typeof updateCartDisplay === 'function') updateCartDisplay();
        
        console.log(`✅ تم تحميل ${allProducts.length} منتج`);
    });
}

// ============================================================
// 4. تحميل التقييمات
// ============================================================

export function loadReviews() {
    const reviewsRef = collection(db, "reviews");
    const q = query(reviewsRef, where("approved", "==", true));
    
    onSnapshot(q, (snapshot) => {
        allReviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        window.allReviews = allReviews;
        
        if (typeof updateReviewBadges === 'function') updateReviewBadges();
        
        if (currentProduct && typeof displayReviewsInModal === 'function') {
            displayReviewsInModal(currentProduct.id);
        }
    });
}

// ============================================================
// 5. دوال مساعدة
// ============================================================

export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function formatDate(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function getAverageRating(productId) {
    const productReviews = allReviews.filter(r => r.productId === productId);
    if (productReviews.length === 0) return 0;
    const sum = productReviews.reduce((s, r) => s + r.rating, 0);
    return sum / productReviews.length;
}

export function getReviewCount(productId) {
    return allReviews.filter(r => r.productId === productId).length;
}

// ============================================================
// 6. المحافظات والمدن
// ============================================================

export const governorates = {
    "القاهرة": ["مدينة نصر", "مصر الجديدة", "مصر القديمة", "التجمع الأول", "التجمع الثالث", "التجمع الخامس", "الرحاب", "مدينتي", "الشروق", "بدر", "المعادي", "زهراء المعادي", "حلوان", "15 مايو", "عين شمس", "المطرية", "السلام", "المرج", "الزيتون", "حدائق القبة", "روض الفرج", "شبرا مصر", "وسط البلد", "القاهرة الجديدة", "القطامية", "المقطم"],
    "الجيزة": ["الجيزة", "الدقي", "العجوزة", "إمبابة", "بولاق الدكرور", "الهرم", "فيصل", "الطالبية", "العمرانية", "حدائق الأهرام", "6 أكتوبر", "الشيخ زايد", "حدائق أكتوبر", "الحوامدية", "البدرشين", "العياط", "أوسيم", "كرداسة", "الصف", "دهشور"],
    "القليوبية": ["بنها", "شبرا الخيمة", "قليوب", "القناطر الخيرية", "ابو زعبل", "الخانكة", "العبور", "الخصوص", "كفر شكر", "طوخ", "شبين القناطر"],
    "الإسكندرية": ["الإسكندرية", "العجمي", "الدخيلة", "برج العرب", "سيدي جابر", "محرم بك", "العصافرة", "المنتزه"],
    "الدقهلية": ["المنصورة", "طلخا", "ميت غمر", "دكرنس", "أجا", "السنبلاوين", "بلقاس", "نبروه", "تمي الأمديد", "الجمالية", "المنزلة", "شربين"],
    "الشرقية": ["الزقازيق", "بلبيس", "العاشر من رمضان", "منيا القمح", "فاقوس", "أبو حماد", "الحسينية", "أولاد صقر", "كفر صقر", "ديرب نجم", "الإبراهيمية", "ههيا"],
    "الغربية": ["طنطا", "المحلة الكبرى", "كفر الزيات", "زفتى", "سمنود", "قطور", "بسيون"],
    "المنوفية": ["شبين الكوم", "السادات", "منوف", "أشمون", "الباجور", "قويسنا", "تلا", "بركة السبع", "الشهداء"],
    "البحيرة": ["دمنهور", "كفر الدوار", "رشيد", "إدكو", "أبو حمص", "الدلنجات", "إيتاي البارود", "حوش عيسى", "شبراخيت", "كوم حمادة", "بدر", "وادي النطرون"],
    "كفر الشيخ": ["كفر الشيخ", "دسوق", "فوه", "مطوبس", "بلطيم", "الحامول", "بيلا", "قلين", "سيدي سالم"],
    "دمياط": ["دمياط", "رأس البر", "فارسكور", "الزرقا", "كفر سعد"],
    "بورسعيد": ["بورسعيد", "بورفؤاد"],
    "الإسماعيلية": ["الإسماعيلية", "فايد", "القنطرة شرق", "القنطرة غرب", "التل الكبير", "أبو صوير"],
    "السويس": ["السويس", "الأربعين", "عتاقة", "الجناين", "العين السخنة"],
    "بني سويف": ["بني سويف", "الواسطى", "ناصر", "إهناسيا", "ببا", "سمسطا", "الفشن"],
    "الفيوم": ["الفيوم", "سنورس", "إطسا", "إبشواي", "يوسف الصديق"],
    "المنيا": ["المنيا", "سمالوط", "بني مزار", "مطاي", "مغاغة", "ملوي", "أبو قرقاص", "دير مواس", "العدوة"],
    "أسيوط": ["أسيوط", "ديروط", "القوصية", "منفلوط", "أبنوب", "أبو تيج", "الغنايم", "ساحل سليم", "البداري", "صدفا"],
    "سوهاج": ["سوهاج", "أخميم", "طهطا", "المراغة", "البلينا", "جرجا", "جهينة", "دار السلام", "ساقلته", "المنشأة"],
    "قنا": ["قنا", "نجع حمادي", "دشنا", "قفط", "قوص", "نقادة", "فرشوط", "أبو تشت"],
    "الأقصر": ["الأقصر", "إسنا", "أرمنت", "الطود", "البياضية", "القرنة"],
    "أسوان": ["أسوان", "إدفو", "كوم أمبو", "دراو", "نصر النوبة"],
    "البحر الأحمر": ["الغردقة", "رأس غارب", "سفاجا", "القصير", "مرسى علم", "حلايب", "شلاتين"],
    "الوادي الجديد": ["الخارجة", "الداخلة", "الفرافرة", "باريس", "موط"],
    "مطروح": ["مرسى مطروح", "الحمام", "العلمين", "الضبعة", "سيوة", "النجيلة", "براني", "السلوم"],
    "شمال سيناء": ["العريش", "رفح", "الشيخ زويد", "بئر العبد"],
    "جنوب سيناء": ["دهب", "شرم الشيخ", "نويبع", "طابا", "سانت كاترين", "الطور", "رأس سدر"]
};

// ============================================================
// 7. تهيئة المحافظات
// ============================================================

export function initGovernorates() {
    const govSelect = document.getElementById('governorate');
    const citySelect = document.getElementById('city');
    
    if (!govSelect) return;
    
    Object.keys(governorates).forEach(gov => {
        const opt = document.createElement('option');
        opt.value = gov;
        opt.textContent = gov;
        govSelect.appendChild(opt);
    });
    
    govSelect.addEventListener('change', function() {
        citySelect.innerHTML = '<option value="">اختر المدينة</option>';
        citySelect.disabled = true;
        
        const cities = governorates[this.value];
        if (cities) {
            cities.forEach(city => {
                const opt = document.createElement('option');
                opt.value = city;
                opt.textContent = city;
                citySelect.appendChild(opt);
            });
            citySelect.disabled = false;
        }
    });
}

// ============================================================
// 8. المؤقت الترويجي
// ============================================================

export function initOfferTimer() {
    const hEl = document.getElementById('h');
    const mEl = document.getElementById('m');
    const sEl = document.getElementById('s');
    
    if (!hEl || !mEl || !sEl) return;
    
    let endTime = Date.now() + 60 * 60 * 1000;
    
    try {
        const saved = localStorage.getItem('vante_offer_end');
        if (saved) {
            const parsed = parseInt(saved);
            if (parsed > Date.now()) endTime = parsed;
        }
    } catch(e) {}
    
    localStorage.setItem('vante_offer_end', endTime.toString());
    
    function tick() {
        const diff = endTime - Date.now();
        if (diff <= 0) {
            hEl.textContent = '00';
            mEl.textContent = '00';
            sEl.textContent = '00';
            localStorage.removeItem('vante_offer_end');
            return;
        }
        
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        
        hEl.textContent = String(h).padStart(2, '0');
        mEl.textContent = String(m).padStart(2, '0');
        sEl.textContent = String(s).padStart(2, '0');
    }
    
    tick();
    setInterval(tick, 1000);
}

// ============================================================
// 9. نظام الإشعارات (Toast)
// ============================================================

export function showToast(message, type = 'success') {
    const toast = document.getElementById('vanteToast');
    const toastMessage = document.getElementById('toastMessage');
    
    if (!toast || !toastMessage) return;
    
    toast.className = `vante-toast ${type}`;
    toastMessage.textContent = message;
    toast.style.display = 'flex';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.display = 'none';
            toast.style.opacity = '1';
        }, 300);
    }, 4000);
}

export function closeToast() {
    const toast = document.getElementById('vanteToast');
    if (toast) {
        toast.style.display = 'none';
    }
}

window.customAlert = showToast;

// ============================================================
// 10. إغلاق جميع المودالات
// ============================================================

export function closeAllModals() {
    // إغلاق السلة
    const cartDrawer = document.getElementById('cartDrawer');
    if (cartDrawer) cartDrawer.classList.remove('open');
    
    // إغلاق مودال المنتج
    const productModal = document.getElementById('productModal');
    if (productModal) productModal.classList.remove('open');
    
    // إغلاق مودال الدفع
    const checkoutModal = document.getElementById('checkoutModal');
    if (checkoutModal) checkoutModal.classList.remove('active');
    
    // إغلاق مودال التواصل
    const contactModal = document.getElementById('contactModal');
    if (contactModal) contactModal.classList.remove('open');
    
    // إغلاق مودال المعلومات
    const infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.classList.remove('open');
    
    // إغلاق البحث
    const searchBar = document.getElementById('searchBar');
    if (searchBar) searchBar.classList.remove('open');
    
    // إغلاق المودال العام
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.remove('active');
    
    document.body.style.overflow = '';
}

window.closeAllModals = closeAllModals;

// ============================================================
// 11. بدء التطبيق
// ============================================================

export function initApp() {
    console.log('🚀 بدء تشغيل VANTÉ...');
    
    initOfferTimer();
    initGovernorates();
    loadProducts();
    loadReviews();
    
    console.log('✅ VANTÉ جاهز للعمل');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// تصدير للاستخدام العام
window.db = db;
window.allProducts = allProducts;
window.allReviews = allReviews;
window.cart = cart;
window.currentCategory = currentCategory;
window.currentSort = currentSort;
window.currentProduct = currentProduct;
window.appliedCoupon = appliedCoupon;
window.discountAmount = discountAmount;
window.showToast = showToast;