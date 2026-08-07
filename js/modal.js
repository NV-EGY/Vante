// ============================================================
// modal.js - إدارة المودالات
// ============================================================

import { 
  allProducts, 
  allReviews, 
  currentProduct,
  selectedRating,
  db,
  escapeHtml,
  formatDate,
  getAverageRating,
  getReviewCount
} from './app.js';

import { 
  collection, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  onSnapshot
} from "firebase-firestore";

// ============================================================
// 1. مودال المنتج (مكتمل من products.js)
// ============================================================

// تم تنفيذ openProduct و closeProduct في products.js
// هذا الملف يكمل الوظائف الإضافية للمودال

// ============================================================
// 2. مودال التقييم
// ============================================================

// فتح مودال التقييم
window.openRatingModal = function() {
  const modal = document.getElementById('ratingModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) {
    modal.classList.add('open');
    // تنظيف الحقول السابقة
    document.getElementById('reviewerName').value = '';
    document.getElementById('reviewerPhone').value = '';
    document.getElementById('nameError').innerText = '';
    document.getElementById('phoneError').innerText = '';
  }
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
};

// إغلاق مودال التقييم
window.closeRatingModal = function() {
  const modal = document.getElementById('ratingModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) modal.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
};

// التحقق من صحة الاسم
function validateName(name) {
  const trimmed = name.trim();
  if (trimmed.length < 3) return 'الاسم يجب أن لا يقل عن 3 أحرف';
  const arabicPattern = /^[\u0600-\u06FF\s]+$/;
  const englishPattern = /^[A-Za-z\s]+$/;
  if (!arabicPattern.test(trimmed) && !englishPattern.test(trimmed)) {
    return 'الاسم يجب أن يحتوي على أحرف عربية أو إنجليزية فقط';
  }
  return '';
}

// التحقق من رقم الهاتف المصري
function validatePhone(phone) {
  const phoneRegex = /^01[0125][0-9]{8}$/;
  if (!phoneRegex.test(phone)) return 'رقم الهاتف غير صحيح (مثال: 01012345678)';
  return '';
}

// تأكيد وإرسال التقييم
window.confirmAndSubmitReview = async function() {
  const name = document.getElementById('reviewerName').value.trim();
  const phone = document.getElementById('reviewerPhone').value.trim();
  
  const nameError = validateName(name);
  const phoneError = validatePhone(phone);
  
  document.getElementById('nameError').innerText = nameError;
  document.getElementById('phoneError').innerText = phoneError;
  
  if (nameError || phoneError) return;
  
  if (!window.currentProduct) {
    window.customAlert('⚠️ يرجى اختيار منتج أولاً', 'warning');
    return;
  }
  
  if (!window.selectedRating || window.selectedRating === 0) {
    window.customAlert('⚠️ يرجى اختيار تقييم (نجوم) أولاً', 'warning');
    return;
  }
  
  const reviewText = document.getElementById('reviewText').value.trim();
  
  try {
    const btn = document.querySelector('.rating-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    
    await addDoc(collection(db, 'reviews'), {
      productId: window.currentProduct.id,
      productName: window.currentProduct.name,
      rating: window.selectedRating,
      text: reviewText || 'لا يوجد تعليق',
      userName: name,
      userPhone: phone,
      approved: false,
      createdAt: serverTimestamp()
    });
    
    window.customAlert('✅ تم إرسال تقييمك بنجاح! سيظهر بعد المراجعة.', 'success');
    
    // إعادة تعيين الحقول
    document.getElementById('reviewText').value = '';
    document.getElementById('reviewText').style.display = 'none';
    window.selectedRating = 0;
    document.querySelectorAll('.rating-stars span').forEach(star => star.classList.remove('active'));
    window.closeRatingModal();
    
  } catch (error) {
    console.error('خطأ في إرسال التقييم:', error);
    window.customAlert('❌ حدث خطأ أثناء إرسال التقييم، حاول مرة أخرى.', 'error');
  } finally {
    const btn = document.querySelector('.rating-submit-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال التقييم';
  }
};

// تقديم التقييم (فتح مودال التقييم)
window.submitReview = function() {
  if (!window.currentProduct) {
    window.customAlert('⚠️ يرجى اختيار منتج أولاً', 'warning');
    return;
  }
  
  if (!window.selectedRating || window.selectedRating === 0) {
    window.customAlert('⚠️ يرجى اختيار تقييم بالنجوم أولاً', 'warning');
    return;
  }
  
  const reviewText = document.getElementById('reviewText').value.trim();
  if (!reviewText) {
    window.customAlert('✍️ يرجى كتابة رأيك في المنتج قبل إرسال التقييم', 'warning');
    const textarea = document.getElementById('reviewText');
    if (textarea) {
      textarea.style.borderColor = '#e74c3c';
      textarea.focus();
      setTimeout(() => {
        textarea.style.borderColor = '';
      }, 2000);
    }
    return;
  }
  
  window.openRatingModal();
};

// ============================================================
// 3. عرض التقييمات في المودال
// ============================================================

window.displayReviewsInModal = function(productId) {
  const container = document.getElementById('productReviewsContainer');
  if (!container) return;
  
  const productReviews = allReviews.filter(r => r.productId === productId);
  
  if (productReviews.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:30px 20px;">
        <i class="fas fa-star" style="font-size:36px; color:#ddd; margin-bottom:12px;"></i>
        <p style="color:#888; font-size:14px;">لا توجد تقييمات لهذا المنتج بعد</p>
        <button class="btn-secondary" onclick="document.getElementById('reviewText').focus();" 
                style="width:auto; padding:8px 24px; margin-top:12px; font-size:13px;">
          <i class="fas fa-pen"></i> كن أول من يقيم
        </button>
      </div>
    `;
    return;
  }
  
  // حساب متوسط التقييمات
  const avgRating = productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length;
  const ratingCounts = {5:0, 4:0, 3:0, 2:0, 1:0};
  productReviews.forEach(r => { ratingCounts[r.rating]++; });
  
  container.innerHTML = `
    <div class="reviews-summary">
      <div class="reviews-summary-left">
        <div class="avg-rating">${avgRating.toFixed(1)}</div>
        <div class="avg-stars">
          ${Array(5).fill().map((_, i) => 
            `<i class="fas fa-star" style="color: ${i < Math.round(avgRating) ? '#FFD700' : '#ddd'}; font-size:16px;"></i>`
          ).join('')}
        </div>
        <div class="total-reviews">${productReviews.length} تقييم</div>
      </div>
      <div class="reviews-bars">
        ${[5,4,3,2,1].map(star => {
          const percent = (ratingCounts[star] / productReviews.length) * 100;
          return `
            <div class="review-bar">
              <span class="review-bar-label">${star} <i class="fas fa-star" style="font-size:11px;"></i></span>
              <div class="review-bar-bg">
                <div class="review-bar-fill" style="width: ${percent}%;"></div>
              </div>
              <span class="review-bar-count">${ratingCounts[star]}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="reviews-list">
      ${productReviews.map(review => `
        <div class="review-item">
          <div class="review-header">
            <div class="reviewer-avatar">
              ${(review.userName?.charAt(0) || '?').toUpperCase()}
            </div>
            <div class="reviewer-info">
              <div class="reviewer-name">${escapeHtml(review.userName || 'مستخدم')}</div>
              <div class="review-stars">
                ${Array(5).fill().map((_, i) => 
                  `<i class="fas fa-star" style="color: ${i < review.rating ? '#FFD700' : '#ddd'}; font-size:13px;"></i>`
                ).join('')}
              </div>
              <div class="review-date">${review.createdAt?.toDate ? formatDate(review.createdAt.toDate()) : 'تاريخ غير محدد'}</div>
            </div>
          </div>
          <div class="review-body">
            <div class="review-title">${review.rating >= 4 ? '👍 منتج ممتاز' : review.rating >= 3 ? '👌 منتج جيد' : '⚠️ يحتاج تحسين'}</div>
            <div class="review-text">${escapeHtml(review.text || '')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

// ============================================================
// 4. مودال التواصل
// ============================================================

window.openContactModal = function() {
  const modal = document.getElementById('contactModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) {
    modal.classList.add('open');
    // تنظيف الحقول
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactMessage').value = '';
    document.getElementById('contactNameError').innerText = '';
    document.getElementById('contactPhoneError').innerText = '';
    document.getElementById('contactMsgError').innerText = '';
  }
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
};

window.closeContactModal = function() {
  const modal = document.getElementById('contactModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) modal.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
};

window.sendContactMessage = async function() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const message = document.getElementById('contactMessage').value.trim();
  
  let isValid = true;
  
  const nameError = validateName(name);
  const phoneError = validatePhone(phone);
  
  document.getElementById('contactNameError').innerText = nameError;
  document.getElementById('contactPhoneError').innerText = phoneError;
  
  if (nameError) isValid = false;
  if (phoneError) isValid = false;
  
  if (!message) {
    document.getElementById('contactMsgError').innerText = 'الرجاء كتابة رسالتك';
    isValid = false;
  } else {
    document.getElementById('contactMsgError').innerText = '';
  }
  
  if (!isValid) return;
  
  try {
    const btn = document.querySelector('.contact-submit');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإرسال...';
    
    await addDoc(collection(db, 'messages'), {
      name: name,
      phone: phone,
      message: message,
      status: 'new',
      createdAt: serverTimestamp()
    });
    
    window.customAlert('✅ تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.', 'success');
    window.closeContactModal();
    
  } catch (error) {
    console.error('خطأ في الإرسال:', error);
    window.customAlert('❌ حدث خطأ أثناء الإرسال، حاول مرة أخرى.', 'error');
  } finally {
    const btn = document.querySelector('.contact-submit');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> إرسال الرسالة';
  }
};

// ============================================================
// 5. مودال دليل المتسوق
// ============================================================

const infoContent = {
  shipping: `
    <h4>📦 سياسة الشحن</h4>
    <p>نشحن إلى جميع محافظات مصر عبر شركات شحن موثوقة. مدة التوصيل من 3 إلى 7 أيام عمل حسب المحافظة.</p>
    <p>تكلفة الشحن: <strong>مجاني</strong> للطلبات فوق 1000 جنيه.</p>
    
    <h4>🔄 سياسة الإرجاع والاستبدال</h4>
    <p>يحق لك استبدال أو إرجاع المنتج خلال 14 يومًا من تاريخ الاستلام بشرط أن يكون بحالته الأصلية والتغليف سليم.</p>
    <p>لبدء عملية الإرجاع، يرجى التواصل مع خدمة العملاء عبر رقم الواتساب أو "تواصل مع المسئول".</p>
    <p>ملاحظة: تكاليف الشحن للإرجاع يتحملها العميل إلا في حالة وجود عيب صناعي.</p>
  `,
  
  size: `
    <h4>📏 دليل المقاسات</h4>
    
    <div class="size-tabs">
      <button class="size-tab active" data-tab="rings">💍 الخواتم</button>
      <button class="size-tab" data-tab="bracelets">📿 الغوايش</button>
      <button class="size-tab" data-tab="necklaces">✨ السلاسل</button>
    </div>
    
    <div id="rings-tab" class="size-content active">
      <h5>قياس الخواتم</h5>
      <p><strong>الطريقة الأولى (القطر الداخلي):</strong> ضعي خاتم مناسب على يدك، ثم قيسي المسافة من الداخل باستخدام مسطرة.</p>
      <table class="size-table">
        <thead><tr><th>القطر (مم)</th><th>القطر (سم)</th><th>المقاس</th></tr></thead>
        <tbody>
          <tr><td>16</td><td>1.6</td><td>16</td></tr>
          <tr><td>17</td><td>1.7</td><td>17</td></tr>
          <tr><td>18</td><td>1.8</td><td>18</td></tr>
          <tr><td>19</td><td>1.9</td><td>19</td></tr>
          <tr><td>20</td><td>2.0</td><td>20</td></tr>
          <tr><td>21</td><td>2.1</td><td>21</td></tr>
        </tbody>
      </table>
      
      <p><strong>الطريقة الثانية (محيط الخيط):</strong> لفي خيطاً حول اصبعك (بدون شد)، ضعي علامة عند نقطة الالتقاء، ثم قيسي الطول.</p>
      <table class="size-table">
        <thead><tr><th>طول الخيط (سم)</th><th>المقاس</th></tr></thead>
        <tbody>
          <tr><td>5.0</td><td>16</td></tr>
          <tr><td>5.3</td><td>17</td></tr>
          <tr><td>5.7</td><td>18</td></tr>
          <tr><td>6.0</td><td>19</td></tr>
          <tr><td>6.3</td><td>20</td></tr>
          <tr><td>6.6</td><td>21</td></tr>
        </tbody>
      </table>
    </div>
    
    <div id="bracelets-tab" class="size-content">
      <h5>قياس الغوايش (الأساور المغلقة)</h5>
      <p><strong>الطريقة الأولى (القطر الداخلي):</strong> ضعي غويشة مناسبة على يدك، ثم قيسي المسافة من الداخل.</p>
      <table class="size-table">
        <thead><tr><th>المقاس</th><th>القطر الداخلي (سم)</th></tr></thead>
        <tbody>
          <tr><td>60</td><td>6.0</td></tr>
          <tr><td>65</td><td>6.5</td></tr>
          <tr><td>70</td><td>7.0</td></tr>
        </tbody>
      </table>
      
      <p><strong>الطريقة الثانية (محيط الخيط):</strong> لفي خيطاً حول رسغك (بدون شد)، قيسي الطول.</p>
      <table class="size-table">
        <thead><tr><th>المقاس</th><th>طول الخيط (سم)</th></tr></thead>
        <tbody>
          <tr><td>60</td><td>≈ 18.8</td></tr>
          <tr><td>65</td><td>≈ 20.4</td></tr>
          <tr><td>70</td><td>≈ 22.0</td></tr>
        </tbody>
      </table>
    </div>
    
    <div id="necklaces-tab" class="size-content">
      <h5>قياس السلاسل</h5>
      <p>استخدم خيطاً لقياس محيط رقبتك، ثم اختر الطول المناسب:</p>
      <table class="size-table">
        <thead><tr><th>طول السلسلة (سم)</th><th>المناسبة</th></tr></thead>
        <tbody>
          <tr><td>45</td><td>تشغيل حول الرقبة (Choker)</td></tr>
          <tr><td>50</td><td>يصل إلى عظمة الترقوة</td></tr>
          <tr><td>55</td><td>أسفل الترقوة قليلاً</td></tr>
          <tr><td>60</td><td>على الصدر</td></tr>
          <tr><td>70</td><td>سلسلة طويلة (أوبرا)</td></tr>
          <tr><td>80</td><td>سلسلة طويلة جداً (لاريات)</td></tr>
        </tbody>
      </table>
      <p><strong>نصيحة:</strong> إذا كنت غير متأكد، اختاري الطول الأطول قليلاً.</p>
    </div>
    
    <div style="margin-top:20px; padding:15px; background:#f9f9f9; border-radius:12px; border-right:3px solid #D4AF37;">
      <h5 style="color:#D4AF37;">📌 نصائح هامة</h5>
      <ul>
        <li>✅ لفي الخيط بدون شد (فقط ملامس للجلد)</li>
        <li>✅ علّمي مكان التقاء الخيط بدقة</li>
        <li>✅ قيسي الطول بالمليمتر (مم) بدقة</li>
        <li>✅ لو قياسك بين مقاسين، اختاري الأكبر</li>
      </ul>
    </div>
  `,
  
  packaging: `
    <h4>🎁 تغليف فاخر</h4>
    <p>نحرص على تقديم تجربة فاخرة منذ لحظة استلامك للطلب:</p>
    <ul>
      <li>✨ <strong>علبة فاخرة بملمس مخملي ولمسات سوداء راقية</strong></li>
      <li>🎨 <strong>تصميم داخلي أنيق</strong> يثبت القطعة بأمان</li>
      <li>🛡️ <strong>خامات قوية عالية الجودة</strong> لحماية المجوهرات</li>
      <li>✨ <strong>تفاصيل دقيقة وتشطيب فاخر</strong> يعكسان هوية VANTÉ</li>
      <li>🎁 <strong>تجربة فتح مميزة</strong> تضفي لمسة فخامة</li>
    </ul>
    <p style="color:#D4AF37; font-weight:bold; text-align:center; margin:20px 0;">
      ✨ لأن كل قطعة مميزة… تستحق تغليفًا يليق بها.
    </p>
  `,
  
  faq: `
    <div class="faq-item">
      <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
        ❓ هل المنتجات أصلية؟ <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-answer">
        نعم، جميع منتجاتنا مصنوعة من معادن ثمينة (ستانلس ستيل بيور) ومضمونة 100% أصلية.
      </div>
    </div>
    
    <div class="faq-item">
      <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
        ❓ كيف أتابع طلبي بعد الشراء؟ <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-answer">
        سنرسل لك تأكيد الطلب عبر واتساب يمكنك من خلاله تتبع حالة الطلب مع أحد ممثلي خدمة العملاء.
      </div>
    </div>
    
    <div class="faq-item">
      <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
        ❓ ما هي طرق الدفع المتاحة؟ <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-answer">
        الدفع عند الاستلام (كاش) لجميع المحافظات، أو تحويل محفظة إلكترونية أو تحويل إنستا باي حسب الاتفاق.
      </div>
    </div>
    
    <div class="faq-item">
      <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
        ❓ مدة التوصيل؟ <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-answer">
        تتراوح بين 3-7 أيام حسب محافظتك، نضمن التوصيل خلال أسبوع كحد أقصى.
      </div>
    </div>
    
    <div class="faq-item">
      <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
        ❓ هل يمكن تغيير المقاس بعد الشراء؟ <i class="fas fa-chevron-down"></i>
      </div>
      <div class="faq-answer">
        نعم، يمكنك استبدال المقاس خلال 14 يومًا من الاستلام بشرط أن يكون المنتج غير مستخدم. ملاحظة: تتحمل مصاريف الشحن بالكامل.
      </div>
    </div>
  `
};

let currentInfoTab = 'shipping';

// فتح مودال دليل المتسوق
window.openInfoModal = function() {
  const modal = document.getElementById('infoModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) {
    modal.classList.add('open');
    renderInfoTab(currentInfoTab);
  }
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
};

// إغلاق مودال دليل المتسوق
window.closeInfoModal = function() {
  const modal = document.getElementById('infoModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) modal.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
};

// عرض تبويب المعلومات
function renderInfoTab(tabId) {
  const infoBody = document.getElementById('infoBody');
  if (!infoBody) return;
  
  infoBody.innerHTML = infoContent[tabId] || '<p>المحتوى غير متوفر</p>';
  
  // تهيئة تبويبات المقاسات
  if (tabId === 'size') {
    document.querySelectorAll('.size-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.size-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.size-content').forEach(c => c.classList.remove('active'));
        const target = document.getElementById(this.dataset.tab + '-tab');
        if (target) target.classList.add('active');
      });
    });
  }
}

// تبديل تبويبات المعلومات
document.querySelectorAll('.info-tabs button').forEach(tab => {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.info-tabs button').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    currentInfoTab = this.dataset.tab;
    renderInfoTab(currentInfoTab);
  });
});

// ============================================================
// 6. نظام النجوم (التقييم)
// ============================================================

// تهيئة أحداث النجوم
export function initStarEvents() {
  const stars = document.querySelectorAll('.rating-stars span');
  
  stars.forEach((star, index) => {
    star.addEventListener('click', function() {
      window.selectedRating = index + 1;
      stars.forEach((s, i) => {
        s.classList.toggle('active', i < window.selectedRating);
      });
      document.getElementById('reviewText').style.display = 'block';
    });
  });
}

// ============================================================
// 7. تصدير الدوال العامة
// ============================================================

window.displayReviewsInModal = window.displayReviewsInModal;
window.selectedRating = window.selectedRating;

console.log('✅ modal.js تم تحميله');
