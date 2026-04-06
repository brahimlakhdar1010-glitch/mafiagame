const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
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
                votes: {}
            };
        }

        if (rooms[roomID].phase !== 'waiting') {
            return socket.emit('sys-msg', '⚠️ اللعبة بدأت بالفعل');
        }

        if (rooms[roomID].password !== pass)
            return socket.emit('error-msg', 'كلمة السر خاطئة!');

        const player = { id: socket.id, name: user, role: 'citizen', alive: true };
        rooms[roomID].players.push(player);
        socket.join(roomID);

        socket.emit('joined');
        io.to(roomID).emit('sys-msg', `${user} انضم للمدينة.`);

        if (rooms[roomID].players.length >= 4 && rooms[roomID].phase === 'waiting') {
            startCountdown(roomID);
        }
    });

    // ✅ WebRTC signaling
    socket.on('ready', (data) => {
        socket.to(data.room).emit('ready', { from: socket.id });
    });

    socket.on('offer', (data) => {
        socket.to(data.room).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.room).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });

    // باقي الكود ديال اللعبة (ما تبدل والو)
    socket.on('send-chat', (data) => {
        const room = rooms[String(data.room)];
        if (room) {
            const p = room.players.find(pl => pl.id === socket.id);
            if (p && p.alive) {
                io.to(String(data.room)).emit('chat-msg', { user: p.name, msg: data.msg });
            }
        }
    });

    socket.on('action', (data) => {
        const room = rooms[String(data.room)];
        const p = room.players.find(pl => pl.id === socket.id);
        if (!p || !p.alive) return;

        if (room.phase === 'night') {
            if (p.role === 'mafia') room.nightActions.kill = data.target;
            if (p.role === 'doctor') room.nightActions.save = data.target;
        } else if (room.phase === 'day') {
            room.votes[data.target] = (room.votes[data.target] || 0) + 1;
        }
    });
});

server.listen(process.env.PORT || 3000);
