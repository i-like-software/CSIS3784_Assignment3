/**
 * Spectator UI: scoreboard + player POV grid
 * Exports: updateTime, updateScores, updateLobby
 */

/* Utility: format seconds to MM:SS */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/* Message box helpers (shared modal in index.html) */
function showMessageBox(message) {
    const messageBox = document.getElementById('messageBox');
    const messageText = document.getElementById('messageText');
    if (!messageBox || !messageText) return;
    messageText.textContent = message;
    messageBox.classList.remove('hidden');
}
function hideMessageBox() {
    const messageBox = document.getElementById('messageBox');
    if (!messageBox) return;
    messageBox.classList.add('hidden');
}

/* Initialization */
document.addEventListener('DOMContentLoaded', () => {
    updateScores([]);
    updateTime(0);
    updateLobby('Connecting...');
});

/* Update scoreboard */
function updateScores(players) {
    const redTeamPlayersBody = document.getElementById('redTeamPlayersBody');
    const blueTeamPlayersBody = document.getElementById('blueTeamPlayersBody');
    const redTeamScoreDisplay = document.getElementById('redTeamScore');
    const blueTeamScoreDisplay = document.getElementById('blueTeamScore');

    if (!redTeamPlayersBody || !blueTeamPlayersBody) return;

    redTeamPlayersBody.innerHTML = '';
    blueTeamPlayersBody.innerHTML = '';

    let redTeamTotalScore = 0;
    let blueTeamTotalScore = 0;

    // normalize team casing defensively
    const redTeamPlayers = players
      .filter(player => (player.team || '').toLowerCase() === 'red')
      .sort((a, b) => b.score - a.score);

    const blueTeamPlayers = players
      .filter(player => (player.team || '').toLowerCase() === 'blue')
      .sort((a, b) => b.score - a.score);

    redTeamPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        const rank = index + 1;
        row.innerHTML = `
            <td>${rank}</td>
            <td>${player.username}</td>
            <td>${player.score}</td>
        `;
        redTeamPlayersBody.appendChild(row);
        redTeamTotalScore += player.score;
    });

    blueTeamPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        const rank = index + 1;
        row.innerHTML = `
            <td>${rank}</td>
            <td>${player.username}</td>
            <td>${player.score}</td>
        `;
        blueTeamPlayersBody.appendChild(row);
        blueTeamTotalScore += player.score;
    });

    if (redTeamScoreDisplay) redTeamScoreDisplay.textContent = `Score: ${redTeamTotalScore}`;
    if (blueTeamScoreDisplay) blueTeamScoreDisplay.textContent = `Score: ${blueTeamTotalScore}`;

    // Also update the player POV grid order (ensure players exist)
    updatePOVGrid(players);

    console.log("Player and team scores updated.");
}

/* Update time */
function updateTime(seconds) {
    const timerEl = document.getElementById('gameTimer');
    if (timerEl) timerEl.textContent = formatTime(seconds);
    console.log(`Game time updated to ${formatTime(seconds)}`);
}

/* Lobby number */
function updateLobby(lobbyNumber) {
    const lobbyEl = document.getElementById('lobbyNumber');
    if (lobbyEl) lobbyEl.textContent = `Lobby: ${lobbyNumber}`;
    console.log(`Lobby number updated to: ${lobbyNumber}`);
}

/* Player POV grid management */
function updatePOVGrid(players) {
    const grid = document.getElementById('playerPOVGrid');
    if (!grid) return;

    const currentCards = Array.from(grid.querySelectorAll('.player-pov-card')).map(c => c.dataset.playerId);
    const incomingIds = players.filter(p => !p.spectator).map(p => p.id);

    // Remove cards not in incomingIds
    currentCards.forEach(id => {
        if (!incomingIds.includes(id)) {
            const el = grid.querySelector(`.player-pov-card[data-player-id="${id}"]`);
            if (el) el.remove();
        }
    });

    // Ensure each player has a placeholder card (actual video attached when remote stream arrives)
    players.forEach(p => {
        if (p.spectator) return;
        let card = grid.querySelector(`.player-pov-card[data-player-id="${p.id}"]`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'player-pov-card';
            card.dataset.playerId = p.id;
            card.innerHTML = `
                <div class="pov-header">
                    <div class="pov-username">${p.username || 'Player'}</div>
                    <div class="pov-team ${(p.team || '').toLowerCase() === 'red' ? 'pov-red' : 'pov-blue'}">${((p.team || '')).toUpperCase()}</div>
                </div>
                <video class="player-pov-video" autoplay playsinline muted></video>
                <div class="pov-footer"><span class="pov-status">Connecting...</span></div>
            `;
            grid.appendChild(card);
        } else {
            // Update meta if changed
            const nameEl = card.querySelector('.pov-username');
            if (nameEl && nameEl.textContent !== p.username) nameEl.textContent = p.username || 'Player';
            const teamEl = card.querySelector('.pov-team');
            if (teamEl) {
                const isRed = (p.team || '').toLowerCase() === 'red';
                teamEl.className = `pov-team ${isRed ? 'pov-red' : 'pov-blue'}`;
                teamEl.textContent = (p.team || '').toUpperCase();
            }
        }
    });
}

/* Listen for remote stream events dispatched by webrtc.js via game.js */
window.addEventListener('webrtc-remote-stream', (ev) => {
    const remoteId = ev.detail.id;
    const stream = ev.detail.stream;
    const grid = document.getElementById('playerPOVGrid');
    if (!grid) return;
    let card = grid.querySelector(`.player-pov-card[data-player-id="${remoteId}"]`);
    if (!card) {
        // create a minimal card if not present
        card = document.createElement('div');
        card.className = 'player-pov-card';
        card.dataset.playerId = remoteId;
        card.innerHTML = `
            <div class="pov-header"><div class="pov-username">Player</div><div class="pov-team pov-blue">?</div></div>
            <video class="player-pov-video" autoplay playsinline muted></video>
            <div class="pov-footer"><span class="pov-status">Connected</span></div>
        `;
        grid.appendChild(card);
    }

    const videoEl = card.querySelector('video.player-pov-video');
    if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.muted = true; // spectator sees muted video
        videoEl.play().catch(() => {});
    }
    const status = card.querySelector('.pov-status');
    if (status) status.textContent = 'Live';
});

export { updateTime, updateScores, updateLobby };
