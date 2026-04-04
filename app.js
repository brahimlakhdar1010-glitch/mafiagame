const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path'); // إضافة مكتبة المسارات

const app = express();
const server = http.createServer(app);

// تحديث إعدادات الـ Socket للسماح بالاتصالات الخارجية (CORS)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// تأمين قراءة الملفات بشكل صحيح على السيرفر
app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮", "مواطن 👤", "مواطن 👤"];
let players = []; // تغيير: جعل المصفوفة فارغة لتستقبل اللاعبين الحقيقيين

io.on('connection', (socket) => {
    console.log('لاعب جديد اتصل');

    // هذا هو الحدث الذي ينتظره زر "دخول" في ملف index.html
    socket.on('playerJoined', (data) => {
        console.log(`اللاعب ${data.name} دخل الغرفة: ${data.roomName}`);
        // هنا يتم إرسال رد للاعب لكي تختفي واجهة الدخول وتظهر اللعبة
        socket.emit('assignRole', "جاري الانتظار..."); 
    });
    
    socket.on('startGame', () => {
        let shuffledRoles = [...roles].sort(() => Math.random() - 0.5);
        io.emit('rolesDistributed', shuffledRoles);
    });
});

// تعديل هام جداً لـ Railway: إضافة '0.0.0.0'
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});

// ملاحظة: في Railway يفضل تصدير server وليس app
module.exports = server;
