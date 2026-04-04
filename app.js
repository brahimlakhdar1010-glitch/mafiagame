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
let currentPhase = "waiting"; 
let timer = null;
let timeLeft = 0;
let nightActions = { killed: null, saved: null };

io.on('connection', (socket) => {
    socket.on('playerJoined', (data) => {
        if (gameStarted) return socket.emit('errorMsg', "اللعبة بدأت بالفعل!");
        players.push({ id: socket.id, name: data.name, role: null, isAlive: true });
        io.emit('phaseChange', { msg: `انضم ${data.name}. العدد الحالي: ${players.length}` });
        
        // تبدأ اللعبة تلقائياً عند وصول 4 لاعبين (يمكنك تغيير الرقم)
        if (players.length === 4 && !gameStarted) {
            startGame();
        }
    });

    socket.on('sendMessage', (data) => {
        const player = players.find(p => p.id === socket.id);
        if (!player || !player.isAlive) return;

        if (currentPhase === "night") {
            if (player.role === "مافيا 👤") {
                players.filter(p => p.role === "مافيا 👤").forEach(m => {
                    io.to(m.id).emit('newMessage', { sender: `[همس المافيا] ${player.name}`, text: data.text });
                });
            }
        } else {
            io.emit('newMessage', { sender: player.name, text: data.text });
        }
    });

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

    socket.on('submitVote', (data) => {
        if (currentPhase === "day") {
            const target = players.find(p => p.id === data.target);
            io.emit('newMessage', { sender: "النظام", text: `تم التصويت ضد ${target.name}` });
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
    });
});

function startGame() {
    gameStarted = true;
    distributeRoles();
    startPhase("night", 60); // الليل دقيقة
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

    const alivePlayers = players.filter(p => p.isAlive).map(p => ({ id: p.id, name: p.name }));
    io.emit('phaseChange', { 
        phase: phase, 
        msg: phase === "night" ? "حل الليل.. المافيا تختار ضحيتها" : "طلع النهار.. حان وقت النقاش والتصويت",
        alivePlayers: alivePlayers
    });

    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        timeLeft--;
        io.emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(timer);
            if (phase === "night") endNight();
            else startPhase("night", 60);
        }
    }, 1000);
}

function endNight() {
    let resultMsg = "مرت الليلة بسلام..";
    if (nightActions.killed && nightActions.killed !== nightActions.saved) {
        const victim = players.find(p => p.id === nightActions.killed);
        if (victim) {
            victim.isAlive = false;
            resultMsg = `للأسف، قُتل ${victim.name} في هذه الليلة.`;
            io.to(victim.id).emit('statusUpdate', 'dead');
        }
    }
    io.emit('newMessage', { sender: "النظام", text: resultMsg });
    startPhase("day", 360); // النهار 6 دقائق
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`سيرفر المافيا يعمل على ${PORT}`));
