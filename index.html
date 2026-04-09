<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<script src="https://cdn.tailwindcss.com"></script>
<title>لعبة مافيا برو</title>
<style>
    .dead { opacity: 0.5; pointer-events: none; text-decoration: line-through; }
    #chat-box { height: 200px; overflow-y: auto; }
    body { font-size: 16px; }
    input, button { font-size: 14px !important; }
    
    /* أنماط الصوت */
    .voice-container {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: center;
        margin: 10px 0;
        flex-wrap: wrap;
    }
    
    #mic-btn {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: 3px solid #4ade80;
        background: linear-gradient(135deg, #1e40af, #1e3a8a);
        color: white;
        font-size: 28px;
        cursor: pointer;
        transition: all 0.3s;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
    }
    
    #mic-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 0 15px rgba(74, 222, 128, 0.6);
    }
    
    #mic-btn:active {
        transform: scale(0.95);
    }
    
    #mic-btn.recording {
        background: linear-gradient(135deg, #dc2626, #991b1b);
        border-color: #ef4444;
        animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        50% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
    }
    
    #volume-indicator {
        width: 120px;
        height: 10px;
        background: #374151;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #4b5563;
    }
    
    #volume-bar {
        height: 100%;
        background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
        width: 0%;
        transition: width 0.1s;
    }
    
    .voice-status {
        font-size: 12px;
        color: #60a5fa;
        text-align: center;
        width: 100%;
    }

    .voice-message {
        background: #1e293b;
        padding: 10px;
        border-radius: 8px;
        margin: 5px 0;
        border-right: 3px solid #3b82f6;
    }

    .voice-message audio {
        width: 100%;
        height: 32px;
        margin-top: 5px;
    }
</style>
</head>
<body class="bg-gray-900 text-white p-4 md:p-6 text-right">
<div class="max-w-xl mx-auto text-center">
    <h1 class="text-2xl md:text-3xl font-bold mb-4">🎭 لعبة مافيا برو</h1>
    
    <div id="timer-display" class="hidden text-3xl md:text-4xl font-mono text-red-500 mb-4 bg-black p-2 rounded shadow-lg border-2 border-red-900">00:00</div>
    <div id="news-bar" class="bg-blue-900 p-2 my-2 rounded hidden italic text-sm md:text-base"></div>

    <div id="setup-area" class="space-y-2">
        <input id="username" class="w-full md:w-auto p-2 text-black text-right rounded" placeholder="اسم المستخدم" />
        <input id="password" class="w-full md:w-auto p-2 text-black text-right rounded" placeholder="كلمة المرور" />
        <br>
        <button onclick="createRoom()" class="bg-blue-500 w-full md:w-auto px-4 py-2 rounded font-bold">إنشاء غرفة</button>
        <div class="py-2 text-gray-500">أو</div>
        <input id="roomId" class="w-full md:w-auto p-2 text-black text-right rounded" placeholder="رقم الغرفة" />
        <button onclick="joinRoom()" class="bg-green-500 w-full md:w-auto px-4 py-2 rounded font-bold">انضمام للغرفة</button>
    </div>

    <hr class="my-4 border-gray-700">
    <h2 class="text-lg md:text-xl">المرحلة الحالية: <span id="phase-text" class="text-blue-400">الانتظار</span></h2>
    <div id="my-role" class="text-xl md:text-2xl font-bold text-yellow-400 my-2"></div>
    
    <div id="game-board" class="mt-4">
        <h3 class="font-bold mb-2">قائمة اللاعبين:</h3>
        <ul id="players-list" class="space-y-2 text-right"></ul>
    </div>

    <!-- قسم الصوت -->
    <div id="voice-setup" class="hidden mt-6 bg-gray-800 rounded p-4">
        <h3 class="font-bold mb-3 border-b border-gray-700 pb-1">🎤 نظام التحدث الصوتي</h3>
        <div class="voice-container">
            <button id="mic-btn" title="اضغط وتحدث - Press to Talk">🎤</button>
            <div id="volume-indicator">
                <div id="volume-bar"></div>
            </div>
        </div>
        <div class="voice-status">
            <div id="voice-status-text">✅ جاهز للتحدث</div>
        </div>
    </div>

    <div id="chat-area" class="mt-6 bg-gray-800 rounded p-4 text-right hidden">
        <h3 class="font-bold mb-2 border-b border-gray-700 pb-1 text-sm">الدردشة العامة 💬</h3>
        <div id="chat-box" class="text-sm space-y-1 mb-2 bg-gray-900 p-2 rounded"></div>
        <div class="flex gap-2">
            <input id="chat-input" type="text" class="flex-1 p-2 rounded text-black text-sm" placeholder="اكتب..." onkeypress="if(event.key==='Enter') sendMessage()">
            <button onclick="sendMessage()" class="bg-blue-600 px-3 py-1 rounded text-sm">إرسال</button>
        </div>
    </div>

    <div id="controls" class="mt-4 flex flex-col gap-2 hidden">
        <button id="start-btn" onclick="startGame()" class="bg-purple-500 w-full py-2 rounded font-bold">بدء اللعبة</button>
        <button id="end-day-btn" onclick="endDay()" class="bg-yellow-600 w-full py-2 rounded hidden font-bold">إنهاء التصويت مبكراً</button>
    </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let currentRoom, myId, myRole, isDead = false, currentPhase = "lobby";

// ===== متغيرات الصوت =====
let mediaRecorder;
let audioContext;
let analyser;
let microphone;
let isRecording = false;
let recordedChunks = [];

const micBtn = document.getElementById('mic-btn');
const volumeBar = document.getElementById('volume-bar');
const voiceStatusText = document.getElementById('voice-status-text');
const voiceSetup = document.getElementById('voice-setup');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

socket.on("connect", () => { myId = socket.id; });

socket.on("timerUpdate", (timeLeft) => {
    const timerDiv = document.getElementById("timer-display");
    timerDiv.classList.remove("hidden");
    timerDiv.textContent = formatTime(timeLeft);
});

socket.on("newsUpdate", msg => {
    const bar = document.getElementById("news-bar");
    bar.classList.remove("hidden");
    bar.textContent = msg;
    setTimeout(() => bar.classList.add("hidden"), 10000);
});

socket.on("phaseUpdate", phase => {
    currentPhase = phase;
    const pText = { "lobby": "الانتظار", "night": "الليل 🌙", "day": "النهار ☀️" };
    document.getElementById("phase-text").textContent = pText[phase];
    
    const endDayBtn = document.getElementById("end-day-btn");
    if (phase === "day") endDayBtn.classList.remove("hidden");
    else endDayBtn.classList.add("hidden");

    refreshUI();
});

socket.on("updatePlayers", players => {
    const list = document.getElementById("players-list");
    list.innerHTML = "";
    
    const me = players.find(p => p.id === myId);
    if (me && me.dead) {
        isDead = true;
        document.getElementById("chat-input").disabled = true;
        document.getElementById("chat-input").placeholder = "أنت ميت...";
    }

    players.forEach(p => {
        const li = document.createElement("li");
        li.className = `flex justify-between items-center p-3 bg-gray-800 border border-gray-700 rounded shadow-sm ${p.dead ? 'dead' : ''}`;
        li.innerHTML = `<span class="font-medium">${p.username} ${p.dead ? '☠' : ''}</span>`;
        
        if (!isDead && !p.dead && currentPhase !== "lobby") {
            const btn = document.createElement("button");
            btn.className = "px-3 py-1 rounded text-xs font-bold";
            
            if (currentPhase === "night") {
                if (myRole === "mafia") { btn.textContent = "اغتيال"; btn.className += " bg-red-700"; btn.onclick = () => sendAction(p.id, 'mafia'); }
                else if (myRole === "doctor") { btn.textContent = "حماية"; btn.className += " bg-green-600"; btn.onclick = () => sendAction(p.id, 'doctor'); }
                else if (myRole === "police") { btn.textContent = "تحقيق"; btn.className += " bg-blue-600"; btn.onclick = () => sendAction(p.id, 'police'); }
                else { btn.style.display = "none"; }
            } else if (currentPhase === "day") {
                btn.textContent = "تصويت";
                btn.className += " bg-orange-600";
                btn.onclick = () => sendVote(p.id);
            }
            li.appendChild(btn);
        }
        list.appendChild(li);
    });
});

function sendMessage() {
    const input = document.getElementById("chat-input");
    const msg = input.value.trim();
    if (msg && !isDead && currentRoom) {
        socket.emit("chatMessage", { roomId: currentRoom, msg: msg });
        input.value = "";
    }
}

socket.on("receiveMessage", data => {
    const box = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "border-b border-gray-800 py-1";
    div.innerHTML = `<span class="text-yellow-400 font-bold text-xs">${data.user}:</span> <span class="text-gray-200">${data.msg}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});

function sendAction(targetId, type) {
    socket.emit("action", { roomId: currentRoom, targetId, type });
    alert("تم تنفيذ المهمة!");
}

function sendVote(targetId) {
    socket.emit("vote", { roomId: currentRoom, targetId });
    alert("تم التصويت!");
}

function refreshUI() {
    if (isDead) {
        document.getElementById("my-role").innerHTML = `<span class="text-red-500">ميت ☠</span>`;
        document.getElementById("controls").classList.add("hidden");
    }
}

socket.on("roleAssigned", role => {
    myRole = role;
    const rolesAr = { "mafia": "مافيا 👿", "doctor": "طبيب 👨‍⚕️", "police": "شرطي 👮", "citizen": "مواطن 👤" };
    document.getElementById("my-role").textContent = "دورك: " + rolesAr[role];
    document.getElementById("setup-area").classList.add("hidden");
    document.getElementById("controls").classList.remove("hidden");
    document.getElementById("start-btn").classList.add("hidden");
    document.getElementById("chat-area").classList.remove("hidden");
});

function createRoom() {
    const user = document.getElementById("username").value;
    if(!user) return alert("ادخل اسمك أولاً");
    socket.emit("createRoom", { username: user, password: document.getElementById("password").value });
    document.getElementById("controls").classList.remove("hidden");
}

function joinRoom() { 
    currentRoom = document.getElementById("roomId").value; 
    socket.emit("joinRoom", { roomId: currentRoom, username: document.getElementById("username").value, password: document.getElementById("password").value }); 
    document.getElementById("chat-area").classList.remove("hidden");
}

function startGame() { socket.emit("startGame", currentRoom); }
function endDay() { socket.emit("endDay", currentRoom); }

socket.on("roomCreated", d => { 
    currentRoom = d.roomId; 
    alert("غرفة رقم: " + d.roomId);
    initializeAudio();
});

socket.on("gameOver", winner => { 
    alert("انتهت اللعبة! الفائز: " + winner); 
    location.reload(); 
});

// ===== نظام الصوت الاحترافي =====
async function initializeAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                echoCancellation: true, 
                noiseSuppression: true,
                autoGainControl: true 
            } 
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
            recordedChunks = [];
            
            if (currentRoom && !isDead) {
                const reader = new FileReader();
                reader.onload = () => {
                    socket.emit("voiceMessage", {
                        roomId: currentRoom,
                        audioData: reader.result,
                        sender: document.getElementById("username").value
                    });
                };
                reader.readAsArrayBuffer(audioBlob);
            }
        };
        
        voiceSetup.classList.remove('hidden');
        voiceStatusText.textContent = '✅ الميكروفون جاهز';
        console.log('✅ الصوت جاهز');
    } catch (err) {
        console.error('❌ خطأ الميكروفون:', err);
        voiceStatusText.textContent = '❌ لم يتم تفعيل الميكروفون';
        alert('يرجى السماح باستخدام الميكروفون');
    }
}

// تشغيل الميكروفون عند الضغط
micBtn.addEventListener('mousedown', () => {
    if (!isRecording && mediaRecorder && !isDead) {
        isRecording = true;
        recordedChunks = [];
        mediaRecorder.start();
        micBtn.classList.add('recording');
        voiceStatusText.textContent = '🔴 جاري التسجيل...';
        startVolumeMonitor();
    }
});

// إيقاف الميكروفون عند ترك الضغط
document.addEventListener('mouseup', () => {
    if (isRecording && mediaRecorder) {
        isRecording = false;
        mediaRecorder.stop();
        micBtn.classList.remove('recording');
        voiceStatusText.textContent = '✅ جاري الإرسال...';
        setTimeout(() => { voiceStatusText.textContent = '✅ الميكروفون جاهز'; }, 1500);
    }
});

// رصد مستوى الصوت
function startVolumeMonitor() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    function monitor() {
        if (!isRecording) return;
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        volumeBar.style.width = (average / 255 * 100) + '%';
        requestAnimationFrame(monitor);
    }
    monitor();
}

// استقبال الرسائل الصوتية
socket.on("receiveVoiceMessage", (data) => {
    const box = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "voice-message";
    
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = URL.createObjectURL(new Blob([data.audioData], { type: 'audio/webm' }));
    
    div.innerHTML = `<span class="text-yellow-400 font-bold text-xs">🎤 ${data.sender}</span>`;
    div.appendChild(audio);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});
</script>
</body>
</html>
