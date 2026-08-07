// ============================================================
// checkout.js - إدارة الدفع وإرسال الطلب
// ============================================================

import { 
  allProducts, 
  cart, 
  appliedCoupon, 
  discountAmount,
  db,
  governorates,
  saveCart,
  updateCartDisplay,
  renderCartItems
} from './app.js';

import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  query, 
  where, 
  getDocs 
} from "firebase-firestore";

// ============================================================
// 1. المتغيرات
// ============================================================

let isProcessing = false;

// ============================================================
// 2. فتح وإغلاق مودال الدفع
// ============================================================

window.openCheckout = function() {
  if (cart.length === 0) {
    window.customAlert('⚠️ السلة فارغة', 'warning');
    return;
  }
  
  const modal = document.getElementById('checkoutModal');
  if (modal) {
    modal.classList.add('open');
    // تنظيف الحقول
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('address').value = '';
    document.getElementById('governorate').value = '';
    document.getElementById('city').innerHTML = '<option value="">اختر المدينة</option>';
    document.getElementById('city').disabled = true;
    
    // عرض رسالة خصم الشحن
    checkShippingDiscount();
  }
};

window.closeCheckout = function() {
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.remove('open');
};

// ============================================================
// 3. التحقق من خصم الشحن
// ============================================================

async function checkShippingDiscount() {
  try {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountSettings = await getDoc(doc(db, 'settings', 'shipping_discount'));
    
    const msgDiv = document.getElementById('shippingDiscountMessage');
    if (!msgDiv) return;
    
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
  } catch (error) {
    console.warn('خطأ في التحقق من خصم الشحن:', error);
  }
}

// ============================================================
// 4. التحقق من البيانات
// ============================================================

function validateCheckoutData(name, phone, gov, city, address) {
  const errors = [];
  
  if (!name || name.trim().length < 3) {
    errors.push('الاسم يجب أن لا يقل عن 3 أحرف');
  }
  
  const phoneRegex = /^01[0125][0-9]{8}$/;
  if (!phoneRegex.test(phone)) {
    errors.push('رقم الهاتف غير صحيح (مثال: 01012345678)');
  }
  
  if (!gov) {
    errors.push('يرجى اختيار المحافظة');
  }
  
  if (!city) {
    errors.push('يرجى اختيار المدينة');
  }
  
  if (!address || address.trim().length < 5) {
    errors.push('يرجى كتابة العنوان بالتفصيل');
  }
  
  return errors;
}

// ============================================================
// 5. حساب الشحن
// ============================================================

async function calculateShipping(gov) {
  try {
    // جلب سعر الشحن حسب المحافظة
    const shippingRateSnap = await getDocs(
      query(collection(db, 'shippingRates'), where('gov', '==', gov))
    );
    
    let customerFee = 70;
    let storeCost = 70;
    
    if (!shippingRateSnap.empty) {
      const rate = shippingRateSnap.docs[0].data();
      customerFee = rate.customerFee || 70;
      storeCost = rate.costForStore || 70;
    }
    
    // التحقق من خصم الشحن للطلبات الكبيرة
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountSettings = await getDoc(doc(db, 'settings', 'shipping_discount'));
    
    let discountApplied = false;
    if (discountSettings.exists()) {
      const settings = discountSettings.data();
      const enabled = settings.enabled === true;
      const threshold = Number(settings.threshold) || 0;
      const discountedFee = Number(settings.discounted_shipping) ?? 0;
      
      if (enabled && subtotal >= threshold) {
        customerFee = discountedFee;
        discountApplied = true;
      }
    }
    
    return { customerFee, storeCost, discountApplied };
  } catch (error) {
    console.warn('خطأ في حساب الشحن:', error);
    return { customerFee: 70, storeCost: 70, discountApplied: false };
  }
}

// ============================================================
// 6. إنشاء رقم الطلب
// ============================================================

async function generateOrderNumber(phone) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  
  // الحصول على كود العميل
  const customersRef = collection(db, 'customers');
  const qCustomer = query(customersRef, where('phone', '==', phone));
  const customerSnap = await getDocs(qCustomer);
  
  let customerCode;
  if (!customerSnap.empty) {
    customerCode = customerSnap.docs[0].data().customerCode;
  } else {
    // إنشاء كود عميل جديد
    const counterRef = doc(db, 'counters', 'customers');
    const counterSnap = await getDoc(counterRef);
    if (!counterSnap.exists()) {
      await setDoc(counterRef, { value: 0 });
    }
    await updateDoc(counterRef, { value: increment(1) });
    const newValue = (await getDoc(counterRef)).data().value;
    customerCode = `V${newValue}`;
    
    // حفظ العميل
    await setDoc(doc(db, 'customers', phone), {
      phone,
      name: document.getElementById('name').value.trim(),
      customerCode,
      createdAt: serverTimestamp()
    });
  }
  
  // عدد الطلبات اليومية
  const ordersRef = collection(db, 'orders');
  const qToday = query(ordersRef, where('date', '==', dateStr));
  const todaySnap = await getDocs(qToday);
  const dailyCount = todaySnap.size + 1;
  
  // عدد طلبات العميل
  const qCustomerOrders = query(ordersRef, where('phone', '==', phone));
  const customerOrdersSnap = await getDocs(qCustomerOrders);
  const customerOrderCount = customerOrdersSnap.size + 1;
  
  // رقم الطلب: V001-20260101-001
  const orderNumber = `${customerCode}-${dateStr}${String(customerOrderCount).padStart(2, '0')}`;
  
  return { orderNumber, dateStr, customerCode };
}

// ============================================================
// 7. إرسال الطلب
// ============================================================

window.checkout = async function() {
  if (isProcessing) return;
  
  // جمع البيانات
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const gov = document.getElementById('governorate').value;
  const city = document.getElementById('city').value;
  const address = document.getElementById('address').value.trim();
  
  // التحقق من البيانات
  const errors = validateCheckoutData(name, phone, gov, city, address);
  if (errors.length > 0) {
    window.customAlert(`⚠️ ${errors.join('\n')}`, 'error');
    return;
  }
  
  // فتح مودال التأكيد
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    const confirmBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    
    const cleanup = () => {
      modal.classList.remove('open');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    const handleConfirm = () => {
      cleanup();
      resolve(true);
      executeCheckout(name, phone, gov, city, address);
    };
    
    const handleCancel = () => {
      cleanup();
      resolve(false);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    modal.classList.add('open');
  });
};

// ============================================================
// 8. تنفيذ الطلب
// ============================================================

async function executeCheckout(name, phone, gov, city, address) {
  if (isProcessing) return;
  isProcessing = true;
  
  const btn = document.querySelector('#checkoutModal .btn-primary');
  const originalText = btn.innerHTML;
  
  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إرسال الطلب...';
    
    // 1. حساب المجموع
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    // 2. حساب الشحن
    const shipping = await calculateShipping(gov);
    const finalShipping = shipping.customerFee;
    
    // 3. حساب الخصم
    let totalDiscount = discountAmount || 0;
    if (appliedCoupon) {
      // التحقق من صلاحية الكوبون
      const isExpired = appliedCoupon.expiryDate?.toDate && appliedCoupon.expiryDate.toDate() < new Date();
      const isMaxed = appliedCoupon.maxUses && appliedCoupon.usedCount >= appliedCoupon.maxUses;
      
      if (isExpired || isMaxed) {
        totalDiscount = 0;
        window.appliedCoupon = null;
      }
    }
    
    // 4. الإجمالي النهائي
    const finalTotal = subtotal + finalShipping - totalDiscount;
    
    // 5. إنشاء رقم الطلب
    const { orderNumber, dateStr } = await generateOrderNumber(phone);
    
    // 6. تجهيز تفاصيل الطلب
    const orderDetails = cart.map(item => {
      const product = allProducts.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        sku: item.sku || product?.sku || null,
        name: item.name,
        size: item.size || '',
        qty: item.qty,
        price: item.price,
        image: item.image || '',
        costPrice: product?.costPrice || 0
      };
    });
    
    // 7. حساب التكلفة الإجمالية
    const totalCost = cart.reduce((sum, item) => {
      const product = allProducts.find(p => p.id === item.productId);
      return sum + (item.qty * (product?.costPrice || 0));
    }, 0);
    
    // 8. حفظ الطلب في Firestore
    const orderData = {
      orderID: orderNumber,
      customerName: name,
      phone: phone,
      gov: gov,
      city: city,
      address: address,
      orderDetails: orderDetails,
      quantity: cart.reduce((sum, i) => sum + i.qty, 0),
      price: subtotal,
      shipping: finalShipping,
      shippingCostPaid: shipping.storeCost,
      finalTotal: finalTotal,
      status: 'new',
      date: dateStr,
      stockDeducted: true,
      stockRestored: false,
      createdAt: serverTimestamp(),
      originalCreatedAt: serverTimestamp(),
      totalCost: totalCost,
      profit: finalTotal - totalCost - shipping.storeCost
    };
    
    // إضافة بيانات الكوبون
    if (appliedCoupon && totalDiscount > 0) {
      orderData.coupon = {
        code: appliedCoupon.code,
        discountType: appliedCoupon.discountType,
        discountValue: appliedCoupon.discountValue,
        appliesTo: appliedCoupon.appliesTo,
        productId: appliedCoupon.randomProductId || null,
        discountAmount: totalDiscount,
        finalTotal: finalTotal
      };
    }
    
    await addDoc(collection(db, 'orders'), orderData);
    
    // 9. تحديث عداد الكوبون
    if (appliedCoupon && totalDiscount > 0) {
      const couponRef = doc(db, 'coupons', appliedCoupon.id);
      await updateDoc(couponRef, { usedCount: increment(1) });
    }
    
    // 10. خصم المخزون
    const stockUpdates = {};
    cart.forEach(item => {
      const product = allProducts.find(p => p.id === item.productId);
      if (product && product.stockBySize && product.stockBySize[item.size] !== undefined) {
        const currentStock = product.stockBySize[item.size];
        if (currentStock === null || currentStock === undefined) return;
        const productId = product.id;
        const size = item.size;
        if (!stockUpdates[productId]) stockUpdates[productId] = {};
        stockUpdates[productId][size] = (stockUpdates[productId][size] || 0) + item.qty;
      }
    });
    
    for (const [productId, sizes] of Object.entries(stockUpdates)) {
      const product = allProducts.find(p => p.id === productId);
      if (!product) continue;
      const newStockBySize = { ...product.stockBySize };
      for (const [size, qty] of Object.entries(sizes)) {
        if (newStockBySize[size] !== null && newStockBySize[size] !== undefined) {
          newStockBySize[size] = Math.max(0, (newStockBySize[size] || 0) - qty);
        }
      }
      await updateDoc(doc(db, 'products', productId), { stockBySize: newStockBySize });
    }
    
    // 11. تحديث المبيعات
    for (const [productId, sizes] of Object.entries(stockUpdates)) {
      const totalQty = Object.values(sizes).reduce((sum, q) => sum + q, 0);
      const productRef = doc(db, 'products', productId);
      await updateDoc(productRef, { salesCount: increment(totalQty) });
    }
    
    // 12. بناء رسالة واتساب
    const message = buildWhatsAppMessage(
      orderNumber, name, phone, gov, city, address,
      cart, subtotal, finalShipping, totalDiscount, finalTotal,
      orderDetails
    );
    
    // 13. إرسال إلى واتساب
    const phoneNumber = '201106018685';
    const encodedMessage = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${phoneNumber}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    
    window.customAlert('✅ تم حفظ طلبك بنجاح!\n\n📱 سيتم تحويلك الآن إلى واتساب.\n⚠️ من فضلك: اضغط على زر الإرسال (➤) لتأكيد طلبك.', 'success');
    
    // محاولة فتح التطبيق أولاً
    window.location.href = appUrl;
    setTimeout(() => {
      if (!document.hidden) window.open(webUrl, '_blank');
    }, 2500);
    
    // 14. تفريغ السلة
    cart = [];
    saveCart();
    updateCartDisplay();
    renderCartItems();
    window.closeCheckout();
    window.closeCart();
    
    // إعادة تعيين الكوبون
    window.appliedCoupon = null;
    window.discountAmount = 0;
    
  } catch (error) {
    console.error('خطأ في إرسال الطلب:', error);
    window.customAlert('❌ حدث خطأ أثناء إرسال الطلب. حاول مرة أخرى.', 'error');
  } finally {
    isProcessing = false;
    const btn = document.querySelector('#checkoutModal .btn-primary');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// ============================================================
// 9. بناء رسالة واتساب
// ============================================================

function buildWhatsAppMessage(
  orderNumber, name, phone, gov, city, address,
  cart, subtotal, shipping, discount, finalTotal,
  orderDetails
) {
  let message = `🛍️ طلب جديد - VANTÉ\n\n`;
  message += `📦 رقم الطلب: ${orderNumber}\n`;
  message += `👤 الاسم: ${name}\n`;
  message += `📱 الهاتف: ${phone}\n`;
  message += `📍 المحافظة: ${gov}\n`;
  message += `🏙️ المدينة: ${city}\n`;
  message += `🏠 العنوان: ${address}\n\n`;
  
  message += `📋 تفاصيل الطلب:\n`;
  orderDetails.forEach((item, index) => {
    message += `${index + 1}. ${item.name}\n`;
    if (item.sku) message += `   🔖 SKU: ${item.sku}\n`;
    message += `   مقاس: ${item.size || 'غير محدد'}\n`;
    message += `   الكمية: ${item.qty}\n`;
    message += `   السعر: ${(item.price * item.qty).toFixed(0)} جنيه\n\n`;
  });
  
  message += `💰 إجمالي المنتجات: ${subtotal.toFixed(0)} جنيه\n`;
  message += `🚚 الشحن: ${shipping.toFixed(0)} جنيه\n`;
  
  if (discount > 0) {
    message += `🎟️ خصم: -${discount.toFixed(0)} جنيه\n`;
  }
  
  message += `\n💳 الإجمالي النهائي: ${finalTotal.toFixed(0)} جنيه\n`;
  message += `\n✅ يرجى تأكيد الطلب بالرد على هذه الرسالة.`;
  
  return message;
}

// ============================================================
// 10. تصدير الدوال العامة
// ============================================================

window.executeCheckout = executeCheckout;

console.log('✅ checkout.js تم تحميله');
