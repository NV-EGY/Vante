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
    db,
    escapeHtml,
    getAverageRating,
    getReviewCount,
    showToast
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
// 1. دوال مساعدة
// ============================================================

function normalize(str) {
    return (str || "").toString().trim().toLowerCase();
}

function filterByCategory(products, category) {
    if (category === 'all') return products;
    return products.filter(p => normalize(p.category) === category);
}

function filterBySearch(products, searchTerm) {
    if (!searchTerm || searchTerm.trim() === '') return products;
    const term = searchTerm.trim().toLowerCase();
    return products.filter(p => 
        p.name?.toLowerCase().includes(term) || 
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.description && p.description.toLowerCase().includes(term))
    );
}

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
            const intervalMs = 60 * 60 * 1000;
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

function isOutOfStock(product) {
    const stock = getProductStock(product);
    if (stock.hasUnlimited) return false;
    if (Object.keys(stock.bySize).length === 0) return false;
    return stock.total <= 0;
}

// ============================================================
// 2. عرض المنتجات
// ============================================================

export function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const counter = document.getElementById('productsCounter');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (!grid) return;
    
    let filtered = filterByCategory(allProducts, currentCategory);
    filtered = filterBySearch(filtered, window._searchTerm || '');
    filtered = sortProducts(filtered, currentSort);
    
    const inStock = filtered.filter(p => !isOutOfStock(p));
    const outOfStock = filtered.filter(p => isOutOfStock(p));
    filtered = [...inStock, ...outOfStock];
    
    const totalProducts = filtered.length;
    const limited = filtered.slice(0, displayedProductsCount);
    
    if (counter) {
        counter.innerHTML = `🛍️ عرض ${limited.length} من ${totalProducts} منتج`;
    }
    
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
    
    if (limited.length === 0) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px 20px; color:#888; font-size:18px;">
                <i class="fas fa-search" style="font-size:48px; color:#ddd; margin-bottom:16px;"></i>
                <p>لا توجد منتجات في هذا القسم</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = limited.map(product => {
        const stock = getProductStock(product);
        const outOfStock = isOutOfStock(product);
        const hasDiscount = product.comparePrice && product.comparePrice > product.price;
        const discountPercent = hasDiscount ? Math.round((1 - product.price / product.comparePrice) * 100) : 0;
        const reviewCount = getReviewCount(product.id);
        
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
                
                <div onclick="event.stopPropagation();">
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
    
    updateReviewBadges();
    setupSizeSelectListeners();
}

// ============================================================
// 3. تحديث شارات التقييمات
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
// 4. مستمعات اختيار المقاس
// ============================================================

function setupSizeSelectListeners() {
    document.querySelectorAll('.size-select').forEach(select => {
        select.removeEventListener('change', handleSizeChange);
        select.addEventListener('change', handleSizeChange);
    });
}

function handleSizeChange(e) {
    const select = e.target;
    const productId = select.dataset.productId;
    const selectedSize = select.value;
    const product = allProducts.find(p => p.id === productId);
    
    if (product && product.stockBySize) {
        const stock = product.stockBySize[selectedSize];
        const stockEl = select.closest('.product-card').querySelector('.stock-info');
        if (stockEl) {
            if (stock === null || stock === undefined) {
                stockEl.className = 'stock-info';
                stockEl.style.cssText = 'background:rgba(212,175,55,0.1);color:#B8860B;';
                stockEl.innerHTML = '<i class="fas fa-boxes"></i> كمية غير محددة';
            } else if (stock > 0) {
                stockEl.className = 'stock-info in-stock';
                stockEl.style.cssText = '';
                stockEl.innerHTML = `<i class="fas fa-check-circle"></i> متوفر: ${stock} قطعة`;
            } else {
                stockEl.className = 'stock-info out-of-stock';
                stockEl.style.cssText = '';
                stockEl.innerHTML = '<i class="fas fa-times-circle"></i> 🚫 نفذت الكمية';
            }
        }
    }
}

// ============================================================
// 5. عرض الأكثر مبيعاً
// ============================================================

let bestSellersConfig = { mode: 'sales', limit: 8 };

export function renderBestSellers() {
    const grid = document.getElementById('bestSellersGrid');
    if (!grid || !allProducts.length) return;
    
    const config = bestSellersConfig;
    let selected = [];
    const limit = Math.min(config.limit || 8, 20);
    
    if (config.mode === 'random') {
        const shuffled = [...allProducts];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        selected = shuffled.slice(0, limit);
    } else {
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
            <div class="best-card" onclick="window.openProduct('${product.id}')">
                ${hasDiscount ? `<span class="best-badge">%${discountPercent} خصم</span>` : ''}
                <img src="${product.image}" alt="${escapeHtml(product.name)}">
                <div class="name">${escapeHtml(product.name)}</div>
                <div>
                    ${hasDiscount ? `<span class="old-price">${Number(product.comparePrice)} EGP</span>` : ''}
                    <span class="price">${Number(product.price)} EGP</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// 6. وظائف التفاعل
// ============================================================

window.openProduct = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        showToast('⚠️ المنتج غير موجود', 'error');
        return;
    }
    
    window.currentProduct = product;
    
    const modal = document.getElementById('productModal');
    const overlay = document.getElementById('modalOverlay');
    
    if (!modal) return;
    
    fillProductModal(product);
    
    modal.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    if (typeof displayReviewsInModal === 'function') {
        displayReviewsInModal(productId);
    }
};

window.closeProduct = function() {
    const modal = document.getElementById('productModal');
    const overlay = document.getElementById('modalOverlay');
    
    modal.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    window.currentProduct = null;
};

function fillProductModal(product) {
    const stock = getProductStock(product);
    const hasDiscount = product.comparePrice && product.comparePrice > product.price;
    
    const allImages = [product.image, ...(product.additionalImages || [])].filter(Boolean);
    window._modalImages = allImages;
    window._modalIndex = 0;
    
    const mainImg = document.getElementById('modalImg');
    if (mainImg && allImages.length) mainImg.src = allImages[0];
    
    document.getElementById('modalTitle').textContent = product.name;
    document.getElementById('modalDesc').innerHTML = product.description || 'منتج فاخر من VANTÉ';
    
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
    
    // المصغرات
    const thumbsContainer = document.getElementById('modalThumbs');
    if (thumbsContainer && allImages.length > 1) {
        thumbsContainer.innerHTML = allImages.map((img, idx) => `
            <img src="${img}" class="${idx === 0 ? 'active' : ''}" 
                 onclick="window.changeModalImage(${idx})" 
                 alt="صورة المنتج">
        `).join('');
        thumbsContainer.style.display = 'flex';
    } else if (thumbsContainer) {
        thumbsContainer.style.display = 'none';
    }
    
    document.querySelectorAll('.rating-stars span').forEach(s => s.classList.remove('active'));
    document.getElementById('reviewText').style.display = 'none';
    document.getElementById('reviewText').value = '';
    window.selectedRating = 0;
}

window.changeModalImage = function(index) {
    const images = window._modalImages || [];
    if (!images.length) return;
    window._modalIndex = index;
    document.getElementById('modalImg').src = images[index];
    document.querySelectorAll('#modalThumbs img').forEach((img, i) => {
        img.classList.toggle('active', i === index);
    });
};

window.addToCartFromCard = function(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        showToast('⚠️ المنتج غير موجود', 'error');
        return;
    }
    
    const select = document.querySelector(`.size-select[data-product-id="${productId}"]`);
    if (!select || !select.value) {
        showToast('⚠️ الرجاء اختيار المقاس أولاً', 'warning');
        return;
    }
    
    const size = select.value;
    const stock = getProductStock(product);
    const qtyForSize = stock.bySize[size];
    
    if (qtyForSize === 0) {
        showToast(`❌ عذراً، مقاس ${size} غير متوفر حالياً.`, 'error');
        return;
    }
    
    const existing = cart.find(item => item.name === product.name && item.size === size);
    const currentQty = existing ? existing.qty : 0;
    
    if (qtyForSize !== null && qtyForSize !== undefined && qtyForSize > 0) {
        if (currentQty + 1 > qtyForSize) {
            showToast(`❌ الكمية المتاحة لمقاس ${size} هي ${qtyForSize} قطعة فقط.`, 'error');
            return;
        }
    }
    
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
    
    localStorage.setItem('vante_cart', JSON.stringify(cart));
    if (typeof updateCartDisplay === 'function') updateCartDisplay();
    
    showToast(`✅ تم إضافة ${product.name} - مقاس ${size} إلى السلة`, 'success');
};

window.addCurrentToCart = function() {
    if (!window.currentProduct) {
        showToast('❌ خطأ في تحميل المنتج', 'error');
        return;
    }
    
    const product = window.currentProduct;
    const sizeSelect = document.getElementById('modalSize');
    const size = sizeSelect ? sizeSelect.value : '';
    
    if (!size) {
        showToast('⚠️ اختر المقاس أولاً', 'warning');
        return;
    }
    
    const stock = getProductStock(product);
    const qtyForSize = stock.bySize[size];
    
    if (qtyForSize === 0) {
        showToast(`❌ عذراً، مقاس ${size} غير متوفر حالياً.`, 'error');
        return;
    }
    
    const existing = cart.find(item => item.name === product.name && item.size === size);
    const currentQty = existing ? existing.qty : 0;
    
    if (qtyForSize !== null && qtyForSize !== undefined && qtyForSize > 0) {
        if (currentQty + 1 > qtyForSize) {
            showToast(`❌ الكمية المتاحة لمقاس ${size} هي ${qtyForSize} قطعة فقط.`, 'error');
            return;
        }
    }
    
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
    
    localStorage.setItem('vante_cart', JSON.stringify(cart));
    if (typeof updateCartDisplay === 'function') updateCartDisplay();
    
    showToast(`✅ تم إضافة ${product.name} - مقاس ${size} إلى السلة`, 'success');
    window.closeProduct();
};

window.shareProduct = function() {
    if (!window.currentProduct) {
        showToast('⚠️ لا يوجد منتج للمشاركة', 'warning');
        return;
    }
    
    const product = window.currentProduct;
    const shareUrl = window.location.origin + window.location.pathname + '?id=' + encodeURIComponent(product.id);
    const shareText = `🛍️ ${product.name} من VANTÉ\n${shareUrl}`;
    
    if (navigator.share) {
        navigator.share({ title: product.name, text: `🛍️ ${product.name} من VANTÉ`, url: shareUrl })
            .catch(() => {});
        return;
    }
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            showToast('✅ تم نسخ الرابط، شاركه مع أصدقائك!', 'success');
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

window.loadMoreProducts = function() {
    displayedProductsCount += 8;
    renderProducts();
};

window.setCategory = function(category) {
    currentCategory = category;
    displayedProductsCount = 8;
    
    document.querySelectorAll('[data-category]').forEach(el => {
        el.classList.toggle('active', el.dataset.category === category);
    });
    
    const categoryNames = {
        all: 'الأقسام',
        necklaces: 'سلاسل & كوليهات',
        bracelets: 'أساور & غوايش',
        rings: 'خواتم & دبل',
        earrings: 'حلقان',
        sets: 'أطقم',
        anklets: 'خلخال'
    };
    const filterLabel = document.getElementById('filterLabel');
    if (filterLabel) filterLabel.textContent = categoryNames[category] || category;
    
    const url = new URL(window.location);
    url.searchParams.set('category', category);
    window.history.replaceState({}, '', url);
    
    renderProducts();
};

window.setSort = function(sortType) {
    currentSort = sortType;
    displayedProductsCount = 8;
    
    document.querySelectorAll('[data-sort]').forEach(el => {
        el.classList.toggle('active', el.dataset.sort === sortType);
    });
    
    const sortLabels = {
        random: '📊 ترتيب حسب',
        latest: '✨ الأحدث',
        price_asc: '💰 الأقل سعراً',
        price_desc: '💰 الأعلى سعراً',
        best_selling: '🔥 الأكثر مبيعاً',
        top_rated: '⭐ الأعلى تقييماً'
    };
    const sortLabel = document.getElementById('sortLabel');
    if (sortLabel) sortLabel.textContent = sortLabels[sortType] || '📊 ترتيب حسب';
    
    renderProducts();
};

// ============================================================
// 7. تهيئة الأحداث
// ============================================================

export function initProductEvents() {
    const filterBtn = document.getElementById('filterBtn');
    const filterMenu = document.getElementById('filterMenu');
    
    if (filterBtn && filterMenu) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('filterDropdown').classList.toggle('open');
        });
        
        filterMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                if (category) window.setCategory(category);
                document.getElementById('filterDropdown').classList.remove('open');
            });
        });
        
        document.addEventListener('click', () => {
            document.getElementById('filterDropdown').classList.remove('open');
        });
    }
    
    const sortBtn = document.getElementById('sortBtn');
    const sortMenu = document.getElementById('sortMenu');
    
    if (sortBtn && sortMenu) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('sortWrapper').classList.toggle('open');
        });
        
        sortMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const sortType = btn.dataset.sort;
                if (sortType) window.setSort(sortType);
                document.getElementById('sortWrapper').classList.remove('open');
            });
        });
        
        document.addEventListener('click', () => {
            document.getElementById('sortWrapper').classList.remove('open');
        });
    }
    
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', window.loadMoreProducts);
    }
}

// ============================================================
// 8. دوال عامة
// ============================================================

window.renderProducts = renderProducts;
window.renderBestSellers = renderBestSellers;
window.updateReviewBadges = updateReviewBadges;
window.displayedProductsCount = displayedProductsCount;
window.currentCategory = currentCategory;
window.currentSort = currentSort;
window._searchTerm = '';

console.log('✅ products.js تم تحميله');