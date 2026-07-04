// js/utils.js - النسخة النهائية الكاملة
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
 * عرض رسالة تنبيه مخصصة (مودال)
 */
export function customAlert(message, type = 'success', title = '') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customAlertOverlay');
        if (overlay) {
            // استخدام المودال الموجود إذا كان متاحاً
            const headerIcon = document.getElementById('alertHeaderIcon');
            const titleEl = document.getElementById('alertTitle');
            const msgEl = document.getElementById('alertMessage');
            const confirmBtn = document.getElementById('alertConfirmBtn');

            let iconClass = 'fa-check-circle';
            let defaultTitle = '';
            if (type === 'success') { iconClass = 'fa-check-circle'; defaultTitle = '✅ نجاح'; }
            else if (type === 'error') { iconClass = 'fa-exclamation-triangle'; defaultTitle = '❌ خطأ'; }
            else if (type === 'warning') { iconClass = 'fa-exclamation-circle'; defaultTitle = '⚠️ تنبيه'; }
            else { iconClass = 'fa-info-circle'; defaultTitle = 'ℹ️ معلومات'; }

            headerIcon.innerHTML = `<i class="fas ${iconClass}"></i><div class="alert-title">${title || defaultTitle}</div>`;
            msgEl.innerText = message;
            overlay.classList.add('active');

            const onConfirm = () => {
                overlay.classList.remove('active');
                confirmBtn.removeEventListener('click', onConfirm);
                resolve();
            };
            confirmBtn.addEventListener('click', onConfirm);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    confirmBtn.removeEventListener('click', onConfirm);
                    resolve();
                }
            });
        } else {
            // Fallback إذا لم يوجد المودال
            alert(message);
            resolve();
        }
    });
}

/**
 * عرض رسالة تأكيد (مودال)
 */
export function customConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('firmOverlay');
        if (overlay) {
            const msgEl = document.getElementById('confirmMessage');
            const yesBtn = document.getElementById('confirmYesBtn');
            const noBtn = document.getElementById('confirmNoBtn');

            msgEl.innerText = message;
            overlay.classList.add('active');

            const onYes = () => {
                overlay.classList.remove('active');
                cleanup();
                resolve(true);
            };
            const onNo = () => {
                overlay.classList.remove('active');
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
            };

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    cleanup();
                    resolve(false);
                }
            });
        } else {
            // Fallback إذا لم يوجد المودال
            resolve(confirm(message));
        }
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
    const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
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
    toast.innerHTML = `<i class="fas ${icon}" style="color: #D4AF37;"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}