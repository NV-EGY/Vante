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
 * تسجيل حدث في سجل التدقيق
 * @param {Object} data - بيانات الحدث
 * @param {string} data.action - نوع العملية (status_change, order_created, order_edited, order_deleted, return_confirmed)
 * @param {string} data.orderId - معرف الطلب
 * @param {string} data.orderNumber - رقم الطلب الظاهر
 * @param {Object} data.details - تفاصيل إضافية (حسب نوع العملية)
 * @param {string} data.performedBy - البريد الإلكتروني للمستخدم (اختياري)
 * @param {string} data.severity - خطورة الحدث (info, warning, error) - اختياري
 */
export async function logAuditEvent(data) {
    try {
        const {
            action,
            orderId = null,
            orderNumber = null,
            details = {},
            performedBy = 'system',
            severity = 'info'
        } = data;

        // جمع معلومات إضافية عن البيئة
        const metadata = {
            userAgent: navigator ? navigator.userAgent : 'unknown',
            url: window ? window.location.href : 'unknown',
            timestamp: Timestamp.now()
        };

        // إذا كان لدينا orderId، نحاول جلب البيانات الإضافية عن الطلب (اختياري)
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
        // لا نرمي الخطأ حتى لا يؤثر على تدفق العملية الأساسية
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

// تصدير db للاستخدام في الملفات الأخرى إذا احتاجت
export { db };