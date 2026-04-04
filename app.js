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
                players: [], 
                phase: "waiting", 
                password: password || null, 
                timerStarted: false 
            };
        }

        const rd = rooms[room];

        if (rd.password && rd.password !== password) {
            return socket.emit('newMessage', { sender: "النظام", text: "خطأ: الرقم السري للغرفة غير صحيح!" });
        }

        if (rd.players.length >= 8) {
            return socket.emit('newMessage', { sender: "النظام", text: "الغرفة ممتلئة تماماً." });
        }

        socket.join(room);
        rd.players.push({ id: socket.id, name, isAlive: true, role: null });
        
        io.to(room).emit('updatePlayers', rd.players);
        socket.to(room).emit('user-connected', socket.id);

        if (rd.players.length >= 4 && !rd.timerStarted) {
            startWaitingTimer(room);
        }
    });

    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('sendMessage', ({ room, text }) => {
        const player = rooms[room].players.find(p => p.id === socket.id);
        if (player && player.isAlive) io.to(room).emit('newMessage', { sender: player.name, text });
    });

    socket.on('disconnect', () => { /* يمكن إضافة تنظيف الغرف هنا */ });
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
            if (rd.players.length >= 4) startGame(room);
            else {
                rd.timerStarted = false;
                io.to(room).emit('newMessage', { sender: "النظام", text: "فشل البدء، العدد أقل من 4." });
            }
        }
    }, 15000);
}

function startGame(room) {
    const rd = rooms[room];
    const count = rd.players.length;
    let roles = ["مافيا 👤", "طبيب 🧑‍⚕️", "شرطة 👮"];
    if (count >= 7) roles.push("مافيا 👤");
    while (roles.length < count) roles.push("مواطن 👤");

    roles = roles.sort(() => Math.random() - 0.5);
    rd.players.forEach((p, i) => {
        p.role = roles[i];
        io.to(p.id).emit('assignRole', p.role);
    });
    
    io.to(room).emit('newMessage', { sender: "النظام", text: "انتبهوا.. اكتمل العدد وبدأت المعركة." });
    // هنا يتم استدعاء منطق أطوار الليل والنهار كما في الكود السابق
}

server.listen(process.env.PORT || 3000);
