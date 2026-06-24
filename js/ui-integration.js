// js/ui-integration.js
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../firebase-config.js";
import { manualSyncOrders } from "./sync-orders.js";

// إضافة معلومات QP إلى بطاقة الطلب
export function addQPInfoToOrderCard(orderElement, qpData) {
    if (!orderElement || !qpData) return;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'qp-info';
    infoDiv.style.cssText = 'margin-top: 8px; font-size: 12px; color: #555; background: #f8f9fa; padding: 6px 12px; border-radius: 8px;';
    
    let html = `<span style="font-weight:bold;">🚚 QP:</span> رقم الشحنة: ${qpData.serial || 'غير معروف'}`;
    if (qpData.StatusNote) {
        html += ` | ملاحظة: ${qpData.StatusNote}`;
    }
    if (qpData.Order_Delivery_Status) {
        html += ` | حالة QP: ${qpData.Order_Delivery_Status}`;
    }
    infoDiv.innerHTML = html;

    // إضافة بعد الـ order-summary أو في مكان مناسب
    const orderBody = orderElement.querySelector('.order-body');
    if (orderBody) {
        orderBody.appendChild(infoDiv);
    }
}

// إضافة زر مزامنة للطلب
export function addSyncButtonToOrder(orderId) {
    const card = document.querySelector(`.order-id[data-id="${orderId}"]`)?.closest('.card');
    if (!card) return;

    const actionsDiv = card.querySelector('.actions');
    if (!actionsDiv) return;

    // التحقق من وجود الزر بالفعل
    if (actionsDiv.querySelector('.sync-btn')) return;

    const syncBtn = document.createElement('button');
    syncBtn.className = 'action-btn sync-btn';
    syncBtn.style.cssText = 'background: #3498db; color: #fff; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;';
    syncBtn.innerHTML = '<i class="fas fa-sync"></i> مزامنة';
    syncBtn.onclick = async (e) => {
        e.stopPropagation();
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';
        try {
            const result = await manualSyncOrders();
            if (result.error) {
                alert(`❌ ${result.error}`);
            } else {
                alert(`✅ تمت المزامنة: ${result.syncedCount} طلب تم تحديثه`);
            }
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync"></i> مزامنة';
        }
    };

    // إضافة الزر قبل الأزرار الأخرى
    actionsDiv.prepend(syncBtn);
}