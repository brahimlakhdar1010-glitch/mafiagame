const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

// ========== دوال مساعدة ==========

function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * توزيع الأدوار بناءً على عدد اللاعبين
 * - مافيا واحد
 * - طبيب واحد
 * - شرطي واحد
 * - بقية لاعبين عاديين
 */
function assignRoles(players) {
  const playerCount = players.length;
  
  // التحقق من الحد الأدنى
  if (playerCount < 4) return {};
  
  const roles = [];
  
  // عدد المافيا بناءً على عدد اللاعبين
  const mafiaCount = playerCount <= 6 ? 1 : Math.ceil(playerCount / 6);
  
  // إضافة الأدوار
  for (let i = 0; i < mafiaCount; i++) roles.push("mafia");
  roles.push("doctor");
  roles.push("police");
  
  // باقي اللاعبين عاديين
  for (let i = roles.length; i < playerCount; i++) {
    roles.push("citizen");
  }
  
  // خلط عشوائي (Fisher-Yates Shuffle)
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  // ربط الأدوار بـ IDs اللاعبين
  let assigned = {};
  players.forEach((p, i) => {
    assigned[p.id] = roles[i];
  });
  
  return assigned;
}

/**
 * التحقق من وجود فائز
 */
function checkWin(room) {
  const alive = room.players.filter(p => !p.dead);
  const mafia = alive.filter(p => room.roles[p.id] === "mafia");
  const citizens = alive.filter(p => room.roles[p.id] !== "mafia");

  if (mafia.length === 0) return "الأبرياء 🎉";
  if (mafia.length >= citizens.length) return "المافيا 👿";
  return null;
}

/**
 * بدء مؤقت العد التنازلي
 */
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

/**
 * انهاء الليل وحل أحداثها
 */
function resolveNight(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let killedId = room.nightAction.mafia;
  let protectedId = room.nightAction.doctor;
  let news = "مرت الليلة بهدوء...";

  if (killedId && killedId !== protectedId) {
    const victim = room.players.find(p => p.id === killedId);
    room.players.forEach(p => { 
      if (p.id === killedId) p.dead = true; 
    });
    if (victim) {
      news = `تم اغتيال ${victim.username} في هذه الليلة! ☠`;
    }
  } else if (killedId && killedId === protectedId) {
    news = "حاولت المافيا القتل لكن الطبيب أنقذ الضحية! 🎉";
  }

  room.phase = "day";
  room.nightAction = { mafia: null, doctor: null };
  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  if (winner) {
    clearInterval(room.timerInterval);
    io.to(roomId).emit("gameOver", winner);
  } else {
    startTimer(roomId, 240); // 4 دقائق للنقاش
  }
}

/**
 * انهاء النهار وحل عملية الإقصاء
 */
function resolveDay(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let tally = {};
  Object.values(room.votes).forEach(v => { 
    if (v) tally[v] = (tally[v] || 0) + 1; 
  });

  let eliminated = null;
  let news = "لم يتم إقصاء أحد اليوم.";

  if (Object.keys(tally).length > 0) {
    const maxVotes = Math.max(...Object.values(tally));
    const candidates = Object.keys(tally).filter(k => tally[k] === maxVotes);
    
    // في حالة التعادل، اختيار عشوائي
    eliminated = candidates[Math.floor(Math.random() * candidates.length)];
    
    const victim = room.players.find(p => p.id === eliminated);
    room.players.forEach(p => { 
      if (p.id === eliminated) p.dead = true; 
    });
    
    if (victim) {
      news = `قرر الشعب إقصاء ${victim.username}! 🏛`;
    }
  }

  room.phase = "night";
  room.votes = {};
  io.to(roomId).emit("newsUpdate", news);
  io.to(roomId).emit("phaseUpdate", room.phase);
  io.to(roomId).emit("updatePlayers", room.players);

  const winner = checkWin(room);
  if (winner) {
    clearInterval(room.timerInterval);
    io.to(roomId).emit("gameOver", winner);
  } else {
    startTimer(roomId, 30); // 30 ثانية للليل
  }
}

/**
 * تحقق من صحة الرسالة
 */
function validateMessage(msg) {
  if (!msg || typeof msg !== 'string') return null;
  const sanitized = msg.trim().substring(0, 500);
  if (sanitized.length === 0) return null;
  return sanitized;
}

// ========== Socket.IO Events ==========

io.on("connection", (socket) => {
  console.log(`لاعب جديد متصل: ${socket.id}`);

  /**
   * إنشاء غرفة جديدة
   */
  socket.on("createRoom", ({ username, password }) => {
    try {
      // التحقق من البيانات
      if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
        socket.emit("error", "بيانات غير صحيحة");
        return;
      }

      if (username.length > 50 || password.length > 50) {
        socket.emit("error", "اسم المستخدم أو كلمة المرور طويلة جداً");
        return;
      }

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
      rooms[roomId].players.push({ 
        id: socket.id, 
        username: username.trim(),
        dead: false 
      });

      socket.emit("roomCreated", { roomId });
      io.to(roomId).emit("updatePlayers", rooms[roomId].players);
      console.log(`تم إنشاء الغرفة: ${roomId}`);
    } catch (err) {
      console.error("خطأ في إنشاء الغرفة:", err);
      socket.emit("error", "حدث خطأ في إنشاء الغرفة");
    }
  });

  /**
   * الانضمام إلى غرفة موجودة
   */
  socket.on("joinRoom", ({ roomId, username, password }) => {
    try {
      const room = rooms[roomId];

      // التحقق من وجود الغرفة والبيانات
      if (!room) {
        socket.emit("error", "الغرفة غير موجودة");
        return;
      }

      if (room.password !== password) {
        socket.emit("error", "كلمة المرور غير صحيحة");
        return;
      }

      if (room.gameStarted) {
        socket.emit("error", "اللعبة قد بدأت بالفعل");
        return;
      }

      if (!username || typeof username !== 'string' || username.length > 50) {
        socket.emit("error", "اسم مستخدم غير صحيح");
        return;
      }

      if (room.players.length >= 20) { // حد أقصى للاعبين
        socket.emit("error", "الغرفة ممتلئة");
        return;
      }

      socket.join(roomId);
      room.players.push({ 
        id: socket.id, 
        username: username.trim(),
        dead: false 
      });

      io.to(roomId).emit("updatePlayers", room.players);
      console.log(`لاعب جديد انضم للغرفة ${roomId}`);
    } catch (err) {
      console.error("خطأ في الانضمام للغرفة:", err);
      socket.emit("error", "حدث خطأ في الانضمام");
    }
  });

  /**
   * بدء اللعبة
   */
  socket.on("startGame", (roomId) => {
    try {
      const room = rooms[roomId];

      if (!room) {
        socket.emit("error", "الغرفة غير موجودة");
        return;
      }

      if (room.gameStarted) {
        socket.emit("error", "اللعبة قد بدأت بالفعل");
        return;
      }

      // الحد الأدنى من اللاعبين
      if (room.players.length < 4) {
        socket.emit("error", "نحتاج إلى 4 لاعبين على الأقل");
        return;
      }

      room.gameStarted = true;
      room.phase = "night";
      room.roles = assignRoles(room.players);

      // إرسال الأدوار لكل لاعب
      room.players.forEach(p => {
        io.to(p.id).emit("roleAssigned", room.roles[p.id]);
      });

      io.to(roomId).emit("phaseUpdate", room.phase);
      io.to(roomId).emit("newsUpdate", "🌙 بدأت اللعبة! حان الليل الأول...");
      io.to(roomId).emit("updatePlayers", room.players);
      
      startTimer(roomId, 30); // 30 ثانية للليل الأول
      console.log(`بدأت اللعبة في الغرفة: ${roomId}`);
    } catch (err) {
      console.error("خطأ في بدء اللعبة:", err);
      socket.emit("error", "حدث خطأ في بدء اللعبة");
    }
  });

  /**
   * استقبال الرسائل
   */
  socket.on("chatMessage", ({ roomId, msg }) => {
    try {
      const room = rooms[roomId];
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // التحقق من أن اللاعب لم يمت (إلا في مرحلة lobby)
      if (room.gameStarted && player.dead && room.phase !== "lobby") {
        return; // اللاعبون الأموات لا يستطيعون التحدث
      }

      // التحقق من صحة الرسالة
      const sanitizedMsg = validateMessage(msg);
      if (!sanitizedMsg) return;

      io.to(roomId).emit("receiveMessage", { 
        user: player.username, 
        msg: sanitizedMsg,
        playerId: socket.id,
        isDead: player.dead
      });

      console.log(`رسالة من ${player.username}: ${sanitizedMsg}`);
    } catch (err) {
      console.error("خطأ في استقبال الرسالة:", err);
    }
  });

  /**
   * تنفيذ أكشن ليلي (مافيا تقتل، طبيب يحمي، شرطي يتحقق)
   */
  socket.on("action", ({ roomId, targetId, type }) => {
    try {
      const room = rooms[roomId];
      if (!room || room.phase !== "night" || !room.gameStarted) return;

      const actor = room.players.find(p => p.id === socket.id);
      if (!actor || actor.dead) return; // لا يمكن للأموات التصرف

      const target = room.players.find(p => p.id === targetId);
      if (!target) return;

      const actorRole = room.roles[socket.id];

      // لا يمكن استهداف النفس
      if (socket.id === targetId) {
        socket.emit("newsUpdate", "لا يمكنك استهداف نفسك!");
        return;
      }

      if (type === "mafia" && actorRole === "mafia") {
        room.nightAction.mafia = targetId;
        socket.emit("newsUpdate", `✓ اخترت اغتيال ${target.username}`);
      } 
      else if (type === "doctor" && actorRole === "doctor") {
        room.nightAction.doctor = targetId;
        socket.emit("newsUpdate", `✓ اخترت حماية ${target.username}`);
      } 
      else if (type === "police" && actorRole === "police") {
        const targetRole = room.roles[targetId];
        const result = targetRole === 'mafia' ? 'مافيا 👿' : 'مواطن عادي 👤';
        socket.emit("newsUpdate", `🔍 نتيجة التحقيق: ${target.username} هو ${result}`);
      }

      console.log(`أكشن من ${actor.username} (${actorRole}): ${type} → ${target.username}`);
    } catch (err) {
      console.error("خطأ في تنفيذ الأكشن:", err);
    }
  });

  /**
   * التصويت على إقصاء لاعب
   */
  socket.on("vote", ({ roomId, targetId }) => {
    try {
      const room = rooms[roomId];
      if (!room || room.phase !== "day" || !room.gameStarted) return;

      const voter = room.players.find(p => p.id === socket.id);
      if (!voter || voter.dead) return; // اللاعبون الأموات لا يصوتون

      const target = room.players.find(p => p.id === targetId);
      if (!target) return;

      // لا يمكن التصويت على نفسك
      if (socket.id === targetId) {
        socket.emit("newsUpdate", "لا يمكنك التصويت على نفسك!");
        return;
      }

      room.votes[socket.id] = targetId;
      socket.emit("newsUpdate", `✓ صوتت على ${target.username}`);
      console.log(`${voter.username} صوت على ${target.username}`);
    } catch (err) {
      console.error("خطأ في التصويت:", err);
    }
  });

  /**
   * إنهاء مرحلة النهار يدويًا
   */
  socket.on("endDay", (roomId) => {
    try {
      resolveDay(roomId);
    } catch (err) {
      console.error("خطأ في إنهاء النهار:", err);
    }
  });

  /**
   * قطع الاتصال
   */
  socket.on("disconnect", () => {
    try {
      console.log(`لاعب قطع الاتصال: ${socket.id}`);

      for (let roomId in rooms) {
        if (rooms[roomId]) {
          const playerIndex = rooms[roomId].players.findIndex(p => p.id === socket.id);
          
          if (playerIndex !== -1) {
            const playerName = rooms[roomId].players[playerIndex].username;
            rooms[roomId].players.splice(playerIndex, 1);
            
            io.to(roomId).emit("updatePlayers", rooms[roomId].players);
            io.to(roomId).emit("newsUpdate", `غادر ${playerName} اللعبة 👋`);

            // حذف الغرفة إذا كانت فارغة
            if (rooms[roomId].players.length === 0) {
              clearInterval(rooms[roomId].timerInterval);
              delete rooms[roomId];
              console.log(`تم حذف الغرفة الفارغة: ${roomId}`);
            }
          }
        }
      }
    } catch (err) {
      console.error("خطأ في التعامل مع قطع الاتصال:", err);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 السيرفر يعمل على المنفذ ${PORT}`);
  console.log(`📍 الوصول عبر: http://localhost:${PORT}`);
});
