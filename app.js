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
                votes: {}, nightActions: { killed: null, saved: null }, timerStarted: false 
            };
        }
        const rd = rooms[room];
        if (rd.password && rd.password !== password) return socket.emit('newMessage', { sender: "النظام", text: "كلمة السر خطأ!" });
        
        socket.join(room);
        rd.players.push({ id: socket.id, name, isAlive: true, role: null });
        io.to(room).emit('updatePlayers', rd.players);

        if (rd.players.length >= 4 && !rd.timerStarted) startWaitingTimer(room);
    });

    socket.on('nightAction', ({ room, targetId, type }) => {
        const rd = rooms[room];
        if (rd.phase !== "night") return;
        
        if (type === "kill") rd.nightActions.killed = targetId;
        if (type === "save") rd.nightActions.saved = targetId;
        if (type === "check") {
            const target = rd.players.find(p => p.id === targetId);
            const isMafia = target.role.includes("مافيا");
            socket.emit('newMessage', { sender: "النظام", text: `النتيجة: ${target.name} ${isMafia ? "هو مافيا بالفعل! 🕵️" : "مواطن بريء ✅"}` });
        }
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd.phase === "day") {
            rd.votes[targetId] = (rd.votes[targetId] || 0) + 1;
            io.to(room).emit('newMessage', { sender: "النظام", text: "تم تسجيل صوت جديد." });
        }
    });

    socket.on('sendMessage', ({ room, text }) => {
        const player = rooms[room].players.find(p => p.id === socket.id);
        if (player && player.isAlive) io.to(room).emit('newMessage', { sender: player.name, text });
    });
});

function startGame(room) {
    const rd = rooms[room];
    const count = rd.players.length;
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];
    while (roles.length < count) roles.push("مواطن 👤");
    roles = roles.sort(() => Math.random() - 0.5);

    rd.players.forEach((p, i) => {
        p.role = roles[i];
        io.to(p.id).emit('assignRole', p.role);
    });
    startPhase(room, "night");
}

function startPhase(room, phase) {
    const rd = rooms[room];
    rd.phase = phase;
    rd.votes = {};
    
    // إعداد التوقيت الجديد:
    // النهار = 300 ثانية (5 دقائق) | الليل = 60 ثانية (دقيقة واحدة)
    const duration = phase === "night" ? 60 : 300; 
    
    const msg = phase === "night" ? "🌃 حل الليل.. نام الجميع. المافيا والشرطة والطبيب يتحركون (دقيقة واحدة)." : "☀️ طلع النهار.. استيقظوا للنقاش والتصويت (لديك 5 دقائق كاملة).";
    io.to(room).emit('phaseChange', { phase, msg });

    setTimeout(() => {
        if (phase === "night") endNight(room);
        else endDay(room);
    }, duration * 1000);
}

function endNight(room) {
    const rd = rooms[room];
    let killedId = rd.nightActions.killed;
    let savedId = rd.nightActions.saved;

    if (killedId && killedId !== savedId) {
        const victim = rd.players.find(p => p.id === killedId);
        victim.isAlive = false;
        io.to(room).emit('newMessage', { sender: "النظام", text: `للأسف، قتلت المافيا ${victim.name} في هذه الليلة.` });
    } else if (killedId && killedId === savedId) {
        const lucky = rd.players.find(p => p.id === killedId);
        io.to(room).emit('newMessage', { sender: "النظام", text: `خبر عاجل! حاولت المافيا قتل ${lucky.name} ولكن الطبيب أنقذه! 🏥` });
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "مرت الليلة بسلام." });
    }
    rd.nightActions = { killed: null, saved: null };
    startPhase(room, "day");
}

function endDay(room) {
    const rd = rooms[room];
    let victimId = Object.keys(rd.votes).reduce((a, b) => rd.votes[a] > rd.votes[b] ? a : b, null);
    if (victimId) {
        const victim = rd.players.find(p => p.id === victimId);
        victim.isAlive = false;
        io.to(room).emit('newMessage', { sender: "النظام", text: `تم إعدام ${victim.name} بناءً على تصويت الجماعة.` });
    }
    startPhase(room, "night");
}

server.listen(process.env.PORT || 3000);
