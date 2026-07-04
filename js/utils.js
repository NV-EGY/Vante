import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./sync-orders.js";

// ========== تسجيل أحداث التدقيق ==========
export async function logAuditEvent(action, orderId, orderNumber, details = {}) {
    try {
        await addDoc(collection(db, "auditLog"), {
            action,
            orderId,
            orderNumber,
            timestamp: serverTimestamp(),
            performedBy: 'system', // يمكن استبداله بـ user.email لاحقاً
            ...details
        });
    } catch (e) {
        console.warn('فشل تسجيل التدقيق:', e);
    }
}

// ========== نظام التنبيهات ==========
export function showToast(message, type = 'success') {
    const existingToast = document.querySelector('.vante-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `vante-toast ${type}`;
    const icon = type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; direction: rtl;">
            <i class="fas ${icon}"></i>
            <span style="flex: 1;">${message}</span>
            <button class="toast-close-btn" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 18px; margin-right: 8px;">&times;</button>
        </div>
    `;
    document.body.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close-btn');
    closeBtn.addEventListener('click', () => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

export function customAlert(message, type = 'success', title = '') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-alert-overlay';
        overlay.innerHTML = `
            <div class="custom-alert-box">
                <div class="alert-header ${type}">
                    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle'}"></i>
                    <div class="alert-title">${title || (type === 'success' ? '✅ نجاح' : type === 'error' ? '❌ خطأ' : '⚠️ تنبيه')}</div>
                </div>
                <div class="alert-message">${message}</div>
                <div class="alert-buttons">
                    <button id="alertConfirmBtn">موافق</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.textContent = `
            .custom-alert-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                opacity: 0; transition: opacity 0.3s ease;
            }
            .custom-alert-overlay.active { opacity: 1; }
            .custom-alert-box {
                background: #fff; border-radius: 32px; width: 90%; max-width: 380px;
                overflow: hidden; box-shadow: 0 30px 50px rgba(0,0,0,0.3);
                transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
                direction: rtl;
            }
            .custom-alert-overlay.active .custom-alert-box { transform: scale(1); }
            .alert-header { padding: 20px 20px 10px; text-align: center; }
            .alert-header i { font-size: 48px; margin-bottom: 10px; }
            .alert-header.success i { color: #2ecc71; }
            .alert-header.error i { color: #e74c3c; }
            .alert-header.warning i { color: #f39c12; }
            .alert-header.info i { color: #3498db; }
            .alert-title { font-size: 22px; font-weight: 800; color: #111; }
            .alert-message { padding: 0 20px 20px; font-size: 15px; color: #555; text-align: center; line-height: 1.6; }
            .alert-buttons { display: flex; border-top: 1px solid #eee; }
            .alert-buttons button { flex: 1; padding: 14px; border: none; background: #fff; font-weight: 700; font-size: 16px; cursor: pointer; transition: 0.2s; }
            .alert-buttons button:first-child { border-left: 1px solid #eee; color: #0F7B65; }
            .alert-buttons button:last-child { color: #888; }
            .alert-buttons button:hover { background: #f9f9f9; }
        `;
        document.head.appendChild(style);

        setTimeout(() => overlay.classList.add('active'), 10);

        const confirmBtn = overlay.querySelector('#alertConfirmBtn');
        const onConfirm = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            confirmBtn.removeEventListener('click', onConfirm);
            resolve();
        };
        confirmBtn.addEventListener('click', onConfirm);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
                confirmBtn.removeEventListener('click', onConfirm);
                resolve();
            }
        });
    });
}

export function customConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-confirm-overlay';
        overlay.innerHTML = `
            <div class="custom-confirm-box">
                <div class="confirm-header">
                    <i class="fas fa-question-circle"></i>
                    <h3>تأكيد العملية</h3>
                </div>
                <div class="confirm-message">${message}</div>
                <div class="confirm-buttons">
                    <button id="confirmNoBtn">إلغاء</button>
                    <button id="confirmYesBtn">تأكيد</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const style = document.createElement('style');
        style.textContent = `
            .custom-confirm-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
                z-index: 999999; display: flex; align-items: center; justify-content: center;
                opacity: 0; visibility: hidden; transition: all 0.3s ease;
            }
            .custom-confirm-overlay.active { opacity: 1; visibility: visible; }
            .custom-confirm-box {
                background: #fff; border-radius: 28px; width: 90%; max-width: 360px;
                overflow: hidden; box-shadow: 0 30px 50px rgba(0,0,0,0.3);
                transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.34, 1.2, 0.64, 1);
                direction: rtl;
            }
            .custom-confirm-overlay.active .custom-confirm-box { transform: scale(1); }
            .confirm-header { background: #111; padding: 20px; text-align: center; }
            .confirm-header i { font-size: 50px; color: #f39c12; margin-bottom: 10px; }
            .confirm-header h3 { color: #fff; font-size: 20px; font-weight: 800; margin: 0; }
            .confirm-message { padding: 25px 20px; font-size: 16px; color: #333; text-align: center; line-height: 1.6; }
            .confirm-buttons { display: flex; border-top: 1px solid #eee; }
            .confirm-buttons button { flex: 1; padding: 15px; border: none; background: #fff; font-weight: 700; font-size: 16px; cursor: pointer; transition: 0.2s; }
            .confirm-buttons button:first-child { border-left: 1px solid #eee; color: #e74c3c; }
            .confirm-buttons button:last-child { color: #0F7B65; }
            .confirm-buttons button:hover { background: #f9f9f9; }
        `;
        document.head.appendChild(style);

        setTimeout(() => overlay.classList.add('active'), 10);

        const yesBtn = overlay.querySelector('#confirmYesBtn');
        const noBtn = overlay.querySelector('#confirmNoBtn');

        const onYes = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
            cleanup();
            resolve(true);
        };

        const onNo = () => {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
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
                setTimeout(() => overlay.remove(), 300);
                cleanup();
                resolve(false);
            }
        });
    });
}