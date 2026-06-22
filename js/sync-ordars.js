// sync-orders.js - مزامنة الحالات بين فانتي وQP Express
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
    getDoc, 
    getDocs,
    addDoc,
    serverTimestamp,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// تهيئة Firebase
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

// ========== 1. الاستماع لتغييرات الحالات في فانتي ==========
// عند تغيير حالة الطلب في فانتي، يتم إرسال التحديث إلى QP Express

// sync-orders.js (الجزء المعدل بالكامل لوظيفة الاستماع والمزامنة)

// ========== 1. الاستماع لتغييرات الحالات في فانتي (معدلة) ==========
function listenForOrderStatusChanges() {
    // الاستماع لجميع الطلبات، وليس فقط حالات معينة
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef);

    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type === "modified") {
                const newOrder = { id: change.doc.id, ...change.doc.data() };
                // نستخدم حقل qp_last_status لتجنب التكرار والحلقات اللانهائية
                if (newOrder.status === newOrder.qp_last_status) continue;

                console.log(`🔄 تغيرت حالة الطلب ${newOrder.orderID} إلى ${newOrder.status}`);

                try {
                    // 1. إذا كانت الحالة "shipped" ولم يتم إنشاؤه في QP بعد، ننشئه أولاً
                    if (newOrder.status === 'shipped' && !newOrder.qp_serial) {
                        console.log(`📦 إنشاء طلب ${newOrder.orderID} في QP Express...`);
                        const createResult = await createOrderInQP(newOrder);
                        // حفظ الرقم التسلسلي
                        await updateDoc(doc(db, "orders", newOrder.id), {
                            qp_serial: createResult.serial,
                            qp_created: serverTimestamp()
                        });
                        // نعيد تعيين newOrder.qp_serial بعد الحفظ
                        newOrder.qp_serial = createResult.serial;
                    }

                    // 2. تحديث الحالة في QP Express (إذا كان لدينا qp_serial)
                    if (newOrder.qp_serial) {
                        // تحويل الحالة
                        const qpStatus = mapStatusToQP(newOrder.status);
                        // ملاحظة افتراضية
                        let note = `تحديث من VANTÉ: ${newOrder.status}`;

                        // إضافة ملاحظات خاصة للحالات التي تتطلب توضيح مصاريف
                        if (newOrder.status === 'undelivered') {
                            note = `لم يصل للعميل - لا توجد مصاريف شحن على العميل. ملاحظة QP: ${newOrder.qp_notes || ''}`;
                        } else if (newOrder.status === 'rejected') {
                            note = `رفض العميل الاستلام - مصاريف الشحن واجبة على المتجر. ملاحظة QP: ${newOrder.qp_notes || ''}`;
                        }

                        console.log(`🔄 مزامنة الطلب ${newOrder.orderID} إلى QP Express (${qpStatus})...`);
                        await updateOrderStatusInQP(newOrder.id, newOrder.status, note);

                        // تحديث حالة المزامنة في Firestore
                        await updateDoc(doc(db, "orders", newOrder.id), {
                            qp_synced: true,
                            qp_last_sync: serverTimestamp(),
                            qp_status: qpStatus,
                            qp_last_status: newOrder.status, // حفظ الحالة لمنع التكرار
                            qp_notes: note
                        });
                    }
                } catch (error) {
                    console.error(`❌ فشل مزامنة الطلب ${newOrder.orderID}:`, error);
                }
            }
        }
    });
}

// ========== 2. جلب تحديثات QP Express (معدلة لإضافة الملاحظات) ==========
async function fetchAndSyncQPUpdates() {
    try {
        console.log('🔄 جلب تحديثات الحالات من QP Express...');
        const updates = await fetchQPUpdates(); // ترجع قائمة الطلبات من QP
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

            if (!snapshot.empty) {
                const docRef = snapshot.docs[0].ref;
                const currentData = snapshot.docs[0].data();
                // داخل sync-orders.js (داخل حلقة for ... of updates)
const qpStatus = qpOrder.Order_Delivery_Status || qpOrder.status;
let vanteStatus = mapQPStatusToVante(qpStatus);
let finalNote = qpOrder.StatusNote || ''; // ✅ عرف finalNote هنا أولاً

// ✅ إضافة منطق المرتجع
if (qpOrder.has_return === true || qpOrder.has_return === "true") {
    vanteStatus = 'returned';
    finalNote = `↩️ مرتجع (عدد القطع: ${qpOrder.return_count || 0}). ${finalNote}`;
}
                // ➕ إضافة ملاحظات توضيحية حسب الحالة (مصاريف الشحن)
                if (qpStatus === 'Undelivered') {
                    finalNote = `🚫 لم يصل للعميل - لا توجد مصاريف شحن. ${finalNote}`;
                } else if (qpStatus === 'Rejected') {
                    finalNote = `🚫 رفض العميل الاستلام - مصاريف الشحن واجبة. ${finalNote}`;
                }

                // تحديث الحالة في فانتي إذا كانت مختلفة
                if (currentData.status !== vanteStatus) {
                    console.log(`🔄 تحديث حالة الطلب ${qpOrder.serial}: ${currentData.status} → ${vanteStatus}`);
                    await updateDoc(docRef, {
                        status: vanteStatus,
                        qp_status: qpStatus,
                        qp_last_update: serverTimestamp(),
                        qp_notes: finalNote,
                        qp_last_status: vanteStatus, // حفظ لمنع التكرار
                        last_updated_at: serverTimestamp(),
                        qp_order_data: qpOrder
                    });
                    syncedCount++;

                    // تسجيل في سجل التحديثات
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

                // إذا كانت الملاحظة جديدة
                if (finalNote && finalNote !== currentData.qp_notes) {
                    await updateDoc(docRef, { qp_notes: finalNote, qp_last_note: serverTimestamp() });
                    notesAddedCount++;
                }
            }
        }

        console.log(`✅ تمت المزامنة: ${syncedCount} طلب تم تحديث حالته، ${notesAddedCount} ملاحظة جديدة`);
        return { syncedCount, notesAddedCount };
    } catch (error) {
        console.error('❌ خطأ في مزامنة تحديثات QP:', error);
        return { error: error.message };
    }
}

// ========== 3. مزامنة دورية كل 5 دقائق ==========
function startPeriodicSync(intervalMinutes = 5) {
    // المزامنة الفورية عند بدء التشغيل
    setTimeout(async () => {
        await fetchAndSyncQPUpdates();
    }, 3000); // انتظار 3 ثواني لتحميل البيانات

    // المزامنة الدورية
    setInterval(async () => {
        await fetchAndSyncQPUpdates();
    }, intervalMinutes * 60 * 1000);

    console.log(`⏰ تم بدء المزامنة الدورية كل ${intervalMinutes} دقائق`);
}

// ========== 4. دالة مزامنة يدوية ==========
async function manualSyncOrders(fromDate = null) {
    console.log('🔄 بدء المزامنة اليدوية...');
    const result = await fetchAndSyncQPUpdates();
    return result;
}

// ========== 5. دالة إنشاء طلب في QP Express عند الإنشاء في فانتي ==========
async function createOrderInQPWhenNew(orderData) {
    try {
        if (!orderData.qp_serial) {
            console.log(`📦 إنشاء طلب ${orderData.orderID} في QP Express...`);
            const result = await createOrderInQP(orderData);
            
            // حفظ الرقم التسلسلي من QP
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

// الاستماع للطلبات الجديدة لإنشائها في QP Express تلقائياً
function listenForNewOrders() {
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, orderBy("createdAt", "desc"), limit(5));

    onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type === "added") {
                const order = { id: change.doc.id, ...change.doc.data() };
                // تأخير بسيط للتأكد من اكتمال البيانات
                setTimeout(async () => {
                    await createOrderInQPWhenNew(order);
                }, 2000);
            }
        }
    });
}

// ========== 6. دالة جلب سجل التحديثات من QP ==========
async function getQPUpdateHistory(orderId = null, fromDate = null) {
    try {
        const history = await fetchQPUpdateHistory(fromDate);
        return history.results || [];
    } catch (error) {
        console.error('خطأ في جلب سجل التحديثات:', error);
        return [];
    }
}

// ========== تصدير الدوال ==========
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
