// admin-integrated.js - لوحة تحكم متكاملة مع QP Express

import { 
    listenForOrderStatusChanges, 
    startPeriodicSync, 
    manualSyncOrders,
    listenForNewOrders,
    getQPUpdateHistory 
} from './sync-orders.js';

import { createOrderInQP, updateOrderStatusInQP } from './qp-integration.js';

// ========== تهيئة لوحة التحكم ==========
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 بدء تشغيل لوحة التحكم المتكاملة...');
    
    // بدء الاستماع لتغييرات الحالات
    listenForOrderStatusChanges();
    
    // بدء الاستماع للطلبات الجديدة
    listenForNewOrders();
    
    // بدء المزامنة الدورية
    startPeriodicSync(3); // كل 3 دقائق
    
    // إضافة أزرار تحكم للمزامنة اليدوية
    addSyncControls();
    
    // عرض سجل التحديثات من QP
    displayQPUpdateHistory();
});

// ========== إضافة أزرار التحكم ==========
function addSyncControls() {
    const header = document.querySelector('.header') || document.body;
    
    const controls = document.createElement('div');
    controls.className = 'sync-controls';
    controls.style.cssText = `
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 10px 0;
        justify-content: center;
    `;
    
    controls.innerHTML = `
        <button onclick="syncNow()" style="background: #0F7B65; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; cursor: pointer; font-weight: bold;">
            <i class="fas fa-sync"></i> مزامنة الآن
        </button>
        <button onclick="viewQPHistory()" style="background: #3498db; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; cursor: pointer; font-weight: bold;">
            <i class="fas fa-history"></i> سجل تحديثات QP
        </button>
        <button onclick="syncAllOrders()" style="background: #9b59b6; color: #fff; border: none; padding: 8px 20px; border-radius: 30px; cursor: pointer; font-weight: bold;">
            <i class="fas fa-sync-alt"></i> مزامنة كل الطلبات
        </button>
    `;
    
    header.appendChild(controls);
    
    // إضافة الدوال إلى النطاق العام
    window.syncNow = async function() {
        const btn = document.querySelector('.sync-controls button:first-child');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المزامنة...';
        btn.disabled = true;
        
        try {
            const result = await manualSyncOrders();
            if (result.error) {
                alert(`❌ ${result.error}`);
            } else {
                alert(`✅ تمت المزامنة:\n- ${result.syncedCount} طلب تم تحديث حالته\n- ${result.notesAddedCount} ملاحظة جديدة`);
            }
        } catch (error) {
            alert(`❌ خطأ: ${error.message}`);
        } finally {
            btn.innerHTML = '<i class="fas fa-sync"></i> مزامنة الآن';
            btn.disabled = false;
        }
    };
    
    window.viewQPHistory = async function() {
        const fromDate = prompt('أدخل التاريخ (YYYY-MM-DD) أو اتركه فارغاً لآخر 24 ساعة:');
        try {
            const history = await getQPUpdateHistory(null, fromDate || null);
            displayHistoryModal(history);
        } catch (error) {
            alert(`❌ خطأ: ${error.message}`);
        }
    };
    
    window.syncAllOrders = async function() {
        const confirmed = confirm('⚠️ سيتم مزامنة جميع الطلبات مع QP Express. هل أنت متأكد؟');
        if (!confirmed) return;
        
        const btn = document.querySelector('.sync-controls button:last-child');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المزامنة...';
        btn.disabled = true;
        
        try {
            // جلب جميع الطلبات من Firestore
            const ordersRef = collection(db, "orders");
            const snapshot = await getDocs(ordersRef);
            
            let count = 0;
            for (const doc of snapshot.docs) {
                const order = { id: doc.id, ...doc.data() };
                if (!order.qp_serial) {
                    await createOrderInQP(order);
                    count++;
                }
            }
            
            // ثم مزامنة التحديثات
            const result = await manualSyncOrders();
            alert(`✅ تمت المزامنة:\n- ${count} طلب تم إنشاؤه في QP\n- ${result.syncedCount || 0} طلب تم تحديث حالته`);
        } catch (error) {
            alert(`❌ خطأ: ${error.message}`);
        } finally {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i> مزامنة كل الطلبات';
            btn.disabled = false;
        }
    };
}

// ========== عرض سجل التحديثات في مودال ==========
function displayHistoryModal(history) {
    if (!history || history.length === 0) {
        alert('لا توجد تحديثات في السجل');
        return;
    }
    
    let html = `
        <div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#fff; border-radius:20px; padding:25px; max-width:90%; max-height:80vh; overflow:auto; z-index:99999; box-shadow:0 25px 60px rgba(0,0,0,0.3); width:700px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0;">📋 سجل تحديثات QP Express</h3>
                <button onclick="this.closest('div[style*="position:fixed"]').remove()" style="background:#eee; border:none; font-size:24px; cursor:pointer; width:40px; height:40px; border-radius:50%;">✕</button>
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead>
                        <tr style="background:#111; color:#fff;">
                            <th style="padding:10px;">رقم الطلب</th>
                            <th style="padding:10px;">الحقل</th>
                            <th style="padding:10px;">القيمة القديمة</th>
                            <th style="padding:10px;">القيمة الجديدة</th>
                            <th style="padding:10px;">الوقت</th>
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    history.forEach(item => {
        html += `
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px; text-align:center;">${item.serial || '-'}</td>
                <td style="padding:8px; text-align:center;">${item.field || 'status'}</td>
                <td style="padding:8px; text-align:center;">${item.old_value || '-'}</td>
                <td style="padding:8px; text-align:center;">${item.new_value || '-'}</td>
                <td style="padding:8px; text-align:center; font-size:11px; color:#888;">${item.update_date || '-'}</td>
            </tr>
        `;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top:15px; text-align:center; font-size:12px; color:#888;">
                إجمالي التحديثات: ${history.length}
            </div>
        </div>
        <div style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:99998;" onclick="this.nextElementSibling?.remove(); this.remove();"></div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

// ========== دالة للحصول على Firestore ==========
import { getFirestore, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// نعيد تعريف db هنا لتجنب مشاكل التصدير
const db = getFirestore();
