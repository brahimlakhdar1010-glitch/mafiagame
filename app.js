const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ================== STATE ================== */
const rooms = {};

/* ================== HELPERS ================== */
const getRoom = id => rooms[id];
const getPlayer = (room, id) => room.players.find(p => p.id === id);

const generateRoomId = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

/* ================== ROLES ================== */
function assignRoles(players, mafiaCount = 1) {
  const roles = [
    ...Array(mafiaCount).fill("mafia"),
    "doctor",
    "police"
  ];

  while (roles.length < players.length) roles.push("citizen");

  shuffle(roles);

  return Object.fromEntries(players.map((p, i) => [p.id, roles[i]]));
}

/* ================== GAME LOGIC ================== */
function checkWin(room) {
  const alive = room.players.filter(p => !p.dead);
  const mafia = alive.filter(p => room.roles[p.id] === "mafia");
  const others = alive.filter(p => room.roles[p.id] !== "mafia");

  if (!mafia.length) return "الأبرياء 🎉";
  if (mafia.length >= others.length) return "المافيا 👿";
  return null;
}

function countVotes(votes) {
  const tally = {};
  Object.values(votes).forEach(v => {
    tally[v] = (tally[v] || 0) + 1;
  });

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return null;
  if (sorted[1] && sorted[0][1] === sorted[1][1]) return null;

  return sorted[0][0];
}

/* ================== TIMER ================== */
function startTimer(roomId, seconds) {
  const room = getRoom(roomId);
  if (!room) return;

  clearInterval(room.timer);
  room.timeLeft = seconds;

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit("timerUpdate", room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.phase === "night" ? resolveNight(roomId) : resolveDay(roomId);
    }
  }, 1000);
}

/* ================== NIGHT ================== */
function resolveNight(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  const killed = countVotes(room.nightAction.mafiaVotes);
  const saved = room.nightAction.doctor;

  let news = "مرت الليلة بهدوء...";

  if (killed && killed !== saved) {
    getPlayer(room, killed).dead = true;
    news = `تم اغتيال ${getPlayer(room, killed).username} ☠`;
  } else if (killed && killed === saved) {
    news = "الطبيب أنقذ الضحية! 🎉";
  }

  room.phase = "day";
  room.nightAction = { mafiaVotes: {}, doctor: null, policeUsed: {} };

  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  winner ? io.to(roomId).emit("gameOver", winner) : startTimer(roomId, 360);
}

/* ================== DAY ================== */
function resolveDay(roomId) {
  const room = getRoom(roomId);
  if (!room) return;

  const eliminated = countVotes(room.votes);

  let news = "لم يتم إقصاء أحد.";

  if (eliminated) {
    getPlayer(room, eliminated).dead = true;
    news = `تم إقصاء ${getPlayer(room, eliminated).username}`;
  }

  room.phase = "night";
  room.votes = {};

  io.to(roomId).emit("voteUpdate", { tally: {}, detailedVotes: {} });
  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  winner ? io.to(roomId).emit("gameOver", winner) : startTimer(roomId, 30);
}

/* ================== SOCKET ================== */
io.on("connection", socket => {
  console.log("🔗", socket.id);

  /* ===== ROOMS ===== */
  socket.on("createRoom", ({ username, password }) => {
    const id = generateRoomId();

    rooms[id] = {
      password,
      players: [{ id: socket.id, username, dead: false }],
      phase: "lobby",
      gameStarted: false,
      votes: {},
      roles: {},
      nightAction: { mafiaVotes: {}, doctor: null, policeUsed: {} }
    };

    socket.join(id);
    socket.emit("roomCreated", { roomId: id });
    io.to(id).emit("updatePlayers", rooms[id].players);
  });

  socket.on("joinRoom", ({ roomId, username, password }) => {
    const room = getRoom(roomId);

    if (!room) return socket.emit("joinError", "❌ الغرفة غير موجودة");
    if (room.password && room.password !== password)
      return socket.emit("joinError", "❌ كلمة المرور خاطئة");
    if (room.gameStarted)
      return socket.emit("joinError", "❌ اللعبة بدأت");

    socket.join(roomId);
    room.players.push({ id: socket.id, username, dead: false });

    socket.emit("joinedRoomSuccess", { roomId });
    io.to(roomId).emit("updatePlayers", room.players);
  });

  /* ===== GAME ===== */
  socket.on("startGame", ({ roomId, mafiaCount }) => {
    const room = getRoom(roomId);
    if (!room || room.gameStarted) return;

    room.gameStarted = true;
    room.phase = "night";
    room.roles = assignRoles(room.players, mafiaCount || 1);

    room.players.forEach(p =>
      io.to(p.id).emit("roleAssigned", room.roles[p.id])
    );

    io.to(roomId).emit("phaseUpdate", room.phase);
    startTimer(roomId, 30);
  });

  socket.on("action", ({ roomId, targetId, type }) => {
    const room = getRoom(roomId);
    if (!room || room.phase !== "night") return;

    if (type === "mafia")
      room.nightAction.mafiaVotes[socket.id] = targetId;

    if (type === "doctor")
      room.nightAction.doctor = targetId;

    if (type === "police") {
      if (room.nightAction.policeUsed[socket.id]) return;

      const role = room.roles[targetId];
      socket.emit("newsUpdate", role === "mafia" ? "مافيا 👿" : "مواطن 👤");

      room.nightAction.policeUsed[socket.id] = true;
    }
  });

  socket.on("vote", ({ roomId, targetId }) => {
    const room = getRoom(roomId);
    if (!room || room.phase !== "day") return;

    room.votes[socket.id] = targetId;

    io.to(roomId).emit("voteUpdate", {
      tally: Object.fromEntries(
        Object.entries(room.votes).map(([_, v]) => [v, 1])
      ),
      detailedVotes: room.votes
    });

    io.to(roomId).emit("updatePlayers", room.players);
  });

  /* ===== CHAT ===== */
  socket.on("chatMessage", ({ roomId, msg }) => {
    const room = getRoom(roomId);
    const p = room && getPlayer(room, socket.id);

    if (p && !p.dead)
      io.to(roomId).emit("receiveMessage", { user: p.username, msg });
  });

  /* ===== DISCONNECT ===== */
  socket.on("disconnect", () => {
    for (const id in rooms) {
      const room = rooms[id];

      room.players = room.players.filter(p => p.id !== socket.id);

      io.to(id).emit("updatePlayers", room.players);

      if (!room.players.length) {
        clearInterval(room.timer);
        delete rooms[id];
      }
    }
  });
});

/* ================== START ================== */
server.listen(3000, () =>
  console.log("🚀 Server running on 3000")
);
