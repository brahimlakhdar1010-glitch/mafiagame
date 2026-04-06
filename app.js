const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

app.use(express.static(__dirname + '/'));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const roomID = String(data.room);
        const { user, pass } = data;

        if (!rooms[roomID]) {
            rooms[roomID] = { 
                password: pass, players: [], phase: 'waiting', 
                timer: 30, interval: null, nightActions: { kill: null, save: null },
                votes: {} // لإضافة نظام التصويت
            };
        }

        // خاصية: منع الدخول إذا بدأت اللعبة
        if (rooms[roomID].phase !== 'waiting') {
            return socket.emit('sys-msg', 'عذراً، اللعبة بدأت بالفعل في هذه الغرفة!');
        }

        if (rooms[roomID].password !== pass) return socket.emit('error-msg', 'كلمة السر خاطئة!');
        
        const player = { id: socket.id, name: user, role: 'citizen', alive: true };
        rooms[roomID].players.push(player);
        socket.join(roomID);

        socket.emit('joined', { room: roomID });
        io.to(roomID).emit('sys-msg', `${user} دخل اللعبة.`);

        if (rooms[roomID].players.length >= 4 && rooms[roomID].phase === 'waiting') {
            startCountdown(roomID);
        }
    });

    socket.on('voice-data', (data) => {
        socket.to(String(data.room)).emit('audio-stream', data.stream);
    });

    socket.on('action', (data) => {
        const room = rooms[String(data.room)];
        const p = room.players.find(pl => pl.id === socket.id);
        if (!p || !p.alive) return;

        if (room.phase === 'night') {
            if (p.role === 'mafia') room.nightActions.kill = data.target;
            if (p.role === 'doctor') room.nightActions.save = data.target;
            if (p.role === 'detective') {
                const target = room.players.find(pl => pl.id === data.target);
                socket.emit('sys-msg', `التحقيق: ${target.name} هو ${target.role === 'mafia' ? 'مافيا 👺' : 'مواطن 👤'}`);
            }
        } 
        // خاصية: تسجيل التصويت في النهار
        else if (room.phase === 'day') {
            room.votes[data.target] = (room.votes[data.target] || 0) + 1;
        }
    });

    socket.on('send-chat', (data) => {
        const room = rooms[String(data.room)];
        if (room) {
            const p = room.players.find(pl => pl.id === socket.id);
            if (p && p.alive) { // الشخص الحي فقط يتحدث
                io.to(String(data.room)).emit('chat-msg', { user: p.name, msg: data.msg });
            }
        }
    });
});

function checkWin(roomID) {
    const room = rooms[roomID];
    const alives = room.players.filter(p => p.alive);
    const mafias = alives.filter(p => p.role === 'mafia').length;
    const citizens = alives.length - mafias;

    if (mafias === 0) {
        io.to(roomID).emit('sys-msg', "🎉 انتهت اللعبة: فاز المواطنون وقضينا على المافيا!");
        resetRoom(roomID);
        return true;
    } else if (mafias >= citizens) {
        io.to(roomID).emit('sys-msg', "💀 انتهت اللعبة: فازت المافيا وسيطرت على المدينة!");
        resetRoom(roomID);
        return true;
    }
    return false;
}

function resetRoom(roomID) {
    if (rooms[roomID].interval) clearInterval(rooms[roomID].interval);
    rooms[roomID].phase = 'waiting';
    rooms[roomID].players.forEach(p => { p.alive = true; });
}

function startCountdown(roomID) {
    const room = rooms[roomID];
    room.phase = 'starting';
    let timeLeft = 30;
    room.interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(room.interval);
            assignRoles(roomID);
        }
    }, 1000);
}

function assignRoles(roomID) {
    const room = rooms[roomID];
    let players = room.players;
    let mafiaCount = Math.max(1, Math.floor(players.length * 0.2));
    let shuffled = [...players].sort(() => 0.5 - Math.random());

    shuffled.forEach((p, i) => {
        if (i < mafiaCount) p.role = 'mafia';
        else if (i === mafiaCount) p.role = 'doctor';
        else if (i === mafiaCount + 1) p.role = 'detective';
        else p.role = 'citizen';
        io.to(p.id).emit('your-role', p.role);
    });
    startNight(roomID);
}

function startNight(roomID) {
    if (checkWin(roomID)) return;
    const room = rooms[roomID];
    room.phase = 'night';
    room.nightActions = { kill: null, save: null };
    // توضيح أن الليل قد حل
    io.to(roomID).emit('sys-msg', "🌑 حلّ الظلام.. أيها الأصحاب القدرات استعدوا!");
    io.to(roomID).emit('phase-change', { phase: 'night', players: room.players.filter(p => p.alive) });
    
    let timeLeft = 30;
    room.interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(room.interval);
            processNight(roomID);
        }
    }, 1000);
}

function processNight(roomID) {
    const room = rooms[roomID];
    let killedID = room.nightActions.kill;
    let savedID = room.nightActions.save;

    if (killedID && killedID === savedID) {
        const savedName = room.players.find(p => p.id === savedID).name;
        io.to(roomID).emit('sys-msg', `🛡️ الطبيب كان بالمرصاد! حاولوا قتل ${savedName} ولكن تم إنقاذه.`);
    } else if (killedID) {
        const victim = room.players.find(p => p.id === killedID);
        if (victim) {
            victim.alive = false;
            io.to(victim.id).emit('is-dead'); // إخبار اللاعب أنه مات
        }
        io.to(roomID).emit('sys-msg', `🚨 فاجعة! تم اغتيال المواطن ${victim ? victim.name : 'مجهول'}.`);
    } else {
        io.to(roomID).emit('sys-msg', `🌙 ليلة هادئة بسلام.. لم يمت أحد.`);
    }
    
    if (!checkWin(roomID)) startDay(roomID);
}

function startDay(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';
    room.votes = {}; // تصقير الأصوات
    // توضيح أن النهار قد حل للتصويت
    io.to(roomID).emit('sys-msg', "☀️ استيقظت المدينة! وقت النقاش والتصويت على المشتبه بهم.");
    io.to(roomID).emit('phase-change', { phase: 'day', players: room.players.filter(p => p.alive) });
    
    let timeLeft = 240;
    room.interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(room.interval);
            processVoting(roomID); // معالجة التصويت عند انتهاء الوقت
        }
    }, 1000);
}

// خاصية: معالجة التصويت وإقصاء اللاعب
function processVoting(roomID) {
    const room = rooms[roomID];
    let topVoted = null;
    let maxVotes = 0;

    for (let id in room.votes) {
        if (room.votes[id] > maxVotes) {
            maxVotes = room.votes[id];
            topVoted = id;
        }
    }

    if (topVoted) {
        const victim = room.players.find(p => p.id === topVoted);
        if (victim) {
            victim.alive = false;
            io.to(victim.id).emit('is-dead');
            io.to(roomID).emit('sys-msg', `⚖️ قررت المدينة إعدام ${victim.name} بالأغلبية!`);
        }
    } else {
        io.to(roomID).emit('sys-msg', "⚖️ لم يتم الاتفاق على إعدام أحد اليوم.");
    }

    if (!checkWin(roomID)) startNight(roomID);
}

server.listen(process.env.PORT || 3000);
