<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
<title>Mafia Game Pro</title>
</head>

<body class="bg-gray-900 text-white p-6">

<div class="max-w-xl mx-auto text-center">

<h1 class="text-3xl font-bold mb-4">🎭 Mafia Game Pro</h1>

<div id="setup-area">
<input id="username" class="p-2 m-1 text-black" placeholder="Username" />
<input id="password" class="p-2 m-1 text-black" placeholder="Password" />

<br>

<button onclick="createRoom()" class="bg-blue-500 px-4 py-2 m-2 rounded">Create Room</button>

<br><br>

<input id="roomId" class="p-2 text-black" placeholder="Room ID" />
<button onclick="joinRoom()" class="bg-green-500 px-4 py-2 m-2 rounded">Join Room</button>
</div>

<hr class="my-4">

<h2 class="text-xl">Phase: <span id="phase">Lobby</span></h2>
<div id="my-role" class="text-2xl font-bold text-yellow-400 my-2"></div>

<ul id="players" class="mt-4"></ul>

<div id="controls" class="mt-4 space-x-2">
<button onclick="startGame()" class="bg-purple-500 px-3 py-1 rounded">Start</button>
<button onclick="endDay()" class="bg-yellow-500 px-3 py-1 rounded">End Day</button>
</div>

</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let currentRoom;

function createRoom() {
  socket.emit("createRoom", {
    username: document.getElementById("username").value,
    password: document.getElementById("password").value
  });
}

function joinRoom() {
  currentRoom = document.getElementById("roomId").value;

  socket.emit("joinRoom", {
    roomId: currentRoom,
    username: document.getElementById("username").value,
    password: document.getElementById("password").value
  });
}

function startGame() {
  socket.emit("startGame", currentRoom);
}

function endDay() {
  socket.emit("endDay", currentRoom);
}

socket.on("roomCreated", d => {
  currentRoom = d.roomId; 
  alert("Room ID: " + d.roomId);
});

socket.on("updatePlayers", players => {
  const list = document.getElementById("players");
  list.innerHTML = "";

  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent = p.username + (p.dead ? " ☠" : "");
    list.appendChild(li);
  });
});

socket.on("phaseUpdate", phase => {
  document.getElementById("phase").textContent = phase;
});

socket.on("roleAssigned", role => {
  alert("Your role: " + role);
  // تحديث الواجهة: إظهار الدور وإخفاء أدوات الدخول
  document.getElementById("my-role").textContent = "Your Role: " + role.toUpperCase();
  document.getElementById("setup-area").style.display = "none";
  document.getElementById("controls").style.display = "none";
});

socket.on("gameOver", winner => {
  alert("Winner: " + winner);
  location.reload(); // إعادة تحميل الصفحة عند انتهاء اللعبة
});
</script>

</body>
</html>
