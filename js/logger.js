// js/logger.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

// ✅ منع تكرار تهيئة Firebase
let app;
try {
    app = getApp();
} catch {
    app = initializeApp(firebaseConfig);
}

const db = getFirestore(app);

/**
 * تحويل أي قيمة إلى صيغة Firestore REST API
 */
function convertToFirestoreValue(value) {
    // ✅ معالجة Timestamp
    if (value && typeof value === 'object' && value.toDate && typeof value.toDate === 'function') {
        return { timestampValue: value.toDate().toISOString() };
    }
    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }
    if (value === null || value === undefined) {
        return { nullValue: null };
    }
    
    if (typeof value === 'string') {
        return { stringValue: value };
    }
    if (typeof value === 'number') {
        return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
    }
    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }
    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map(item => convertToFirestoreValue(item))
            }
        };
    }
    if (typeof value === 'object') {
        const fields = {};
        for (const [k, v] of Object.entries(value)) {
            fields[k] = convertToFirestoreValue(v);
        }
        return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
}

export async function logAuditEvent(data) {
    // ✅ استخراج performedBy من data أولاً
    let performedBy = data.performedBy || window.currentUserEmail || 'system';
    
    // ✅ السماح بالتسجيل فقط من صفحات الإدارة
    const currentPath = window.location.pathname;
    const allowedPages = [
        'admin-order',
        'admin-products',
        'admin-product',
        'Profits',
        'Audit-log',
        'admin-order (1)',
        '/',
        '/index.html',
        ''
    ];
    const isAdminPage = allowedPages.some(page => currentPath.includes(page));
    if (!isAdminPage) return;

    try {
        const {
            action,
            orderId = null,
            orderNumber = null,
            details = {},
            severity = 'info'
        } = data;

        // ✅ تحويل details بالكامل باستخدام الدالة الجديدة
        const cleanDetails = convertToFirestoreValue(details);

        // ✅ بناء المستند النهائي
        const docData = {
            action: { stringValue: action },
            orderId: { stringValue: orderId || '' },
            orderNumber: { stringValue: orderNumber || '' },
            severity: { stringValue: severity || 'info' },
            details: cleanDetails,
            performedBy: { stringValue: performedBy || 'system' },
            timestamp: { timestampValue: new Date().toISOString() },
            createdAt: { timestampValue: new Date().toISOString() }
        };

        // ✅ إضافة حقول مساعدة للعرض السريع
        if (details.oldStatus) {
            docData.oldStatus = { stringValue: String(details.oldStatus) };
        }
        if (details.newStatus) {
            docData.newStatus = { stringValue: String(details.newStatus) };
        }
        if (details.notes) {
            docData.notes = { stringValue: String(details.notes) };
        }
        if (details.customerName) {
            docData.customerName = { stringValue: String(details.customerName) };
        }
        if (details.finalTotal !== undefined) {
            docData.finalTotal = { doubleValue: Number(details.finalTotal) };
        }

        // ✅ حفظ باستخدام REST API
        const token = await getAuthToken();
        const projectId = "vante-orders";
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/auditLog`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fields: docData })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log("✅ [Audit Log] تم تسجيل الحدث:", action, orderNumber);
        return await response.json();

    } catch (error) {
        console.error("❌ [Audit Log] فشل التسجيل عبر REST:", error);
        // ✅ محاولة بديلة عبر SDK
        try {
            const logEntry = {
                action,
                orderId,
                orderNumber,
                severity,
                details,
                performedBy: performedBy,
                createdAt: Timestamp.now()
            };
            await addDoc(collection(db, "auditLog"), logEntry);
            console.log("✅ [Audit Log] تم التسجيل عبر SDK كحل بديل");
        } catch (e) {
            console.error("❌ [Audit Log] فشل التسجيل عبر SDK أيضاً:", e);
        }
    }
}

// ✅ دالة الحصول على توكن المصادقة
async function getAuthToken() {
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const auth = getAuth();
    
    return new Promise((resolve, reject) => {
        if (auth.currentUser) {
            auth.currentUser.getIdToken().then(resolve).catch(reject);
        } else {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                unsubscribe();
                if (user) {
                    user.getIdToken().then(resolve).catch(reject);
                } else {
                    reject(new Error('غير مسجل الدخول'));
                }
            });
        }
    });
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