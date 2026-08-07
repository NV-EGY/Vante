// ============================================================
// search.js - إدارة البحث والاقتراحات الذكية
// ============================================================

import { 
    allProducts, 
    renderProducts,
    escapeHtml,
    displayedProductsCount,
    showToast
} from './app.js';

// ============================================================
// 1. المتغيرات
// ============================================================

let searchTimeout = null;
let currentSearchTerm = '';

// ============================================================
// 2. فتح وإغلاق البحث
// ============================================================

window.openSearch = function() {
    const searchBar = document.getElementById('searchBar');
    const overlay = document.getElementById('modalOverlay');
    const input = document.getElementById('searchInput');
    
    if (searchBar) {
        searchBar.classList.add('open');
        if (input) {
            input.value = currentSearchTerm;
            input.focus();
            input.select();
        }
    }
    if (overlay) overlay.classList.add('active');
    
    if (currentSearchTerm && currentSearchTerm.length > 0) {
        showSuggestions(currentSearchTerm);
    }
};

window.closeSearch = function() {
    const searchBar = document.getElementById('searchBar');
    const overlay = document.getElementById('modalOverlay');
    const suggestions = document.getElementById('searchSuggestions');
    
    if (searchBar) searchBar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    if (suggestions) {
        suggestions.style.display = 'none';
        suggestions.innerHTML = '';
    }
    
    if (!currentSearchTerm || currentSearchTerm.trim() === '') {
        window._searchTerm = '';
        renderProducts();
    }
};

// ============================================================
// 3. تطبيق البحث
// ============================================================

window.applySearch = function() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    
    const term = input.value.trim();
    currentSearchTerm = term;
    window._searchTerm = term;
    
    displayedProductsCount = 8;
    renderProducts();
    closeSearch();
    
    if (term.length > 0) {
        const filteredCount = allProducts.filter(p => {
            return p.name?.toLowerCase().includes(term.toLowerCase()) ||
                   (p.sku && p.sku.toLowerCase().includes(term.toLowerCase())) ||
                   (p.description && p.description.toLowerCase().includes(term.toLowerCase()));
        }).length;
        
        if (filteredCount === 0) {
            showToast(`🔍 لم يتم العثور على نتائج لـ "${term}"`, 'info');
        } else {
            showToast(`🔍 تم العثور على ${filteredCount} منتج لـ "${term}"`, 'success');
        }
    }
};

window.clearSearch = function() {
    const input = document.getElementById('searchInput');
    if (input) input.value = '';
    
    currentSearchTerm = '';
    window._searchTerm = '';
    displayedProductsCount = 8;
    
    hideSuggestions();
    renderProducts();
    closeSearch();
};

// ============================================================
// 4. الاقتراحات الذكية
// ============================================================

function showSuggestions(term) {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    if (!suggestionsDiv) return;
    
    const lowerTerm = term.toLowerCase().trim();
    if (lowerTerm.length === 0) {
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
        return;
    }
    
    const matches = allProducts.filter(p => {
        return p.name?.toLowerCase().includes(lowerTerm) ||
               (p.sku && p.sku.toLowerCase().includes(lowerTerm)) ||
               (p.description && p.description.toLowerCase().includes(lowerTerm));
    }).slice(0, 6);
    
    if (matches.length === 0) {
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
        return;
    }
    
    suggestionsDiv.innerHTML = matches.map(product => `
        <div class="search-suggestion" data-product-id="${product.id}">
            <img src="${product.image}" alt="${escapeHtml(product.name)}" 
                 onerror="this.src='images/placeholder.jpg'">
            <div class="info">
                <div class="name">${escapeHtml(product.name)}</div>
                <div class="price">${Number(product.price).toFixed(0)} جنيه</div>
                ${product.sku ? `<div style="font-size:11px;color:#999;">🔖 ${product.sku}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    suggestionsDiv.style.display = 'block';
    
    suggestionsDiv.querySelectorAll('.search-suggestion').forEach(el => {
        el.addEventListener('click', function() {
            const productId = this.dataset.productId;
            if (productId) {
                selectSuggestion(productId);
            }
        });
    });
}

function hideSuggestions() {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    if (suggestionsDiv) {
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
    }
}

function selectSuggestion(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) return;
    
    currentSearchTerm = product.name;
    window._searchTerm = product.name;
    
    const input = document.getElementById('searchInput');
    if (input) input.value = product.name;
    
    displayedProductsCount = 8;
    renderProducts();
    
    hideSuggestions();
    closeSearch();
    
    const productsSection = document.querySelector('.products-section');
    if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    showToast(`✅ تم البحث عن: ${product.name}`, 'success');
}

// ============================================================
// 5. البحث عن الأقسام بالكلمات المفتاحية
// ============================================================

export function getCategoryFromSearch(searchTerm) {
    if (!searchTerm) return null;
    
    const lowerTerm = searchTerm.toLowerCase();
    
    const categoryKeywords = {
        necklaces: ['سلاسل', 'كوليهات', 'كوليه', 'سلسلة', 'قلادة', 'نكلاس', 'نقلة'],
        bracelets: ['أساور', 'اساور', 'غوايش', 'غويشة', 'سوار', 'غويش', 'بريسم'],
        rings: ['خواتم', 'خاتم', 'توينزات', 'توينز', 'دبل', 'دبلة', 'دبل ذهب'],
        earrings: ['حلقان', 'حلق', 'أقراط', 'اقراط', 'حلقين', 'حلق ذهب'],
        sets: ['اطقم', 'أطقم', 'طقم', 'نصف طقم', 'اطقم اطفال'],
        anklets: ['خلخال', 'خلاخيل', 'خلخلة', 'خلاخل']
    };
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        for (const kw of keywords) {
            if (lowerTerm.includes(kw) || kw.includes(lowerTerm)) {
                return category;
            }
        }
    }
    
    return null;
}

// ============================================================
// 6. تهيئة أحداث البحث
// ============================================================

export function initSearchEvents() {
    const searchInput = document.getElementById('searchInput');
    const searchBar = document.getElementById('searchBar');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const term = this.value.trim();
        currentSearchTerm = term;
        window._searchTerm = term;
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        showSuggestions(term);
        
        searchTimeout = setTimeout(() => {
            if (term.length === 0) {
                displayedProductsCount = 8;
                renderProducts();
                hideSuggestions();
            }
        }, 400);
    });
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const term = this.value.trim();
            if (term.length > 0) {
                window.applySearch();
            } else {
                window.closeSearch();
            }
        }
    });
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#searchBar') && !e.target.closest('#searchSuggestions')) {
            hideSuggestions();
        }
    });
    
    searchInput.addEventListener('blur', function() {
        setTimeout(hideSuggestions, 200);
    });
}

// ============================================================
// 7. دوال عامة
// ============================================================

window.showSuggestions = showSuggestions;
window.hideSuggestions = hideSuggestions;
window.selectSuggestion = selectSuggestion;
window.currentSearchTerm = currentSearchTerm;

console.log('✅ search.js تم تحميله');