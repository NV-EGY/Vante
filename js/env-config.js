// env-config.js - إعدادات البيئة

// إعدادات QP Express
const QP_CONFIG = {
    // محطة الإنتاج
    PRODUCTION: {
        API_BASE: 'https://qpxpress.com:8001/integration',
        PORTAL_URL: 'https://qpxpress.com',
        USERNAME: 'VNT@QPX', // استبدل بالبيانات الحقيقية
        PASSWORD: '80977701' // استبدل بالبيانات الحقيقية
    },
    
    // محطة الاختبار (إذا كانت متوفرة)
    // STAGING: {
    //     API_BASE: 'https://staging.qpxpress.com:8001/integration',
    //     PORTAL_URL: 'https://staging.qpxpress.com',
    //     USERNAME: 'test_username',
    //     PASSWORD: 'test_password'
    // }
};

// الحصول على الإعدادات حسب البيئة
function getQPConfig(env = 'PRODUCTION') {
    return QP_CONFIG[env] || QP_CONFIG.PRODUCTION;
}

// تصدير الإعدادات
export { QP_CONFIG, getQPConfig };
