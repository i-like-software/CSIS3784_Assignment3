const { addPlayer, startGame, playerHitEventHandler } = require('./index');

// Creates a fake socket with a send method
function createFakeSocket(name) {
    return {
        readyState: 1,
        send: (msg) => {
            console.log(`[${name} socket]`, msg);
        }
    };
}

// Define a test game ID
const gameId = 'test-game';

// Add players to the game
addPlayer(gameId, 'player1', createFakeSocket('player1'));
addPlayer(gameId, 'player2', createFakeSocket('player2'));
addPlayer(gameId, 'player3', createFakeSocket('player3'));

// Start the game
startGame(gameId);

// Simulate player hits after some delay
setTimeout(() => {
    console.log('\nSimulating hits...');
    playerHitEventHandler(gameId, 'player1', 'player2');
}, 2000);

setTimeout(() => {
    playerHitEventHandler(gameId, 'player3', 'player1');
}, 4000);

setTimeout(() => {
    playerHitEventHandler(gameId, 'player1', 'player3');
}, 6000);

// End test after longer than game duration
setTimeout(() => {
    console.log('\nTest complete.');
    process.exit(0);
}, 65000);