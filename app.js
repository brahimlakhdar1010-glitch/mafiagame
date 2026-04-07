const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

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

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // Create Room
  socket.on("createRoom", ({ username, password }) => {
    const roomId = generateRoomId();

    rooms[roomId] = {
      password,
      players: [],
      gameStarted: false,
      votes: {},
      roles: {}
    };

    socket.join(roomId);
    rooms[roomId].players.push({ id: socket.id, username });

    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  // Join Room
  socket.on("joinRoom", ({ roomId, username, password }) => {
    const room = rooms[roomId];

    if (!room) return socket.emit("errorMsg", "Room not found");
    if (room.password !== password) return socket.emit("errorMsg", "Wrong password");
    if (room.gameStarted) return socket.emit("errorMsg", "Game already started");

    socket.join(roomId);
    room.players.push({ id: socket.id, username });

    io.to(roomId).emit("updatePlayers", room.players);
  });

  // Start Game
  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    room.gameStarted = true;

    const roles = assignRoles(room.players);
    room.roles = roles;

    room.players.forEach((p) => {
      io.to(p.id).emit("roleAssigned", roles[p.id]);
    });

    io.to(roomId).emit("gameStarted");
  });

  // Voting
  socket.on("vote", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.votes[socket.id] = targetId;
    io.to(roomId).emit("voteUpdate", room.votes);
  });

  // Voice signaling (WebRTC)
  socket.on("voiceOffer", (data) => {
    socket.to(data.roomId).emit("voiceOffer", data);
  });

  socket.on("voiceAnswer", (data) => {
    socket.to(data.roomId).emit("voiceAnswer", data);
  });

  socket.on("iceCandidate", (data) => {
    socket.to(data.roomId).emit("iceCandidate", data);
  });

  // Disconnect
  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (p) => p.id !== socket.id
      );

      io.to(roomId).emit("updatePlayers", rooms[roomId].players);
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
