// js/utils.js
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./sync-orders.js";

/**
 * تسجيل حدث في سجل التدقيق
 */
export async function logAuditEvent(action, orderId, orderNumber, details = {}) {
    try {
        await addDoc(collection(db, "auditLog"), {
            action,
            orderId,
            orderNumber,
            timestamp: serverTimestamp(),
            performedBy: 'system',
            ...details
        });
    } catch (e) {
        console.warn('فشل تسجيل التدقيق:', e);
    }
}

/**
 * عرض رسالة تنبيه (Fallback - سيتم استبدالها بالمودال في الصفحات)
 */
export function customAlert(message, type = 'success', title = '') {
    console.log(`[${type}] ${message}`);
    alert(message);
}

/**
 * عرض رسالة تأكيد (Fallback)
 */
export function customConfirm(message) {
    return new Promise((resolve) => {
        resolve(confirm(message));
    });
}

/**
 * عرض رسالة سريعة (toast)
 */
export function showToast(message, type = 'success', duration = 3000) {
    const existing = document.querySelector('.vante-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `vante-toast ${type}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: #111;
        color: #fff;
        padding: 14px 28px;
        border-radius: 30px;
        font-weight: 700;
        font-size: 14px;
        z-index: 999999;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        border: 1px solid #D4AF37;
        display: flex;
        align-items: center;
        gap: 10px;
        direction: rtl;
    `;
    toast.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}" style="color: #D4AF37;"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}