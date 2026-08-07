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

// تصدير db لاستخدامه في الملفات الأخرى
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
// 3. تحميل المنتجات من Firestore
// ============================================================

export function loadProducts() {
  const productsRef = collection(db, "products");
  
  onSnapshot(query(productsRef), (snapshot) => {
    allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // تحديث السلة (للتأكد من صحة البيانات)
    updateCartDisplay();
    
    // إعادة عرض المنتجات والأكثر مبيعاً
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderBestSellers === 'function') renderBestSellers();
    
    console.log(`✅ تم تحميل ${allProducts.length} منتج`);
  });
}

// ============================================================
// 4. تحميل التقييمات من Firestore
// ============================================================

export function loadReviews() {
  const reviewsRef = collection(db, "reviews");
  const q = query(reviewsRef, where("approved", "==", true));
  
  onSnapshot(q, (snapshot) => {
    allReviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // تحديث شارات التقييمات
    if (typeof updateReviewBadges === 'function') updateReviewBadges();
    
    // عرض التقييمات في المودال إذا كان هناك منتج مفتوح
    if (currentProduct && typeof displayReviewsInModal === 'function') {
      displayReviewsInModal(currentProduct.id);
    }
  });
}

// ============================================================
// 5. إدارة السلة (التخزين المحلي)
// ============================================================

export function saveCart() {
  localStorage.setItem('vante_cart', JSON.stringify(cart));
}

export function updateCartDisplay() {
  const cartCountEl = document.getElementById('cartCount');
  const cartItemsEl = document.getElementById('cartItems');
  const totalEl = document.getElementById('total');
  
  if (!cartItemsEl) return;
  
  // حساب الإجمالي والعدد
  let total = 0;
  let count = 0;
  
  // تحديث السلة باستخدام الوظيفة المحسنة (مع الخصومات)
  if (typeof renderCartItems === 'function') {
    renderCartItems();
  } else {
    // عرض بسيط في حالة عدم توفر الدالة المتقدمة
    const html = cart.map((item, index) => `
      <div class="cart-item">
        <div class="cart-item-details">
          <strong>${item.name}</strong>
          <small>المقاس: ${item.size || 'غير محدد'}</small>
        </div>
        <div class="cart-item-price">${(item.price * item.qty).toFixed(0)} جنيه</div>
      </div>
    `).join('');
    
    cartItemsEl.innerHTML = html || 'السلة فارغة';
    
    cart.forEach(item => {
      total += item.price * item.qty;
      count += item.qty;
    });
    
    if (totalEl) totalEl.textContent = total.toFixed(0);
  }
  
  if (cartCountEl) cartCountEl.textContent = count;
  
  saveCart();
}

// ============================================================
// 6. دوال مساعدة عامة
// ============================================================

// تهيئة بيانات المحافظات والمدن
export const governorates = {
  "القاهرة": ["مدينة نصر", "مصر الجديدة", "مصر القديمة", "التجمع الأول", "التجمع الثالث", "التجمع الخامس", "الرحاب", "مدينتي", "الشروق", "بدر", "المعادي", "زهراء المعادي", "حلوان", "15 مايو", "عين شمس", "المطرية", "السلام", "المرج", "الزيتون", "حدائق القبة", "روض الفرج", "شبرا مصر", "وسط البلد", "القاهرة الجديدة", "القطامية", "المقطم", "هليوبوليس الجديدة"],
  "الجيزة": ["الجيزة", "الدقي", "العجوزة", "إمبابة", "بولاق الدكرور", "الهرم", "فيصل", "الطالبية", "العمرانية", "حدائق الأهرام", "6 أكتوبر", "الشيخ زايد", "حدائق أكتوبر", "الحوامدية", "البدرشين", "العياط", "أوسيم", "كرداسة", "الصف", "دهشور", "ناهيا", "المنصورية"],
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

// دالة لتوليد معرف فريد
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// دالة لتنسيق التاريخ
export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

// دالة لتجنب XSS
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// دالة لحساب متوسط التقييمات
export function getAverageRating(productId) {
  const productReviews = allReviews.filter(r => r.productId === productId);
  if (productReviews.length === 0) return 0;
  const sum = productReviews.reduce((s, r) => s + r.rating, 0);
  return sum / productReviews.length;
}

// دالة لحساب عدد التقييمات
export function getReviewCount(productId) {
  return allReviews.filter(r => r.productId === productId).length;
}

// ============================================================
// 7. تهيئة المؤقتات والعروض
// ============================================================

// عرض العروض الترويجية
export function initOfferTimer() {
  const hEl = document.getElementById('h');
  const mEl = document.getElementById('m');
  const sEl = document.getElementById('s');
  
  if (!hEl || !mEl || !sEl) return;
  
  // تعيين وقت انتهاء العرض (ساعة واحدة من الآن)
  let endTime = Date.now() + 60 * 60 * 1000;
  
  // محاولة استعادة الوقت المحفوظ
  try {
    const saved = localStorage.getItem('vante_offer_end');
    if (saved) {
      const parsed = parseInt(saved);
      if (parsed > Date.now()) endTime = parsed;
    }
  } catch(e) {}
  
  // حفظ وقت الانتهاء
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
// 8. تهيئة محافظات الدفع
// ============================================================

export function initGovernorates() {
  const govSelect = document.getElementById('governorate');
  const citySelect = document.getElementById('city');
  
  if (!govSelect) return;
  
  // ملء قائمة المحافظات
  Object.keys(governorates).forEach(gov => {
    const opt = document.createElement('option');
    opt.value = gov;
    opt.textContent = gov;
    govSelect.appendChild(opt);
  });
  
  // عند تغيير المحافظة، تحديث المدن
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
// 9. تهيئة البحث والإغلاق العام
// ============================================================

export function initGlobalClose() {
  // إغلاق المودالات عند الضغط على Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // إغلاق مودال المنتج
      const productModal = document.getElementById('productModal');
      if (productModal && productModal.classList.contains('open')) {
        if (typeof closeProduct === 'function') closeProduct();
      }
      
      // إغلاق السلة
      const cartDrawer = document.getElementById('cartDrawer');
      if (cartDrawer && cartDrawer.classList.contains('open')) {
        if (typeof closeCart === 'function') closeCart();
      }
      
      // إغلاق البحث
      const searchBar = document.getElementById('searchBar');
      if (searchBar && searchBar.classList.contains('open')) {
        if (typeof closeSearch === 'function') closeSearch();
      }
    }
  });
}

// ============================================================
// 10. تصدير الدوال العامة للنافذة (للاستخدام من HTML)
// ============================================================

// تصدير الدوال الأساسية للاستخدام من الأحداث المباشرة في HTML
window.customAlert = function(message, type = 'success') {
  // استخدام نظام Toast
  const toast = document.createElement('div');
  toast.className = `vante-toast ${type}`;
  toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:inherit;font-size:18px;cursor:pointer;">&times;</button>
    </div>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
};

// تصدير المتغيرات العامة
window.allProducts = allProducts;
window.allReviews = allReviews;
window.cart = cart;
window.currentCategory = currentCategory;
window.currentSort = currentSort;
window.currentProduct = currentProduct;
window.appliedCoupon = appliedCoupon;
window.discountAmount = discountAmount;

// ============================================================
// 11. بدء التطبيق
// ============================================================

export function initApp() {
  console.log('🚀 بدء تشغيل VANTÉ...');
  
  // تهيئة المؤقت
  initOfferTimer();
  
  // تهيئة المحافظات
  initGovernorates();
  
  // تهيئة الإغلاق العام
  initGlobalClose();
  
  // تحميل المنتجات
  loadProducts();
  
  // تحميل التقييمات
  loadReviews();
  
  // عرض السلة
  updateCartDisplay();
  
  console.log('✅ VANTÉ جاهز للعمل');
}

// تشغيل التطبيق عند تحميل الصفحة
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
