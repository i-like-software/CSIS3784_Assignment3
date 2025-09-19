/**
 *
 * UI helpers for player view: score displays, timer, action messages, team label.
 * Exported functions:
 *  - updatePlayerScores(players)
 *  - updatePlayerTime(seconds)
 *  - updateActionLabel(message)
 *  - updateTeamName(teamName, color)
 *  - showMessageBox(message)
 *  - hideMessageBox()
 *  - endGame()
 */

/**
 * Formats seconds into a MM:SS string (e.g., 120 seconds becomes "02:00").
 * @param {number} seconds - The total seconds.
 * @returns {string} Formatted time string.
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Displays a custom message box overlay on the screen.
 * @param {string} message - The message text to display.
 */
function showMessageBox(message) {
    const messageBox = document.getElementById('messageBox');
    const messageText = document.getElementById('messageText');
    if (!messageBox || !messageText) return;
    messageText.textContent = message;
    messageBox.classList.remove('hidden');
}

/**
 * Hides the custom message box overlay.
 */
function hideMessageBox() {
    const messageBox = document.getElementById('messageBox');
    if (!messageBox) return;
    messageBox.classList.add('hidden');
}

/**
 * Updates the total scores displayed on the player's screen by processing
 * the full players array (same as spectator).
 * Expects each player: { id, username, score, team, spectator }
 * @param {Array<Object>} players
 */
function updatePlayerScores(players) {
    // Defensive: normalize players array
    players = players || [];

    // Use the player-view specific elements (IDs).
    const redScoreDisplay = document.getElementById('playerRedScore');
    const blueScoreDisplay = document.getElementById('playerBlueScore');

    // If those IDs are not present, attempt to fallback to selectors for older markup.
    const redDisplay = redScoreDisplay || document.querySelector('#playerViewScreen .text-red-500');
    const blueDisplay = blueScoreDisplay || document.querySelector('#playerViewScreen .text-blue-500');

    let redTeamTotalScore = 0;
    let blueTeamTotalScore = 0;

    players.forEach(player => {
        const t = (player.team || '').toString().toLowerCase();
        const s = Number(player.score) || 0;
        if (t === 'red') redTeamTotalScore += s;
        else if (t === 'blue') blueTeamTotalScore += s;
    });

    if (redDisplay) {
        // Player view top label shows only the total number (not full text)
        redDisplay.textContent = `RED: ${redTeamTotalScore}`;
    }
    if (blueDisplay) {
        blueDisplay.textContent = `BLUE: ${blueTeamTotalScore}`;
    }
}

/**
 * Updates the game timer displayed on the player's screen.
 * @param {number} seconds - The total seconds remaining.
 */
function updatePlayerTime(seconds) {
    const playerStatusLabel = document.getElementById('playerStatusLabel');
    if (playerStatusLabel) {
        playerStatusLabel.textContent = `Time Left: ${formatTime(seconds)}`;
    }
}

/**
 * Updates the action message displayed under the shoot button.
 * @param {string} message - The message to display (e.g., "You hit RED!").
 */
function updateActionLabel(message) {
    const callActionMessage = document.getElementById('callActionMessage');
    if (callActionMessage) {
        callActionMessage.textContent = message;
        callActionMessage.classList.remove('animate-pulse');
        void callActionMessage.offsetWidth; // Trigger reflow
        callActionMessage.classList.add('animate-pulse');
    }
}

/**
 * Updates the player's team name label.
 * @param {string} teamName - The player's team name (e.g., "RED", "BLUE").
 * @param {string} color - The CSS color for the text (e.g., "red", "blue", "#FF0000").
 */
function updateTeamName(teamName, color) {
    const teamNameLabel = document.getElementById('teamNameLabel');
    if (teamNameLabel) {
        teamNameLabel.textContent = `Your Team: ${teamName}`;
        if (color) teamNameLabel.style.color = color;
        teamNameLabel.style.textShadow = `0 0 8px ${color || '#fff'}`;
    }
}

/**
 * Function to handle the end of the game.
 * Makes the leave button visible and deactivates the weapons.
 */
function endGame() {
    const leaveButton = document.getElementById('leaveGamePlayerBtn');
    //Weapons
    const shootButton = document.getElementById('shootButton');
    const bazookaButton = document.getElementById('bazookaButton');
    const grenadeButton = document.getElementById('grenadeButton');

    if (leaveButton) {
        leaveButton.classList.remove('hidden'); // Make leave button visible
    }
    if (shootButton) {
        shootButton.disabled = true; // Deactivate shoot button
        shootButton.classList.add('opacity-50', 'cursor-not-allowed'); // Visual feedback for disabled
    }
    if (bazookaButton) {
        bazookaButton.disabled = true; // Deactivate bazooka button
        bazookaButton.classList.add('opacity-50', 'cursor-not-allowed'); // Visual feedback for disabled
    }
    if (grenadeButton) {
        grenadeButton.disabled = true; // Deactivate grenade button
        grenadeButton.classList.add('opacity-50', 'cursor-not-allowed'); // Visual feedback for disabled
    }
    updatePlayerTime(0);
}

export { updatePlayerScores, updatePlayerTime, updateActionLabel, updateTeamName, showMessageBox, hideMessageBox, endGame };
