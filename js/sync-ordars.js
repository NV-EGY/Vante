// ============================================================
// sync-orders.js - المزامنة التلقائية بين VANTÉ و QP Express
// الإصدار: 2.0 (محسّن، معالجة أخطاء متقدمة، جاهز للإنتاج)
// ============================================================

// ========== الاستيرادات ==========
import {
    getQPToken,
    createOrderInQP,
    updateOrderStatusInQP,
    fetchQPUpdates,
    fetchQPUpdateHistory,
    mapStatusToQP,
    mapQPStatusToVante
} from './qp-integration.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    query,
    where,
    onSnapshot,
    updateDoc,
    doc,
    getDocs,
    addDoc,
    serverTimestamp,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ========== تهيئة Firebase ==========
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

// ========== الثوابت والإعدادات ==========
const SYNC_INTERVAL_MINUTES = 3; // الفترة بين كل مزامنة دورية
const MAX_RETRY_ATTEMPTS = 3;    // عدد محاولات إعادة المحاولة في حالة الفشل

// ========== 1. الاستماع لتغييرات الحالات في فانتي ==========

/**
 * تراقب التغييرات في حالة الطلبات داخل فانتي،
 * وعند تغيير الحالة إلى 'shipped' تقوم بإنشاء الطلب في QP Express،
 * وباقي الحالات تُحدَّث في QP عبر PATCH.
 */
function listenForOrderStatusChanges() {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef);

    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            // نتعامل فقط مع التعديلات (modified)
            if (change.type !== "modified") continue;

            const newOrder = { id: change.doc.id, ...change.doc.data() };

            // منع التكرار: إذا كانت الحالة الحالية هي نفس آخر حالة تمت مزامنتها
            if (newOrder.status === newOrder.qp_last_status) continue;

            console.log(`🔄 تغيرت حالة الطلب ${newOrder.orderID} إلى ${newOrder.status}`);

            try {
                // ----- الحالة: 'shipped' والطلب غير مسجل في QP بعد -----
                if (newOrder.status === 'shipped' && !newOrder.qp_serial) {
                    console.log(`📦 إنشاء طلب ${newOrder.orderID} في QP Express...`);
                    const createResult = await createOrderInQP(newOrder);
                    
                    // حفظ رقم التسلسلي وتحديث حالة المزامنة
                    await updateDoc(doc(db, "orders", newOrder.id), {
                        qp_serial: createResult.serial,
                        qp_created: serverTimestamp(),
                        qp_status: 'Pending',
                        qp_last_status: newOrder.status // منع التكرار
                    });
                    
                    console.log(`✅ تم إنشاء الطلب ${newOrder.orderID} برقم ${createResult.serial}`);
                    continue; // ننهي معالجة هذا التغيير، لأن التحديث سيتم لاحقاً
                }

                // ----- تحديث الحالة في QP Express (إذا كان الطلب مسجلاً) -----
                if (newOrder.qp_serial) {
                    const qpStatus = mapStatusToQP(newOrder.status);
                    let note = `تحديث من VANTÉ: ${newOrder.status}`;

                    // ملاحظات خاصة حسب الحالة
                    if (newOrder.status === 'undelivered') {
                        note = `لم يصل للعميل - لا توجد مصاريف شحن على العميل. ملاحظة QP: ${newOrder.qp_notes || ''}`;
                    } else if (newOrder.status === 'rejected') {
                        note = `رفض العميل الاستلام - مصاريف الشحن واجبة على المتجر. ملاحظة QP: ${newOrder.qp_notes || ''}`;
                    }

                    console.log(`🔄 مزامنة الطلب ${newOrder.orderID} إلى QP Express (${qpStatus})...`);
                    
                    // محاولة التحديث مع إعادة المحاولة في حال الفشل
                    await withRetry(async () => {
                        await updateOrderStatusInQP(newOrder.id, newOrder.status, note);
                    }, MAX_RETRY_ATTEMPTS);

                    // تحديث حالة المزامنة في Firestore
                    await updateDoc(doc(db, "orders", newOrder.id), {
                        qp_synced: true,
                        qp_last_sync: serverTimestamp(),
                        qp_status: qpStatus,
                        qp_last_status: newOrder.status,
                        qp_notes: note
                    });
                }
            } catch (error) {
                console.error(`❌ فشل مزامنة الطلب ${newOrder.orderID}:`, error);
                // يمكن إضافة منطق لتسجيل الخطأ في قاعدة البيانات أو إشعار المسؤول
            }
        }
    });
}

// ========== 2. جلب تحديثات QP Express وتطبيقها على فانتي ==========

/**
 * تجلب قائمة الطلبات المحدثة من QP Express وتزامن الحالات والملاحظات مع فانتي.
 * تعالج حالات Undelivered, Rejected, Returned مع ملاحظات توضيحية.
 */
async function fetchAndSyncQPUpdates() {
    try {
        console.log('🔄 جلب تحديثات الحالات من QP Express...');
        const updates = await fetchQPUpdates(); // ترجع مصفوفة من الطلبات
        let syncedCount = 0;
        let notesAddedCount = 0;

        for (const qpOrder of updates) {
            // البحث عن الطلب في فانتي باستخدام referenceID أو orderID أو qp_serial
            const orderRef = collection(db, "orders");
            let q = query(orderRef, where("referenceID", "==", qpOrder.referenceID || ''));
            let snapshot = await getDocs(q);

            if (snapshot.empty) {
                q = query(orderRef, where("orderID", "==", qpOrder.referenceID || ''));
                snapshot = await getDocs(q);
            }
            if (snapshot.empty && qpOrder.serial) {
                q = query(orderRef, where("qp_serial", "==", qpOrder.serial));
                snapshot = await getDocs(q);
            }

            if (snapshot.empty) continue; // لم نجد الطلب في فانتي

            const docRef = snapshot.docs[0].ref;
            const currentData = snapshot.docs[0].data();
            
            // استخراج الحالة من QP
            const qpStatus = qpOrder.Order_Delivery_Status || qpOrder.status || 'Pending';
            let vanteStatus = mapQPStatusToVante(qpStatus);
            let finalNote = qpOrder.StatusNote || '';

            // ========== معالجة المرتجع (has_return) ==========
            if (qpOrder.has_return === true || qpOrder.has_return === "true") {
                vanteStatus = 'returned';
                finalNote = `↩️ مرتجع (عدد القطع: ${qpOrder.return_count || 0}). ${finalNote}`;
            }

            // ========== إضافة ملاحظات خاصة للحالات ==========
            if (qpStatus === 'Undelivered') {
                finalNote = `🚫 لم يصل للعميل - لا توجد مصاريف شحن على العميل. ملاحظة QP: ${finalNote}`;
            } else if (qpStatus === 'Rejected') {
                finalNote = `🚫 رفض العميل الاستلام - مصاريف الشحن واجبة (على المتجر أو العميل حسب الاتفاق). ملاحظة QP: ${finalNote}`;
            }

            // ========== تحديث الحالة في فانتي إذا كانت مختلفة ==========
            if (currentData.status !== vanteStatus) {
                console.log(`🔄 تحديث حالة الطلب ${qpOrder.serial}: ${currentData.status} → ${vanteStatus}`);
                await updateDoc(docRef, {
                    status: vanteStatus,
                    qp_status: qpStatus,
                    qp_last_update: serverTimestamp(),
                    qp_notes: finalNote,
                    qp_last_status: vanteStatus, // منع التكرار
                    last_updated_at: serverTimestamp(),
                    qp_order_data: qpOrder // حفظ البيانات الكاملة من QP للرجوع إليها
                });
                syncedCount++;

                // تسجيل في سجل التحديثات (للتدقيق)
                await addDoc(collection(db, "order_updates"), {
                    orderId: snapshot.docs[0].id,
                    orderID: currentData.orderID,
                    field: "status",
                    old_value: currentData.status,
                    new_value: vanteStatus,
                    source: "qp_express",
                    qp_note: finalNote,
                    createdAt: serverTimestamp()
                });
            }

            // ========== تحديث الملاحظة إذا كانت جديدة ==========
            if (finalNote && finalNote !== currentData.qp_notes) {
                await updateDoc(docRef, {
                    qp_notes: finalNote,
                    qp_last_note: serverTimestamp()
                });
                notesAddedCount++;
            }
        }

        console.log(`✅ تمت المزامنة: ${syncedCount} طلب تم تحديث حالته، ${notesAddedCount} ملاحظة جديدة`);
        return { syncedCount, notesAddedCount };

    } catch (error) {
        console.error('❌ خطأ في مزامنة تحديثات QP:', error);
        return { error: error.message };
    }
}

// ========== 3. المزامنة الدورية ==========

/**
 * تبدأ المزامنة الدورية مع QP Express كل عدد محدد من الدقائق.
 * كما تقوم بمزامنة فورية بعد 3 ثوانٍ من بدء التشغيل.
 */
function startPeriodicSync(intervalMinutes = SYNC_INTERVAL_MINUTES) {
    // مزامنة فورية بعد تحميل البيانات الأولية
    setTimeout(async () => {
        await fetchAndSyncQPUpdates();
    }, 3000);

    // المزامنة الدورية
    setInterval(async () => {
        await fetchAndSyncQPUpdates();
    }, intervalMinutes * 60 * 1000);

    console.log(`⏰ تم بدء المزامنة الدورية كل ${intervalMinutes} دقائق`);
}

// ========== 4. المزامنة اليدوية (للاختبار أو التدخل) ==========

/**
 * دالة للمزامنة اليدوية، يمكن استدعاؤها من لوحة التحكم.
 */
async function manualSyncOrders() {
    console.log('🔄 بدء المزامنة اليدوية...');
    const result = await fetchAndSyncQPUpdates();
    return result;
}

// ========== 5. إنشاء طلب في QP عند إنشائه في فانتي ==========

/**
 * تقوم بإنشاء الطلب في QP Express إذا كان جديداً ولم يُنشأ بعد.
 * تُستدعى من مستمع الطلبات الجديدة.
 */
async function createOrderInQPWhenNew(orderData) {
    try {
        if (!orderData.qp_serial) {
            console.log(`📦 إنشاء طلب ${orderData.orderID} في QP Express...`);
            const result = await createOrderInQP(orderData);
            
            await updateDoc(doc(db, "orders", orderData.id), {
                qp_serial: result.serial,
                qp_created: serverTimestamp(),
                qp_status: 'Pending'
            });
            
            console.log(`✅ تم إنشاء الطلب ${orderData.orderID} في QP Express برقم ${result.serial}`);
            return result;
        }
        return null;
    } catch (error) {
        console.error(`❌ فشل إنشاء الطلب ${orderData.orderID} في QP:`, error);
        return null;
    }
}

/**
 * تستمع للطلبات الجديدة في فانتي (عند إضافة طلب جديد) لإنشائه في QP تلقائياً.
 */
function listenForNewOrders() {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, orderBy("createdAt", "desc"), limit(5));

    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type === "added") {
                const order = { id: change.doc.id, ...change.doc.data() };
                // تأخير بسيط للتأكد من اكتمال جميع بيانات الطلب
                setTimeout(async () => {
                    await createOrderInQPWhenNew(order);
                }, 2000);
            }
        }
    });
}

// ========== 6. جلب سجل التحديثات من QP ==========

/**
 * جلب سجل التحديثات من QP Express بناءً على التاريخ.
 * يُستخدم في لوحة التحكم لعرض التغييرات.
 */
async function getQPUpdateHistory(fromDate = null) {
    try {
        const history = await fetchQPUpdateHistory(fromDate);
        return history.results || [];
    } catch (error) {
        console.error('خطأ في جلب سجل التحديثات:', error);
        return [];
    }
}

// ========== دالة مساعدة: إعادة المحاولة التلقائية ==========

/**
 * تنفذ دالة مع إعادة المحاولة في حال فشلت.
 */
async function withRetry(fn, maxAttempts = 3, delay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.warn(`⚠️ محاولة ${attempt}/${maxAttempts} فشلت: ${error.message}`);
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }
    throw lastError;
}

// ========== التصدير ==========
export {
    listenForOrderStatusChanges,
    fetchAndSyncQPUpdates,
    startPeriodicSync,
    manualSyncOrders,
    createOrderInQPWhenNew,
    listenForNewOrders,
    getQPUpdateHistory,
    db
};