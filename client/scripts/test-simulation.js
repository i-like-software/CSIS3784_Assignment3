import { updateTime, updateLobby, updateScores } from "./spectate-script.js";

// --- Global State for Test Simulation ---
let currentTestTime = 0;
let currentTestPlayers = [];
let testSimulationIntervalId;

/**
 * Helper function to get a random integer within a range.
 * This is usually defined in a utility script or spectate-script.js.
 * Including it here for self-containment if not already globally available.
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates initial dummy player data for the test simulation.
 * This function is internal to the simulation script.
 * @param {number} count - The number of dummy players to generate.
 * @returns {Array<Object>} An array of player objects.
 */
function generateTestPlayers(count) {
    const players = [];
    for (let i = 1; i <= count; i++) {
        players.push({
            name: `Player ${i}`,
            score: getRandomInt(0, 100),
            team: Math.random() > 0.5 ? 'red' : 'blue', // Assign a random team
        });
    }
    return players;
}

/**
 * Starts a continuous simulation of game time and score updates.
 * This simulates receiving live data from a server for testing purposes.
 * It calls the `updateTime` and `updateScores` functions (defined in spectate-script.js)
 * to update the UI.
 */
function startTestSimulation() {
    if (testSimulationIntervalId) clearInterval(testSimulationIntervalId); // Clear any existing simulation

    currentTestTime = 0; // Reset simulation time
    // Generate an even number of players, split between teams, or just random
    currentTestPlayers = generateTestPlayers(getRandomInt(4, 12)); // Generate 4-12 test players, ensuring at least one per team for visibility

    // Immediately update UI with initial simulated data
    // updateTime and updateScores are expected to be globally available from spectate-script.js
    if (typeof updateTime === 'function' && typeof updateScores === 'function') {
        updateTime(currentTestTime);
        updateScores(currentTestPlayers);
        updateLobby(getRandomInt(10000, 99999)); // Simulate a random lobby number
    } else {
        console.error("spectate-script.js functions (updateTime, updateScores) not available. Ensure it's loaded before test-simulation.js.");
        return;
    }


    testSimulationIntervalId = setInterval(() => {
        currentTestTime++;
        updateTime(currentTestTime); // Simulate time update

        // Simulate random score changes for test players
        currentTestPlayers.forEach(player => {
            player.score += getRandomInt(-5, 10); // Scores can go up or down slightly
            if (player.score < 0) player.score = 0; // Prevent negative scores
        });
        updateScores(currentTestPlayers); // Simulate score update

        // Stop simulation after a certain time for demonstration
        if (currentTestTime >= 300) { // Stop after 5 minutes (300 seconds)
            stopTestSimulation();
            showMessageBox("Test simulation ended. Game over!");
        }

    }, 1000); // Update every second
    console.log("Test simulation started.");
}

/**
 * Stops the current score and time test simulation.
 */
function stopTestSimulation() {
    if (testSimulationIntervalId) {
        clearInterval(testSimulationIntervalId);
        testSimulationIntervalId = null;
        console.log("Test simulation stopped.");
    }
    // Optionally clear display when simulation ends if needed for visual reset
    // updateScores([]);
    // updateTime(0);
}

// Automatically start the simulation when the DOM content is fully loaded
// This ensures that spectate-script.js has initialized its elements and functions.
document.addEventListener('DOMContentLoaded', () => {
    // A small delay can sometimes be useful to ensure all other scripts
    // (especially spectate-script.js) have fully executed their DOMContentLoaded logic.
    setTimeout(() => {
        startTestSimulation();
    }, 5000); // Delay by 100ms
});