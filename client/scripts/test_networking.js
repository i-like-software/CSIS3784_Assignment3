const url = window.location
console.log(url.host);

// Web socket stuff to send and receive connection
const socket = new WebSocket(`wss:${url.host}`);

socket.addEventListener('open', function (event) {
    let data = {
        type: 'login',
        message: 'Hello from client!',
        timestamp: new Date().toISOString(),
        username: 'Siyabonga',
        health: 100,
    }
    socket.send(JSON.stringify(data));

    let roomCode = '12345'; // Example room code
    playerJoin(roomCode);
    let username = 'Siyabonga'; // Example username
    login(username);

    let startRoomCode = '12345'; // Example room code to start the game
    startGame(startRoomCode);
});

function playerJoin(roomCode){
    if (socket.readyState === WebSocket.OPEN) {
        const event = {
            type: 'player_join',
            username: 'Siyabonga',
            health: 100,
            timestamp: Date.now(),
            roomCode: roomCode
        };
        socket.send(JSON.stringify(event));
    }
}

function playerLeft(roomCode){
    if (socket.readyState === WebSocket.OPEN) {

    }
}

function login(username){
    if (socket.readyState === WebSocket.OPEN) {
        const event = {
            type: 'login',
            username: username,
            timestamp: Date.now()
        };
        socket.send(JSON.stringify(event));
    }
}

function startGame(roomCode){
    if (socket.readyState === WebSocket.OPEN) {
        const event = {
            type: 'start_game',
            roomCode: roomCode,
            timestamp: Date.now()
        };
        socket.send(JSON.stringify(event));
    }
}
// Listen for messages from the server
socket.addEventListener('message', function (event) {
    console.log('Message from server:', event);
    let data;
    try {
        data = JSON.parse(event.data);
    } catch (e) {
        console.error('Invalid JSON:', event.data);
        return;
    }
    switch(data.type) {
        case 'timer_update':
            // Handle timer update event
            console.log(`Timer updated: ${data.timeRemaining} seconds remaining`);
            break;
        case 'login':
            // Handle player login event
            console.log(`Player logged in: ${data.username}`);
            break;
        case 'player_join':
            // Handle player joined event
            console.log(`Player joined: ${data.username}`);
            break;
        case 'player_left':
            // Handle player left event
            console.log(`Player left: ${data.username}`);
            break;
        case 'player_hit':
            // Handle player hit event
            console.log(`Player hit: ${data.username}`);
            break;
        case 'start_game':
            // Handle start game event
            console.log('Game started');
            break;
        default:
            (data.type === null || data.type === undefined) ?
            socket.send("Either event is Null or Undefined") :
            socket.send('Unknown event type:');
            console.log(`Unknown event type: ${data.type}`);
            break;
    }
});