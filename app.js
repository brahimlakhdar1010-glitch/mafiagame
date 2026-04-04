<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mafia Voice Rooms</title>
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://unpkg.com/simple-peer@9.11.1/simplepeer.min.js"></script>
    <style>
        :root { --bg: #0f172a; --acc: #e94560; --txt: #f8fafc; }
        body { background: var(--bg); color: var(--txt); font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; height: 100vh; overflow: hidden; }
        #login-screen { position: fixed; inset: 0; background: var(--bg); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 100; }
        #game-screen { display: none; width: 100%; max-width: 500px; height: 100%; flex-direction: column; padding: 15px; box-sizing: border-box; }
        input { padding: 12px; border-radius: 8px; margin: 5px; border: none; width: 80%; }
        button { padding: 12px; background: var(--acc); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        #status-bar { background: #fbbf24; color: #000; padding: 10px; border-radius: 8px; text-align: center; font-weight: bold; }
        #chatBox { flex-grow: 1; background: rgba(0,0,0,0.3); border-radius: 10px; padding: 10px; overflow-y: auto; margin: 10px 0; border: 1px solid #334155; }
        .player-btn { display: block; width: 100%; padding: 10px; margin: 5px 0; background: #1e293b; color: white; border: 1px solid var(--acc); border-radius: 5px; text-align: right; }
        .dead { filter: grayscale(1); opacity: 0.5; pointer-events: none; }
    </style>
</head>
<body>

    <div id="login-screen">
        <h1>🎙️ مافيا - غرف وصوت</h1>
        <input type="text" id="playerName" placeholder="اسمك المستعار">
        <input type="text" id="roomNumber" placeholder="رقم الغرفة (مثلاً: 101)">
        <button onclick="joinGame()">دخول الغرفة</button>
    </div>

    <div id="game-screen">
        <div id="status-bar">في انتظار اللاعبين...</div>
        <div id="userRole" style="text-align:center; margin:10px; color:#60a5fa;">دورك: جاري التحديد...</div>
        
        <div id="action-pannel" style="display:none; background:#1e293b; padding:10px; border-radius:10px; border: 1px solid #475569;">
            <p id="action-title" style="margin-top:0; font-size:0.9rem; color:#94a3b8;"></p>
            <div id="players-list"></div>
        </div>

        <div id="chatBox"></div>
        <div style="display:flex; gap:5px;">
            <input type="text" id="chatInput" placeholder="اكتب هنا..." style="flex-grow:1; margin:0;">
            <button onclick="sendChat()">إرسال</button>
        </div>
    </div>

    <script>
        const socket = io();
        let myName, currentRoom, myRole, isAlive = true, myStream;
        const peers = {};

        // وظيفة النطق الآلي
        function speak(text) {
            const msg = new SpeechSynthesisUtterance(text);
            msg.lang = 'ar-SA';
            window.speechSynthesis.speak(msg);
        }

        async function joinGame() {
            myName = document.getElementById('playerName').value;
            currentRoom = document.getElementById('roomNumber').value;
            if (!myName || !currentRoom) return alert("يرجى إكمال البيانات");
