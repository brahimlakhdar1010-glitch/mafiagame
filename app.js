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
                password: pass,
                players: [],
                phase: 'waiting',
                votes: {},
                nightActions: {}
            };
        }

        if (rooms[roomID].password !== pass)
            return socket.emit('error-msg', 'كلمة السر خاطئة!');

        const player = { id: socket.id, name: user, role: 'citizen', alive: true, muted: false };
        rooms[roomID].players.push(player);
        socket.join(roomID);

        socket.emit('joined');
        io.to(roomID).emit('sys-msg', `${user} دخل`);

        if (rooms[roomID].players.length >= 4 && rooms[roomID].phase === 'waiting') {
            assignRoles(roomID);
        }
    });

    // 🔊 WebRTC Signaling
    socket.on('ready', (data) => {
        socket.to(data.room).emit('ready', { from: socket.id });
    });

    socket.on('offer', (data) => {
        socket.to(data.room).emit('offer', { offer: data.offer, from: socket.id });
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', { answer: data.answer, from: socket.id });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.room).emit('ice-candidate', { candidate: data.candidate, from: socket.id });
    });

    socket.on('toggle-mute', (data) => {
        const room = rooms[data.room];
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.muted = !player.muted;
        }
    });

    socket.on('disconnect', () => {
        for (let roomID in rooms) {
            rooms[roomID].players = rooms[roomID].players.filter(p => p.id !== socket.id);
        }
    });
});

function assignRoles(roomID) {
    const room = rooms[roomID];
    const players = room.players;

    players[0].role = 'mafia';

    players.forEach(p => {
        io.to(p.id).emit('your-role', p.role);
    });

    startDay(roomID);
}

function startDay(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';
    io.to(roomID).emit('phase-change', { phase: 'day' });

    setTimeout(() => startNight(roomID), 30000);
}

function startNight(roomID) {
    const room = rooms[roomID];
    room.phase = 'night';
    io.to(roomID).emit('phase-change', { phase: 'night' });

    setTimeout(() => startDay(roomID), 20000);
}
const PORT = process.env.PORT || 3000;
server.listen(PORT);

