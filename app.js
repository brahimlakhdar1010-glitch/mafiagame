const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/'));

let rooms = {};

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const { room, pass, user } = data;
        if (!rooms[room]) {
            rooms[room] = { password: pass, players: [], phase: 'waiting', timer: 30, votes: {} };
        }
        if (rooms[room].password !== pass) return socket.emit('error', 'كلمة السر خاطئة!');

        const player = { id: socket.id, name: user, role: 'civilian', alive: true };
        rooms[room].players.push(player);
        socket.join(room);

        socket.emit('room-joined', { room });
        io.to(room).emit('system-msg', `${user} انضم إلى اللعبة.`);

        if (rooms[room].players.length >= 4 && rooms[room].phase === 'waiting') {
            startCountdown(room);
        }
    });

    socket.on('chat-msg', (data) => {
        const room = rooms[data.room];
        const p = room.players.find(pl => pl.id === socket.id);
        if(p && p.alive) io.to(data.room).emit('system-msg', `${p.name}: ${data.msg}`);
    });

    socket.on('cast-vote', (targetID) => {
        // منطق استقبال التصويت أو القتل
    });
});

function startCountdown(roomID) {
    let timeLeft = 30;
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('timer-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
            assignRoles(roomID);
            startNightPhase(roomID);
        }
    }, 1000);
}

function assignRoles(roomID) {
    let players = rooms[roomID].players;
    let mafiaCount = Math.floor(players.length * 0.2) || 1;
    players.forEach((p, i) => {
        if(i < mafiaCount) p.role = 'mafia';
        else if(i === mafiaCount) p.role = 'doctor';
        else if(i === mafiaCount + 1) p.role = 'detective';
        io.to(p.id).emit('your-role', p.role);
    });
}

function startNightPhase(roomID) {
    const room = rooms[roomID];
    room.phase = 'night';
    io.to(roomID).emit('system-msg', "حلّ الظلام على المدينة.. أيها الأشرار استيقظوا.");
    io.to(roomID).emit('update-players-list', room.players.filter(p => p.alive));
    
    let timeLeft = 30;
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('timer-update', timeLeft);
        if(timeLeft <= 0) {
            clearInterval(interval);
            startDayPhase(roomID);
        }
    }, 1000);
}

function startDayPhase(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';
    io.to(roomID).emit('system-msg', "استيقظت المدينة.. وقت النقاش والتصويت (4 دقائق).");
    io.to(roomID).emit('update-players-list', room.players.filter(p => p.alive));

    let timeLeft = 240; 
    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('timer-update', timeLeft);
        if(timeLeft <= 0) {
            clearInterval(interval);
            startNightPhase(roomID);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
