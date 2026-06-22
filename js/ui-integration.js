import { db } from './sync-orders.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateOrderStatusInQP } from './qp-integration.js';
function addQPInfoToOrderCard(orderId, orderData) {
    const orderElement = document.querySelector(`.order-id[data-id="${orderId}"]`)?.closest('.card');
    if (!orderElement) return;
    
    // إضافة معلومات QP
    const qpInfo = document.createElement('div');
    qpInfo.className = 'qp-info';
    qpInfo.style.cssText = `
        background: #f0f7ff;
        border-radius: 12px;
        padding: 8px 12px;
        margin-top: 8px;
        font-size: 12px;
        border-right: 3px solid #0F7B65;
        direction: rtl;
    `;
    
    qpInfo.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px;">
            <span><i class="fas fa-truck" style="color:#0F7B65;"></i> 
                <strong>QP Express:</strong> 
                ${orderData.qp_serial ? `#${orderData.qp_serial}` : 'غير مسجل'}
            </span>
            <span style="font-size:11px; color:#666;">
                ${orderData.qp_status ? `الحالة: ${orderData.qp_status}` : ''}
            </span>
        </div>
        ${orderData.qp_notes ? `<div style="margin-top:5px; font-size:11px; color:#555; border-top:1px dashed #ddd; padding-top:5px;">
            <i class="fas fa-sticky-note" style="color:#f39c12;"></i> ${orderData.qp_notes}
        </div>` : ''}
        <div style="margin-top:5px; font-size:10px; color:#999; text-align:left;">
            ${orderData.qp_last_update ? `آخر تحديث: ${new Date(orderData.qp_last_update?.toDate?.() || Date.now()).toLocaleString('ar-EG')}` : ''}
        </div>
    `;
    
    // إدراج قبل الأزرار
    const actions = orderElement.querySelector('.actions');
    if (actions) {
        orderElement.insertBefore(qpInfo, actions);
    } else {
        orderElement.appendChild(qpInfo);
    }
}

/**
 * إضافة زر مزامنة يدوية لكل طلب
 */
function addSyncButtonToOrder(orderId) {
    const orderElement = document.querySelector(`.order-id[data-id="${orderId}"]`)?.closest('.card');
    if (!orderElement) return;
    
    const actions = orderElement.querySelector('.actions');
    if (!actions) return;
    
    const syncBtn = document.createElement('button');
    syncBtn.className = 'action-btn';
    syncBtn.style.cssText = `
        background: #0F7B65;
        color: #fff;
        border: none;
        padding: 4px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 11px;
    `;
    syncBtn.innerHTML = '<i class="fas fa-sync"></i> مزامنة';
    syncBtn.onclick = async function(e) {
        e.stopPropagation();
        const btn = this;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
        
        try {
            const orderData = await getOrderFromDB(orderId);
            if (orderData) {
                await updateOrderStatusInQP(orderId, orderData.status);
                alert('✅ تم مزامنة الطلب بنجاح');
            }
        } catch (error) {
            alert(`❌ خطأ: ${error.message}`);
        } finally {
            btn.innerHTML = '<i class="fas fa-sync"></i> مزامنة';
            btn.disabled = false;
        }
    };
    
    // إضافة الزر بعد أزرار الإجراءات الحالية
    actions.appendChild(syncBtn);
}

/**
 * جلب بيانات الطلب من Firestore
 */
async function getOrderFromDB(orderId) {
    const docRef = doc(db, "orders", orderId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
}

// تصدير الدوال
export { addQPInfoToOrderCard, addSyncButtonToOrder, getOrderFromDB };
