import { updatePlayerScores, updatePlayerTime, updateActionLabel, endGame, showMessageBox, hideMessageBox, updateTeamName } from "./player.js";
import { updateScores, updateTime, updateLobby } from "./spectate-script.js";
import { initLocalStream, onRemoteStream, createPeerForSpectator, handleOfferOnPlayer, handleAnswerOnSpectator, handleIce, setLocalStream, closeAllPeers } from "./webrtc.js";
import { initCameraDetection, detectColor } from "./cameraDetection.js";

document.addEventListener('DOMContentLoaded', () => {
    let isHost = false;
    const homeScreen = document.getElementById('homeScreen');
    const createGameScreen = document.getElementById('createGameScreen');
    const joinGameScreen = document.getElementById('joinGameScreen');
    const waitingRoomScreen = document.getElementById('waitingRoomScreen');
    const playerViewScreen = document.getElementById('playerViewScreen');
    const spectatorViewScreen = document.getElementById('spectatorViewScreen');

    const usernameScreen = document.getElementById('usernameScreen');
    const usernameInput = document.getElementById('usernameInput');
    const continueBtn = document.getElementById('continueBtn');
    const hostPlayerList = document.getElementById('hostPlayerList');

    const screens = [usernameScreen, homeScreen, createGameScreen, joinGameScreen, waitingRoomScreen, playerViewScreen, spectatorViewScreen];

    const shootButton = document.getElementById('shootButton');
    const bazookaButton = document.getElementById('bazookaButton');
    const grenadeButton = document.getElementById('grenadeButton');

    // Play click sound for all buttons except weapon buttons
    document.addEventListener('click', function(e) {
        const target = e.target;
        if (target.tagName === 'BUTTON') {
            if (target !== shootButton && target !== bazookaButton && target !== grenadeButton) {
                playsound('assets/click_sound.mp3');
            }
        }
    });

    // ===== WebSocket helper: build URL with smart defaults & override via ?server= host:port =====
    function buildWebSocketURL() {
        // If user provided a server override via ?server=host:port
        try {
            const params = new URLSearchParams(window.location.search);
            const serverOverride = params.get('server');
            if (serverOverride) {
                // if override contains protocol, strip it
                const sanitized = serverOverride.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
                const useSecure = window.location.protocol === 'https:';
                const scheme = useSecure ? 'wss' : 'ws';
                return `${scheme}://${sanitized}`;
            }
        } catch (e) {
            // ignore
        }

        // Default: use current page location host
        const loc = window.location;
        const useSecure = (loc.protocol === 'https:');
        const scheme = useSecure ? 'wss' : 'ws';
        return `${scheme}://${loc.host}`;
    }

    // Try to connect with basic reconnect attempt once on error
    function createSocketWithRetry() {
        const url = buildWebSocketURL();
        console.log("Attempting WebSocket to:", url);
        let socket;
        try {
            socket = new WebSocket(url);
        } catch (e) {
            console.error("WebSocket construction failed:", e);
            // fallback: construct using hostname + port (if available)
            const fallbackHost = window.location.hostname + (window.location.port ? `:${window.location.port}` : '');
            const fallbackUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${fallbackHost}`;
            console.log("Attempting fallback WebSocket to:", fallbackUrl);
            socket = new WebSocket(fallbackUrl);
        }

        // basic single retry on error during initial connection
        let attemptedRetry = false;
        const originalOnError = () => {};
        socket.addEventListener('error', (ev) => {
            console.warn("WebSocket error event:", ev);
            if (!attemptedRetry) {
                attemptedRetry = true;
                // try a quick reconnect after 300ms using same builder (in case of transient network)
                setTimeout(() => {
                    try {
                        const retry = new WebSocket(buildWebSocketURL());
                        // move important handlers to retry in main scope by replacing socket variable (we won't rewire everything here)
                        // but we still want the rest of the code to attach to the retry we return
                        socket = retry;
                        // Let rest of script attach listeners to this returned socket reference (which is updated).
                    } catch (e) {
                        console.warn("Retry WebSocket failed to construct:", e);
                    }
                }, 300);
            }
            originalOnError(ev);
        });

        return socket;
    }

    // Create socket instance (the rest of this file uses 'socket' variable)
    const socket = createSocketWithRetry();

    // Intialise username and game ID variables
    let currentGameId = null;
    let playerName = null;
    let mySocketId = null; // set by server on login OR discovered via player_list_update
    let playerTeam = null;
    let myRole = null; // 'player' or 'spectator'

    // store latest player list (for spectator offers)
    let latestPlayers = [];

    const createdGameCode = document.getElementById('createdGameCode');
    const startGameBtn = document.getElementById('startGameBtn');
    const joinGameCodeInput = document.getElementById('joinGameCodeInput');
    const waitingRoomGameId = document.getElementById('waitingRoomGameId');
    const playerList = document.getElementById('playerList');
    const waitingMessage = document.getElementById('waitingMessage');

    // Wire remote stream callback (spectator will render)
    onRemoteStream((remoteId, stream) => {
        const ev = new CustomEvent('webrtc-remote-stream', { detail: { id: remoteId, stream } });
        window.dispatchEvent(ev);
    });

    function ensureSpectatorPeers() {
        if (myRole !== 'spectator') return;
        if (!mySocketId) return;
        if (!latestPlayers || latestPlayers.length === 0) return;

        latestPlayers.forEach(p => {
            if (p.spectator) return;
            try {
                // Spectator initiates the offer to each player
                createPeerForSpectator(mySocketId, p.id, socket).catch(() => {});
            } catch (err) {
                console.warn("Failed to create spectator peer:", err);
            }
        });
    }

    // Consolidated message handler with debug logging
    socket.addEventListener('message', async (msg) => {
        let data;
        try {
            data = JSON.parse(msg.data);
        } catch (err) {
            console.warn("Received non-JSON ws message:", msg.data);
            return;
        }

        // DEBUG: log every incoming message so we can see what server actually sends
        console.log("WS recv:", data);

        // If server sent login_success and included id, use it (best case)
        if (data.type === 'login_success') {
            if (data.id) {
                mySocketId = data.id;
                console.log("Assigned socket id (from login_success):", mySocketId);
                ensureSpectatorPeers();
            } else {
                // server acknowledged login but didn't give id — we'll discover it later on player_list_update
                console.log("Login acknowledged by server (no id provided). Will discover id from player_list_update.");
            }
            return;
        }

        // WebRTC signalling types
        if (data.type === 'webrtc-offer') {
            // Player receives an offer from a spectator (spectator created offer)
            if (myRole === 'player' && data.toId === mySocketId) {
                try {
                    await handleOfferOnPlayer(mySocketId, data.fromId, data.sdp, socket);
                } catch (e) {
                    console.error("Error handling offer on player:", e);
                }
            }
            return;
        }
        if (data.type === 'webrtc-answer') {
            // Spectator receives answer from player
            if (myRole === 'spectator' && data.toId === mySocketId) {
                try {
                    await handleAnswerOnSpectator(data.fromId, data.sdp);
                } catch (e) {
                    console.error("Error handling answer on spectator:", e);
                }
            }
            return;
        }
        if (data.type === 'webrtc-ice') {
            if (data.toId === mySocketId) {
                try {
                    await handleIce(data.fromId, data.candidate);
                } catch (e) {
                    console.error("Error handling ICE:", e);
                }
            }
            return;
        }

        // NEW: server asks us to initiate WebRTC to a specific peer (used especially for spectators)
        if (data.type === 'initiate_webrtc') {
            if (myRole === 'spectator' && data.toId) {
                try {
                    await createPeerForSpectator(mySocketId, data.toId, socket);
                } catch (e) {
                    console.error("initiate_webrtc -> createPeerForSpectator failed:", e);
                }
            }
            return;
        }

        // Lobby id push (for spectators)
        if (data.type === 'lobby_assignment') {
            currentGameId = data.gameId;
            updateLobby(currentGameId);
            return;
        }

        // Other game messages
        switch (data.type) {
            case 'game_created':
                currentGameId = data.gameId;
                if (createdGameCode) createdGameCode.textContent = data.gameId;
                showScreen(createGameScreen);
                break;

            case 'join_confirmed':
                // server confirms join and sends assigned team and gameId
                currentGameId = data.gameId;
                if (data.team) {
                    playerTeam = (data.team || '').toString().toLowerCase();
                }
                if (data.role) myRole = data.role;

                // update waiting room label
                if (waitingRoomGameId) waitingRoomGameId.textContent = currentGameId;

                // show player's team in the player view UI immediately (if joining as player)
                if (myRole === 'player' && playerTeam) {
                    const color = (playerTeam === 'red') ? 'red' : 'blue';
                    updateTeamName((playerTeam || '').toUpperCase(), color);
                }

                // also reflect on spectator HUD (covers servers that don't send lobby_assignment)
                if (myRole === 'spectator') {
                    updateLobby(currentGameId || '—');
                }
                break;

            case 'player_list_update':
                // normalize and store the players array so we can use it in peer creation etc.
                latestPlayers = (data.players || []).map(p => {
                    return {
                        id: p.id,
                        username: p.username || ('Player ' + (p.id || '').slice(0, 4)),
                        score: Number(p.score) || 0,
                        team: (p.team || '').toString().toLowerCase(),
                        spectator: !!p.spectator
                    };
                });

                // --- NEW: If we still don't have mySocketId, try to discover it by username match ---
                if (!mySocketId && playerName) {
                    const me = latestPlayers.find(x => x.username === playerName || x.username === (playerName + ' '));
                    if (me) {
                        mySocketId = me.id;
                        console.log("Discovered mySocketId from player_list_update via username match:", mySocketId);
                        // ensure peer creation if spectator
                        ensureSpectatorPeers();
                    }
                }
                // ---------------------------------------------------------------------------

                console.log("player_list_update payload (normalized):", latestPlayers);

                // update lists for hosts, players, spectators (UI lists)
                if (hostPlayerList) hostPlayerList.innerHTML = '';
                if (playerList) playerList.innerHTML = '';

                latestPlayers.forEach(p => {
                    const displayTeam = p.spectator ? 'spec' : (p.team || '—');
                    if (playerList) {
                        const li = document.createElement('li');
                        li.textContent = `${p.username} (${displayTeam})`;
                        playerList.appendChild(li);
                    }
                    if (hostPlayerList) {
                        const hostLi = document.createElement('li');
                        hostLi.textContent = `${p.username} (${displayTeam})`;
                        hostPlayerList.appendChild(hostLi);
                    }
                });

                // update player UI & spectator scoreboard
                updatePlayerScores(latestPlayers);
                updateScores(latestPlayers);

                // If I'm a player, ensure my team variable is in sync (server is authoritative)
                if (myRole === 'player') {
                    const me = latestPlayers.find(x => x.id === mySocketId);
                    if (me) {
                        playerTeam = (me.team || '').toLowerCase();
                        const color = (playerTeam === 'red') ? 'red' : 'blue';
                        updateTeamName((playerTeam || '').toUpperCase(), color);
                    }
                }

                // If I'm a spectator, ensure we have POV peers
                ensureSpectatorPeers();
                break;

            // NEW: explicit score update. Clients update scoreboard immediately.
            case 'score_update':
                // update latestPlayers and totals
                latestPlayers = (data.players || []).map(p => {
                    return {
                        id: p.id,
                        username: p.username || ('Player ' + (p.id || '').slice(0, 4)),
                        score: Number(p.score) || 0,
                        team: (p.team || '').toString().toLowerCase(),
                        spectator: !!p.spectator
                    };
                });

                console.log("score_update payload (normalized):", latestPlayers, "redTeam:", data.redTeamScore, "blueTeam:", data.blueTeamScore);

                // update both player view totals and spectator scoreboard
                updatePlayerScores(latestPlayers);
                updateScores(latestPlayers);

                // If I'm a player, keep my local team synced to server
                if (myRole === 'player') {
                    const me = latestPlayers.find(x => x.id === mySocketId);
                    if (me) {
                        playerTeam = (me.team || '').toLowerCase();
                        const color = (playerTeam === 'red') ? 'red' : 'blue';
                        updateTeamName((playerTeam || '').toUpperCase(), color);
                    }
                }
                break;

            case 'timer_tick':
                updatePlayerTime(data.timeLeftSeconds);
                updateTime(data.timeLeftSeconds);
                break;

            case 'game_started':
                startGameInternal();
                break;

            case 'game_over':
                if (data.winner === 'draw') {
                    updateActionLabel("Game Over! Draw!");
                } else {
                    updateActionLabel("Game Over! Winner is: " + data.winner + "!");
                }
                endGame();
                break;

            case 'join_error':
                showMessageBox(data.message || "Join error");
                break;

            default:
                // ignore unknowns
                break;
        }
    });

    // CREATE GAME (host)
    const createBtn = document.getElementById('createGameBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            isHost = true;
            myRole = 'player'; // host is a player by default
            socket.send(JSON.stringify({ type: 'create_game' }));
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
            if (currentGameId) {
                socket.send(JSON.stringify({ type: 'start_game', gameId: currentGameId }));
            } else {
                console.warn("No currentGameId when pressing Start");
            }
        });
    }

    const joinBtn = document.getElementById('joinGameBtn');
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            showScreen(joinGameScreen);
        });
    }

    const joinAsPlayerBtn = document.getElementById('joinAsPlayerBtn');
    if (joinAsPlayerBtn) {
        joinAsPlayerBtn.addEventListener('click', () => {
            joinGame('PLAYER');
        });
    }

    const joinAsSpectatorBtn = document.getElementById('joinAsSpectatorBtn');
    if (joinAsSpectatorBtn) {
        joinAsSpectatorBtn.addEventListener('click', () => {
            joinGame('SPECTATOR');
        });
    }

    function joinGame(role) {
        const code = joinGameCodeInput.value ? joinGameCodeInput.value.trim().toUpperCase() : '';
        if (joinGameCodeInput) joinGameCodeInput.value = ''; // Clear input
        if (!code) {
            showMessageBox("Please enter a game code!");
            return;
        }

        myRole = (role === 'SPECTATOR') ? 'spectator' : 'player';

        socket.send(JSON.stringify({
            type: 'player_join',
            username: playerName,
            gameId: code,
            role: (role === 'SPECTATOR') ? 'spectator' : 'player'
        }));

        // Immediately show waiting room for players; spectators see lobby info
        if (myRole === 'player') {
            if (waitingRoomGameId) waitingRoomGameId.textContent = code;
            showScreen(waitingRoomScreen);
        } else if (myRole === 'spectator') {
            updateLobby(code);
            showScreen(spectatorViewScreen);
        }
    }

    function showScreen(screen) {
        screens.forEach(s => s.classList.add('hidden'));
        if (screen) screen.classList.remove('hidden');
    }

    function startGameInternal() {
        // Called when server says game started — for both players and spectators
        if (myRole === 'player') {
            showScreen(playerViewScreen);
            updateActionLabel('');
            // init local camera stream so player can answer spectator offers
            initLocalStream().then((stream) => {
                setLocalStream(stream);
                try { initCameraDetection(); } catch (e) {}
            }).catch(err => {
                console.warn("Player camera init failed:", err);
                showMessageBox("Camera access failed. Player POV will not stream.");
            });

            // Ensure player's team is displayed
            if (playerTeam) {
                const color = (playerTeam === 'red') ? 'red' : 'blue';
                updateTeamName((playerTeam || '').toUpperCase(), color);
            }

            // Enable Weapons
            if (shootButton && bazookaButton && grenadeButton ) {
                shootButton.disabled = false;
                bazookaButton.disabled = false;
                grenadeButton.disabled = false;
                // ensure multiple listeners are not stacked
                shootButton.removeEventListener('click', shootHandler);
                shootButton.addEventListener('click', shootHandler);
                bazookaButton.removeEventListener('touchstart', bazookaHandler);
                bazookaButton.addEventListener('touchstart', bazookaHandler);
                bazookaButton.removeEventListener('mousedown', bazookaHandler);
                bazookaButton.addEventListener('mousedown', bazookaHandler);
                grenadeButton.removeEventListener('click', grenadeHandler);
                grenadeButton.addEventListener('click', grenadeHandler);
            }
        } else if (myRole === 'spectator') {
            showScreen(spectatorViewScreen);
            updateActionLabel('');
            // Spectator peers are created on player_list_update or initiate_webrtc
            ensureSpectatorPeers();
        }
    }

    let grenadeCooldown = false;
    let bazookaCharging = false;
    let bazookaChargeStart = 0;

    // Weapon Handlers
    function shootHandler() {
        let detectedColour = detectColor();
        // normalize color to lowercase strings the server expects
        let colorToSend = (detectedColour || "blank").toString().toLowerCase();
        if (colorToSend !== "red" && colorToSend !== "blue") colorToSend = "blank";

        if (colorToSend === "red" || colorToSend === "blue") {
            updateActionLabel(`HEADSHOT! You shot ${colorToSend.toUpperCase()}!`);
        } else {
            updateActionLabel('Blank shot');
        }

        showExplosion();
        vibrateDevice(100);
        playsound('assets/shoot_sound.mp3');

        sendHitPayload('shoot', colorToSend);
    }

    function grenadeHandler() {
        if (grenadeCooldown) {
            updateActionLabel('Grenade on cooldown!');
            return;
        }
        let detectedColour = detectColor();
        let colorToSend = (detectedColour || "blank").toString().toLowerCase();
        if (colorToSend !== "red" && colorToSend !== "blue") colorToSend = "blank";
        updateActionLabel(colorToSend === "blank" ? 'Grenade missed!' : `GRENADE HIT! Targeted ${colorToSend.toUpperCase()} team!`);

        grenadeCooldown = true;
        grenadeButton.disabled = true;
 
        showExplosion(); // center of screen
        vibrateDevice(300);
        playsound('assets/grenade_sound.mp3');
        sendHitPayload('grenade', colorToSend);
        const cooldownCircle = document.getElementById("grenade-cooldown-circle");
        const duration = 10000; // 10s
        const radius = 50;
        const circumference = 2 * Math.PI * radius;

        if (cooldownCircle) {
            cooldownCircle.strokeDasharray = `${circumference} ${circumference}`;
            cooldownCircle.style.strokeDasharray = circumference;
            cooldownCircle.style.strokeDashoffset = circumference;

            let start = null;

            function animate(time) {
            if (!start) start = time;
            let elapsed = time - start;

            let progress = Math.min(elapsed / duration, 1);
            cooldownCircle.style.strokeDashoffset = circumference * (1 - progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Reset cooldown
                grenadeCooldown = false;
                grenadeButton.disabled = false;
                updateActionLabel('Grenade ready!');
                cooldownCircle.style.strokeDashoffset = 0;
                cooldownCircle.style.strokeDasharray = '0px, 1000px'; // effectively hide the circle
            }
            }

            requestAnimationFrame(animate);
        } else {
            // Fallback if SVG not present
            setTimeout(() => {
            grenadeCooldown = false;
            grenadeButton.disabled = false;
            updateActionLabel('Grenade ready!');
            }, duration);
        }
    }

    function bazookaHandler() {
    if (bazookaCharging) return;
    bazookaCharging = true;
    bazookaChargeStart = Date.now();
    updateActionLabel('Charging BAZOOKA...');
    bazookaButton.style.backgroundColor = '#ffa500'; // Orange for charging
    const bazookaCircle = document.getElementById("bazooka-charge-circle");
    const duration = 3000; // 3 seconds
    const radius = 50;
    const circumference = 2 * Math.PI * radius;

    if (bazookaCircle) {
        bazookaCircle.style.strokeDasharray = circumference;
        bazookaCircle.style.strokeDashoffset = circumference;
        bazookaCircle.classList.remove('hidden');

        let start = null;
        let stopped = false;

        function animate(time) {
            if (!start) start = time;
            let elapsed = time - start;
            let progress = Math.min(elapsed / duration, 1);
            bazookaCircle.style.strokeDashoffset = circumference * (1 - progress);

            if (progress < 1 && !stopped) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);

        function mouseUpHandler() {
            stopped = true;
            bazookaCircle.classList.add('hidden');
            bazookaCircle.style.strokeDashoffset = 0;
            document.removeEventListener('touchend', mouseUpHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            bazookaReleaseHandler();
        }

        document.addEventListener('touchend', mouseUpHandler, { once: true });
        document.addEventListener('mouseup', mouseUpHandler, { once: true });
    } else {
        document.addEventListener('touchend', bazookaReleaseHandler, { once: true });
        document.addEventListener('mouseup', bazookaReleaseHandler, { once: true })
    }
    }

    function bazookaReleaseHandler() {
        if (!bazookaCharging) return;
        bazookaCharging = false;
        bazookaButton.style.backgroundColor = '#ff0000'; // Reset to red
        const chargeTime = Date.now() - bazookaChargeStart;
        if (chargeTime < 3000) {
            updateActionLabel('BAZOOKA charge failed! Hold for 3 seconds.');
            return;
        }
        let detectedColour = detectColor();
        let colorToSend = (detectedColour || "blank").toString().toLowerCase();
        if (colorToSend !== "red" && colorToSend !== "blue") colorToSend = "blank";
        updateActionLabel(colorToSend === "blank" ? 'BAZOOKA missed!' : `BAZOOKA BLAST! Hit ${colorToSend.toUpperCase()}!`);
        showExplosion()
        playsound('assets/bazooka_sound.mp3');
        vibrateDevice(200);
        sendHitPayload('bazooka', colorToSend);
    }

    //Helper to send hit payloads
    function sendHitPayload(weapon, color) {
        const payload = {
            type: 'player_hit',
            gameId: currentGameId,
            color: color,
            username: playerName,
            weapon: weapon
        };
        socket.send(JSON.stringify(payload));
        console.log("Sent player_hit event:", payload);
    }
    // Simple sound player
    function playsound(url) {
        const sound = new Audio(url);
        sound.play();
    }

    //Vibrate device
    function vibrateDevice(duration) {
        if (navigator.vibrate) {
            navigator.vibrate(duration);
        }
    }

    // Simple explosion effect at x,y (defaults to center of screen)
    function showExplosion(x = window.innerWidth / 2, y = window.innerHeight / 2) {
        const container = document.getElementById("weapon-effects");
        const boom = document.createElement("div");
        boom.className = "explosion";

        // center explosion at x,y
        boom.style.left = `${x - 40}px`;
        boom.style.top = `${y - 40}px`;
        boom.style.position = "absolute";

        container.appendChild(boom);

        // remove after animation
        setTimeout(() => boom.remove(), 700);
    }

    // Continue button listener for the username screen
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            const name = usernameInput ? usernameInput.value.trim() : '';
            if (!name) {
                showMessageBox("Please enter your name!");
                return;
            }

            playerName = name;
            socket.send(JSON.stringify({
                type: 'login',
                username: playerName
            }));
            showScreen(homeScreen);
        });
    }

    // Leave game handlers
    const leaveBtn = document.getElementById('leaveButton');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (!currentGameId) {
                showScreen(homeScreen);
                return;
            }
            socket.send(JSON.stringify({
                type: 'leave_game',
                gameId: currentGameId,
                username: playerName,
                role: 'spectator'
            }));
            currentGameId = null;
            showScreen(homeScreen);
            closeAllPeers();
        });
    }

    const leavePlayerBtn = document.getElementById('leaveGamePlayerBtn');
    if (leavePlayerBtn) {
        leavePlayerBtn.addEventListener('click', () => {
            if (currentGameId) {
                socket.send(JSON.stringify({
                    type: 'leave_game',
                    gameId: currentGameId,
                    username: playerName,
                    role: 'player'
                }));
            }
            currentGameId = null;
            const shootButtonEl = document.getElementById('shootButton');
            if (shootButtonEl) {
                shootButtonEl.disabled = false;
                shootButtonEl.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (leavePlayerBtn) leavePlayerBtn.classList.add('hidden');
            showScreen(homeScreen);
            closeAllPeers();
        });
    }

    // Close message modal
    const closeMsg = document.getElementById('closeMessageBox');
    if (closeMsg) {
        closeMsg.addEventListener('click', () => {
            hideMessageBox();
        });
    }

    socket.addEventListener('open', () => {
        console.log("WebSocket connected");
        // If page is served over http (non-localhost) warn about WebRTC HTTPS requirement
        if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            console.warn("Page served over plain HTTP on a non-localhost host. Some browsers (mobile) will block camera / WebRTC. Use HTTPS (ngrok or real cert) for best compatibility.");
        }
    });

    socket.addEventListener('close', () => {
        console.log("WebSocket closed");
        closeAllPeers();
    });
}); // DOMContentLoaded
