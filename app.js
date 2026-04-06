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
    // نظام دخول الغرف بكلمة سر
    socket.on('join-room', (data) => {
        const roomID = String(data.room);
        const { user, pass } = data;

        if (!rooms[roomID]) {
            rooms[roomID] = { 
                password: pass, players: [], phase: 'waiting', 
                timer: 30, votes: {}, nightActions: { kill: null, save: null } 
            };
        }

        if (rooms[roomID].password !== pass) return socket.emit('error-msg', 'كلمة السر خاطئة!');
        
        const player = { id: socket.id, name: user, role: 'citizen', alive: true, voted: false };
        rooms[roomID].players.push(player);
        socket.join(roomID);

        socket.emit('joined', { room: roomID });
        io.to(roomID).emit('sys-msg', `${user} دخل اللعبة.`);

        if (rooms[roomID].players.length >= 4 && rooms[roomID].phase === 'waiting') {
            startCountdown(roomID);
        }
    });

    // نظام الميكروفون والصوت
    socket.on('voice-data', (data) => {
        const roomID = String(data.room);
        socket.to(roomID).emit('audio-stream', { stream: data.stream, sender: socket.id });
    });

    // نظام الدردشة
    socket.on('send-chat', (data) => {
        const room = rooms[String(data.room)];
        if (!room) return;
        const p = room.players.find(pl => pl.id === socket.id);
        if (p && p.alive) {
            io.to(String(data.room)).emit('chat-msg', { user: p.name, msg: data.msg });
        }
    });

    // تنفيذ الحركات (قتل، حماية، تحقيق، تصويت)
    socket.on('action', (data) => {
        const room = rooms[String(data.room)];
        const p = room.players.find(pl => pl.id === socket.id);
        if (!p || !p.alive) return;

        if (room.phase === 'night') {
            if (p.role === 'mafia') room.nightActions.kill = data.target;
            if (p.role === 'doctor') room.nightActions.save = data.target;
            if (p.role === 'detective') {
                const target = room.players.find(pl => pl.id === data.target);
                socket.emit('sys-msg', `نتائج التحقيق: ${target.name} هو ${target.role === 'mafia' ? 'مافيا 👺' : 'مواطن 👤'}`);
            }
        } else if (room.phase === 'day') {
            room.votes[data.target] = (room.votes[data.target] || 0) + 1;
            p.voted = true;
        }
    });
});

function startCountdown(roomID) {
    const room = rooms[roomID];
    room.phase = 'starting';
    let timeLeft = 30;
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
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
    const room = rooms[roomID];
    room.phase = 'night';
    room.nightActions = { kill: null, save: null };
    io.to(roomID).emit('phase-change', { phase: 'night', players: room.players.filter(p => p.alive) });
    
    let timeLeft = 30;
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
            processNight(roomID);
        }
    }, 1000);
}

function processNight(roomID) {
    const room = rooms[roomID];
    let killedID = room.nightActions.kill;
    let savedID = room.nightActions.save;

    if (killedID && killedID !== savedID) {
        const victim = room.players.find(p => p.id === killedID);
        if (victim) victim.alive = false;
        io.to(roomID).emit('sys-msg', `استيقظت المدينة على فاجعة.. تم اغتيال ${victim ? victim.name : 'أحدهم'}`);
    } else {
        io.to(roomID).emit('sys-msg', `ليلة هادئة.. لم يمت أحد!`);
    }
    startDay(roomID);
}

function startDay(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';
    room.votes = {};
    room.players.forEach(p => p.voted = false);
    io.to(roomID).emit('phase-change', { phase: 'day', players: room.players.filter(p => p.alive) });
    
    let timeLeft = 240;
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('time-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
            // منطق الإعدام بناءً على التصويت ثم العودة لليل...
            startNight(roomID);
        }
    }, 1000);
}

server.listen(process.env.PORT || 3000);
