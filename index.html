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

            try {
                myStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                socket.emit('joinRoom', { name: myName, room: currentRoom });
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('game-screen').style.display = 'flex';
            } catch (err) { alert("يجب السماح بالميكروفون للمشاركة في النقاش!"); }
        }

        // إشارات الصوت
        socket.on('user-connected', id => {
            const p = new SimplePeer({ initiator: true, stream: myStream, trickle: false });
            p.on('signal', s => socket.emit('signal', { to: id, signal: s }));
            p.on('stream', st => { const a = document.createElement('audio'); a.srcObject = st; a.play(); });
            peers[id] = p;
        });

        socket.on('signal', d => {
            if (!peers[d.from]) {
                const p = new SimplePeer({ initiator: false, stream: myStream, trickle: false });
                p.on('signal', s => socket.emit('signal', { to: d.from, signal: s }));
                p.on('stream', st => { const a = document.createElement('audio'); a.srcObject = st; a.play(); });
                peers[d.from] = p;
            }
            peers[d.from].signal(d.signal);
        });

        // أحداث اللعبة
        socket.on('phaseChange', (data) => {
            document.getElementById('status-bar').innerText = data.msg;
            speak(data.msg); // نطق التوجيه

            const list = document.getElementById('players-list');
            const panel = document.getElementById('action-pannel');
            list.innerHTML = ""; panel.style.display = 'none';

            if (!isAlive) return;

            if (data.phase === "night" && !myRole.includes("مواطن")) {
                panel.style.display = 'block';
                document.getElementById('action-title').innerText = "اختر هدفك لليلة:";
                data.alivePlayers.forEach(p => {
                    if (p.id !== socket.id) {
                        const btn = document.createElement('button');
                        btn.className = "player-btn"; btn.innerText = p.name;
                        btn.onclick = () => { socket.emit('nightAction', { room: currentRoom, targetId: p.id }); panel.style.display = 'none'; };
                        list.appendChild(btn);
                    }
                });
            } else if (data.phase === "day") {
                panel.style.display = 'block';
                document.getElementById('action-title').innerText = "صوّت ضد من تشك به:";
                data.alivePlayers.forEach(p => {
                    if (p.id !== socket.id) {
                        const btn = document.createElement('button');
                        btn.className = "player-btn"; btn.innerText = p.name;
                        btn.onclick = () => { socket.emit('submitVote', { room: currentRoom, targetId: p.id }); panel.style.display = 'none'; };
                        list.appendChild(btn);
                    }
                });
            }
        });

        socket.on('assignRole', r => { myRole = r; document.getElementById('userRole').innerText = "دورك: " + r; speak("تم تحديد دورك، أنت " + r); });
        
        socket.on('newMessage', d => {
            const div = document.createElement('div');
            div.innerHTML = `<b style="color:var(--acc)">${d.sender}:</b> ${d.text}`;
            document.getElementById('chatBox').appendChild(div);
            document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight;
            if(d.sender === "النظام") speak(d.text);
        });

        socket.on('statusUpdate', s => { 
            if(s==='dead') { 
                isAlive = false; 
                document.getElementById('game-screen').classList.add('dead');
                myStream.getTracks().forEach(t => t.enabled = false); 
                speak("لقد تم إقصاؤك من اللعبة.");
            } 
        });

        function sendChat() {
            const val = document.getElementById('chatInput').value;
            if (val && isAlive) { socket.emit('sendMessage', { room: currentRoom, text: val }); document.getElementById('chatInput').value = ""; }
        }
    </script>
</body>
</html>
