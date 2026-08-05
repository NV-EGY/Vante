const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ✅ إعدادات Firebase الخاصة بك
const firebaseConfig = {
    apiKey: "AIzaSyCotT8EP2uy_HsgHknxeGBorKoEUORPtmU",
    authDomain: "vante-orders.firebaseapp.com",
    projectId: "vante-orders",
    storageBucket: "vante-orders.firebasestorage.app",
    messagingSenderId: "842319700646",
    appId: "1:842319700646:web:f6afd78ef7038c3be4ca67",
    measurementId: "G-56ZC1RW0T7"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function generatePages() {
  // ✅ جلب جميع المنتجات من Firestore
  const snapshot = await db.collection('products').get();
  
  // تأكد من وجود مجلد _products
  if (!fs.existsSync('./_products')) {
    fs.mkdirSync('./_products');
  }

  // ✅ حذف الملفات القديمة لضمان عدم بقاء منتجات محذوفة
  const oldFiles = fs.readdirSync('./_products');
  oldFiles.forEach(file => fs.unlinkSync(`./_products/${file}`));

  snapshot.forEach(doc => {
    const product = doc.data();
    const id = doc.id;
    
    // ✅ توليد ملف HTML تلقائياً
    const html = `
<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <meta property="og:image" content="${product.image || 'https://Vante.sbs/images/preview.jpg'}">
    <meta property="og:title" content="VANTÉ - ${product.name}">
    <meta property="og:description" content="${(product.description || 'منتج فاخر من VANTÉ').replace(/"/g, '&quot;')}">
    <meta property="og:url" content="https://Vante.sbs/Product.html?id=${id}">
    <title>VANTÉ - ${product.name}</title>
    <meta http-equiv="refresh" content="0; url=https://Vante.sbs/Product.html?id=${id}">
</head>
<body></body>
</html>
    `;

    fs.writeFileSync(`./_products/${id}.html`, html);
    console.log(`✅ تم توليد صفحة المنتج: ${id}.html`);
  });
}

generatePages().catch(console.error);