const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ room, name, password }) => {
        if (!rooms[room]) {
            rooms[room] = { 
                players: [], phase: "waiting", password: password || null, 
                votes: {}, nightActions: { killed: null, saved: null }, 
                timerStarted: false, timerInterval: null 
            };
        }
        const rd = rooms[room];
        if (rd.password && rd.password !== password) return socket.emit('newMessage', { sender: "النظام", text: "كلمة السر خطأ!" });
        
        socket.join(room);
        let isSpectator = rd.phase !== "waiting";
        rd.players.push({ id: socket.id, name, isAlive: !isSpectator, role: null, isSpectator: isSpectator });
        
        io.to(room).emit('updatePlayers', rd.players);
        if (rd.players.length >= 4 && !rd.timerStarted && rd.phase === "waiting") startWaitingTimer(room);
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd && rd.phase === "day") {
            const voter = rd.players.find(p => p.id === socket.id);
            const target = rd.players.find(p => p.id === targetId);
            if (voter?.isAlive && !voter.isSpectator && target?.isAlive) {
                rd.votes[socket.id] = targetId;
                io.to(room).emit('newMessage', { sender: "النظام", text: `📢 ${voter.name} صوّت ضد ${target.name}` });
            }
        }
    });

    socket.on('nightAction', ({ room, targetId, type }) => {
        const rd = rooms[room];
        if (rd?.phase !== "night") return;
        const actor = rd.players.find(p => p.id === socket.id);
        if (!actor?.isAlive) return;

        if (type === "kill" && actor.role.includes("مافيا")) rd.nightActions.killed = targetId;
        if (type === "save" && actor.role.includes("طبيب")) rd.nightActions.saved = targetId; // يسمح بحماية أي لاعب (بما فيهم نفسه)
        if (type === "check" && actor.role.includes("شرطة")) {
            const target = rd.players.find(p => p.id === targetId);
            socket.emit('newMessage', { sender: "النظام", text: `🔍 نتيجة التحقيق: ${target.name} هو ${target?.role?.includes("مافيا") ? "مافيا 🕵️" : "مواطن ✅"}` });
        }
    });

    socket.on('sendMessage', ({ room, text }) => {
        const rd = rooms[room];
        const player = rd?.players.find(p => p.id === socket.id);
        if (player) io.to(room).emit('newMessage', { sender: player.name, text });
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            let rd = rooms[r];
            const idx = rd.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                rd.players.splice(idx, 1);
                io.to(r).emit('updatePlayers', rd.players);
                break;
            }
        }
    });
});

// باقي الدوال (startWaitingTimer, startGame, startPhase, endNight, endDay, checkGameOver) تبقى كما هي في الكود المستقر الأخير
function startWaitingTimer(room) {
    const rd = rooms[room];
    rd.timerStarted = true;
    let timeLeft = 30;
    rd.timerInterval = setInterval(() => {
        io.to(room).emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(rd.timerInterval);
            startGame(room);
        }
        timeLeft--;
    }, 1000);
}

function startGame(room) {
    const rd = rooms[room];
    let players = rd.players.filter(p => !p.isSpectator);
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];
    if (players.length >= 6) roles.push("مافيا 👤");
    while (roles.length < players.length) roles.push("مواطن 👤");
    roles = roles.sort(() => Math.random() - 0.5);

    players.forEach((p, i) => {
        p.role = roles[i];
        p.isAlive = true;
        io.to(p.id).emit('assignRole', p.role);
    });
    startPhase(room, "night");
}

function startPhase(room, phase) {
    const rd = rooms[room];
    if (!rd) return;
    rd.phase = phase;
    rd.votes = {};
    let timeLeft = phase === "night" ? 45 : 120;

    io.to(room).emit('phaseChange', { phase, msg: phase === "night" ? "الليل: المافيا تخطط." : "النهار: وقت النقاش." });

    rd.players.forEach(p => {
        let canTalk = p.isAlive && (phase === "day" || p.role?.includes("مافيا"));
        io.to(p.id).emit('audioControl', { allowedBySystem: canTalk });
    });

    setTimeout(() => {
        rd.players.forEach(p => {
            if (p.isAlive) io.to(room).emit('user-connected', p.id);
        });
    }, 1000);

    clearInterval(rd.timerInterval);
    rd.timerInterval = setInterval(() => {
        io.to(room).emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(rd.timerInterval);
            phase === "night" ? endNight(room) : endDay(room);
        }
        timeLeft--;
    }, 1000);
}

function endNight(room) {
    const rd = rooms[room];
    const { killed, saved } = rd.nightActions;
    if (killed && killed !== saved) {
        const p = rd.players.find(x => x.id === killed);
        if (p) { p.isAlive = false; p.isSpectator = true; io.to(room).emit('newMessage', { sender: "النظام", text: `💀 مات ${p.name} الليلة.` }); }
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "🌅 مر الليل بسلام." });
    }
    rd.nightActions = { killed: null, saved: null };
    checkGameOver(room) || startPhase(room, "day");
}

function endDay(room) {
    const rd = rooms[room];
    let counts = {};
    Object.values(rd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    let victim = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null);
    if (victim) {
        const p = rd.players.find(x => x.id === victim);
        if (p) { p.isAlive = false; p.isSpectator = true; io.to(room).emit('newMessage', { sender: "النظام", text: `⚖️ تم إعدام ${p.name}.` }); }
    }
    checkGameOver(room) || startPhase(room, "night");
}

function checkGameOver(room) {
    const rd = rooms[room];
    const mafia = rd.players.filter(p => p.isAlive && p.role.includes("مافيا")).length;
    const citizens = rd.players.filter(p => p.isAlive && !p.role.includes("مافيا")).length;
    if (mafia === 0) { io.to(room).emit('newMessage', { sender: "النظام", text: "🏆 فاز المواطنون!" }); return true; }
    if (mafia >= citizens) { io.to(room).emit('newMessage', { sender: "النظام", text: "😈 فازت المافيا!" }); return true; }
    return false;
}

server.listen(process.env.PORT || 3000);
