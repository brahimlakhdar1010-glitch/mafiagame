const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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
  
  let shuffledRoles = [...roles];
  for (let i = shuffledRoles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
  }
  
  players.forEach((p, i) => {
    assigned[p.id] = shuffledRoles[i % shuffledRoles.length];
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

 let killedId = null;

// حساب تصويت المافيا
if (room.nightAction.mafiaVotes) {
  let tally = {};
  Object.values(room.nightAction.mafiaVotes).forEach(v => {
    tally[v] = (tally[v] || 0) + 1;
  });

  let sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

  if (sorted.length > 0) {
    // تحقق من التعادل
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
      killedId = null; // ❌ تعادل = لا قتل
    } else {
      killedId = sorted[0][0];
    }
  }
}
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
  room.nightAction = { mafiaVotes: {}, doctor: null };
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

let eliminated = null;

let sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);

if (sorted.length > 0) {
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    eliminated = null; // ❌ تعادل = لا إقصاء
  } else {
    eliminated = sorted[0][0];
  }
}
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
  console.log(`🔗 [${socket.id}] اتصل جديد`);
  console.log(`📊 الغرف الموجودة حالياً:`, Object.keys(rooms));

  // ✅ إضافة قائمة الغرف النشطة
  socket.on("getRooms", () => {
    socket.emit("roomsList", Object.keys(rooms));
  });

  socket.on("createRoom", ({ username, password }) => {
    const roomId = generateRoomId();
    rooms[roomId] = {
      password, 
      players: [], 
      phase: "lobby", 
      gameStarted: false,
      votes: {}, 
      roles: {}, 
      nightAction: { mafia: null, doctor: null },
      timeLeft: 0, 
      timerInterval: null
    };
    socket.join(roomId);
    rooms[roomId].players.push({ id: socket.id, username, dead: false });
    
    console.log(`✅ [${socket.id}] أنشأ غرفة: ${roomId}`);
    console.log(`📊 الغرف الموجودة الآن:`, Object.keys(rooms));
    
    socket.emit("roomCreated", { roomId });
    io.to(roomId).emit("updatePlayers", rooms[roomId].players);
  });

  socket.on("joinRoom", ({ roomId, username, password }) => {
    console.log(`🔍 [${socket.id}] يحاول الدخول للغرفة: ${roomId}`);
    console.log(`📊 الغرف المتاحة:`, Object.keys(rooms));
    
    // ✅ التحقق من وجود الغرفة
    const room = rooms[roomId];
    
    if (!room) {
      console.log(`❌ [${socket.id}] الغرفة ${roomId} غير موجودة!`);
      console.log(`🔍 البحث في جميع المفاتيح:`, Object.keys(rooms));
      socket.emit("joinError", "الغرفة غير موجودة ❌ | الرقم الذي أدخلته: " + roomId);
      return;
    }
    
    // ✅ التحقق من كلمة المرور
    if (room.password !== "" && room.password && room.password !== password) {
      console.log(`❌ [${socket.id}] كلمة مرور خاطئة للغرفة ${roomId}`);
      socket.emit("joinError", "كلمة المرور خاطئة ❌");
      return;
    }
    
    // ✅ التحقق من بدء اللعبة
    if (room.gameStarted) {
      console.log(`❌ [${socket.id}] اللعبة بدأت بالفعل في الغرفة ${roomId}`);
      socket.emit("joinError", "اللعبة بدأت بالفعل ❌");
      return;
    }
    
    // ✅ إضافة اللاعب
    socket.join(roomId);
    room.players.push({ id: socket.id, username, dead: false });
    
    console.log(`✅ [${socket.id}] انضم بنجاح للغرفة ${roomId}`);
    console.log(`👥 عدد اللاعبين الآن:`, room.players.length);
    
    // ✅ إرسال تأكيد للعميل
    socket.emit("joinedRoomSuccess", { 
      roomId, 
      players: room.players,
      message: "تم الانضمام بنجاح! ✅"
    });
    
    // ✅ تحديث الجميع
    io.to(roomId).emit("updatePlayers", room.players);
    io.to(roomId).emit("newsUpdate", `${username} انضم للغرفة! 👋`);
  });

  socket.on("startGame", ({ roomId, mafiaCount }) => {
  const room = rooms[roomId];
  if (!room || room.gameStarted) return;

  room.gameStarted = true;
  room.phase = "night";

  // ✅ نحفظ عدد المافيا
  room.mafiaCount = mafiaCount || 1;

  room.roles = assignRoles(room.players, room.mafiaCount);

  room.players.forEach(p => { 
    io.to(p.id).emit("roleAssigned", room.roles[p.id]); 
  });

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
socket.on("mafiaMessage", ({ roomId, msg }) => {
  const room = rooms[roomId];
  if (!room) return;

  const sender = room.players.find(p => p.id === socket.id);
  if (!sender || sender.dead) return;

  // إرسال فقط للمافيا
  room.players.forEach(p => {
    if (room.roles[p.id] === "mafia") {
      io.to(p.id).emit("receiveMafiaMessage", {
        user: sender.username,
        msg
      });
    }
  });
});
  socket.on("voiceMessage", ({ roomId, audioData, sender }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.username === sender);
    if (player && !player.dead) {
      io.to(roomId).emit("receiveVoiceMessage", {
        audioData: audioData,
        sender: sender,
        timestamp: new Date().toLocaleTimeString('ar-SA')
     });
    }
  });

  socket.on("action", ({ roomId, targetId, type }) => {
    const room = rooms[roomId];
    if (!room || room.phase !== "night") return;
   if (type === "mafia") {
  if (!room.nightAction.mafiaVotes) room.nightAction.mafiaVotes = {};
  room.nightAction.mafiaVotes[socket.id] = targetId;
}
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

  socket.on("endDay", (roomId) => { 
    resolveDay(roomId); 
  });

  // WebRTC Signaling
  socket.on("webrtc-offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("webrtc-offer", { offer, from: socket.id });
  });

  socket.on("webrtc-answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("webrtc-answer", { answer, from: socket.id });
  });

  socket.on("webrtc-ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("webrtc-ice-candidate", { candidate, from: socket.id });
  });

  socket.on("joinVoice", ({ roomId }) => {
    socket.to(roomId).emit("newVoiceUser", { userId: socket.id });
  });

  socket.on("disconnect", () => {
    console.log(`❌ [${socket.id}] قطع الاتصال`);
    for (let roomId in rooms) {
      if(rooms[roomId]) {
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
        io.to(roomId).emit("updatePlayers", rooms[roomId].players);
        if(rooms[roomId].players.length === 0) {
            clearInterval(rooms[roomId].timerInterval);
            delete rooms[roomId];
            console.log(`🗑️ حذفت الغرفة الفارغة: ${roomId}`);
        }
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => { 
  console.log("🚀 السيرفر يعمل على المنفذ 3000..."); 
});
