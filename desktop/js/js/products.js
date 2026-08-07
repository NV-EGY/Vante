// ============================================================
// products.js - إدارة المنتجات والعرض
// ============================================================

import { 
  allProducts, 
  allReviews, 
  cart, 
  currentCategory, 
  currentSort, 
  displayedProductsCount,
  currentProduct,
  selectedRating,
  saveCart,
  updateCartDisplay,
  escapeHtml,
  getAverageRating,
  getReviewCount,
  db
} from './app.js';

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  increment,
  serverTimestamp,
  addDoc
} from "firebase-firestore";

// ============================================================
// 1. دوال مساعدة للفلترة والترتيب
// ============================================================

// دالة لتطبيع النصوص (إزالة التشكيل والمسافات)
function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

// دالة للفلترة حسب القسم
function filterByCategory(products, category) {
  if (category === 'all') return products;
  return products.filter(p => normalize(p.category) === category);
}

// دالة للفلترة حسب البحث
function filterBySearch(products, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') return products;
  const term = searchTerm.trim().toLowerCase();
  return products.filter(p => 
    p.name?.toLowerCase().includes(term) || 
    (p.sku && p.sku.toLowerCase().includes(term)) ||
    (p.description && p.description.toLowerCase().includes(term))
  );
}

// دالة للترتيب
function sortProducts(products, sortType) {
  const sorted = [...products];
  
  switch(sortType) {
    case 'latest':
      sorted.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        if (aTime !== bTime) return bTime - aTime;
        return b.id?.localeCompare(a.id) || 0;
      });
      break;
      
    case 'price_asc':
      sorted.sort((a, b) => a.price - b.price);
      break;
      
    case 'price_desc':
      sorted.sort((a, b) => b.price - a.price);
      break;
      
    case 'best_selling':
      sorted.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
      break;
      
    case 'top_rated':
      sorted.sort((a, b) => {
        const avgA = getAverageRating(a.id);
        const avgB = getAverageRating(b.id);
        return avgB - avgA;
      });
      break;
      
    case 'random':
    default:
      // ترتيب عشوائي موحد لكل الزوار
      const intervalMs = 60 * 60 * 1000; // ساعة
      const currentHour = Math.floor(Date.now() / intervalMs);
      const seed = currentHour * 9999 + 7777;
      
      function seededRandom(seed) {
        return function() {
          seed = (seed * 9301 + 49297) % 233280;
          return seed / 233280;
        };
      }
      
      const random = seededRandom(seed);
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      break;
  }
  
  return sorted;
}

// دالة للتحقق من توفر المنتج
function getProductStock(product) {
  const stockBySize = product.stockBySize || {};
  let total = 0;
  let hasUnlimited = false;
  
  for (let qty of Object.values(stockBySize)) {
    if (qty === null || qty === undefined) {
      hasUnlimited = true;
    } else {
      total += parseInt(qty) || 0;
    }
  }
  
  return {
    total: hasUnlimited ? null : total,
    hasUnlimited: hasUnlimited,
    bySize: stockBySize
  };
}

// دالة للتحقق من نفاد المنتج
function isOutOfStock(product) {
  const stock = getProductStock(product);
  if (stock.hasUnlimited) return false;
  if (Object.keys(stock.bySize).length === 0) return false;
  return stock.total <= 0;
}

// ============================================================
// 2. عرض المنتجات في الشبكة
// ============================================================

export function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const counter = document.getElementById('productsCounter');
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  
  if (!grid) return;
  
  // 1. الفلترة
  let filtered = filterByCategory(allProducts, currentCategory);
  filtered = filterBySearch(filtered, window._searchTerm || '');
  
  // 2. الترتيب
  filtered = sortProducts(filtered, currentSort);
  
  // 3. فصل المنتجات المتوفرة عن النافدة
  const inStock = filtered.filter(p => !isOutOfStock(p));
  const outOfStock = filtered.filter(p => isOutOfStock(p));
  filtered = [...inStock, ...outOfStock];
  
  // 4. تطبيق حدود العرض
  const totalProducts = filtered.length;
  const limited = filtered.slice(0, displayedProductsCount);
  
  // 5. تحديث العداد
  if (counter) {
    counter.innerHTML = `🛍️ عرض ${limited.length} من ${totalProducts} منتج`;
  }
  
  // 6. تحديث زر تحميل المزيد
  if (loadMoreContainer) {
    if (displayedProductsCount < totalProducts) {
      loadMoreContainer.style.display = 'block';
      const remaining = totalProducts - displayedProductsCount;
      if (loadMoreBtn) {
        loadMoreBtn.innerHTML = `<i class="fas fa-arrow-down"></i> عرض المزيد (متبقى ${remaining} منتج)`;
      }
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }
  
  // 7. عرض المنتجات أو رسالة "لا توجد منتجات"
  if (limited.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:#888; font-size:18px;">
        <i class="fas fa-search" style="font-size:48px; color:#ddd; margin-bottom:16px;"></i>
        <p>لا توجد منتجات في هذا القسم</p>
      </div>
    `;
    return;
  }
  
  // 8. بناء HTML لكل منتج
  grid.innerHTML = limited.map(product => {
    const stock = getProductStock(product);
    const outOfStock = isOutOfStock(product);
    const hasDiscount = product.comparePrice && product.comparePrice > product.price;
    const discountPercent = hasDiscount ? Math.round((1 - product.price / product.comparePrice) * 100) : 0;
    const reviewCount = getReviewCount(product.id);
    const avgRating = getAverageRating(product.id);
    
    // خيارات المقاسات
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ["7", "8", "9"];
    let sizeOptions = '';
    const availableSizes = sizes.filter(s => {
      const qty = stock.bySize[s];
      return qty === null || qty === undefined || qty > 0;
    });
    
    if (availableSizes.length === 1) {
      const size = availableSizes[0];
      const qty = stock.bySize[size];
      const label = (qty !== null && qty !== undefined && qty > 0) 
        ? `مقاس: ${size} (باقى ${qty} قطعه)` 
        : `مقاس: ${size}`;
      sizeOptions = `<option value="${size}" selected>${label}</option>`;
    } else if (availableSizes.length > 1) {
      sizeOptions = `<option value="" disabled selected>اختر المقاس</option>`;
      sizes.forEach(s => {
        const qty = stock.bySize[s] !== undefined ? stock.bySize[s] : null;
        let label = `مقاس: ${s}`;
        let isDisabled = false;
        if (qty !== null) {
          if (qty > 0) {
            label += ` (باقى ${qty} قطعه)`;
          } else {
            label += ` (نفذ)`;
            isDisabled = true;
          }
        }
        sizeOptions += `<option value="${s}" ${isDisabled ? 'disabled' : ''}>${label}</option>`;
      });
    } else {
      sizeOptions = `<option value="" disabled selected>🚫 نفذت الكمية</option>`;
    }
    
    // شريط المخزون
    let stockHtml = '';
    if (stock.hasUnlimited) {
      stockHtml = `
        <div class="stock-info in-stock">
          <i class="fas fa-infinity"></i> متوفر دائماً
        </div>`;
    } else if (Object.keys(stock.bySize).length === 0) {
      stockHtml = `
        <div class="stock-info" style="background:rgba(212,175,55,0.1);color:#B8860B;">
          <i class="fas fa-boxes"></i> كمية غير محددة
        </div>`;
    } else if (stock.total > 20) {
      stockHtml = `
        <div class="stock-info in-stock">
          <i class="fas fa-check-circle"></i> متوفر: ${stock.total} قطعة
        </div>`;
    } else if (stock.total > 0) {
      const percent = Math.min(100, Math.round((stock.total / 20) * 100));
      const barColor = percent > 50 ? '#f39c12' : '#e74c3c';
      stockHtml = `
        <div style="margin:8px 0;">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#555;margin-bottom:4px;">
            <span><i class="fas fa-cubes"></i> متبقي: ${stock.total} قطعة</span>
            <span style="font-weight:700;color:${barColor};">${percent}%</span>
          </div>
          <div style="width:100%;height:4px;background:#eee;border-radius:10px;overflow:hidden;">
            <div style="width:${percent}%;height:100%;background:${barColor};border-radius:10px;"></div>
          </div>
        </div>`;
    } else {
      stockHtml = `
        <div class="stock-info out-of-stock">
          <i class="fas fa-times-circle"></i> 🚫 نفذت الكمية
        </div>`;
    }
    
    return `
      <div class="product-card ${outOfStock ? 'out-of-stock' : ''}" 
           style="position:relative; cursor:pointer;"
           onclick="window.openProduct('${product.id}')">
        
        ${hasDiscount ? `<span class="discount-badge">${discountPercent}% OFF</span>` : ''}
        
        <div class="review-badge">
          <i class="fas fa-star"></i> ${reviewCount}
        </div>
        
        <div class="product-image">
          <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy">
        </div>
        
        <div class="product-name">${escapeHtml(product.name)}</div>
        
        <div class="product-price">
          ${hasDiscount ? `<span class="old-price">${Number(product.comparePrice)} EGP</span>` : ''}
          <span>${Number(product.price)} EGP</span>
        </div>
        
        <div class="size-selector" onclick="event.stopPropagation();">
          <select class="size-select" data-product-id="${product.id}">
            ${sizeOptions}
          </select>
        </div>
        
        ${stockHtml}
        
        <button class="btn-primary" 
                onclick="event.stopPropagation(); window.addToCartFromCard('${product.id}')"
                ${outOfStock ? 'disabled style="opacity:0.6;cursor:not-allowed;"' : ''}>
          ${outOfStock ? '<i class="fas fa-times-circle"></i> نفذت الكمية' : '<i class="fas fa-shopping-bag"></i> أضف للسلة'}
        </button>
      </div>
    `;
  }).join('');
  
  // تحديث شارات التقييمات
  updateReviewBadges();
}

// ============================================================
// 3. عرض الأكثر مبيعاً
// ============================================================

let bestSellersConfig = { mode: "sales", limit: 8 };
let randomRefreshInterval = null;

export function renderBestSellers() {
  const grid = document.getElementById('bestSellersGrid');
  if (!grid || !allProducts.length) return;
  
  const config = bestSellersConfig;
  let selected = [];
  const limit = Math.min(config.limit || 8, 20);
  
  if (config.mode === "random") {
    // عشوائي
    const shuffled = [...allProducts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    selected = shuffled.slice(0, limit);
  } else {
    // الأكثر مبيعاً
    selected = [...allProducts]
      .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
      .slice(0, limit);
  }
  
  if (selected.length === 0) {
    grid.innerHTML = '<p style="text-align:center;color:#888;">لا توجد منتجات</p>';
    return;
  }
  
  grid.innerHTML = selected.map(product => {
    const hasDiscount = product.comparePrice && product.comparePrice > product.price;
    const discountPercent = hasDiscount ? Math.round((1 - product.price / product.comparePrice) * 100) : 0;
    
    return `
      <div class="best-seller-card" onclick="window.openProduct('${product.id}')">
        ${hasDiscount ? `<span class="best-seller-badge">%${discountPercent} خصم</span>` : ''}
        <img src="${product.image}" alt="${escapeHtml(product.name)}">
        <div class="name">${escapeHtml(product.name)}</div>
        <div class="price-wrapper">
          ${hasDiscount ? `<span class="old-price">${Number(product.comparePrice)} EGP</span>` : ''}
          <span class="current-price">${Number(product.price)} EGP</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// 4. تحديث شارات التقييمات
// ============================================================

export function updateReviewBadges() {
  const reviewCounts = {};
  allReviews.forEach(review => {
    const productId = review.productId;
    if (!reviewCounts[productId]) reviewCounts[productId] = 0;
    reviewCounts[productId]++;
  });
  
  document.querySelectorAll('.review-badge').forEach(badge => {
    const card = badge.closest('.product-card');
    if (!card) return;
    const onclick = card.getAttribute('onclick') || '';
    const match = onclick.match(/openProduct\('([^']+)'\)/);
    if (match && match[1]) {
      const productId = match[1];
      const count = reviewCounts[productId] || 0;
      badge.innerHTML = `<i class="fas fa-star"></i> ${count}`;
    }
  });
}

// ============================================================
// 5. وظائف التفاعل مع المنتجات
// ============================================================

// فتح المنتج (مودال)
window.openProduct = function(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) {
    window.customAlert('⚠️ المنتج غير موجود', 'error');
    return;
  }
  
  // حفظ المنتج الحالي
  window.currentProduct = product;
  
  // فتح المودال
  const modal = document.getElementById('productModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (!modal) {
    console.error('مودال المنتج غير موجود');
    return;
  }
  
  // ملء بيانات المنتج في المودال
  fillProductModal(product);
  
  modal.classList.add('open');
  if (overlay) overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // عرض التقييمات
  if (typeof displayReviewsInModal === 'function') {
    displayReviewsInModal(productId);
  }
};

// إغلاق المنتج
window.closeProduct = function() {
  const modal = document.getElementById('productModal');
  const overlay = document.getElementById('modalOverlay');
  
  if (modal) modal.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  window.currentProduct = null;
};

// ملء بيانات المنتج في المودال
function fillProductModal(product) {
  const stock = getProductStock(product);
  const hasDiscount = product.comparePrice && product.comparePrice > product.price;
  
  // الصورة الرئيسية
  const mainImg = document.getElementById('modalImg');
  if (mainImg) mainImg.src = product.image;
  
  // العنوان والوصف
  document.getElementById('modalTitle').textContent = product.name;
  document.getElementById('modalDesc').innerHTML = product.description || 'منتج فاخر من VANTÉ';
  
  // السعر
  const priceEl = document.getElementById('modalPrice');
  const oldPriceEl = document.getElementById('modalOldPrice');
  if (priceEl) priceEl.textContent = Number(product.price) + ' جنيه';
  if (oldPriceEl) {
    if (hasDiscount) {
      oldPriceEl.textContent = Number(product.comparePrice) + ' جنيه';
      oldPriceEl.style.display = '';
    } else {
      oldPriceEl.style.display = 'none';
    }
  }
  
  // المخزون
  const stockInfo = document.getElementById('modalStockInfo');
  if (stockInfo) {
    if (stock.hasUnlimited) {
      stockInfo.className = 'stock-info in-stock';
      stockInfo.innerHTML = '<i class="fas fa-infinity"></i> متوفر دائماً (غير محدود)';
    } else if (stock.total > 0) {
      stockInfo.className = 'stock-info in-stock';
      stockInfo.innerHTML = `<i class="fas fa-check-circle"></i> متوفر: ${stock.total} قطعة`;
    } else {
      stockInfo.className = 'stock-info out-of-stock';
      stockInfo.innerHTML = '<i class="fas fa-times-circle"></i> 🚫 نفذت الكمية';
    }
  }
  
  // المقاسات
  const sizeSelect = document.getElementById('modalSize');
  if (sizeSelect) {
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ["7", "8", "9"];
    const availableSizes = sizes.filter(s => {
      const qty = stock.bySize[s];
      return qty === null || qty === undefined || qty > 0;
    });
    
    sizeSelect.innerHTML = '';
    
    if (availableSizes.length === 0) {
      sizeSelect.innerHTML = `<option value="" disabled selected>🚫 نفذت الكمية</option>`;
    } else if (availableSizes.length === 1) {
      const size = availableSizes[0];
      const qty = stock.bySize[size];
      const label = (qty !== null && qty !== undefined && qty > 0) 
        ? `مقاس: ${size} (باقى ${qty} قطعه)` 
        : `مقاس: ${size}`;
      sizeSelect.innerHTML = `<option value="${size}" selected>${label}</option>`;
    } else {
      sizeSelect.innerHTML = `<option value="" disabled selected>اختر المقاس</option>`;
      sizes.forEach(s => {
        const qty = stock.bySize[s] !== undefined ? stock.bySize[s] : null;
        let label = `مقاس: ${s}`;
        let isDisabled = false;
        if (qty !== null) {
          if (qty > 0) {
            label += ` (باقى ${qty} قطعه)`;
          } else {
            label += ` (نفذ)`;
            isDisabled = true;
          }
        }
        sizeSelect.innerHTML += `<option value="${s}" ${isDisabled ? 'disabled' : ''}>${label}</option>`;
      });
    }
  }
  
  // إعادة ضبط التقييمات
  document.querySelectorAll('.rating-stars span').forEach(s => s.classList.remove('active'));
  document.getElementById('reviewText').style.display = 'none';
  document.getElementById('reviewText').value = '';
  window.selectedRating = 0;
}

// ============================================================
// 6. إضافة المنتج للسلة من البطاقة
// ============================================================

window.addToCartFromCard = function(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) {
    window.customAlert('⚠️ المنتج غير موجود', 'error');
    return;
  }
  
  const select = document.querySelector(`.size-select[data-product-id="${productId}"]`);
  if (!select || !select.value) {
    window.customAlert('⚠️ الرجاء اختيار المقاس أولاً', 'warning');
    return;
  }
  
  const size = select.value;
  const stock = getProductStock(product);
  
  // التحقق من توفر المقاس
  const qtyForSize = stock.bySize[size];
  if (qtyForSize === 0) {
    window.customAlert(`❌ عذراً، مقاس ${size} غير متوفر حالياً.`, 'error');
    return;
  }
  
  // التحقق من الكمية المطلوبة
  const existing = cart.find(item => item.name === product.name && item.size === size);
  const currentQty = existing ? existing.qty : 0;
  
  if (qtyForSize !== null && qtyForSize !== undefined && qtyForSize > 0) {
    if (currentQty + 1 > qtyForSize) {
      window.customAlert(`❌ الكمية المتاحة لمقاس ${size} هي ${qtyForSize} قطعة فقط.`, 'error');
      return;
    }
  }
  
  // إضافة للسلة
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      size: size,
      image: product.image,
      comparePrice: product.comparePrice || null,
      qty: 1,
      sku: product.sku || null
    });
  }
  
  saveCart();
  updateCartDisplay();
  
  window.customAlert(`✅ تم إضافة ${product.name} - مقاس ${size} إلى السلة`, 'success');
  
  // فتح السلة تلقائياً
  setTimeout(() => {
    if (typeof window.openCart === 'function') window.openCart();
  }, 300);
};

// ============================================================
// 7. إضافة المنتج للسلة من المودال
// ============================================================

window.addCurrentProductToCart = function() {
  if (!window.currentProduct) {
    window.customAlert('❌ خطأ في تحميل المنتج', 'error');
    return;
  }
  
  const product = window.currentProduct;
  const sizeSelect = document.getElementById('modalSize');
  const size = sizeSelect ? sizeSelect.value : '';
  
  if (!size) {
    window.customAlert('⚠️ اختر المقاس أولاً', 'warning');
    return;
  }
  
  const stock = getProductStock(product);
  const qtyForSize = stock.bySize[size];
  
  // التحقق من التوفر
  if (qtyForSize === 0) {
    window.customAlert(`❌ عذراً، مقاس ${size} غير متوفر حالياً.`, 'error');
    return;
  }
  
  // التحقق من الكمية
  const existing = cart.find(item => item.name === product.name && item.size === size);
  const currentQty = existing ? existing.qty : 0;
  
  if (qtyForSize !== null && qtyForSize !== undefined && qtyForSize > 0) {
    if (currentQty + 1 > qtyForSize) {
      window.customAlert(`❌ الكمية المتاحة لمقاس ${size} هي ${qtyForSize} قطعة فقط.`, 'error');
      return;
    }
  }
  
  // إضافة للسلة
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      size: size,
      image: product.image,
      comparePrice: product.comparePrice || null,
      qty: 1,
      sku: product.sku || null
    });
  }
  
  saveCart();
  updateCartDisplay();
  
  window.customAlert(`✅ تم إضافة ${product.name} - مقاس ${size} إلى السلة`, 'success');
  
  // إغلاق المودال وفتح السلة
  window.closeProduct();
  setTimeout(() => {
    if (typeof window.openCart === 'function') window.openCart();
  }, 300);
};

// ============================================================
// 8. تحميل المزيد من المنتجات
// ============================================================

window.loadMoreProducts = function() {
  displayedProductsCount += 8;
  renderProducts();
};

// ============================================================
// 9. تغيير الفئة (القسم)
// ============================================================

window.setCategory = function(category) {
  currentCategory = category;
  displayedProductsCount = 8;
  
  // تحديث روابط القائمة
  document.querySelectorAll('[data-category]').forEach(el => {
    el.classList.toggle('active', el.dataset.category === category);
  });
  
  // تحديث عنوان الصفحة
  const categoryNames = {
    all: 'كل الأقسام',
    necklaces: 'سلاسل & كوليهات',
    bracelets: 'أساور & غوايش',
    rings: 'خواتم & دبل',
    earrings: 'حلقان',
    sets: 'أطقم',
    anklets: 'خلخال'
  };
  const title = categoryNames[category] || category;
  document.querySelector('.filter-btn')?.querySelector('span')?.textContent = title;
  
  // تحديث URL
  const url = new URL(window.location);
  url.searchParams.set('category', category);
  window.history.replaceState({}, '', url);
  
  // إعادة عرض المنتجات
  renderProducts();
};

// ============================================================
// 10. تحديث الترتيب
// ============================================================

window.setSort = function(sortType) {
  currentSort = sortType;
  displayedProductsCount = 8;
  
  // تحديث روابط القائمة
  document.querySelectorAll('[data-sort]').forEach(el => {
    el.classList.toggle('active', el.dataset.sort === sortType);
  });
  
  // تحديث النص المعروض
  const sortLabels = {
    random: '🎲 عشوائي',
    latest: '✨ الأحدث',
    price_asc: '💰 الأقل سعراً',
    price_desc: '💰 الأعلى سعراً',
    best_selling: '🔥 الأكثر مبيعاً',
    top_rated: '⭐ الأعلى تقييماً'
  };
  const label = document.getElementById('sortLabel');
  if (label) label.textContent = sortLabels[sortType] || 'ترتيب حسب';
  
  renderProducts();
};

// ============================================================
// 11. مشاركة المنتج
// ============================================================

window.shareProduct = function() {
  if (!window.currentProduct) {
    window.customAlert('⚠️ لا يوجد منتج للمشاركة', 'warning');
    return;
  }
  
  const product = window.currentProduct;
  const shareUrl = window.location.origin + window.location.pathname + '?id=' + encodeURIComponent(product.id);
  const shareText = `🛍️ ${product.name} من VANTÉ\n${shareUrl}`;
  
  if (navigator.share) {
    navigator.share({
      title: product.name,
      text: `🛍️ ${product.name} من VANTÉ`,
      url: shareUrl
    }).catch(() => {});
    return;
  }
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      window.customAlert('✅ تم نسخ الرابط، شاركه مع أصدقائك!', 'success');
    }).catch(() => {
      fallbackShare(shareText);
    });
  } else {
    fallbackShare(shareText);
  }
};

function fallbackShare(text) {
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(whatsappUrl, '_blank');
}

// ============================================================
// 12. تهيئة الأحداث
// ============================================================

export function initProductEvents() {
  // أحداث الفلتر
  const filterBtn = document.getElementById('filterBtn');
  const filterMenu = document.getElementById('filterMenu');
  
  if (filterBtn && filterMenu) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterMenu.classList.toggle('open');
    });
    
    filterMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        if (category) window.setCategory(category);
        filterMenu.classList.remove('open');
      });
    });
    
    document.addEventListener('click', () => {
      filterMenu.classList.remove('open');
    });
  }
  
  // أحداث الترتيب
  const sortBtn = document.getElementById('sortBtn');
  const sortMenu = document.getElementById('sortMenu');
  
  if (sortBtn && sortMenu) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortMenu.classList.toggle('open');
    });
    
    sortMenu.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const sortType = btn.dataset.sort;
        if (sortType) window.setSort(sortType);
        sortMenu.classList.remove('open');
      });
    });
    
    document.addEventListener('click', () => {
      sortMenu.classList.remove('open');
    });
  }
  
  // أحداث المودال
  const modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', window.closeProduct);
  }
}

// ============================================================
// 13. تصدير الدوال العامة
// ============================================================

window.renderProducts = renderProducts;
window.renderBestSellers = renderBestSellers;
window.updateReviewBadges = updateReviewBadges;
window.displayedProductsCount = displayedProductsCount;
window.currentCategory = currentCategory;
window.currentSort = currentSort;
window._searchTerm = '';

console.log('✅ products.js تم تحميله');