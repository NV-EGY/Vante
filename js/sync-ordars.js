// js/sync-orders.js
import { getFirestore, doc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase-config.js"; // تأكد من تصدير db من ملف الإعدادات

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

// =================== الحصول على توكن ===================
async function getQPToken() {
    const config = await loadQPConfig();
    const response = await fetch(`${config.server_url}integration/token`, {
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

// =================== إنشاء طلب في QP ===================
export async function createOrderInQP(orderData) {
    try {
        const token = await getQPToken();
        const config = await loadQPConfig();

        // تحويل بيانات الطلب من VANTÉ إلى تنسيق QP
        const payload = {
            full_name: orderData.customerName || "",
            phone: orderData.phone || "",
            address: orderData.address || "",
            total_amount: Number(orderData.finalTotal) || 0,
            notes: orderData.notes || "",
            order_date: new Date().toISOString(),
            shipment_contents: (orderData.orderDetails || []).map(item => `${item.name} (${item.size})`).join(', '),
            weight: "0.00", // يمكن تعديله حسب الحاجة
            city: orderData.city || "",
            referenceID: orderData.orderID || "" // رقم الطلب الداخلي
        };

        const response = await fetch(`${config.server_url}integration/order`, {
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
        // يمكن تخزين serial في الطلب لمزامنة الحالة لاحقاً
        await updateDoc(doc(db, "orders", orderData.id), {
            qpSerial: result.serial,
            qpStatus: result.Order_Delivery_Status || "Pending",
            qpLastSync: serverTimestamp()
        });

        console.log(`✅ تم إنشاء الطلب في QP برقم: ${result.serial}`);
        return result;
    } catch (error) {
        console.error("❌ خطأ في إنشاء الطلب:", error);
        throw error;
    }
}

// =================== جلب تحديثات الحالة ===================
export async function getOrderUpdateHistory(page = 1, pageSize = 200) {
    try {
        const token = await getQPToken();
        const config = await loadQPConfig();

        const url = `${config.server_url}integration/get_order_update_history?page=${page}&page_size=${pageSize}`;
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

// =================== معالجة التحديثات ===================
export async function processUpdates(updates) {
    if (!updates || updates.length === 0) return;

    for (const update of updates) {
        try {
            // update يحتوي على: serial, referenceID, full_name, phone, field, old_value, new_value, notes
            const { serial, referenceID, field, new_value, notes } = update;

            if (field !== "Order_Delivery_Status") continue; // نهتم فقط بتحديث الحالة

            // البحث عن الطلب في VANTÉ بواسطة referenceID (وهو orderID الخاص بنا)
            const q = query(collection(db, "orders"), where("orderID", "==", referenceID));
            const snap = await getDocs(q);
            if (snap.empty) {
                console.warn(`⚠️ لم يتم العثور على طلب بالرقم ${referenceID}`);
                continue;
            }

            const orderDoc = snap.docs[0];
            const orderId = orderDoc.id;
            const currentData = orderDoc.data();

            // تحويل حالة QP إلى حالة VANTÉ
            let newStatus = currentData.status;
            let notesToAdd = "";

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
                    newStatus = "cancelled";
                    notesToAdd = notes || "موصلش للعميل (Undelivered) - لا مصاريف شحن";
                    break;
                case "Rejected":
                    newStatus = "rejected";
                    notesToAdd = notes || "العميل رفض الطلب - يتحمل مصاريف الشحن";
                    break;
                default:
                    continue;
            }

            // تحديث الحالة والملاحظات في Firestore
            const updateData = {
                status: newStatus,
                qpStatus: new_value,
                qpLastSync: serverTimestamp()
            };

            // إضافة الملاحظات إذا وجدت
            if (notesToAdd) {
                updateData.notes = notesToAdd;
            }

            // في حالة Undelivered، يمكن إلغاء تكاليف الشحن على العميل
            if (new_value === "Undelivered") {
                // يمكننا تعيين shippingCostPaid = 0 أو تعديل finalTotal
                // لكن الأفضل أن نتركه كما هو مع ملاحظة واضحة
                // يمكن إضافة حقل shippingExempted: true
                updateData.shippingExempted = true;
            }

            await updateDoc(doc(db, "orders", orderId), updateData);

            console.log(`🔄 تم تحديث الطلب ${referenceID} إلى حالة ${newStatus} (QP: ${new_value})`);
        } catch (error) {
            console.error("❌ خطأ في معالجة تحديث:", error);
        }
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

// =================== المزامنة اليدوية ===================
export async function manualSyncOrders() {
    try {
        const pageSize = 200;
        let page = 1;
        let allUpdates = [];

        // جلب جميع التحديثات من الصفحات (يمكن تحديد تاريخ معين لتقليل الحجم)
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

        // تصفية التحديثات التي تحتوي على field === "Order_Delivery_Status"
        const statusUpdates = allUpdates.filter(u => u.field === "Order_Delivery_Status");
        if (statusUpdates.length === 0) {
            console.log("ℹ️ لا توجد تحديثات حالة جديدة");
            return { syncedCount: 0, notesAddedCount: 0 };
        }

        // معالجة التحديثات
        await processUpdates(statusUpdates);

        console.log(`✅ تمت مزامنة ${statusUpdates.length} طلب مع QP Express`);
        return {
            syncedCount: statusUpdates.length,
            notesAddedCount: 0 // يمكننا حساب عدد الملاحظات المضافة
        };
    } catch (error) {
        console.error("❌ فشل المزامنة اليدوية:", error);
        return { error: error.message };
    }
}

// دالة للاستماع المستمر (استدعاء startPeriodicSync من الخارج)
export async function listenForOrderStatusChanges() {
    // بدء المزامنة التلقائية
    startPeriodicSync(3);
    console.log("👂 تم تفعيل الاستماع لتغييرات حالة الطلبات من QP Express");
}