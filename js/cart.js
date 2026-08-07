// ============================================================
// cart.js - إدارة سلة التسوق والكوبونات
// ============================================================

import { 
    allProducts, 
    cart, 
    appliedCoupon, 
    discountAmount,
    db,
    escapeHtml,
    showToast
} from './app.js';

import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    increment 
} from "firebase-firestore";

// ============================================================
// 1. عرض السلة
// ============================================================

export function renderCartItems() {
    const cartItemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('total');
    
    if (!cartItemsEl) return;
    
    if (cart.length === 0) {
        cartItemsEl.innerHTML = `
            <div style="text-align:center; padding:40px 0; color:#888;">
                <i class="fas fa-shopping-bag" style="font-size:48px; color:#ddd; margin-bottom:16px;"></i>
                <p>سلة التسوق فارغة</p>
                <button class="btn-secondary" onclick="closeCart()" style="width:auto; padding:10px 30px; margin-top:16px;">
                    <i class="fas fa-arrow-right"></i> مواصلة التسوق
                </button>
            </div>
        `;
        if (totalEl) totalEl.textContent = '0';
        return;
    }
    
    let subtotal = 0;
    let totalDiscount = 0;
    
    const html = cart.map((item, index) => {
        const product = allProducts.find(p => p.id === item.productId);
        const itemTotal = item.price * item.qty;
        subtotal += itemTotal;
        
        let itemDiscount = 0;
        if (appliedCoupon && appliedCoupon.isActive !== false) {
            const isExpired = appliedCoupon.expiryDate?.toDate && appliedCoupon.expiryDate.toDate() < new Date();
            const isMaxed = appliedCoupon.maxUses && appliedCoupon.usedCount >= appliedCoupon.maxUses;
            
            if (!isExpired && !isMaxed) {
                if (appliedCoupon.appliesTo === 'all') {
                    if (appliedCoupon.discountType === 'percentage') {
                        itemDiscount = (itemTotal * appliedCoupon.discountValue) / 100;
                    } else {
                        itemDiscount = appliedCoupon.discountValue * (itemTotal / subtotal);
                    }
                } else if (appliedCoupon.appliesTo === 'random' && appliedCoupon.randomProductId === item.productId) {
                    if (appliedCoupon.discountType === 'percentage') {
                        itemDiscount = (itemTotal * appliedCoupon.discountValue) / 100;
                    } else {
                        itemDiscount = Math.min(appliedCoupon.discountValue, itemTotal);
                    }
                }
            }
        }
        
        totalDiscount += itemDiscount;
        
        let maxStock = -1;
        if (product && product.stockBySize && item.size) {
            const stockValue = product.stockBySize[item.size];
            if (stockValue !== null && stockValue !== undefined) {
                maxStock = stockValue;
            }
        }
        
        const isUnlimited = (maxStock === -1);
        const maxedOut = (!isUnlimited && item.qty >= maxStock);
        const finalPrice = itemTotal - itemDiscount;
        
        return `
            <div class="cart-item">
                <div class="cart-item-details">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>المقاس: ${item.size || 'غير محدد'} ${isUnlimited ? ' <span style="color:#800080;">(غير محدود)</span>' : ''}</small>
                    ${item.sku ? `<small style="display:block;color:#999;font-size:11px;">SKU: ${item.sku}</small>` : ''}
                    <div style="display:flex; gap:12px; margin-top:4px; font-size:13px; color:#888;">
                        <span>${item.qty} × ${Number(item.price).toFixed(0)} جنيه</span>
                        ${itemDiscount > 0 ? `<span style="color:#27ae60;">-${Number(itemDiscount).toFixed(0)} جنيه خصم</span>` : ''}
                    </div>
                </div>
                <div class="cart-item-price">
                    ${finalPrice.toFixed(0)} جنيه
                </div>
                <div style="display:flex; gap:4px; flex-direction:column; align-items:center;">
                    <button onclick="window.changeQty(${index}, 1)" ${maxedOut ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}
                            style="width:30px; height:30px; border-radius:8px; background:#111; color:#fff; border:none; cursor:pointer;">
                        <i class="fas fa-plus"></i>
                    </button>
                    <span style="font-weight:700; font-size:14px;">${item.qty}</span>
                    <button onclick="window.changeQty(${index}, -1)" 
                            style="width:30px; height:30px; border-radius:8px; background:#f5f5f5; color:#111; border:none; cursor:pointer;">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    cartItemsEl.innerHTML = html;
    
    const finalTotal = subtotal - totalDiscount;
    if (totalEl) totalEl.textContent = finalTotal.toFixed(0);
    
    updateCouponMessage(subtotal, totalDiscount, finalTotal);
    window.discountAmount = totalDiscount;
}

function updateCouponMessage(subtotal, totalDiscount, finalTotal) {
    const couponMsg = document.getElementById('couponMessage');
    if (!couponMsg) return;
    
    if (appliedCoupon && totalDiscount > 0) {
        let message = `🎟️ كود "${appliedCoupon.code}"`;
        if (appliedCoupon.appliesTo === 'random' && appliedCoupon.randomProductId) {
            const product = allProducts.find(p => p.id === appliedCoupon.randomProductId);
            const productName = product ? product.name : 'منتج غير معروف';
            message += ` خصم ${totalDiscount.toFixed(0)} جنيه على: ${escapeHtml(productName)}`;
        } else {
            message += ` خصم ${totalDiscount.toFixed(0)} جنيه`;
        }
        message += ` <button onclick="window.removeCoupon()" style="background:none; border:none; color:#c0392b; cursor:pointer; font-size:16px;">❌</button>`;
        couponMsg.innerHTML = message;
        couponMsg.style.color = '#D4AF37';
    } else if (appliedCoupon && totalDiscount === 0) {
        couponMsg.innerHTML = '⚠️ الكود غير صالح لهذه السلة (قد تكون المنتجات غير قابلة للخصم)';
        couponMsg.style.color = '#e67e22';
    } else {
        couponMsg.innerHTML = '';
    }
}

// ============================================================
// 2. تغيير الكمية
// ============================================================

window.changeQty = function(index, change) {
    const item = cart[index];
    if (!item) return;
    
    if (change > 0) {
        const product = allProducts.find(p => p.id === item.productId);
        if (product && product.stockBySize && product.stockBySize[item.size] !== undefined) {
            const stockValue = product.stockBySize[item.size];
            if (stockValue !== null && stockValue !== undefined) {
                if (item.qty + change > stockValue) {
                    showToast(`❌ الكمية المتاحة لمقاس ${item.size} هي ${stockValue} قطعة فقط.`, 'error');
                    return;
                }
            }
        }
    }
    
    item.qty += change;
    if (item.qty <= 0) {
        cart.splice(index, 1);
    }
    
    localStorage.setItem('vante_cart', JSON.stringify(cart));
    renderCartItems();
    updateCartDisplay();
};

// ============================================================
// 3. فتح وإغلاق السلة
// ============================================================

window.openCart = function() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('modalOverlay');
    
    renderCartItems();
    drawer.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
};

window.closeCart = function() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('modalOverlay');
    
    drawer.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
};

// ============================================================
// 4. تحديث عرض السلة
// ============================================================

export function updateCartDisplay() {
    const cartData = JSON.parse(localStorage.getItem('vante_cart') || '[]');
    window.cart = cartData;
    
    const count = cartData.reduce((sum, item) => sum + (item.qty || 1), 0);
    const countEl = document.getElementById('cartCount');
    if (countEl) countEl.textContent = count;
    
    renderCartItems();
}

// ============================================================
// 5. نظام الكوبونات
// ============================================================

export async function applyCoupon(code) {
    if (!code || code.trim() === '') {
        showToast('⚠️ أدخل كود الخصم أولاً', 'warning');
        return false;
    }
    
    const trimmedCode = code.trim().toUpperCase();
    
    try {
        const couponsRef = collection(db, 'coupons');
        const q = query(couponsRef, where('code', '==', trimmedCode));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            showToast('❌ كود الخصم غير صالح', 'error');
            return false;
        }
        
        const couponData = snapshot.docs[0];
        const coupon = { id: couponData.id, ...couponData.data() };
        
        const now = new Date();
        const isExpired = coupon.expiryDate?.toDate && coupon.expiryDate.toDate() < now;
        const isMaxed = coupon.maxUses && coupon.usedCount >= coupon.maxUses;
        
        if (!coupon.isActive) {
            showToast('❌ الكود غير نشط حالياً', 'error');
            return false;
        }
        
        if (isExpired) {
            showToast('❌ انتهت صلاحية الكود', 'error');
            return false;
        }
        
        if (isMaxed) {
            showToast('❌ تم استخدام هذا الكود أقصى عدد مرات', 'error');
            return false;
        }
        
        window.appliedCoupon = coupon;
        
        if (coupon.appliesTo === 'random') {
            const eligibleItems = cart.filter(item => {
                const product = allProducts.find(p => p.id === item.productId);
                return item.productId && product && product.discountable !== false;
            });
            
            if (eligibleItems.length === 0) {
                showToast('⚠️ لا يوجد منتج قابل للخصم لتطبيق الخصم العشوائي', 'warning');
                window.appliedCoupon = null;
                return false;
            }
            
            const randomIndex = Math.floor(Math.random() * eligibleItems.length);
            window.appliedCoupon.randomProductId = eligibleItems[randomIndex].productId;
        }
        
        renderCartItems();
        showToast(`✅ تم تطبيق كود ${coupon.code}`, 'success');
        return true;
        
    } catch (error) {
        console.error('خطأ في تطبيق الكوبون:', error);
        showToast('❌ حدث خطأ أثناء تطبيق الكود', 'error');
        return false;
    }
}

window.removeCoupon = function() {
    window.appliedCoupon = null;
    window.discountAmount = 0;
    renderCartItems();
    showToast('✅ تم إلغاء الخصم', 'info');
};

// ============================================================
// 6. فتح مودال الدفع
// ============================================================

window.openCheckout = function() {
    if (cart.length === 0) {
        showToast('⚠️ السلة فارغة', 'warning');
        return;
    }
    
    const modal = document.getElementById('checkoutModal');
    modal.classList.add('active');
    checkShippingDiscount();
};

window.closeCheckout = function() {
    const modal = document.getElementById('checkoutModal');
    modal.classList.remove('active');
};

async function checkShippingDiscount() {
    try {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        const discountSettings = await getDoc(doc(db, 'settings', 'shipping_discount'));
        
        const msgDiv = document.getElementById('shippingDiscountMessage');
        if (msgDiv) {
            if (discountSettings.exists()) {
                const settings = discountSettings.data();
                const enabled = settings.enabled === true;
                const threshold = Number(settings.threshold) || 0;
                
                if (enabled && subtotal >= threshold) {
                    msgDiv.style.display = 'block';
                } else {
                    msgDiv.style.display = 'none';
                }
            } else {
                msgDiv.style.display = 'none';
            }
        }
    } catch (error) {
        console.warn('خطأ في التحقق من خصم الشحن:', error);
    }
}

// ============================================================
// 7. تهيئة الكوبونات
// ============================================================

export function initCouponEvents() {
    const applyBtn = document.getElementById('applyCouponBtn');
    const couponInput = document.getElementById('couponInput');
    
    if (applyBtn) {
        applyBtn.addEventListener('click', async () => {
            const code = couponInput ? couponInput.value.trim() : '';
            if (await applyCoupon(code)) {
                if (couponInput) couponInput.value = '';
            }
        });
    }
    
    if (couponInput) {
        couponInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                const code = couponInput.value.trim();
                if (await applyCoupon(code)) {
                    couponInput.value = '';
                }
            }
        });
    }
}

// ============================================================
// 8. دوال عامة
// ============================================================

window.renderCartItems = renderCartItems;
window.updateCartDisplay = updateCartDisplay;
window.applyCoupon = applyCoupon;
window.cart = cart;

console.log('✅ cart.js تم تحميله');