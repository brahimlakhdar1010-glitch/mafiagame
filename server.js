const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

let rooms = {}; 
let roomTimers = {};    // لإدارة الانتقال بين المراحل
let roomIntervals = {}; // لإدارة العداد التنازلي (الثواني)

const roles = ["مافيا 🦹‍♂️", "طبيب 👨‍⚕️", "شرطة 👮‍♂️", "مواطن 👤"];
const DAY_TIME = 7 * 60;  // 420 ثانية (7 دقائق)
const NIGHT_TIME = 1 * 60; // 60 ثانية (دقيقة واحدة)

app.use(express.static(__dirname));
app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });

io.on('connection', (socket) => {
    
    socket.on('playerJoined', (data) => {
        const { name, peerId, roomName, roomPass } = data;

        if (!rooms[roomName]) {
            rooms[roomName] = { 
                password: roomPass, 
                players: [], 
                phase: "waiting",
                victim: null,
                protected: null,
                investigated: false 
            };
        }

        const room = rooms[roomName];

        if (room.password !== roomPass) return socket.emit('errorMsg', "❌ كلمة السر خاطئة لهذه الغرفة!");
        if (room.players.length >= 4) return socket.emit('errorMsg', "🚫 الغرفة ممتلئة حالياً.");

        socket.join(roomName);
        socket.roomName = roomName;
        room.players.push({ id: socket.id, name, peerId, role: "", alive: true });

        io.to(roomName).emit('updatePlayerList', room.players);

        if (room.players.length === 4 && room.phase === "waiting") {
            startRoomGame(roomName);
        }
    });

    function startRoomGame(roomName) {
        const room = rooms[roomName];
        let shuffled = [...roles].sort(() => Math.random() - 0.5);
        room.players.forEach((p, i) => {
            p.role = shuffled[i];
            io.to(p.id).emit('assignRole', p.role);
        });
        goToPhase(roomName, "day", "🌞 بدأ النهار! لديكم 7 دقائق للنقاش.");
    }

    function goToPhase(roomName, phase, msg) {
        const room = rooms[roomName];
        if (!room) return;

        room.phase = phase;
        io.to(roomName).emit('phaseChange', { phase, msg });
        io.to(roomName).emit('receiveMessage', { user: "النظام 📢", msg });

        // تنظيف المؤقتات السابقة للغرفة
        clearTimeout(roomTimers[roomName]);
        clearInterval(roomIntervals[roomName]);

        let timeLeft = (phase === "day") ? DAY_TIME : NIGHT_TIME;

        // إرسال تحديث الثواني كل ثانية واحدة
        roomIntervals[roomName] = setInterval(() => {
            timeLeft--;
            io.to(roomName).emit('timerUpdate', timeLeft);
            if (timeLeft <= 0) clearInterval(roomIntervals[roomName]);
        }, 1000);

        // الانتقال التلقائي بعد انتهاء الوقت
        roomTimers[roomName] = setTimeout(() => {
            if (phase === "day") {
                goToPhase(roomName, "night", "🌑 انتهى الوقت! حل الليل (دقيقة واحدة للأدوار).");
            } else {
                revealMorning(roomName);
            }
        }, timeLeft * 1000 + 1000);
    }

    function revealMorning(roomName) {
        const room = rooms[roomName];
        if (!room) return;

        let killResult = "🛡️ ليلة هادئة.. لم يمت أحد.";
        if (room.victim && room.victim !== room.protected) {
            const vIdx = room.players.findIndex(p => p.name === room.victim);
            if (vIdx !== -1) {
                room.players[vIdx].alive = false;
                killResult = `🔫 استيقظت المدينة على خبر مقتل: ${room.victim}`;
                io.to(roomName).emit('playerKilled', room.victim);
            }
        } else if (room.victim && room.victim === room.protected) {
            killResult = "🛡️ المافيا حاول القتل، لكن الطبيب أنقذ الضحية!";
        }

        room.victim = null;
        room.protected = null;
        io.to(roomName).emit('updatePlayerList', room.players);
        
        // التحقق من حالة الفوز
        const aliveMafia = room.players.filter(p => p.alive && p.role === "مافيا 🦹‍♂️").length;
        const aliveOthers = room.players.filter(p => p.alive && p.role !== "مافيا 🦹‍♂️").length;

        if (aliveMafia === 0) {
            io.to(roomName).emit('receiveMessage', { user: "النظام 🎉", msg: "فاز المواطنون بإبادة المافيا!" });
            stopGame(roomName);
        } else if (aliveMafia >= aliveOthers) {
            io.to(roomName).emit('receiveMessage', { user: "النظام 💀", msg: "فازت المافيا بالسيطرة على المدينة!" });
            stopGame(roomName);
        } else {
            goToPhase(roomName, "day", killResult);
        }
    }

    function stopGame(roomName) {
        clearInterval(roomIntervals[roomName]);
        clearTimeout(roomTimers[roomName]);
        if(rooms[roomName]) rooms[roomName].phase = "waiting";
    }

    // أفعال الأدوار (تُقبل مرة واحدة فقط في الليل)
    socket.on('mafiaKill', (target) => { if(rooms[socket.roomName]) rooms[socket.roomName].victim = target; });
    socket.on('doctorProtect', (target) => { if(rooms[socket.roomName]) rooms[socket.roomName].protected = target; });
    socket.on('policeInvestigate', (tName) => {
        const room = rooms[socket.roomName];
        if(room && !room.investigated) {
            const target = room.players.find(p => p.name === tName);
            const res = target.role === "مافيا 🦹‍♂️" ? "مافيا! 🕵️‍♂️" : "مواطن صالح ✅";
            socket.emit('receiveMessage', { user: "تحقيق 🔍", msg: `فحص ${tName}: هو ${res}` });
            room.investigated = true;
        }
    });

    socket.on('newMessage', (data) => io.to(socket.roomName).emit('receiveMessage', data));

    socket.on('disconnect', () => {
        if (socket.roomName && rooms[socket.roomName]) {
            rooms[socket.roomName].players = rooms[socket.roomName].players.filter(p => p.id !== socket.id);
            io.to(socket.roomName).emit('updatePlayerList', rooms[socket.roomName].players);
        }
    });
});

http.listen(3000, () => console.log("🚀 السيرفر يعمل مع العداد التنازلي على المنفذ 3000"));