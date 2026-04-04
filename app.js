const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ room, name }) => {
        socket.join(room);
        if (!rooms[room]) {
            rooms[room] = { players: [], phase: "waiting", votes: {}, nightActions: { killed: null, saved: null } };
        }
        const rd = rooms[room];
        rd.players.push({ id: socket.id, name, isAlive: true, role: null });
        
        io.to(room).emit('updatePlayers', rd.players);
        socket.to(room).emit('user-connected', socket.id);

        if (rd.players.length === 4 && rd.phase === "waiting") {
            startGame(room);
        }
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd && rd.phase === "day") {
            rd.votes[targetId] = (rd.votes[targetId] || 0) + 1;
            io.to(room).emit('newMessage', { sender: "النظام", text: "تم تسجيل صوت جديد." });
        }
    });

    socket.on('nightAction', ({ room, targetId }) => {
        const rd = rooms[room];
        const player = rd.players.find(p => p.id === socket.id);
        if (player.role && player.role.includes("مافيا")) rd.nightActions.killed = targetId;
        if (player.role && player.role.includes("طبيب")) rd.nightActions.saved = targetId;
    });

    socket.on('sendMessage', ({ room, text }) => {
        const player = rooms[room].players.find(p => p.id === socket.id);
        if (player && player.isAlive) io.to(room).emit('newMessage', { sender: player.name, text });
    });

    socket.on('disconnect', () => { /* تنظيف الغرفة */ });
});

function startGame(room) {
    const rd = rooms[room];
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮", "مواطن 👤"].sort(() => Math.random() - 0.5);
    rd.players.forEach((p, i) => {
        p.role = roles[i];
        io.to(p.id).emit('assignRole', p.role);
    });
    startPhase(room, "night", 60);
}

function startPhase(room, phase, duration) {
    const rd = rooms[room];
    rd.phase = phase;
    rd.votes = {};
    rd.nightActions = { killed: null, saved: null };
    
    const alivePlayers = rd.players.filter(p => p.isAlive);
    const msg = (phase === "night") ? "حل الليل، أغمضوا أعينكم. المافيا تختار ضحيتها الآن." : "طلع النهار، استيقظوا جميعاً للنقاش والتصويت.";
    
    io.to(room).emit('phaseChange', { phase, alivePlayers, msg });

    setTimeout(() => {
        if (phase === "night") endNight(room);
        else endDay(room);
    }, duration * 1000);
}

function endDay(room) {
    const rd = rooms[room];
    let victimId = Object.keys(rd.votes).reduce((a, b) => (rd.votes[a] > rd.votes[b] ? a : b), null);
    if (victimId) {
        const victim = rd.players.find(p => p.id === victimId);
        victim.isAlive = false;
        io.to(room).emit('newMessage', { sender: "النظام", text: "تم إعدام " + victim.name + " بناءً على تصويت الجماعة." });
        io.to(victimId).emit('statusUpdate', 'dead');
    }
    startPhase(room, "night", 60);
}

function endNight(room) {
    const rd = rooms[room];
    if (rd.nightActions.killed && rd.nightActions.killed !== rd.nightActions.saved) {
        const victim = rd.players.find(p => p.id === rd.nightActions.killed);
        victim.isAlive = false;
        io.to(victim.id).emit('statusUpdate', 'dead');
        io.to(room).emit('newMessage', { sender: "النظام", text: "للأسف، استيقظنا على خبر مقتل " + victim.name + "." });
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "مرت الليلة بسلام ولم يمت أحد." });
    }
    startPhase(room, "day", 180);
}

server.listen(process.env.PORT || 3000);
