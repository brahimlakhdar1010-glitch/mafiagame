const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 30000 // تحسين استقرار الاتصال الصوتي
});

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
        
        // التحقق من كلمة السر
        if (rd.password && rd.password !== password) {
            return socket.emit('newMessage', { sender: "النظام", text: "❌ كلمة السر غير صحيحة!" });
        }
        
        socket.join(room);
        rd.players.push({ id: socket.id, name, isAlive: true, role: null });
        
        io.to(room).emit('updatePlayers', rd.players);
        io.to(room).emit('user-connected', socket.id); // ضروري لربط الميكروفون

        // بدء عداد الانتظار عند دخول أول لاعبين
        if (rd.players.length >= 2 && !rd.timerStarted) {
            startWaitingTimer(room);
        }
    });

    // التعامل مع إشارات الصوت (WebRTC)
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('submitVote', ({ room, targetId }) => {
        const rd = rooms[room];
        if (rd && rd.phase === "day") {
            const voter = rd.players.find(p => p.id === socket.id);
            const target = rd.players.find(p => p.id === targetId);
            if (voter && target && voter.isAlive && target.isAlive) {
                rd.votes[socket.id] = targetId;
                io.to(room).emit('newMessage', { sender: "النظام", text: `📢 اللاعب ${voter.name} صوّت ضد ${target.name}` });
            }
        }
    });

    socket.on('nightAction', ({ room, targetId, type }) => {
        const rd = rooms[room];
        if (!rd || rd.phase !== "night") return;
        const actor = rd.players.find(p => p.id === socket.id);
        if (!actor || !actor.isAlive) return;

        if (type === "kill" && actor.role.includes("مافيا")) rd.nightActions.killed = targetId;
        if (type === "save" && actor.role.includes("طبيب")) rd.nightActions.saved = targetId;
        if (type === "check" && actor.role.includes("شرطة")) {
            const target = rd.players.find(p => p.id === targetId);
            const isMafia = target && target.role.includes("مافيا");
            socket.emit('newMessage', { 
                sender: "النظام", 
                text: `🔍 نتيجة التحقيق: ${target.name} هو ${isMafia ? "مافيا 🕵️" : "مواطن بريء ✅"}` 
            });
        }
    });

    socket.on('sendMessage', ({ room, text }) => {
        const rd = rooms[room];
        if (!rd) return;
        const player = rd.players.find(p => p.id === socket.id);
        if (player && player.isAlive) {
            io.to(room).emit('newMessage', { sender: player.name, text });
        }
    });

    // تنظيف الغرفة عند خروج اللاعب
    socket.on('disconnect', () => {
        for (let r in rooms) {
            let rd = rooms[r];
            const index = rd.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const pName = rd.players[index].name;
                rd.players.splice(index, 1);
                io.to(r).emit('updatePlayers', rd.players);
                io.to(r).emit('newMessage', { sender: "النظام", text: `🔌 غادر ${pName} اللعبة.` });
                
                if (rd.players.length === 0) {
                    clearInterval(rd.timerInterval);
                    delete rooms[r];
                }
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
            if (rd.players.length >= 2) startGame(room);
            else rd.timerStarted = false;
        }
        timeLeft--;
    }, 1000);
}

function startGame(room) {
    const rd = rooms[room];
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];
    while (roles.length < rd.players.length) roles.push("مواطن 👤");
    roles = roles.sort(() => Math.random() - 0.5);
    rd.players.forEach((p, i) => {
        p.role = roles[i];
        p.isAlive = true; // التأكد من أن الجميع أحياء عند البداية
        io.to(p.id).emit('assignRole', p.role);
    });
    startPhase(room, "night");
}

function startPhase(room, phase) {
    const rd = rooms[room];
    if (!rd) return;
    rd.phase = phase;
    rd.votes = {};
    let timeLeft = phase === "night" ? 60 : 180;
    
    io.to(room).emit('phaseChange', { 
        phase, 
        msg: phase === "night" ? "🌃 بدأ الليل.. الأدوار الخاصة تتحرك الآن." : "☀️ طلع النهار.. النقاش والتصويت بدأ!", 
        players: rd.players 
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
        if (victim) victim.isAlive = false;
        io.to(room).emit('newMessage', { sender: "النظام", text: `💀 ليلة حزينة.. قتلت المافيا اللاعب ${victim.name}.` });
    } else if (killedId && killedId === savedId) {
        const savedPlayer = rd.players.find(p => p.id === savedId);
        io.to(room).emit('newMessage', { sender: "النظام", text: `🏥 عمل بطولي! الطبيب أنقذ اللاعب ${savedPlayer.name} من الموت.` });
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "🌙 مرت الليلة بهدوء، لم يمت أحد." });
    }
    
    rd.nightActions = { killed: null, saved: null };
    if (!checkGameOver(room)) startPhase(room, "day");
}

function endDay(room) {
    const rd = rooms[room];
    let counts = {};
    Object.values(rd.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
    
    let victimId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null);
    
    if (victimId && counts[victimId] > 0) {
        const victim = rd.players.find(p => p.id === victimId);
        if (victim) {
            victim.isAlive = false;
            io.to(room).emit('newMessage', { sender: "النظام", text: `⚖️ المحكمة قررت: تم إعدام ${victim.name} بناءً على التصويت.` });
        }
    } else {
        io.to(room).emit('newMessage', { sender: "النظام", text: "⚖️ لم يتفق أحد على التصويت، نجا الجميع اليوم." });
    }
    
    if (!checkGameOver(room)) startPhase(room, "night");
}

function checkGameOver(room) {
    const rd = rooms[room];
    const mafia = rd.players.filter(p => p.isAlive && p.role.includes("مافيا")).length;
    const citizens = rd.players.filter(p => p.isAlive && !p.role.includes("مافيا")).length;
    
    if (mafia === 0) { 
        io.to(room).emit('newMessage', { sender: "النظام", text: "🏆 مبروك! فاز المواطنون وتم طرد المافيا من المدينة." }); 
        resetRoom(room);
        return true; 
    }
    if (mafia >= citizens) { 
        io.to(room).emit('newMessage', { sender: "النظام", text: "😈 خسرتم! سيطرت المافيا على المدينة بالكامل." }); 
        resetRoom(room);
        return true; 
    }
    return false;
}

function resetRoom(room) {
    const rd = rooms[room];
    if (rd) {
        rd.phase = "waiting";
        rd.timerStarted = false;
        rd.players.forEach(p => { p.isAlive = true; p.role = null; });
    }
}

server.listen(process.env.PORT || 3000);
