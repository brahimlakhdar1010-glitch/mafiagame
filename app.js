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
        if (rd.players.length >= 2 && !rd.timerStarted) startWaitingTimer(room);
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd && rd.phase === "day") {
            const voter = rd.players.find(p => p.id === socket.id);
            const target = rd.players.find(p => p.id === targetId);
            if (voter && target && voter.isAlive) {
                rd.votes[socket.id] = targetId;
                io.to(room).emit('newMessage', { 
                    sender: "النظام", 
                    text: `📢 اللاعب ${voter.name} صوّت ضد ${target.name}` 
                });
            }
        }
    });

    socket.on('nightAction', ({ room, targetId, type }) => {
        const rd = rooms[room];
        if (rd.phase !== "night") return;
        const actor = rd.players.find(p => p.id === socket.id);
        
        // تعديل: المافيا تقتل، الطبيب يحمي، والشرطة فقط تسأل
        if (type === "kill" && actor.role.includes("مافيا")) rd.nightActions.killed = targetId;
        if (type === "save" && actor.role.includes("طبيب")) rd.nightActions.saved = targetId;
        if (type === "check" && actor.role.includes("شرطة")) {
            const target = rd.players.find(p => p.id === targetId);
            const isMafia = target && target.role.includes("مافيا");
            socket.emit('newMessage', { sender: "النظام", text: `🔍 نتيجة التحقيق: ${target.name} ${isMafia ? "هو المافيا! 🕵️" : "مواطن بريء ✅"}` });
        }
    });

    socket.on('sendMessage', ({ room, text }) => {
        const player = rooms[room].players.find(p => p.id === socket.id);
        if (player && player.isAlive) io.to(room).emit('newMessage', { sender: player.name, text });
    });
});

function startWaitingTimer(room) {
    const rd = rooms[room];
    rd.timerStarted = true;
    let timeLeft = 45;
    const interval = setInterval(() => {
        if (timeLeft > 0) {
            io.to(room).emit('newMessage', { sender: "النظام", text: `ستبدأ اللعبة خلال ${timeLeft} ثانية...` });
            timeLeft -= 15;
        } else {
            clearInterval(interval);
            if (rd.players.length >= 2) startGame(room);
            else rd.timerStarted = false;
        }
    }, 15000); 
}

function startGame(room) {
    const rd = rooms[room];
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];
    while (roles.length < rd.players.length) roles.push("مواطن 👤");
    roles = roles.sort(() => Math.random() - 0.5);
    rd.players.forEach((p, i) => {
        p.role = roles[i];
        io.to(p.id).emit('assignRole', p.role);
    });
    startPhase(room, "night");
}

function startPhase(room, phase) {
    const rd = rooms[room];
    if (!rd) return;
    rd.phase = phase;
    rd.votes = {};
    const duration = phase === "night" ? 60 : 300; 
    io.to(room).emit('phaseChange', { phase, msg: phase === "night" ? "🌃 الليل: المافيا والشرطة والطبيب يتحركون." : "☀️ النهار: وقت النقاش والتصويت العلني.", players: rd.players });
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
        if (victim) victim.isAlive = false;
        io.to(room).emit('newMessage', { sender: "النظام", text: `💀 استيقظت المدينة على خبر مقتل ${victim ? victim.name : "أحدهم"}.` });
    } else if (killedId && killedId === savedId) {
        const savedPlayer = rd.players.find(p => p.id === savedId);
        // تعديل: ذكر اسم الشخص الذي تعرض للحماية بنجاح
        io.to(room).emit('newMessage', { sender: "النظام", text: `🏥 خبر عاجل: حاول المافيا قتل ${savedPlayer.name} ولكن الطبيب البطل تدخل وأنقذه! ✅` });
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
        if (victim) {
            victim.isAlive = false;
            io.to(room).emit('newMessage', { sender: "النظام", text: `⚖️ تم إعدام ${victim.name} بأغلبية الأصوات.` });
        }
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "🕊️ لم يتم الاتفاق على إقصاء أحد اليوم." });
    }
    if (!checkGameOver(room)) startPhase(room, "night");
}

function checkGameOver(room) {
    const rd = rooms[room];
    const mafiaCount = rd.players.filter(p => p.isAlive && p.role.includes("مافيا")).length;
    const citizensCount = rd.players.filter(p => p.isAlive && !p.role.includes("مافيا")).length;
    if (mafiaCount === 0) {
        io.to(room).emit('newMessage', { sender: "النظام", text: "🏆 فوز ساحق للمواطنين! تم القضاء على المافيا تماماً." });
        return true;
    } else if (mafiaCount >= citizensCount) {
        io.to(room).emit('newMessage', { sender: "النظام", text: "😈 فازت المافيا.. لقد أحكموا سيطرتهم على المدينة." });
        return true;
    }
    return false;
}
server.listen(process.env.PORT || 3000);
