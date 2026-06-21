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

function listenForOrderStatusChanges() {
    // الاستماع للطلبات التي تغيرت حالتها إلى "shipped" أو "processing"
    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, where("status", "in", ["shipped", "processing", "delivered"]));

    onSnapshot(q, async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "modified") {
                const order = { id: change.doc.id, ...change.doc.data() };
                const oldOrder = change.doc.data(); // لا يوجد old data في onSnapshot مباشرة
                
                // نتحقق مما إذا كانت الحالة قد تغيرت
                try {
                    // جلب البيانات القديمة من مستند آخر (نستخدم حل مؤقت)
                    // أو نعتمد على حقل lastSync لتجنب التكرار
                    if (order.status === "shipped" && !order.qp_synced) {
                        console.log(`🔄 مزامنة الطلب ${order.orderID} إلى QP Express...`);
                        
                        // تحديث الحالة في QP Express
                        const result = await updateOrderStatusInQP(order.id, order.status, 
                            `تم شحن الطلب من VANTÉ - ${new Date().toLocaleString()}`
                        );
                        
                        // تحديث حالة المزامنة في Firestore
                        await updateDoc(doc(db, "orders", order.id), {
                            qp_synced: true,
                            qp_last_sync: serverTimestamp(),
                            qp_status: mapStatusToQP(order.status)
                        });
                        
                        console.log(`✅ تم مزامنة الطلب ${order.orderID} بنجاح`);
                    }
                } catch (error) {
                    console.error(`❌ فشل مزامنة الطلب ${order.orderID}:`, error);
                }
            }
        });
    });
}

// ========== 2. جلب تحديثات الحالات من QP Express ==========
// يتم جلب التحديثات من QP Express بشكل دوري وتحديث الطلبات في فانتي

async function fetchAndSyncQPUpdates() {
    try {
        console.log('🔄 جلب تحديثات الحالات من QP Express...');
        const updates = await fetchQPUpdates();
        
        let syncedCount = 0;
        let notesAddedCount = 0;

        for (const qpOrder of updates) {
            // البحث عن الطلب في قاعدة بيانات فانتي باستخدام referenceID أو serial
            const orderRef = collection(db, "orders");
            let q = query(orderRef, where("referenceID", "==", qpOrder.referenceID || ''));
            let snapshot = await getDocs(q);
            
            // إذا لم يتم العثور عليه، حاول البحث بـ orderID
            if (snapshot.empty) {
                q = query(orderRef, where("orderID", "==", qpOrder.referenceID || ''));
                snapshot = await getDocs(q);
            }
            
            // إذا لم يتم العثور عليه، جرب البحث بالرقم التسلسلي
            if (snapshot.empty && qpOrder.serial) {
                q = query(orderRef, where("qp_serial", "==", qpOrder.serial));
                snapshot = await getDocs(q);
            }

            if (!snapshot.empty) {
                const docRef = snapshot.docs[0].ref;
                const currentData = snapshot.docs[0].data();
                
                const vanteStatus = mapQPStatusToVante(qpOrder.Order_Delivery_Status || qpOrder.status);
                
                // التحقق مما إذا كانت الحالة قد تغيرت
                if (currentData.status !== vanteStatus) {
                    console.log(`🔄 تحديث حالة الطلب ${qpOrder.serial}: ${currentData.status} → ${vanteStatus}`);
                    
                    // تحديث الحالة في فانتي
                    await updateDoc(docRef, {
                        status: vanteStatus,
                        qp_status: qpOrder.Order_Delivery_Status || qpOrder.status,
                        qp_last_update: serverTimestamp(),
                        qp_notes: qpOrder.StatusNote || '',
                        last_updated_at: serverTimestamp(),
                        // حفظ الملاحظات الإضافية
                        qp_order_data: qpOrder
                    });
                    
                    syncedCount++;
                    
                    // إضافة ملاحظة إلى سجل التحديثات
                    await addDoc(collection(db, "order_updates"), {
                        orderId: snapshot.docs[0].id,
                        orderID: currentData.orderID,
                        field: "status",
                        old_value: currentData.status,
                        new_value: vanteStatus,
                        source: "qp_express",
                        qp_status: qpOrder.Order_Delivery_Status || qpOrder.status,
                        qp_note: qpOrder.StatusNote || '',
                        createdAt: serverTimestamp()
                    });
                }
                
                // إضافة ملاحظات QP Express إذا كانت جديدة
                if (qpOrder.StatusNote && qpOrder.StatusNote !== currentData.qp_notes) {
                    await updateDoc(docRef, {
                        qp_notes: qpOrder.StatusNote,
                        qp_last_note: serverTimestamp()
                    });
                    notesAddedCount++;
                }
            } else {
                // الطلب غير موجود في قاعدة بيانات فانتي - ربما تم إنشاؤه مباشرة في QP
                console.log(`⚠️ الطلب ${qpOrder.serial} غير موجود في قاعدة بيانات فانتي`);
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
    getQPUpdateHistory
};
