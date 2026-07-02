// js/ui-integration.js
// ============================================================
// 🔌 هذا الملف مسؤول عن تزيين بطاقات الطلبات بمعلومات QP Express
// ============================================================

import { db } from "./sync-orders.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * إضافة معلومات QP Express إلى بطاقة الطلب
 * @param {HTMLElement} orderElement - عنصر الـ div.card الخاص بالطلب
 * @param {Object} orderData - بيانات الطلب الكاملة (يجب أن تحتوي على qpSerial, qpStatus, notes)
 */
export function injectQPInfo(orderElement, orderData) {
    if (!orderElement || !orderData) return;

    let infoDiv = orderElement.querySelector('.qp-info');
    const isNew = !infoDiv;

    if (isNew) {
        infoDiv = document.createElement('div');
        infoDiv.className = 'qp-info';
        infoDiv.style.cssText = 'margin-top: 8px; font-size: 12px; color: #555; background: #f8f9fa; padding: 6px 12px; border-radius: 8px; border-right: 3px solid #D4AF37;';
        
        const orderBody = orderElement.querySelector('.order-body');
        if (orderBody) {
            orderBody.appendChild(infoDiv);
        } else {
            orderElement.appendChild(infoDiv);
        }
    }

    let html = `<span style="font-weight:bold; color: #0F7B65;">🚚 QP Express:</span>`;
    
    if (orderData.qpSerial) {
        html += ` رقم الشحنة: <strong style="direction:ltr; display:inline-block;">${orderData.qpSerial}</strong>`;
        
        // ⚠️ إذا كانت الحالة الحالية ليست "شحن"، نضيف تنبيه "تم الإنشاء سابقاً"
        if (orderData.status !== "shipped") {
            html += ` | ⚠️ <span style="color:#e67e22; font-weight:bold;">تم الإنشاء سابقاً</span>`;
        }
        
        if (orderData.qpStatus) {
            html += ` | حالة QP: ${orderData.qpStatus}`;
        }
    } else {
        html += ` <span style="color:#999;">(لم يتم إنشاء الشحنة بعد)</span>`;
    }

    if (orderData.notes && !orderData.notes.includes('QP')) {
        html += ` | 📝 ${orderData.notes}`;
    }

    infoDiv.innerHTML = html;
    // ❌ تم إزالة استدعاء ensureSyncButton
}

/**
 * الدالة الرئيسية: تزيين جميع بطاقات الطلبات المعروضة حالياً في الصفحة
 * @param {Array} ordersArray - مصفوفة الطلبات الحالية (من Firestore)
 */
export function enhanceAllOrderCards(ordersArray) {
    if (!ordersArray || ordersArray.length === 0) return;

    const cards = document.querySelectorAll('#orders .card');
    
    cards.forEach((card) => {
        const orderIdElement = card.querySelector('.order-id');
        if (!orderIdElement) return;
        
        let orderId = orderIdElement.getAttribute('data-id');
        if (!orderId) {
            const text = orderIdElement.textContent.trim();
            const found = ordersArray.find(o => o.orderID === text);
            if (found) orderId = found.id;
        }

        if (!orderId) return;

        const orderData = ordersArray.find(o => o.id === orderId);
        if (!orderData) return;

        injectQPInfo(card, orderData);
    });
}

// ============================================================
// 🔄 دالة مساعدة لتحديث بطاقة واحدة فقط
// ============================================================
export async function refreshSingleOrderCard(orderId) {
    try {
        const docSnap = await getDoc(doc(db, "orders", orderId));
        if (!docSnap.exists()) return;
        const data = { id: docSnap.id, ...docSnap.data() };
        
        const card = document.querySelector(`.order-id[data-id="${orderId}"]`)?.closest('.card');
        if (card) {
            injectQPInfo(card, data);
        }
    } catch (e) {
        console.warn("فشل تحديث بطاقة فردية:", e);
    }
}