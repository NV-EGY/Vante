// js/logger.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, Timestamp, getDoc, doc, query, where, getDocs
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

export async function logAuditEvent(data) {
    // ============================================================
    // ✅ السماح بالتسجيل فقط من صفحات الإدارة المحددة
    // ============================================================
    const currentPath = window.location.pathname;
    
    // ✅ قائمة الصفحات المسموح لها بالتسجيل
    const allowedPages = [
        'admin-order',
        'admin-products',
        'admin-product',
        'Profits',
        'Audit-log',
        'admin-order (1)'
    ];
    
    const isAdminPage = allowedPages.some(page => currentPath.includes(page));
    
    if (!isAdminPage) {
        // ✅ سكوت تام بدلاً من console.log لتجنب الضوضاء
        return;
    }
    // ============================================================

    try {
        const {
            action,
            orderId = null,
            orderNumber = null,
            details = {},
            performedBy = window.currentUserEmail || 'system',
            severity = 'info'
        } = data;

        const metadata = {
            userAgent: navigator.userAgent || 'unknown',
            url: window.location.href || 'unknown',
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
        console.log("✅ [Audit Log] تم تسجيل الحدث:", action, orderNumber);
    } catch (error) {
        console.error("❌ [Audit Log] فشل التسجيل:", error);
    }
}

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