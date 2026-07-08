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
    // ✅ السماح بالتسجيل فقط من صفحات الإدارة المحددة
    // ============================================================
    const currentPath = window.location.pathname;
    
    const allowedPages = [
        'admin-order',
        'admin-products',
        'admin-product',
        'Profits',
        'Audit-log',
        'admin-order (1)'
    ];
    
    const isAdminPage = allowedPages.some(page => currentPath.includes(page));
    if (!isAdminPage) return;
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

        // ✅ تحويل details إلى صيغة قابلة للقراءة
        const cleanDetails = {};
        for (const [key, value] of Object.entries(details)) {
            if (typeof value === 'string') {
                cleanDetails[key] = { stringValue: value };
            } else if (typeof value === 'number') {
                cleanDetails[key] = { doubleValue: value };
            } else if (typeof value === 'boolean') {
                cleanDetails[key] = { booleanValue: value };
            } else if (Array.isArray(value)) {
                cleanDetails[key] = { 
                    arrayValue: { 
                        values: value.map(v => ({ stringValue: String(v) })) 
                    } 
                };
            } else if (value && typeof value === 'object') {
                // ✅ دعم الكائنات المتداخلة (مثل oldStatus, newStatus)
                const nestedFields = {};
                for (const [k, v] of Object.entries(value)) {
                    if (typeof v === 'string') {
                        nestedFields[k] = { stringValue: v };
                    } else if (typeof v === 'number') {
                        nestedFields[k] = { doubleValue: v };
                    } else {
                        nestedFields[k] = { stringValue: String(v) };
                    }
                }
                cleanDetails[key] = { mapValue: { fields: nestedFields } };
            } else {
                cleanDetails[key] = { stringValue: String(value) };
            }
        }

        // ✅ إضافة الحقول الرئيسية كقيم مباشرة للعرض
        const docData = {
            action: { stringValue: action },
            orderId: { stringValue: orderId || '' },
            orderNumber: { stringValue: orderNumber || '' },
            severity: { stringValue: severity || 'info' },
            details: { mapValue: { fields: cleanDetails } },
            performedBy: { stringValue: performedBy || 'system' },
            timestamp: { timestampValue: new Date().toISOString() },
            createdAt: { timestampValue: new Date().toISOString() }
        };

        // ✅ إضافة القيم المباشرة للعرض السريع
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

        // ✅ حفظ باستخدام REST API مباشرة (لضمان التوافق)
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
        console.error("❌ [Audit Log] فشل التسجيل:", error);
        // ✅ محاولة بديلة عبر SDK إذا فشل REST
        try {
            const logEntry = {
                action,
                orderId,
                orderNumber,
                severity,
                details,
                performedBy,
                createdAt: Timestamp.now()
            };
            await addDoc(collection(db, "auditLog"), logEntry);
            console.log("✅ [Audit Log] تم التسجيل عبر SDK كحل بديل");
        } catch (e) {
            console.error("❌ [Audit Log] فشل التسجيل عبر SDK أيضاً:", e);
        }
    }
}

// ✅ دالة مساعدة للحصول على توكن المصادقة
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