// ============================================================
// search.js - إدارة البحث والاقتراحات الذكية
// ============================================================

import { 
  allProducts, 
  renderProducts,
  escapeHtml,
  displayedProductsCount
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
      // تحديد النص بالكامل لسهولة التعديل
      input.select();
    }
  }
  if (overlay) overlay.classList.add('active');
  
  // عرض الاقتراحات إذا كان هناك كلمة بحث
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
  
  // إلغاء البحث إذا كان فارغاً
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
  
  // إعادة تعيين عدد المنتجات المعروضة
  displayedProductsCount = 8;
  
  // إعادة عرض المنتجات مع التصفية
  renderProducts();
  
  // إغلاق شريط البحث
  closeSearch();
  
  // عرض رسالة إذا تم العثور على نتائج
  if (term.length > 0) {
    const filteredCount = allProducts.filter(p => {
      return p.name?.toLowerCase().includes(term.toLowerCase()) ||
             (p.sku && p.sku.toLowerCase().includes(term.toLowerCase())) ||
             (p.description && p.description.toLowerCase().includes(term.toLowerCase()));
    }).length;
    
    if (filteredCount === 0) {
      window.customAlert(`🔍 لم يتم العثور على نتائج لـ "${term}"`, 'info');
    } else {
      window.customAlert(`🔍 تم العثور على ${filteredCount} منتج لـ "${term}"`, 'success');
    }
  }
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
  
  // البحث عن المنتجات المتطابقة
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
  
  // بناء HTML للاقتراحات
  suggestionsDiv.innerHTML = matches.map(product => `
    <div class="search-suggestion" data-product-id="${product.id}">
      <img src="${product.image}" alt="${escapeHtml(product.name)}" 
           onerror="this.src='images/placeholder.jpg'">
      <div class="search-suggestion-info">
        <div class="search-suggestion-name">${escapeHtml(product.name)}</div>
        <div class="search-suggestion-price">${Number(product.price).toFixed(0)} جنيه</div>
        ${product.sku ? `<div class="search-suggestion-sku">🔖 ${product.sku}</div>` : ''}
      </div>
    </div>
  `).join('');
  
  suggestionsDiv.style.display = 'block';
  
  // إضافة حدث النقر على كل اقتراح
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
  
  // تعيين كلمة البحث
  currentSearchTerm = product.name;
  window._searchTerm = product.name;
  
  // تحديث حقل الإدخال
  const input = document.getElementById('searchInput');
  if (input) input.value = product.name;
  
  // إعادة تعيين عدد المنتجات
  displayedProductsCount = 8;
  
  // إعادة عرض المنتجات
  renderProducts();
  
  // إخفاء الاقتراحات وإغلاق شريط البحث
  hideSuggestions();
  closeSearch();
  
  // التمرير إلى المنتجات
  const productsSection = document.querySelector('.products-section');
  if (productsSection) {
    productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  
  window.customAlert(`✅ تم البحث عن: ${product.name}`, 'success');
}

// ============================================================
// 5. تهيئة أحداث البحث
// ============================================================

export function initSearchEvents() {
  const searchInput = document.getElementById('searchInput');
  const searchBar = document.getElementById('searchBar');
  
  if (!searchInput) return;
  
  // حدث الكتابة مع تأخير (Debounce)
  searchInput.addEventListener('input', function(e) {
    const term = this.value.trim();
    currentSearchTerm = term;
    window._searchTerm = term;
    
    // إلغاء التأخير السابق
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // عرض الاقتراحات فوراً
    showSuggestions(term);
    
    // تأخير البحث الكامل لتجنب التحميل الزائد
    searchTimeout = setTimeout(() => {
      if (term.length === 0) {
        // إلغاء البحث إذا كان فارغاً
        displayedProductsCount = 8;
        renderProducts();
        hideSuggestions();
      }
    }, 400);
  });
  
  // حدث الضغط على Enter
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
  
  // إغلاق الاقتراحات عند النقر خارج شريط البحث
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#searchBar') && !e.target.closest('#searchSuggestions')) {
      hideSuggestions();
    }
  });
  
  // عند فقدان التركيز، إخفاء الاقتراحات
  searchInput.addEventListener('blur', function() {
    setTimeout(hideSuggestions, 200);
  });
}

// ============================================================
// 6. البحث عن طريق كلمات مفتاحية للأقسام
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
// 7. إعادة تعيين البحث
// ============================================================

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
// 8. تصدير الدوال العامة
// ============================================================

window.showSuggestions = showSuggestions;
window.hideSuggestions = hideSuggestions;
window.selectSuggestion = selectSuggestion;
window.currentSearchTerm = currentSearchTerm;

console.log('✅ search.js تم تحميله');
