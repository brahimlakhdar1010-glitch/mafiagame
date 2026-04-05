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
            rooms[room] = { 
                password: pass, 
                players: [], 
                phase: 'waiting', 
                timer: 30,
                votes: {},
                nightAction: { killed: null, saved: null }
            };
        }

        if (rooms[room].password !== pass) {
            return socket.emit('error', 'كلمة السر خاطئة!');
        }

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
        const player = room.players.find(p => p.id === socket.id);
        if(player && player.alive) {
            io.to(data.room).emit('system-msg', `${player.name}: ${data.msg}`);
        }
    });
});

function startCountdown(roomID) {
    let timeLeft = 30;
    rooms[roomID].phase = 'starting';
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
    // توزيع المافيا (20%)
    let mafiaCount = Math.max(1, Math.floor(players.length * 0.2));
    let shuffled = [...players].sort(() => 0.5 - Math.random());

    shuffled.forEach((p, i) => {
        let role = 'civilian';
        if (i < mafiaCount) role = 'mafia';
        else if (i === mafiaCount) role = 'doctor';
        else if (i === mafiaCount + 1) role = 'detective';
        
        p.role = role;
        io.to(p.id).emit('your-role', role);
    });
}

function startNightPhase(roomID) {
    const room = rooms[roomID];
    room.phase = 'night';
    let timeLeft = 30;
    
    io.to(roomID).emit('phase-change', 'night');
    io.to(roomID).emit('system-msg', "حلّ الظلام على المدينة.. أيها الأشرار استيقظوا.");

    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('timer-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
            startDayPhase(roomID);
        }
    }, 1000);
}

function startDayPhase(roomID) {
    const room = rooms[roomID];
    room.phase = 'day';
    let timeLeft = 240; // 4 دقائق

    io.to(roomID).emit('phase-change', 'day');
    
    // منطق القتل والنجاة (مثال مبسط)
    if(room.nightAction.killed && room.nightAction.killed !== room.nightAction.saved) {
        let victim = room.players.find(p => p.id === room.nightAction.killed);
        if(victim) {
            victim.alive = false;
            io.to(roomID).emit('system-msg', `للأسف، استيقظت المدينة على خبر رحيل ${victim.name}.. لقد كان مواطناً.`);
        }
    } else {
        io.to(roomID).emit('system-msg', "حاولت المافيا ارتكاب جريمة، لكن الطبيب كان في المكان المناسب!");
    }

    const interval = setInterval(() => {
        timeLeft--;
        io.to(roomID).emit('timer-update', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(interval);
            // هنا يتم حساب التصويت والإعدام ثم العودة لليل
            startNightPhase(roomID);
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MAFIALAKHDAR running on port ${PORT}`));
