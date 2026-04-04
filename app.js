const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let players = []; 
let gameStarted = false;
let currentPhase = "waiting"; // waiting, night, day
let timer = null;
let timeLeft = 0;

// متغيرات لتخزين قرارات الليل
let nightActions = { killed: null, saved: null };

io.on('connection', (socket) => {
    socket.on('playerJoined', (data) => {
        if (gameStarted) return socket.emit('errorMsg', "اللعبة بدأت!");
        players.push({ id: socket.id, name: data.name, role: null, isAlive: true });
        io.emit('phaseChange', { msg: `انضم ${data.name}. العدد: ${players.length}` });
        
        // بدء اللعبة يدوياً أو عند وصول عدد معين (مثلاً 4)
        if (players.length === 4 && !gameStarted) {
            startGame();
        }
    });

    // --- نظام الدردشة ---
    socket.on('sendMessage', (data) => {
        // في الليل، المافيا فقط من يمكنهم الدردشة مع بعضهم (إذا كان هناك أكثر من 1)
        const player = players.find(p => p.id === socket.id);
        if (currentPhase === "night") {
            if (player && player.role === "مافيا 👤") {
                players.filter(p => p.role === "مافيا 👤").forEach(m => {
                    io.to(m.id).emit('newMessage', { sender: `[همس المافيا] ${player.name}`, text: data.text });
                });
            }
        } else {
            io.emit('newMessage', { sender: data.sender, text: data.text });
        }
    });

    // --- قرارات الليل ---
    socket.on('nightAction', (data) => {
        const actor = players.find(p => p.id === socket.id);
        if (currentPhase !== "night" || !actor || !actor.isAlive) return;

        if (actor.role === "مافيا 👤") nightActions.killed = data.targetId;
        if (actor.role === "طبيب 🧑‍⚕️") nightActions.saved = data.targetId;
        if (actor.role === "شرطة 👮") {
            const target = players.find(p => p.id === data.targetId);
            socket.emit('newMessage', { sender: "النظام", text: `نتيجة التحقيق: ${target.name} هو ${target.role === "مافيا 👤" ? "مافيا!" : "بريء."}` });
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
    });
});

function startGame() {
    gameStarted = true;
    distributeRoles();
    startPhase("night", 60); // الليل دقيقة واحدة كما طلبت
}

function distributeRoles() {
    let roles = [];
    const mafiaCount = players.length >= 5 ? 2 : 1;
    
    for (let i = 0; i < mafiaCount; i++) roles.push("مافيا 👤");
    roles.push("طبيب 🧑‍⚕️");
    roles.push("شرطة 👮");
    while (roles.length < players.length) roles.push("مواطن 👤");

    roles = roles.sort(() => Math.random() - 0.5);
    players.forEach((p, i) => {
        p.role = roles[i];
        io.to(p.id).emit('assignRole', p.role);
    });
}

function startPhase(phase, duration) {
    currentPhase = phase;
    timeLeft = duration;
    nightActions = { killed: null, saved: null };

    io.emit('phaseChange', { 
        phase: phase, 
        msg: phase === "night" ? "حل الليل.. المافيا تختار ضحيتها" : "طلع النهار.. حان وقت النقاش والتصويت" 
    });

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            if (phase === "night") endNight();
            else startPhase("night", 60); // الانتقال لليل تلقائياً بعد النهار
        }
    }, 1000);
}

function endNight() {
    let resultMsg = "مرت الليلة بهدوء..";
    if (nightActions.killed && nightActions.killed !== nightActions.saved) {
        const victim = players.find(p => p.id === nightActions.killed);
        if (victim) {
            victim.isAlive = false;
            resultMsg = `للأسف، قُتل ${victim.name} في هذه الليلة.`;
            io.to(victim.id).emit('statusUpdate', 'dead');
        }
    }
    io.emit('newMessage', { sender: "النظام", text: resultMsg });
    startPhase("day", 360); // النهار 6 دقائق (360 ثانية)
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));
