const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/'));

let rooms = {}; // لتخزين بيانات الغرف واللاعبين

io.on('connection', (socket) => {
    socket.on('join-room', (data) => {
        const { room, pass, user } = data;

        // إنشاء الغرفة إذا لم تكن موجودة
        if (!rooms[room]) {
            rooms[room] = { password: pass, players: [], phase: 'waiting', timer: 30 };
        }

        // التحقق من كلمة السر
        if (rooms[room].password !== pass) {
            return socket.emit('error', 'كلمة السر خاطئة!');
        }

        const player = { id: socket.id, name: user, role: 'civilian', alive: true };
        rooms[room].players.push(player);
        socket.join(room);

        socket.emit('room-joined', { room });
        io.to(room).emit('system-msg', `${user} انضم إلى اللعبة.`);

        // بدء العد التنازلي إذا وصل العدد لـ 4 لاعبين مثلاً
        if (rooms[room].players.length >= 4 && rooms[room].phase === 'waiting') {
            startCountdown(room);
        }
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
    let numMafia = Math.floor(players.length * 0.2) || 1;
    
    // منطق توزيع الأدوار عشوائياً (المافيا، الطبيب، المحقق)
    // يتم إرسال دور كل لاعب له بشكل خاص
    players.forEach((p, index) => {
        if(index < numMafia) p.role = 'mafia';
        else if(index === numMafia) p.role = 'doctor';
        else if(index === numMafia + 1) p.role = 'detective';
        
        io.to(p.id).emit('your-role', p.role);
    });
}

function startNightPhase(roomID) {
    rooms[roomID].phase = 'night';
    io.to(roomID).emit('system-msg', "حلّ الظلام على المدينة.. أيها الأشرار استيقظوا.");
    // عداد 30 ثانية لليل
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
