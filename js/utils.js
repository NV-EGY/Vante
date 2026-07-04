import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./sync-orders.js"; // أو تهيئة جديدة

export async function logAuditEvent(action, orderId, orderNumber, details = {}) {
    try {
        await addDoc(collection(db, "auditLog"), {
            action,
            orderId,
            orderNumber,
            timestamp: serverTimestamp(),
            performedBy: 'system', // أو user.email
            ...details
        });
    } catch (e) {
        console.warn('فشل تسجيل التدقيق:', e);
    }
}

// يمكنك أيضاً نقل customAlert و customConfirm هنا
export function showToast(message, type = 'success') { ... }
export function customAlert(message, type = 'success') { ... }
export function customConfirm(message) { ... }