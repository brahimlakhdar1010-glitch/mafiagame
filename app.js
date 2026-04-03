const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname)); // لتشغيل ملف index.html

// مصفوفة اللاعبين والأدوار من كودك
const roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮", "مواطن 👤", "مواطن 👤"];
let players = ["عمر", "سارة", "ياسين", "أمين", "لخضر"];

io.on('connection', (socket) => {
    console.log('لاعب جديد اتصل');
    
    socket.on('startGame', () => {
        let shuffledRoles = roles.sort(() => Math.random() - 0.5);
        io.emit('rolesDistributed', shuffledRoles); // إرسال الأدوار للجميع
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});