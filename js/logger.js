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

export async function logAuditEvent(data) {
    // ============================================================
    // 🔥 منع التسجيل في صفحات المتجر (الزبائن) نهائياً
    // ============================================================
    const currentPath = window.location.pathname;
    console.log("🔍 [Audit Log] المسار الحالي:", currentPath);

    // الصفحات المسموح لها فقط بالتسجيل (لوحات التحكم)
    // نسمح بأي ملف يبدأ بـ "admin-" أو يحتوي على "Profits" أو "Audit-log"
    // كما نسمح تحديداً باسم "admin-order (1).html"
    const isAdminPage = 
        currentPath.includes('admin-order') ||
        currentPath.includes('admin-product') ||
        currentPath.includes('Profits') ||
        currentPath.includes('Audit-log') ||
        currentPath.includes('admin-order (1)'); // دعم النسخة ذات المسافة

    console.log("🔍 [Audit Log] هل هي صفحة إدارة؟", isAdminPage);

    if (!isAdminPage) {
        console.log("⛔ [Audit Log] تم منع التسجيل: ليست صفحة إدارة");
        return;
    }
    // ============================================================

    try {
        const {
            action,
            orderId = null,
            orderNumber = null,
            details = {},
            performedBy = 'system',
            severity = 'info'
        } = data;

        console.log("📝 [Audit Log] تسجيل حدث:", { action, orderId, orderNumber });

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
console.log("💾 [Audit Log] البيانات المرسلة إلى Firestore:", logEntry);
        await addDoc(collection(db, "auditLog"), logEntry);
        console.log("✅ [Audit Log] تم تسجيل الحدث بنجاح في Firestore");
    } catch (error) {
        console.error("❌ [Audit Log] فشل تسجيل حدث التدقيق:", error);
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