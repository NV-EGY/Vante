// js/ui-integration.js
// ============================================================
// 🔌 هذا الملف مسؤول عن تزيين بطاقات الطلبات بمعلومات QP Express
// وأزرار المزامنة الفردية.
// يعتمد على sync-orders.js للحصول على db ودالة المزامنة.
// ============================================================

import { db } from "./sync-orders.js";        // ✅ استيراد db من ملف المزامنة (موجود فعلاً)
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { manualSyncOrders } from "./sync-orders.js";

/**
 * إضافة معلومات QP Express إلى بطاقة الطلب
 * @param {HTMLElement} orderElement - عنصر الـ div.card الخاص بالطلب
 * @param {Object} orderData - بيانات الطلب الكاملة (يجب أن تحتوي على qpSerial, qpStatus, notes)
 */
export function injectQPInfo(orderElement, orderData) {
    if (!orderElement || !orderData) return;

    // ✅ منع التكرار: إذا كان هناك عنصر .qp-info بالفعل، نعيد تعبئته بدلاً من إضافته جديد
    let infoDiv = orderElement.querySelector('.qp-info');
    const isNew = !infoDiv;

    if (isNew) {
        infoDiv = document.createElement('div');
        infoDiv.className = 'qp-info';
        infoDiv.style.cssText = 'margin-top: 8px; font-size: 12px; color: #555; background: #f8f9fa; padding: 6px 12px; border-radius: 8px; border-right: 3px solid #D4AF37;';
        
        // نضعه قبل الـ actions (أو في نهاية الـ order-body)
        const orderBody = orderElement.querySelector('.order-body');
        if (orderBody) {
            orderBody.appendChild(infoDiv);
        } else {
            // إذا لم يوجد order-body (نادراً)، نضعه في نهاية الكارد
            orderElement.appendChild(infoDiv);
        }
    }

    // بناء المحتوى
    let html = `<span style="font-weight:bold; color: #0F7B65;">🚚 QP Express:</span>`;
    
    if (orderData.qpSerial) {
        html += ` رقم الشحنة: <strong style="direction:ltr; display:inline-block;">${orderData.qpSerial}</strong>`;
    } else {
        html += ` <span style="color:#999;">(لم يتم إنشاء الشحنة بعد)</span>`;
    }

    if (orderData.qpStatus) {
        html += ` | الحالة: ${orderData.qpStatus}`;
    }

    if (orderData.notes && !orderData.notes.includes('QP')) {
        // نعرض الملاحظات العامة إذا لم تكن متعلقة بـ QP
        html += ` | 📝 ${orderData.notes}`;
    }

    // تحديث المحتوى
    infoDiv.innerHTML = html;

    // ✅ إضافة زر المزامنة إذا لم يكن موجوداً
    ensureSyncButton(orderElement, orderData.id);
}

/**
 * إضافة زر "مزامنة" بجانب الطلب لتحديث حالته الفردية
 * @param {HTMLElement} orderElement 
 * @param {string} orderId 
 */
export function ensureSyncButton(orderElement, orderId) {
    if (!orderElement || !orderId) return;

    // منع التكرار
    if (orderElement.querySelector('.sync-btn')) return;

    const actionsDiv = orderElement.querySelector('.actions');
    if (!actionsDiv) return;

    const syncBtn = document.createElement('button');
    syncBtn.className = 'action-btn sync-btn';
    syncBtn.style.cssText = 'background: #3498db; color: #fff; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; transition: 0.2s;';
    syncBtn.innerHTML = '<i class="fas fa-sync"></i> تحديث حالة';
    syncBtn.title = 'مزامنة هذا الطلب مع QP Express';

    syncBtn.onclick = async (e) => {
        e.stopPropagation();
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
        syncBtn.style.opacity = '0.6';

        try {
            // نقوم بمزامنة الكل حالياً (لأن API لا يدعم مزامنة طلب واحد بسهولة بدون معرفته)
            // لكننا نستدعي المزامنة العامة ثم نعيد تحديث الواجهة
            const result = await manualSyncOrders();
            
            if (result && result.error) {
                alert(`❌ فشل المزامنة: ${result.error}`);
            } else {
                // نعرض رسالة نجاح
                const count = result?.syncedCount || 0;
                alert(`✅ تمت المزامنة! تم تحديث ${count} طلب.`);
                // نعيد تحميل البيانات من Firestore (الـ onSnapshot سيفعلها تلقائياً في admin-orders)
                // لكننا نضيف مؤشر بأنه تم التحديث
                syncBtn.innerHTML = '✓ تم';
                syncBtn.style.background = '#2ecc71';
                setTimeout(() => {
                    syncBtn.innerHTML = '<i class="fas fa-sync"></i> تحديث حالة';
                    syncBtn.style.background = '#3498db';
                }, 2000);
            }
        } catch (error) {
            alert(`❌ حدث خطأ: ${error.message}`);
        } finally {
            syncBtn.disabled = false;
            syncBtn.style.opacity = '1';
            if (!syncBtn.innerHTML.includes('✓ تم')) {
                syncBtn.innerHTML = '<i class="fas fa-sync"></i> تحديث حالة';
            }
        }
    };

    // نضعه في بداية الـ actions (قبل أزرار واتساب والنسخ)
    actionsDiv.prepend(syncBtn);
}

/**
 * الدالة الرئيسية: تزيين جميع بطاقات الطلبات المعروضة حالياً في الصفحة
 * يُنصح باستدعاؤها بعد كل عملية `render()` في admin-orders.html
 * @param {Array} ordersArray - مصفوفة الطلبات الحالية (من Firestore)
 */
export function enhanceAllOrderCards(ordersArray) {
    if (!ordersArray || ordersArray.length === 0) return;

    // نبحث عن جميع البطاقات المعروضة حالياً في DOM
    const cards = document.querySelectorAll('#orders .card');
    
    cards.forEach((card) => {
        // نستخرج الـ order-id من العنصر المخفي أو من النص
        const orderIdElement = card.querySelector('.order-id');
        if (!orderIdElement) return;
        
        // نحاول الحصول على id من الـ data-id أو من النص
        let orderId = orderIdElement.getAttribute('data-id');
        if (!orderId) {
            // محاولة استخراج الرقم من النص (مثلاً VNT-001)
            const text = orderIdElement.textContent.trim();
            // نبحث عن الطلب في المصفوفة باستخدام orderID
            const found = ordersArray.find(o => o.orderID === text);
            if (found) orderId = found.id;
        }

        if (!orderId) return;

        // نبحث عن بيانات الطلب الكاملة من المصفوفة
        const orderData = ordersArray.find(o => o.id === orderId);
        if (!orderData) return;

        // ✅ حقن المعلومات (بدون تكرار)
        injectQPInfo(card, orderData);
    });
}

// ============================================================
// 🔄 دالة مساعدة لتحديث بطاقة واحدة فقط (إذا تغيرت لحظياً)
// ============================================================
export async function refreshSingleOrderCard(orderId) {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) return;
        const data = { id: docSnap.id, ...docSnap.data() };
        
        // البحث عن البطاقة في DOM
        const card = document.querySelector(`.order-id[data-id="${orderId}"]`)?.closest('.card');
        if (card) {
            injectQPInfo(card, data);
        }
    } catch (e) {
        console.warn("فشل تحديث بطاقة فردية:", e);
    }
}