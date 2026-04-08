const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function assignRoles(players) {
  const roles = ["mafia", "doctor", "police", "citizen"];
  let assigned = {};
  players.forEach((p, i) => {
    assigned[p.id] = roles[i % roles.length];
  });
  return assigned;
}

function checkWin(room) {
  const alive = room.players.filter(p => !p.dead);
  const mafia = alive.filter(p => room.roles[p.id] === "mafia");
  const citizens = alive.filter(p => room.roles[p.id] !== "mafia");

  if (mafia.length === 0) return "الأبرياء 🎉";
  if (mafia.length >= citizens.length) return "المافيا 👿";
  return null;
}

function startTimer(roomId, seconds) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.timerInterval);
  room.timeLeft = seconds;

  room.timerInterval = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit("timerUpdate", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timerInterval);
      if (room.phase === "night") {
        resolveNight(roomId);
      } else if (room.phase === "day") {
        resolveDay(roomId);
      }
    }
  }, 1000);
}

function resolveNight(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let killedId = room.nightAction.mafia;
  let protectedId = room.nightAction.doctor;
  let news = "مرت الليلة بهدوء...";

  if (killedId && killedId !== protectedId) {
    room.players.forEach(p => { if (p.id === killedId) p.dead = true; });
    const victim = room.players.find(p => p.id === killedId);
    news = `تم اغتيال ${victim.username} في هذه الليلة! ☠`;
  } else if (killedId && killedId === protectedId) {
    news = "حاولت المافيا القتل لكن الطبيب أنقذ الضحية! 🎉";
  }

  room.phase = "day";
  room.nightAction = { mafia: null, doctor: null };
  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  if (winner) io.to(roomId).emit("gameOver", winner);
  else startTimer(roomId, 240);
}

function resolveDay(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let tally = {};
  Object.values(room.votes).forEach(v => { if (v) tally[v] = (tally[v] || 0) + 1; });

  let eliminated = Object.keys(tally).sort((a,b) => tally[b] - tally[a])[0];
  let news = "لم يتم إقصاء أحد اليوم.";

  if (eliminated) {
    room.players.forEach(p => { if (p.id === eliminated) p.dead = true; });
    const victim = room.players.find(p => p.id === eliminated);
    news = `قرر الشعب إقصاء ${victim.username}! 🏛`;
  }

  room.phase = "night";
  room.votes = {};
  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  if (winner) io.to(roomId).emit("gameOver", winner);
  else startTimer(roomId, 30);
}

io.on("connection", (socket) => {

  socket.on("createRoom", ({ username, password }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      password, players: [], phase: "lobby", gameStarted: false,
      votes: {}, roles: {}, nightAction: { mafia: null, doctor: null },
      timeLeft: 0, timerInterval: null,
      voiceUsers: [] // ✅ إضافة الصوت فقط
    };
    socket.join(roomId);
    rooms[roomId].players.push({ id: socket.id, username, dead: false });
    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  socket.on("joinRoom", ({ roomId, username, password }) => {
    const room = rooms[roomId];
    if (!room || room.password !== password || room.gameStarted) return;
    socket.join(roomId);
    room.players.push({ id: socket.id, username, dead: false });
    io.to(roomId).emit("updatePlayers", room.players);
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.gameStarted) return;
    room.gameStarted = true;
    room.phase = "night";
    room.roles = assignRoles(room.players);
    room.players.forEach(p => { io.to(p.id).emit("roleAssigned", room.roles[p.id]); });
    io.to(roomId).emit("phaseUpdate", room.phase);
    startTimer(roomId, 30);
  });

  socket.on("chatMessage", ({ roomId, msg }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.dead) {
      io.to(roomId).emit("receiveMessage", { user: player.username, msg: msg });
    }
  });

  socket.on("action", ({ roomId, targetId, type }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== "night") return;
    if (type === "mafia") room.nightAction.mafia = targetId;
    if (type === "doctor") room.nightAction.doctor = targetId;
    if (type === "police") {
      const targetRole = room.roles[targetId];
      socket.emit("newsUpdate", `نتيجة التحقيق: الشخص هو ${targetRole === 'mafia' ? 'مافيا 👿' : 'مواطن 👤'}`);
    }
  });

  socket.on("vote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== "day") return;
    room.votes[socket.id] = targetId;
  });

  socket.on("endDay", (roomId) => { resolveDay(roomId); });

  /* ================== نظام الصوت ================== */

  socket.on("joinVoice", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.voiceUsers) room.voiceUsers = [];

    if (!room.voiceUsers.includes(socket.id)) {
      room.voiceUsers.push(socket.id);
    }

    io.to(roomId).emit("voiceUsers", room.voiceUsers);
  });

  socket.on("offer", ({ target, offer }) => {
    io.to(target).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ target, answer }) => {
    io.to(target).emit("answer", { from: socket.id, answer });
  });

  socket.on("iceCandidate", ({ target, candidate }) => {
    io.to(target).emit("iceCandidate", { from: socket.id, candidate });
  });

  /* ================== نهاية الصوت ================== */

  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      if(rooms[roomId]) {
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);

        // ✅ حذف من الصوت
        if (rooms[roomId].voiceUsers) {
          rooms[roomId].voiceUsers = rooms[roomId].voiceUsers.filter(id => id !== socket.id);
        }

        io.to(roomId).emit("updatePlayers", rooms[roomId].players);

        if(rooms[roomId].players.length === 0) {
            clearInterval(rooms[roomId].timerInterval);
            delete rooms[roomId];
        }
      }
    }
  });

});

server.listen(process.env.PORT || 3000, () => { console.log("السيرفر يعمل..."); });
