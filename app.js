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

// دالة إدارة العداد التنازلي
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
      // يمكن إضافة انتقال تلقائي للمرحلة التالية هنا إذا أردت
    }
  }, 1000);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ username, password }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      password,
      players: [],
      phase: "lobby",
      gameStarted: false,
      votes: {},
      mafiaVotes: {},
      roles: {},
      timeLeft: 0,
      timerInterval: null
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

    room.players.forEach(p => {
      io.to(p.id).emit("roleAssigned", room.roles[p.id]);
    });

    io.to(roomId).emit("phaseUpdate", room.phase);
    startTimer(roomId, 30); // 30 ثانية لليل
  });

  socket.on("endDay", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    // منطق التصفية (كما هو في كودك)
    let tally = {};
    Object.values(room.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });
    const eliminated = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];
    room.players.forEach(p => { if (p.id === eliminated) p.dead = true; });

    room.votes = {};
    room.phase = "night";
    
    io.to(roomId).emit("phaseUpdate", room.phase);
    io.to(roomId).emit("updatePlayers", room.players);
    startTimer(roomId, 30); // إعادة عداد الليل
  });

  // تحديث في نظام المافيا للانتقال للنهار
  socket.on("mafiaVote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.mafiaVotes[socket.id] = targetId;
    const mafiaPlayers = room.players.filter(p => room.roles[p.id] === "mafia" && !p.dead);

    if (Object.keys(room.mafiaVotes).length >= mafiaPlayers.length) {
      // منطق القتل...
      room.phase = "day";
      io.to(roomId).emit("phaseUpdate", room.phase);
      startTimer(roomId, 240); // 4 دقائق للنهار (4 * 60 = 240 ثانية)
    }
  });

  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      if(rooms[roomId]) {
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
        io.to(roomId).emit("updatePlayers", rooms[roomId].players);
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => { console.log("السيرفر يعمل..."); });
