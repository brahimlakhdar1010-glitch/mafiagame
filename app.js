const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

// المتغيرات الأساسية للعبة
let connectedPlayers = []; 
let gameStarted = false;
let timeLeft = 60; // مهلة الدخول بالثواني (دقيقة واحدة)
let timerInterval = null;

// قائمة الأدوار الأساسية (ستتكرر المواطنين إذا زاد العدد)
const baseRoles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];

function startCountdown() {
    if (timerInterval) return; // لضمان عدم تشغيل أكثر من مؤقت

    timerInterval = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft); // إرسال الوقت المتبقي لجميع اللاعبين

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            if (connectedPlayers.length >= 3) {
                startGame();
            } else {
                io.emit('phaseChange', { msg: "لم يكتمل العدد الأدنى (3 لاعبين)، تم إعادة المؤقت." });
                timeLeft = 60;
                startCountdown();
            }
        }
    }, 1000);
}

function startGame() {
    gameStarted = true;
    
    // إنشاء قائمة أدوار تناسب عدد اللاعبين
    let gameRoles = [...baseRoles];
    while (gameRoles.length < connectedPlayers.length) {
        gameRoles.push("مواطن 👤");
    }
    
    // خلط الأدوار
    gameRoles = gameRoles.sort(() => Math.random() - 0.5);

    // توزيع الأدوار
    connectedPlayers.forEach((p, index) => {
        io.to(p.id).emit('assignRole', gameRoles[index]);
    });

    io.emit('phaseChange', { phase: "day", msg: `بدأت اللعبة بـ ${connectedPlayers.length} لاعبين!` });
}

io.on('connection', (socket) => {
    socket.on('playerJoined', (data) => {
        if (gameStarted) {
            socket.emit('errorMsg', "عذراً، اللعبة بدأت بالفعل!");
            return;
        }

        connectedPlayers.push({ id: socket.id, name: data.name });
        console.log(`لاعب جديد: ${data.name}. العدد الحالي: ${connectedPlayers.length}`);

        // ابدأ العد التنازلي عند دخول أول لاعب
        if (connectedPlayers.length === 1) {
            startCountdown();
        }

        socket.emit('assignRole', "في انتظار انضمام البقية...");
        io.emit('phaseChange', { msg: `انضم ${data.name}. اللاعبون: ${connectedPlayers.length}` });
    });

    socket.on('disconnect', () => {
        connectedPlayers = connectedPlayers.filter(p => p.id !== socket.id);
        if (connectedPlayers.length === 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timeLeft = 60;
            gameStarted = false;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
});
