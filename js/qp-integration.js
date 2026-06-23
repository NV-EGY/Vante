// qp-integration.js - وحدة التكامل مع QP Express API

const QP_API_BASE = "https://qpxpress.com:8001/integration";
const QP_USERNAME = "VNT@QPX"; // استبدل بالبيانات الصحيحة
const QP_PASSWORD = "80977701"; // استبدل بالبيانات الصحيحة

let qpToken = null;
let tokenExpiry = null;

/**
 * الحصول على توكن المصادقة من QP Express
 */
async function getQPToken() {
    // إذا كان التوكن موجوداً ولم ينتهِ صلاحيته
    if (qpToken && tokenExpiry && Date.now() < tokenExpiry) {
        return qpToken;
    }

    try {
        const response = await fetch(`${QP_API_BASE}/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: QP_USERNAME,
                password: QP_PASSWORD
            })
        });

        if (!response.ok) {
            throw new Error(`فشل الحصول على التوكن: ${response.status}`);
        }

        const data = await response.json();
        qpToken = data.token;
        // التوكن صالح لمدة ساعة (افتراضي)
        tokenExpiry = Date.now() + 3600000;
        return qpToken;
    } catch (error) {
        console.error('خطأ في الحصول على التوكن:', error);
        throw error;
    }
}
import { doc, getDoc } from "firebase/firestore";
import { db } from "./sync-orders.js"; // أو استخدم db الموجود في ملف آخر

async function getOrderFromDB(orderId) {
    const docRef = doc(db, "orders", orderId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}
/**
 * إنشاء طلب جديد في نظام QP Express
 */
async function createOrderInQP(orderData) {
    try {
        const token = await getQPToken();
        const orderDetails = orderData.orderDetails || [];

        // ✅ تأكد من أن البيانات نصية (String) عشان مشاكل الترميز
        const shipmentContents = orderDetails.map(item =>
            `${item.name || ''} (${item.size || ''}) x${item.qty || 0}`
        ).join(', ');

        const notes = [
            orderData.notes || '',
            orderDetails.map(item =>
                `- ${item.name || ''} (مقاس ${item.size || ''}) × ${item.qty || 0}`
            ).join('\n')
        ].filter(Boolean).join('\n');

        const payload = {
            full_name: (orderData.customerName || orderData.full_name || '').toString(),
            phone: (orderData.phone || '').toString(),
            address: (orderData.address || '').toString(),
            total_amount: parseFloat(orderData.finalTotal) || 0,
            notes: notes.toString(),
            order_date: new Date().toISOString(),
            shipment_contents: shipmentContents.toString(),
            weight: (orderData.weight || '50.00').toString(),
            city: (orderData.city || orderData.gov || '').toString(),
            referenceID: (orderData.orderID || orderData.id || '').toString()
        };

        // ✅ التحويل إلى JSON
        const jsonPayload = JSON.stringify(payload);

        let response;
        if (orderData.qp_serial) {
            // تحديث طلب موجود
            response = await fetch(`${QP_API_BASE}/order/${orderData.qp_serial}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: jsonPayload,
                mode: 'cors',   // ✅ مهم جداً
                credentials: 'omit'
            });
        } else {
            // إنشاء طلب جديد
            response = await fetch(`${QP_API_BASE}/order`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: jsonPayload,
                mode: 'cors',   // ✅ مهم جداً
                credentials: 'omit'
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل في ${orderData.qp_serial ? 'تحديث' : 'إنشاء'} الطلب: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('خطأ في إنشاء الطلب بـ QP:', error);
        throw error;
    }
}

/**
 * تحديث حالة طلب في QP Express
 */
async function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');
        
        // تحويل حالة فانتي إلى حالة QP Express
        const qpStatus = mapStatusToQP(status);
        
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
async function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        returasync function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}orderData.notesasync function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}async function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}async function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}orderData.notesorderData.notesasync function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}orderData.orderDetailsorderData.orderDetailsorderData.orderDetailsasync function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        if (!order) throw new Error('الطلب غير موجود');

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: order.qp_serial || orderId,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString()
        };

        const jsonPayload = JSON.stringify(payload);

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: jsonPayload,
            mode: 'cors',   // ✅ مهم جداً
            credentials: 'omit'
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث dd4tçgcch: ${response.status}`);
        }

tt2t54544454,2tddd,t2d,rd,r,drr,r,r,d,,tfft,,,,,ff,55,f,t,t,t,5,ttfreturn await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}orderData.orderDetailsorderData.notesorderData.orderDetailsn await response.json();
    } xrdf,tt5144447catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
dffeśsseżeďrdrdŕ2        };

        const response = await fetch(`${QP_API_BASE}/order/${order.qp_serial || orderId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`فشل تحديث الحالة: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في تحديث حالة الطلب بـ QP:', error);
        throw error;
    }
}

/**
 * تحويل حالة فانتي إلى حالة QP Express
 */
// qp-integration.js (الجزء المعدل)

/**
 * تحويل حالة فانتي إلى حالة QP Express
 */
function mapStatusToQP(status) {
    const statusMap = {
        'new': 'Pending',
        'processing': 'Pending',
        'shipped': 'Out For Delivery',   // ✅ هذا هو المطلوب
        'delivered': 'Delivered',
        'confirmed': 'Pending',
        'hold': 'Hold',
        'undelivered': 'Undelivered',
        'rejected': 'Rejected',
        'cancelled': 'Rejected',
        'returned': 'Delivered'
    };
    return statusMap[status] || 'Pending';
}

/**
 * تحويل حالة QP Express إلى حالة فانتي
 */
function mapQPStatusToVante(qpStatus) {
    const statusMap = {
        'Pending': 'shipped',            // يبقى جاري الشحن
        'Out For Delivery': 'shipped',   // يبقى جاري الشحن
        'Delivered': 'delivered',        // تم التسليم
        'Hold': 'hold',                  // معلق
        'Undelivered': 'undelivered',    // لاغي (لم يصل)
        'Rejected': 'rejected'           // لاغي (رفض)
    };
    return statusMap[qpStatus] || 'new';
}

/**
 * جلب تحديثات الحالات من QP Express (Polling)
 */
async function fetchQPUpdates(fromDate = null) {
    try {
        const token = await getQPToken();
        const params = new URLSearchParams({
            page_size: 100,
            page: 1,
            from_date: fromDate || new Date(Date.now() - 86400000).toISOString().split('T')[0], // أمس
            to_date: new Date().toISOString().split('T')[0]
        });

        const response = await fetch(`${QP_API_BASE}/order?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`فشل جلب التحديثات: ${response.status}`);
        }

        const data = await response.json();
        return data.results || [];
    } catch (error) {
        console.error('خطأ في جلب تحديثات QP:', error);
        return [];
    }
}

/**
 * جلب سجل التحديثات من QP Express
 */
async function fetchQPUpdateHistory(fromDate = null, page = 1) {
    try {
        const token = await getQPToken();
        const params = new URLSearchParams({
            page_size: 200,
            page: page,
            from_date: fromDate || new Date(Date.now() - 86400000).toISOString().split('T')[0]
        });

        const response = await fetch(`${QP_API_BASE}/get_order_update_history?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`فشل جلب سجل التحديثات: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('خطأ في جلب سجل تحديثات QP:', error);
        return { results: [] };
    }
}

// تصدير الدوال للاستخدام
export {
    getQPToken,
    createOrderInQP,
    updateOrderStatusInQP,
    fetchQPUpdates,
    fetchQPUpdateHistory,
    mapStatusToQP,
    mapQPStatusToVante
};
