import { initializeApp, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

// =================== دالة إعادة المخزون (النسخة النهائية المعدلة) ===================
async function restoreStockForOrder(orderId, orderData = null) {
    // ✅ التأكد من وجود orderData
    if (!orderData) {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) {
            console.warn(`⚠️ الطلب ${orderId} غير موجود`);
            return;
        }
        orderData = orderSnap.data();
    }
    
    // ✅ التحقق من stockRestored بأمان
    if (orderData.stockRestored) {
        console.log(`⚠️ المخزون للطلب ${orderId} تم استرجاعه مسبقاً، تخطي.`);
        return;
    }
    
    // ✅ التأكد من وجود orderDetails
    const orderDetails = orderData.orderDetails || [];
    if (orderDetails.length === 0) {
        console.warn(`⚠️ الطلب ${orderId} ليس له تفاصيل منتجات`);
        await updateDoc(doc(db, "orders", orderId), { stockRestored: true });
        return;
    }
    
    for (const item of orderDetails) {
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
                stockBySize[item.size] = (currentStock || 0) + item.qty;
                await updateDoc(productRef, { stockBySize });
                console.log(`✅ تم إعادة ${item.qty} قطعة من ${item.name} (مقاس ${item.size})`);
            }
        }
    }
    
    // ✅ وضع علامة بأن المخزون استعيد
    await updateDoc(doc(db, "orders", orderId), { 
        stockRestored: true,
        stockDeducted: false
    });
    console.log(`✅ تم استرجاع المخزون للطلب ${orderId}`);
}

// =================== دالة خصم المخزون (النسخة النهائية المعدلة) ===================
async function deductStockForOrder(orderId, orderData = null) {
    // ✅ التأكد من وجود orderData
    if (!orderData) {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists()) {
            console.warn(`⚠️ الطلب ${orderId} غير موجود`);
            return;
        }
        orderData = orderSnap.data();
    }
    
    // ✅ التحقق من stockDeducted بأمان
    if (orderData.stockDeducted) {
        console.log(`⚠️ المخزون للطلب ${orderId} تم خصمه مسبقاً، تخطي.`);
        return;
    }
    
    // ✅ التأكد من وجود orderDetails
    const orderDetails = orderData.orderDetails || [];
    if (orderDetails.length === 0) {
        console.warn(`⚠️ الطلب ${orderId} ليس له تفاصيل منتجات`);
        await updateDoc(doc(db, "orders", orderId), { stockDeducted: true });
        return;
    }
    
    for (const item of orderDetails) {
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
                console.log(`✅ تم خصم ${item.qty} قطعة من ${item.name} (مقاس ${item.size})`);
            }
        }
    }
    
    // ✅ وضع علامة بأن المخزون خُصم
    await updateDoc(doc(db, "orders", orderId), { 
        stockDeducted: true,
        stockRestored: false
    });
    console.log(`✅ تم خصم المخزون للطلب ${orderId}`);
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
async function getCityId(govName) {
    if (!govName) return 1;

    try {
        // ✅ البحث في جدول cities
        const citiesRef = collection(db, "cities");
        const q = query(citiesRef, where("governorate", "==", govName));
        const snap = await getDocs(q);
        if (!snap.empty) {
            return snap.docs[0].data().id;
        }

        // ✅ البحث في جدول governorates
        const govDoc = await getDoc(doc(db, "governorates", govName));
        if (govDoc.exists()) {
            return govDoc.data().cityId || 1;
        }

        // ✅ البحث في جدول shippingRates (كحل أخير)
        const ratesRef = collection(db, "shippingRates");
        const ratesSnap = await getDocs(query(ratesRef, where("gov", "==", govName)));
        if (!ratesSnap.empty) {
            const rate = ratesSnap.docs[0].data();
            return rate.cityId || 1;
        }

        console.warn(`⚠️ لم يتم العثور على معرف للمحافظة: ${govName}، استخدام القاهرة (1)`);
        return 1;
    } catch (error) {
        console.error("❌ خطأ في جلب معرف المحافظة:", error);
        return 1;
    }
}
// =================== إنشاء طلب في QP ===================
async function createOrderInQP(orderData) {
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
    qpDeleted: false,
    updatedAt: serverTimestamp()  // ✅ أضف هذا السطر
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
async function getOrderUpdateHistory(page = 1, pageSize = 200) {
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
async function processUpdates(updates) {
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
    shippingCostPaid: newShippingCostPaid,
    updatedAt: serverTimestamp()  // ✅ أضف هذا السطر
};

// ✅ إذا كانت الحالة الجديدة delivered، نضيف deliveredAt
if (new_value === "Delivered") {
    updateData.deliveredAt = serverTimestamp();
}

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
async function manualSyncOrders() {
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

function startPeriodicSync(intervalMinutes = 3) {
    if (syncInterval) clearInterval(syncInterval);

    // أول مزامنة فورية
    manualSyncOrders();

    syncInterval = setInterval(async () => {
        console.log("⏳ جاري المزامنة التلقائية مع QP Express...");
        await manualSyncOrders();
    }, intervalMinutes * 60 * 1000);

    console.log(`✅ تم بدء المزامنة التلقائية كل ${intervalMinutes} دقيقة`);
}

function stopPeriodicSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log("⏹️ تم إيقاف المزامنة التلقائية");
    }
}

async function createOrderInQPWithRetry(orderData, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 محاولة إنشاء شحنة (${attempt}/${maxRetries}) للطلب ${orderData.orderID}`);
            const result = await createOrderInQP(orderData);
            if (result) return result;
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ فشلت المحاولة ${attempt}: ${error.message}`);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }
    throw new Error(`فشل إنشاء الشحنة بعد ${maxRetries} محاولات: ${lastError?.message || 'خطأ غير معروف'}`);
}

// =================== الاستماع للتغييرات ===================
async function listenForOrderStatusChanges() {
    startPeriodicSync(3);
    console.log("👂 تم تفعيل الاستماع لتغييرات حالة الطلبات من QP Express");
}
// =================== إلغاء طلب في QP (محلياً) ===================
async function cancelOrderInQP(orderId, serial) {
    try {
        console.log(`🗑️ محاولة إلغاء الشحنة ${serial} في QP Express...`);
        
        // ✅ محاولة إلغاء الشحنة عبر API (إذا كانت مدعومة)
        try {
            const token = await getQPToken();
            const config = await loadQPConfig();
            const response = await fetch(`${config.server_url}/integration/cancel_order`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ serial: serial })
            });
            
            if (response.ok) {
                console.log(`✅ تم إلغاء الشحنة ${serial} في QP Express`);
                await updateDoc(doc(db, "orders", orderId), {
                    qpDeleted: true,
                    qpStatus: "Cancelled",
                    qpSerial: null,
                    qpLastSync: serverTimestamp()
                });
                return { success: true, message: "تم إلغاء الشحنة في QP Express" };
            }
        } catch (apiError) {
            console.warn("⚠️ فشل إلغاء الشحنة عبر API، سيتم الإلغاء محلياً:", apiError.message);
        }
        
        // ✅ الإلغاء المحلي كحل بديل
        await updateDoc(doc(db, "orders", orderId), {
            qpDeleted: true,
            qpStatus: "Cancelled (local)",
            qpSerial: null,
            qpLastSync: serverTimestamp()
        });
        
        return { success: true, message: "تم الإلغاء محلياً (API غير متوفرة)" };
    } catch (error) {
        console.error("❌ خطأ في إلغاء الشحنة:", error);
        return { success: false, error: error.message };
    }
}

// =================== التصدير النهائي ===================
export { 
    db,
    restoreStockForOrder,
    deductStockForOrder,
    createOrderInQP,
    getOrderUpdateHistory,
    processUpdates,
    manualSyncOrders,
    startPeriodicSync,
    stopPeriodicSync,
    listenForOrderStatusChanges,
    cancelOrderInQP,
    createOrderInQPWithRetry
};