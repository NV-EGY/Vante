// ============================================================
// qp-integration.js - الوحدة الأساسية للتكامل مع QP Express API
// الإصدار: 2.0 (نظيف، محسّن، وجاهز للإنتاج)
// ============================================================

// ========== الاستيرادات (في الأعلى كما يجب) ==========
import { getQPConfig } from './env-config.js';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './sync-orders.js'; // تأكد من أن المسار صحيح

// ========== إعدادات البيئة ==========
const config = getQPConfig('PRODUCTION');
const QP_API_BASE = config.API_BASE;
const QP_USERNAME = config.USERNAME;
const QP_PASSWORD = config.PASSWORD;

// ========== المتغيرات الداخلية ==========
let qpToken = null;
let tokenExpiry = null;
let isRefreshingToken = false;
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 دقائق قبل الانتهاء

// ========== دوال مساعدة ==========

/**
 * الحصول على توكن المصادقة من QP Express مع إعادة محاولة تلقائية
 */
async function getQPToken() {
    // إذا كان التوكن موجوداً ولم ينتهِ صلاحيته (مع هامش أمان)
    if (qpToken && tokenExpiry && (Date.now() < tokenExpiry - TOKEN_REFRESH_MARGIN)) {
        return qpToken;
    }

    // منع التكرار في حالة طلبات متزامنة
    if (isRefreshingToken) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return getQPToken(); // استدعاء ذاتي بعد الانتظار
    }

    isRefreshingToken = true;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // مهلة 15 ثانية

        const response = await fetch(`${QP_API_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: QP_USERNAME, password: QP_PASSWORD }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل الحصول على التوكن (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        if (!data.token) throw new Error('الاستجابة لا تحتوي على توكن');

        qpToken = data.token;
        tokenExpiry = Date.now() + 3600000; // ساعة واحدة
        console.log('✅ تم تجديد توكن QP Express بنجاح');
        return qpToken;

    } catch (error) {
        console.error('❌ خطأ في الحصول على التوكن:', error);
        // إعادة طرح الخطأ مع رسالة واضحة
        throw new Error('تعذر الحصول على توكن المصادقة: ' + error.message);
    } finally {
        isRefreshingToken = false;
    }
}

/**
 * جلب بيانات الطلب من Firestore باستخدام رقم الطلب الداخلي
 */
async function getOrderFromDB(orderId) {
    if (!orderId) throw new Error('معرف الطلب مطلوب');
    const docRef = doc(db, 'orders', orderId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        throw new Error(`الطلب رقم ${orderId} غير موجود في قاعدة البيانات`);
    }
    return { id: docSnap.id, ...docSnap.data() };
}

// ========== دوال API الأساسية ==========

/**
 * إنشاء طلب جديد في نظام QP Express
 * @param {Object} orderData - بيانات الطلب من Firestore
 * @returns {Promise<Object>} - كائن يحتوي على serial الخاص بالطلب في QP
 */
async function createOrderInQP(orderData) {
    try {
        const token = await getQPToken();
        const orderDetails = orderData.orderDetails || [];

        // بناء محتويات الشحنة (shipment_contents)
        const shipmentContents = orderDetails
            .map(item => `${item.name || ''} (${item.size || ''}) x${item.qty || 0}`)
            .join(', ');

        // بناء الملاحظات (notes) مع تفاصيل المنتجات
        const notesLines = [
            orderData.notes || '',
            ...orderDetails.map(item =>
                `- ${item.name || ''} (مقاس ${item.size || ''}) × ${item.qty || 0}`
            )
        ].filter(Boolean);
        const notes = notesLines.join('\n');

        // إعداد payload وفقاً لوثائق API
        const payload = {
            full_name: (orderData.customerName || orderData.full_name || '').toString().trim(),
            phone: (orderData.phone || '').toString().trim(),
            address: (orderData.address || '').toString().trim(),
            total_amount: parseFloat(orderData.finalTotal) || 0,
            notes: notes,
            order_date: new Date().toISOString(),
            shipment_contents: shipmentContents,
            weight: (orderData.weight || '50.00').toString(),
            city: (orderData.city || orderData.gov || '').toString().trim(),
            referenceID: (orderData.orderID || orderData.id || '').toString().trim()
        };

        // التحقق من البيانات الأساسية
        if (!payload.full_name || !payload.phone || !payload.address) {
            throw new Error('بيانات العميل غير مكتملة (الاسم، الهاتف، العنوان)');
        }

        const response = await fetch(`${QP_API_BASE}/order`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            mode: 'cors',
            credentials: 'omit',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل إنشاء الطلب (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ تم إنشاء الطلب في QP برقم تسلسلي: ${result.serial}`);
        return result;

    } catch (error) {
        console.error('❌ خطأ في createOrderInQP:', error);
        throw error;
    }
}

/**
 * تحديث حالة طلب في QP Express (PATCH)
 * @param {string} orderId - معرف الطلب في Firestore
 * @param {string} status - الحالة الجديدة في نظام فانتي
 * @param {string} note - ملاحظة إضافية (اختياري)
 */
async function updateOrderStatusInQP(orderId, status, note = '') {
    try {
        const token = await getQPToken();
        const order = await getOrderFromDB(orderId);
        const qpSerial = order.qp_serial;
        if (!qpSerial) {
            throw new Error('الطلب غير مسجل في QP Express (لا يوجد qp_serial)');
        }

        const qpStatus = mapStatusToQP(status);
        const payload = {
            serial: qpSerial,
            status: qpStatus,
            StatusNote: (note || `تحديث الحالة: ${status}`).toString().slice(0, 500), // حد أقصى 500 حرف
        };

        const response = await fetch(`${QP_API_BASE}/order/${qpSerial}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            mode: 'cors',
            credentials: 'omit',
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل تحديث الحالة (${response.status}): ${errorText}`);
        }

        const result = await response.json();
        console.log(`✅ تم تحديث حالة الطلب ${qpSerial} إلى ${qpStatus}`);
        return result;

    } catch (error) {
        console.error('❌ خطأ في updateOrderStatusInQP:', error);
        throw error;
    }
}

/**
 * جلب قائمة الطلبات من QP Express مع إمكانية التصفية
 * @param {string|null} fromDate - تاريخ البداية (YYYY-MM-DD)
 * @param {number} pageSize - عدد النتائج في الصفحة
 * @param {number} page - رقم الصفحة
 */
async function fetchQPUpdates(fromDate = null, pageSize = 100, page = 1) {
    try {
        const token = await getQPToken();
        const params = new URLSearchParams({
            page_size: pageSize,
            page: page,
            from_date: fromDate || new Date(Date.now() - 86400000).toISOString().split('T')[0], // أمس
            to_date: new Date().toISOString().split('T')[0],
        });

        const response = await fetch(`${QP_API_BASE}/order?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل جلب التحديثات (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return data.results || [];

    } catch (error) {
        console.error('❌ خطأ في fetchQPUpdates:', error);
        return []; // نعيد مصفوفة فارغة بدلاً من إلقاء الخطأ (لتجنب تعطل المزامنة)
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
            from_date: fromDate || new Date(Date.now() - 86400000).toISOString().split('T')[0],
        });

        const response = await fetch(`${QP_API_BASE}/get_order_update_history?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل جلب سجل التحديثات (${response.status}): ${errorText}`);
        }

        return await response.json();

    } catch (error) {
        console.error('❌ خطأ في fetchQPUpdateHistory:', error);
        return { results: [] };
    }
}

// ========== دوال تحويل الحالات ==========

/**
 * تحويل حالة فانتي إلى حالة QP Express
 * (مع مراعاة جميع الحالات الممكنة)
 */
function mapStatusToQP(status) {
    const statusMap = {
        'new': 'Pending',
        'processing': 'Pending',
        'shipped': 'Out For Delivery',
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
        'Pending': 'shipped',
        'Out For Delivery': 'shipped',
        'Delivered': 'delivered',
        'Hold': 'hold',
        'Undelivered': 'undelivered',
        'Rejected': 'rejected',
        // أي حالة غير معروفة نعتبرها 'new'
    };
    return statusMap[qpStatus] || 'new';
}

// ========== تصدير الدوال ==========
export {
    getQPToken,
    createOrderInQP,
    updateOrderStatusInQP,
    fetchQPUpdates,
    fetchQPUpdateHistory,
    mapStatusToQP,
    mapQPStatusToVante,
    getOrderFromDB, // قد تحتاجها في ملفات أخرى
};