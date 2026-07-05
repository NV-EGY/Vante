// js/logger.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, Timestamp, getDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCotT8EP2uy_HsgHknxeGBorKoEUORPtmU",
    authDomain: "vante-orders.firebaseapp.com",
    projectId: "vante-orders",
    storageBucket: "vante-orders.firebasestorage.app",
    messagingSenderId: "842319700646",
    appId: "1:842319700646:web:f6afd78ef7038c3be4ca67"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * تسجيل حدث في سجل التدقيق (مع تعطيل مؤقت في صفحات المتجر)
 */
export async function logAuditEvent(data) {
    // ====== منع التسجيل في الصفحات غير الإدارية ======
    const currentPath = window.location.pathname;
    const allowedPages = ['admin-order', 'admin-product', 'Profits', 'Audit-log'];
    const isAdminPage = allowedPages.some(page => currentPath.includes(page));
    if (!isAdminPage) {
        return; // تجاهل التسجيل في صفحات المتجر وغيرها
    }
    // ==============================================

    try {
        const {
            action,
            orderId = null,
            orderNumber = null,
            details = {},
            performedBy = 'system',
            severity = 'info'
        } = data;

        const metadata = {
            userAgent: navigator ? navigator.userAgent : 'unknown',
            url: window ? window.location.href : 'unknown',
            timestamp: Timestamp.now()
        };

        let orderSnapshot = null;
        if (orderId) {
            try {
                orderSnapshot = await getDoc(doc(db, "orders", orderId));
            } catch (e) { /* تجاهل */ }
        }

        const logEntry = {
            action,
            orderId,
            orderNumber,
            severity,
            details,
            performedBy,
            metadata,
            ...(orderSnapshot?.exists() ? {
                orderDataSnapshot: {
                    status: orderSnapshot.data().status,
                    customerName: orderSnapshot.data().customerName,
                    finalTotal: orderSnapshot.data().finalTotal
                }
            } : {})
        };

        await addDoc(collection(db, "auditLog"), logEntry);
    } catch (error) {
        console.error("❌ فشل تسجيل حدث التدقيق:", error);
    }
}

// دالة مساعدة لتسجيل تغييرات الحقول عند التعديل
export function getChangedFields(oldData, newData, fields) {
    const changes = {};
    fields.forEach(field => {
        if (JSON.stringify(oldData[field]) !== JSON.stringify(newData[field])) {
            changes[field] = {
                old: oldData[field],
                new: newData[field]
            };
        }
    });
    return changes;
}

export { db };