const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path"); // تم إضافة هذا السطر للتعامل مع المسارات

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// التعديل: هذا الجزء يحل مشكلة Cannot GET / ويقوم بعرض ملف الواجهة
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

function getAlive(room) {
  return room.players.filter(p => !p.dead);
}

function checkWin(room) {
  const alive = getAlive(room);
  const mafia = alive.filter(p => room.roles[p.id] === "mafia");
  const citizens = alive.filter(p => room.roles[p.id] !== "mafia");

  if (mafia.length === 0) return "citizens";
  if (mafia.length >= citizens.length) return "mafia";
  return null;
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
      roles: {}
    };

    socket.join(roomId);
    rooms[roomId].players.push({ id: socket.id, username, dead: false });

    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  socket.on("joinRoom", ({ roomId, username, password }) => {
    const room = rooms[roomId];

    if (!room) return socket.emit("errorMsg", "Room not found");
    if (room.password !== password) return socket.emit("errorMsg", "Wrong password");
    if (room.gameStarted) return socket.emit("errorMsg", "Game already started");

    socket.join(roomId);
    room.players.push({ id: socket.id, username, dead: false });

    io.to(roomId).emit("updatePlayers", room.players);
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.gameStarted = true;
    room.phase = "night";
    room.roles = assignRoles(room.players);

    room.players.forEach(p => {
      io.to(p.id).emit("roleAssigned", room.roles[p.id]);
    });

    io.to(roomId).emit("phaseUpdate", room.phase);
  });

  // Mafia voting
  socket.on("mafiaVote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.mafiaVotes[socket.id] = targetId;

    const mafiaPlayers = room.players.filter(p => room.roles[p.id] === "mafia" && !p.dead);

    if (Object.keys(room.mafiaVotes).length >= mafiaPlayers.length) {
      const tally = {};

      Object.values(room.mafiaVotes).forEach(v => {
        tally[v] = (tally[v] || 0) + 1;
      });

      const target = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];

      room.players.forEach(p => {
        if (p.id === target) p.dead = true;
      });

      room.mafiaVotes = {};
      room.phase = "day";

      const winner = checkWin(room);
      if (winner) {
        io.to(roomId).emit("gameOver", winner);
      } else {
        io.to(roomId).emit("phaseUpdate", room.phase);
        io.to(roomId).emit("updatePlayers", room.players);
      }
    }
  });

  // Day voting
  socket.on("vote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.votes[socket.id] = targetId;
    io.to(roomId).emit("voteUpdate", room.votes);
  });

  socket.on("endDay", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    let tally = {};
    Object.values(room.votes).forEach(v => {
      tally[v] = (tally[v] || 0) + 1;
    });

    const eliminated = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0];

    room.players.forEach(p => {
      if (p.id === eliminated) p.dead = true;
    });

    room.votes = {};
    room.phase = "night";

    const winner = checkWin(room);
    if (winner) {
      io.to(roomId).emit("gameOver", winner);
    } else {
      io.to(roomId).emit("phaseUpdate", room.phase);
      io.to(roomId).emit("updatePlayers", room.players);
    }
  });

  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("updatePlayers", rooms[roomId].players);
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
