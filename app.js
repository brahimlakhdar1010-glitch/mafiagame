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
                phase: 'waiting'
            };
        }

        if (rooms[roomID].password !== pass)
            return socket.emit('error-msg', 'كلمة السر خاطئة');

        const player = {
            id: socket.id,
            name: user,
            role: 'citizen',
            alive: true,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user}`
        };

        rooms[roomID].players.push(player);
        socket.join(roomID);

        socket.emit('joined');
        io.to(roomID).emit('players-update', rooms[roomID].players);

        if (rooms[roomID].players.length >= 4 && rooms[roomID].phase === 'waiting') {
            startGame(roomID);
        }
    });

    // WebRTC
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

    socket.on('disconnect', () => {
        for (let roomID in rooms) {
            rooms[roomID].players = rooms[roomID].players.filter(p => p.id !== socket.id);
            io.to(roomID).emit('players-update', rooms[roomID].players);
        }
    });
});

function startGame(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';

    room.players[0].role = 'mafia';

    room.players.forEach(p => {
        io.to(p.id).emit('your-role', p.role);
    });

    startDay(roomID);
}

function startDay(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';

    io.to(roomID).emit('phase-change', {
        phase: 'day',
        players: room.players
    });

    setTimeout(() => startNight(roomID), 30000);
}

function startNight(roomID) {
    const room = rooms[roomID];
    room.phase = 'night';

    io.to(roomID).emit('phase-change', {
        phase: 'night',
        players: room.players
    });

    setTimeout(() => startDay(roomID), 20000);
}

server.listen(3000);
