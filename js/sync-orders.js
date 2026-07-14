import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { logAuditEvent } from './logger.js';

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
export { db };
export { restoreStockForOrder };
// =================== إعدادات QP ===================
let QP_CONFIG = null;

async function loadQPConfig() {
    if (QP_CONFIG) return QP_CONFIG;
    const configDoc = await getDoc(doc(db, "settings", "qp_credentials"));
    if (configDoc.exists()) {
        QP_CONFIG = configDoc.data();
        return QP_CONFIG;
    }
    throw new Error("لم يتم العثور على بيانات تسجيل الدخول لـ QP Express في Firestore");
}

export async function deductStockForOrder(orderId, orderData) {
    if (!orderData) {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) return;
        orderData = orderSnap.data();
    }
    
    // إذا كان الطلب قد تم خصم مخزونه بالفعل ولا يحتاج إلى خصم مرة أخرى
    if (orderData.stockDeducted) {
        console.log(`⚠️ المخزون للطلب ${orderId} تم خصمه مسبقاً، تخطي.`);
        return;
    }
    
    for (const item of (orderData.orderDetails || [])) {
        if (!item.name || !item.size) continue;
        let productId = item.productId;
        let productDoc;
        if (productId) {
            productDoc = await getDoc(doc(db, "products", productId));
        } else {
            const productSnap = await getDocs(query(collection(db, "products"), where("name", "==", item.name)));
            if (!productSnap.empty) productDoc = productSnap.docs[0];
        }
        if (productDoc && productDoc.exists()) {
            const productRef = doc(db, "products", productDoc.id);
            const stockBySize = productDoc.data().stockBySize || {};
            const currentStock = stockBySize[item.size];
            if (currentStock !== null && currentStock !== undefined) {
                stockBySize[item.size] = Math.max(0, (currentStock || 0) - item.qty);
                await updateDoc(productRef, { stockBySize });
            }
        }
    }
    // وضع علامة بأن المخزون خُصم
    await updateDoc(doc(db, "orders", orderId), { stockDeducted: true, stockRestored: false });
}

// =================== الحصول على توكن ===================
async function getQPToken() {
    const config = await loadQPConfig();
    const response = await fetch(`${config.server_url}/integration/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: config.username,
            password: config.password
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`فشل الحصول على التوكن: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return data.token;
}
// =================== جلب معرف المدينة ===================
// =================== جلب معرف المدينة ===================
// استبدل دالة getCityId بالكود التالي
async function getCityId(govName) {
    if (!govName) return 1; // fallback للقاهرة

    try {
        // 1. البحث عن المحافظة في جدول cities
        const citiesRef = collection(db, "cities");
        const q = query(citiesRef, where("governorate", "==", govName));
        const snap = await getDocs(q);
        if (!snap.empty) {
            return snap.docs[0].data().id;
        }

        // 2. إذا لم نجد، نحاول البحث باسم المحافظة كـ city name
        const docSnap = await getDoc(doc(db, "cities", govName));
        if (docSnap.exists()) {
            return docSnap.data().id;
        }

        // 3. إذا لم نجد، نبحث في جدول المحافظات (governorates) إن وجد
        const govDoc = await getDoc(doc(db, "governorates", govName));
        if (govDoc.exists()) {
            return govDoc.data().cityId; // افترض وجود حقل cityId
        }

        console.warn(`⚠️ لم يتم العثور على معرف للمحافظة: ${govName}`);
        return 1; // fallback للقاهرة
    } catch (error) {
        console.error("❌ خطأ في جلب معرف المحافظة:", error);
        return 1;
    }
}
// =================== إنشاء طلب في QP ===================
export async function createOrderInQP(orderData) {
    try {
        // التحقق من وجود شحنة سابقة
        if (orderData.qpSerial && !orderData.qpDeleted) {
            console.log(`ℹ️ الطلب ${orderData.orderID} له بالفعل رقم شحنة ${orderData.qpSerial}، لن يتم إعادة إنشائه.`);
            return null;
        }

        const token = await getQPToken();
        const config = await loadQPConfig();

        // ✅ جلب معرف المحافظة الصحيح
        const cityId = await getCityId(orderData.gov);
        console.log(`🏙️ تم استخدام معرف المدينة (${cityId}) للمحافظة ${orderData.gov}`);

        // ✅ تجميع العنوان التفصيلي والمدينة في حقل address
        const fullAddress = `المدينة: ${orderData.city || ''}، ${orderData.address || ''}`;

        const payload = {
            full_name: orderData.customerName || "",
            phone: orderData.phone || "",
            address: fullAddress,   // هنا نضع العنوان الكامل
            total_amount: Number(orderData.finalTotal) || 0,
            notes: orderData.notes || "",
            order_date: new Date().toISOString(),
            shipment_contents: (orderData.orderDetails || []).map(item => `${item.name} (${item.size})`).join(', '),
            weight: "0.00",
            city: cityId,           // المعرف الصحيح للمحافظة
            referenceID: orderData.orderID || ""
        };

        const response = await fetch(`${config.server_url}/integration/order`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل إنشاء الطلب في QP: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        await updateDoc(doc(db, "orders", orderData.id), {
            qpSerial: result.serial,
            qpStatus: result.Order_Delivery_Status || "Pending",
            qpLastSync: serverTimestamp(),
            qpDeleted: false
        });

        console.log(`✅ تم إنشاء الطلب في QP برقم: ${result.serial}`);
        return result;
        // داخل createOrderInQP (بعد النجاح)
await logAuditEvent({
  action: 'shipment_created',
  orderId: orderData.id,
  orderNumber: orderData.orderID,
  details: { qpSerial: result.serial },
  performedBy: 'system (QP)',
  severity: 'info'
});


    } catch (error) {
      // داخل catch (في createOrderInQP)
await logAuditEvent({
  action: 'shipment_failed',
  orderId: orderData.id,
  orderNumber: orderData.orderID,
  details: { error: error.message },
  performedBy: 'system (QP)',
  severity: 'error'
});
        console.error("❌ خطأ في إنشاء الطلب:", error);
        throw error;
    }
}

// =================== جلب تحديثات الحالة ===================
export async function getOrderUpdateHistory(page = 1, pageSize = 200) {
    try {
        const token = await getQPToken();
        const config = await loadQPConfig();
        const url = `${config.server_url}/integration/get_order_update_history?page=${page}&page_size=${pageSize}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`فشل جلب التحديثات: ${response.status} - ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("❌ خطأ في جلب التحديثات:", error);
        return null;
    }
}

// =================== معالجة التحديثات (النسخة النهائية المعدلة) ===================
export async function processUpdates(updates) {
    if (!updates || updates.length === 0) return;

    for (const update of updates) {
        try {
            const { referenceID, field, new_value, notes } = update;

            const q = query(collection(db, "orders"), where("orderID", "==", referenceID));
            const snap = await getDocs(q);
            if (snap.empty) {
                console.warn(`⚠️ لم يتم العثور على طلب بالرقم ${referenceID}`);
                continue;
            }

            const orderDoc = snap.docs[0];
            const orderId = orderDoc.id;
            const currentData = orderDoc.data();

            // ----- حالة المرتجع (من QP) -----
            if (update.has_return && update.has_return === true) {
                // ✅ عند المرتجع، نغير الحالة إلى returned (ولكن لا نعيد المخزون تلقائياً)
                // سيتم تأكيد الاستلام يدوياً من المسؤول في Profits
                await updateDoc(doc(db, "orders", orderId), {
                    status: "returned",
                    notes: (notes || "مرتجع من شركة الشحن - في انتظار تأكيد المسؤول"),
                    stockRestored: false  // لم نستعد المخزون بعد
                });
                console.log(`🔄 تم تحديث الطلب ${referenceID} إلى حالة مرتجع (في انتظار التأكيد)`);
                continue;
            }

            // ----- تحديث الحالة -----
            if (field !== "Order_Delivery_Status") continue;

            let newStatus = currentData.status;
            let notesToAdd = "";
            let newShippingCostPaid = currentData.shippingCostPaid || 0;

            switch (new_value) {
                case "Pending":
                case "Out For Deliver":
                    newStatus = "shipped";
                    break;

                case "Delivered":
                    newStatus = "delivered";
                    break;

                case "Hold":
                    newStatus = "hold";
                    notesToAdd = notes || "معلق من قبل شركة الشحن";
                    break;

                case "Undelivered":
                    // ✅ لا نعيد المخزون تلقائياً، ننتظر تأكيد المسؤول
                    newStatus = "undelivered";
                    notesToAdd = notes || "موصلش للعميل (Undelivered) - في انتظار تأكيد المرتجع";
                    newShippingCostPaid = 0;
                    break;

                case "Rejected":
                    // ✅ لا نعيد المخزون تلقائياً، ننتظر تأكيد المسؤول
                    newStatus = "rejected";
                    notesToAdd = notes || "العميل رفض الطلب - في انتظار تأكيد المرتجع";
                    break;

                default:
                    continue;
            }

            const updateData = {
                status: newStatus,
                qpStatus: new_value,
                qpLastSync: serverTimestamp(),
                shippingCostPaid: newShippingCostPaid
            };

            if (notesToAdd) updateData.notes = notesToAdd;
            if (new_value === "Undelivered") updateData.shippingExempted = true;

            await updateDoc(doc(db, "orders", orderId), updateData);

            // ✅ تسجيل الحدث في Audit Log
            await logAuditEvent({
                action: 'status_change',
                orderId: orderId,
                orderNumber: referenceID,
                details: {
                    oldStatus: currentData.status,
                    newStatus: newStatus,
                    notes: notesToAdd || `تحديث تلقائي من QP: ${new_value}`,
                    source: 'QP Express'
                },
                performedBy: 'system (QP)',
                severity: 'info'
            });

            console.log(`🔄 تم تحديث الطلب ${referenceID} إلى حالة ${newStatus} (QP: ${new_value})`);

        } catch (error) {
            console.error("❌ خطأ في معالجة تحديث:", error);
        }
    }
}

// =================== المزامنة اليدوية (تمت إضافتها) ===================
export async function manualSyncOrders() {
    try {
        console.log("🔄 بدء المزامنة اليدوية مع QP Express...");
        const pageSize = 200;
        let page = 1;
        let allUpdates = [];

        // جلب جميع التحديثات
        while (true) {
            const data = await getOrderUpdateHistory(page, pageSize);
            if (!data || !data.results || data.results.length === 0) break;
            allUpdates = allUpdates.concat(data.results);
            if (!data.next) break;
            page++;
        }

        if (allUpdates.length === 0) {
            console.log("ℹ️ لا توجد تحديثات جديدة من QP Express");
            return { syncedCount: 0, notesAddedCount: 0 };
        }

        // تصفية تحديثات الحالة فقط
        const statusUpdates = allUpdates.filter(u => u.field === "Order_Delivery_Status" || u.has_return === true);
        if (statusUpdates.length === 0) {
            console.log("ℹ️ لا توجد تحديثات حالة جديدة");
            return { syncedCount: 0, notesAddedCount: 0 };
        }

        await processUpdates(statusUpdates);
        console.log(`✅ تمت مزامنة ${statusUpdates.length} طلب مع QP Express`);
        return {
            syncedCount: statusUpdates.length,
            notesAddedCount: 0
        };
    } catch (error) {
        console.error("❌ فشل المزامنة اليدوية:", error);
        return { error: error.message };
    }
}

// =================== المزامنة الدورية ===================
let syncInterval = null;

export function startPeriodicSync(intervalMinutes = 3) {
    if (syncInterval) clearInterval(syncInterval);

    // أول مزامنة فورية
    manualSyncOrders();

    syncInterval = setInterval(async () => {
        console.log("⏳ جاري المزامنة التلقائية مع QP Express...");
        await manualSyncOrders();
    }, intervalMinutes * 60 * 1000);

    console.log(`✅ تم بدء المزامنة التلقائية كل ${intervalMinutes} دقيقة`);
}

export function stopPeriodicSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log("⏹️ تم إيقاف المزامنة التلقائية");
    }
}

// =================== الاستماع للتغييرات ===================
export async function listenForOrderStatusChanges() {
    startPeriodicSync(3);
    console.log("👂 تم تفعيل الاستماع لتغييرات حالة الطلبات من QP Express");
}
// =================== إلغاء طلب في QP ===================
// =================== إلغاء طلب في QP (محلياً) ===================
export async function cancelOrderInQP(orderId, serial) {
    try {
        // بغض النظر عن الـ serial، نضع علامة الإلغاء محلياً
        // لأن نظام QP لا يوفر نقطة نهاية للإلغاء حالياً
        console.log(`🗑️ إلغاء الطلب ${orderId} محلياً (serial: ${serial || 'غير موجود'})`);
        
        await updateDoc(doc(db, "orders", orderId), {
            qpDeleted: true,
            qpStatus: "Cancelled (local)",
            qpSerial: null,          // إزالة الرقم التسلسلي
            qpLastSync: serverTimestamp()
        });
        
        return { 
            success: true, 
            message: "تم وضع علامة إلغاء محلياً (API الإلغاء غير متوفر في QP Express)" 
        };
    } catch (error) {
        console.error("❌ خطأ في تحديث حالة الإلغاء محلياً:", error);
        return { success: false, error: error.message };
    }
}
export { db, restoreStockForOrder, deductStockForOrder };