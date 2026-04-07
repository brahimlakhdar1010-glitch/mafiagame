const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {

    socket.on('join-room', ({ user, room, pass }) => {
        room = String(room);

        if (!rooms[room]) {
            rooms[room] = {
                password: pass,
                players: [],
                phase: 'waiting',
                votes: {},
                actions: {},
                interval: null
            };
        }

        const r = rooms[room];

        if (r.phase !== 'waiting')
            return socket.emit('error-msg', "⚠️ اللعبة بدأت");

        if (r.password !== pass)
            return socket.emit('error-msg', "❌ كلمة السر خاطئة");

        const player = {
            id: socket.id,
            name: user,
            role: 'citizen',
            alive: true
        };

        r.players.push(player);
        socket.join(room);

        io.to(room).emit('players', r.players);

        if (r.players.length >= 4) startCountdown(room);
    });

    socket.on('vote', ({ room, target }) => {
        const r = rooms[room];
        if (!r) return;

        r.votes[target] = (r.votes[target] || 0) + 1;
    });

    socket.on('action', ({ room, target }) => {
        const r = rooms[room];
        if (!r) return;

        const p = r.players.find(x => x.id === socket.id);

        if (p.role === 'mafia') r.actions.kill = target;
        if (p.role === 'doctor') r.actions.save = target;
        if (p.role === 'detective') {
            const t = r.players.find(x => x.id === target);
            socket.emit('detective-result', t.role);
        }
    });
});

function startCountdown(room) {
    const r = rooms[room];
    if (r.phase !== 'waiting') return;

    r.phase = 'starting';
    let time = 30;

    r.interval = setInterval(() => {
        io.to(room).emit('timer', time);
        time--;

        if (time < 0) {
            clearInterval(r.interval);
            assignRoles(room);
        }
    }, 1000);
}

function assignRoles(room) {
    const r = rooms[room];
    const players = r.players.sort(() => 0.5 - Math.random());

    players[0].role = 'mafia';
    players[1].role = 'doctor';
    players[2].role = 'detective';

    players.forEach(p => {
        io.to(p.id).emit('role', p.role);
    });

    startNight(room);
}

function startNight(room) {
    const r = rooms[room];
    r.phase = 'night';
    r.actions = {};

    io.to(room).emit('phase', 'night');

    let time = 30;
    r.interval = setInterval(() => {
        io.to(room).emit('timer', time);
        time--;

        if (time < 0) {
            clearInterval(r.interval);
            processNight(room);
        }
    }, 1000);
}

function processNight(room) {
    const r = rooms[room];

    let kill = r.actions.kill;
    let save = r.actions.save;

    if (kill && kill === save) {
        const p = r.players.find(x => x.id === kill);
        io.to(room).emit('msg', `🛡️ تم إنقاذ ${p.name}`);
    } else if (kill) {
        const p = r.players.find(x => x.id === kill);
        if (p) {
            p.alive = false;
            io.to(room).emit('msg', `💀 مات ${p.name}`);
        }
    }

    if (!checkWin(room)) startDay(room);
}

function startDay(room) {
    const r = rooms[room];
    r.phase = 'day';
    r.votes = {};

    io.to(room).emit('phase', 'day');

    let time = 240;
    r.interval = setInterval(() => {
        io.to(room).emit('timer', time);
        time--;

        if (time < 0) {
            clearInterval(r.interval);
            processVotes(room);
        }
    }, 1000);
}

function processVotes(room) {
    const r = rooms[room];

    let max = 0, target = null;

    for (let id in r.votes) {
        if (r.votes[id] > max) {
            max = r.votes[id];
            target = id;
        }
    }

    if (target) {
        const p = r.players.find(x => x.id === target);
        if (p) {
            p.alive = false;
            io.to(room).emit('msg', `⚖️ تم إعدام ${p.name}`);
        }
    }

    if (!checkWin(room)) startNight(room);
}

function checkWin(room) {
    const r = rooms[room];

    const alive = r.players.filter(p => p.alive);
    const mafia = alive.filter(p => p.role === 'mafia').length;
    const others = alive.length - mafia;

    if (mafia === 0) {
        io.to(room).emit('end', "🏆 فاز المواطنون!");
        return true;
    }

    if (mafia >= others) {
        io.to(room).emit('end', "💀 فازت المافيا!");
        return true;
    }

    return false;
}

server.listen(process.env.PORT || 3000);
