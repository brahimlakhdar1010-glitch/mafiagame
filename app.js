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

        // يبدأ العد التنازلي إذا وصل العدد لـ 4 لاعبين
        if (rd.players.length >= 4 && !rd.timerStarted && rd.phase === "waiting") startWaitingTimer(room);
    });

    socket.on('signal', (data) => {
        const rd = Object.values(rooms).find(r => r.players.some(p => p.id === socket.id));
        if (!rd) return;
        const sender = rd.players.find(p => p.id === socket.id);
        const receiver = rd.players.find(p => p.id === data.to);

        if (rd.phase === "night") {
            // عزل صوتي: المافيا يسمعون بعضهم فقط في الليل
            if (sender.role?.includes("مافيا") && receiver.role?.includes("مافيا")) {
                io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
            }
        } else {
            io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
        }
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd && rd.phase === "day") {
            const voter = rd.players.find(p => p.id === socket.id);
            const target = rd.players.find(p => p.id === targetId);
            if (voter?.isAlive && !voter.isSpectator && target?.isAlive) {
                const oldTargetId = rd.votes[socket.id];
                rd.votes[socket.id] = targetId;
                let msg = oldTargetId ? `🔄 ${voter.name} غير تصويته إلى ${target.name}` : `📢 ${voter.name} صوّت ضد ${target.name}`;
                io.to(room).emit('newMessage', { sender: "النظام", text: msg });
            }
        }
    });

    socket.on('nightAction', ({ room, targetId, type }) => {
        const rd = rooms[room];
        if (rd?.phase !== "night") return;
        const actor = rd.players.find(p => p.id === socket.id);
        if (!actor?.isAlive || actor.isSpectator) return;

        if (type === "kill" && actor.role.includes("مافيا")) rd.nightActions.killed = targetId;
        if (type === "save" && actor.role.includes("طبيب")) rd.nightActions.saved = targetId;
        if (type === "check" && actor.role.includes("شرطة")) {
            const target = rd.players.find(p => p.id === targetId);
            const isMafia = target?.role?.includes("مافيا");
            socket.emit('newMessage', { sender: "النظام", text: `🔍 النتيجة: ${target.name} ${isMafia ? "مافيا 🕵️" : "مواطن ✅"}` });
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
            const index = rd.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const player = rd.players[index];
                if (rd.phase !== "waiting") {
                    player.isAlive = false;
                    player.isSpectator = true;
                } else {
                    rd.players.splice(index, 1);
                }
                io.to(r).emit('updatePlayers', rd.players);
                break;
            }
        }
    });
});

function startWaitingTimer(room) {
    const rd = rooms[room];
    rd.timerStarted = true;
    let timeLeft = 30;
    rd.timerInterval = setInterval(() => {
        io.to(room).emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(rd.timerInterval);
            if (rd.players.length >= 4) startGame(room);
            else rd.timerStarted = false;
        }
        timeLeft--;
    }, 1000);
}

function startGame(room) {
    const rd = rooms[room];
    let activePlayers = rd.players.filter(p => !p.isSpectator);
    let total = activePlayers.length;
    
    // التعديل المطلوب: تحديد عدد المافيا بناءً على عدد اللاعبين
    let mafiaCount = total >= 6 ? 2 : 1;
    let roles = [];
    for(let i=0; i<mafiaCount; i++) roles.push("مافيا 👤");
    roles.push("طبيب 🧑‍⚕️", "شرطة 👮");
    while (roles.length < total) roles.push("مواطن 👤");
    
    roles = roles.sort(() => Math.random() - 0.5);
    activePlayers.forEach((p, i) => {
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
    let timeLeft = phase === "night" ? 60 : 120;

    io.to(room).emit('phaseChange', { 
        phase, 
        msg: phase === "night" ? "🌃 الليل: الصمت يسود.. المافيا تخطط." : "☀️ النهار: وقت النقاش والتصويت."
    });

    io.to(room).emit('resetAudio'); 

    rd.players.forEach(p => {
        let canTalk = p.isAlive && !p.isSpectator && ((phase === "day") || (p.role?.includes("مافيا")));
        io.to(p.id).emit('audioControl', { allowedBySystem: canTalk });
    });

    clearInterval(rd.timerInterval);
    rd.timerInterval = setInterval(() => {
        io.to(room).emit('timerUpdate', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(rd.timerInterval);
            if (phase === "night") endNight(room);
            else endDay(room);
        }
        timeLeft--;
    }, 1000);
}

function endNight(room) {
    const rd = rooms[room];
    let killedId = rd.nightActions.killed;
    let savedId = rd.nightActions.saved;
    if (killedId && killedId !== savedId) {
        const victim = rd.players.find(p => p.id === killedId);
        if (victim) { victim.isAlive = false; victim.isSpectator = true; }
        io.to(room).emit('newMessage', { sender: "النظام", text: `💀 مقتل ${victim?.name || "أحدهم"}.` });
    } else if (killedId && killedId === savedId) {
        io.to(room).emit('newMessage', { sender: "النظام", text: `🏥 الطبيب أنقذ الضحية! ✅` });
    }
    rd.nightActions = { killed: null, saved: null };
    if (!checkGameOver(room)) startPhase(room, "day");
}

function endDay(room) {
    const rd = rooms[room];
    let counts = {};
    Object.values(rd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    let victimId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null);
    if (victimId) {
        const victim = rd.players.find(p => p.id === victimId);
        if (victim) { victim.isAlive = false; victim.isSpectator = true; io.to(room).emit('newMessage', { sender: "النظام", text: `⚖️ تم إعدام ${victim.name}.` }); }
    }
    if (!checkGameOver(room)) startPhase(room, "night");
}

function checkGameOver(room) {
    const rd = rooms[room];
    const mafia = rd.players.filter(p => p.isAlive && p.role?.includes("مافيا")).length;
    const citizens = rd.players.filter(p => p.isAlive && !p.role?.includes("مافيا")).length;
    if (mafia === 0 && rd.phase !== "waiting") { io.to(room).emit('newMessage', { sender: "النظام", text: "🏆 فوز المواطنين!" }); return true; }
    if (mafia >= citizens && rd.phase !== "waiting") { io.to(room).emit('newMessage', { sender: "النظام", text: "😈 فوز المافيا!" }); return true; }
    return false;
}
server.listen(process.env.PORT || 3000);
