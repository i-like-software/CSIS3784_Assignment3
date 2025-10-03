const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs");
const https = require("https");
const http = require("http");
const networkInterfaces = os.networkInterfaces();

const app = express();
app.use(express.static(path.join(__dirname, "../client")));

const getLocalExternalIP = () => {
  for (const iface of Object.values(networkInterfaces)) {
    for (const ifaceInfo of iface) {
      if (ifaceInfo.family === "IPv4" && !ifaceInfo.internal) {
        return ifaceInfo.address;
      }
    }
  }
  return "localhost";
};

const PORT = process.env.PORT || 3000;

// --- New production-ready server code ---
const server = http.createServer(app);
const LOCAL_IP = getLocalExternalIP();
server.listen(PORT, () => {
  console.log(`Server running at: http://${LOCAL_IP}:${PORT}`);
});
// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

const Game = require("./Game");
const activeGames = new Map();
const socketById = new Map(); // id -> ws socket

function createGame(gameId) {
  if (!activeGames.get(gameId)) {
    activeGames.set(gameId, new Game(gameId));
  }
  return activeGames.get(gameId);
}

const addPlayer = (gameId, playerId, socket, isSpectator) => {
  const game = activeGames.get(gameId);
  if (!game) {
    console.error(`Game with ID ${gameId} does not exist.`);
    return false;
  }
  isSpectator
    ? game.addSpectator(playerId, socket)
    : game.addPlayer(playerId, socket);
  console.log(`Player ${playerId} added to game ${gameId}.`);
  return true;
};

// WebSocket server
const { WebSocketServer } = require("ws");
const ws = new WebSocketServer({ server});
const { v4: uuidv4 } = require("uuid");

function sendError(socket, message, protocol) {
  socket.send(
    JSON.stringify({
      type: "error",
      message: message,
      protocol: protocol || null,
    })
  );
  console.error(`${message} \nProtocol: ${protocol || "Unknown"}`);
}

// Helper: find game by socket id
function findGameByParticipantId(id) {
  for (const [gId, game] of activeGames.entries()) {
    if (game.shooters.has(id) || game.spectators.has(id)) {
      return { game, gameId: gId };
    }
  }
  return null;
}

// Helper: forward WebRTC signaling
function forwardSignalingIfSameGame(fromId, toId, payload) {
  const fromGame = findGameByParticipantId(fromId);
  const toGame = findGameByParticipantId(toId);
  if (!fromGame || !toGame || fromGame.gameId !== toGame.gameId) {
    console.warn("Signaling forward blocked: peers not in same game", fromId, toId);
    return false;
  }
  const destSocket = socketById.get(toId);
  if (destSocket && destSocket.readyState === 1) {
    destSocket.send(JSON.stringify(payload));
    console.log("Forwarded signaling:", payload.type, "from", fromId, "to", toId);
    return true;
  } else {
    console.warn("Destination socket not found or not open:", toId);
    return false;
  }
}

ws.on("connection", (socket) => {
  socket.on("message", async function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.log("Invalid JSON:", message);
      return;
    }

    switch (data.type) {
      case "login":
        {
          let id = uuidv4();
          socket.id = id;
          socket.username = data.username || "anonymous";
          socketById.set(id, socket);
          socket.send(JSON.stringify({ type: "login_success", id }));
          console.log(`Player logged in: ${socket.username} (${id})`);
        }
        break;

      case "create_game":
        {
          const gameId = uuidv4().slice(0, 6).toUpperCase();
          console.log(`Game created with ID: ${gameId}`);
          const game = createGame(gameId);

          if (!socket.id) {
            socket.id = uuidv4();
            socketById.set(socket.id, socket);
          }
          game.addPlayer(socket.id, socket);
          const player = game.getPlayer(socket.id);
          player.setHost(true);

          socket.send(JSON.stringify({
            type: "game_created",
            gameId,
            message: "Game created successfully!"
          }));
          socket.send(JSON.stringify({
            type: "join_confirmed",
            gameId,
            message: `Joined game ${gameId} successfully as the host!`,
            team: player.team,
            role: 'player'
          }));

          const playerlist1 = activeGames.get(gameId).getPlayerList();
          activeGames.get(gameId).broadcastAll({
            type: "player_list_update",
            players: playerlist1
          });
        }
        break;

      case "player_join":
        {
          console.log(`Join request from: ${data.username} to ${data.gameId}`);
          if (!data.gameId || !activeGames.get(data.gameId)) {
            socket.send(JSON.stringify({
              type: "join_error",
              message: "Invalid Game ID. Please check the code."
            }));
            break;
          }

          if (!socket.id) {
            socket.id = uuidv4();
            socketById.set(socket.id, socket);
          }

          if (data.role === "spectator") {
            addPlayer(data.gameId, socket.id, socket, true);
            socket.send(JSON.stringify({
              type: "join_confirmed",
              gameId: data.gameId,
              message: `Joined game ${data.gameId} successfully as spectator`,
              role: 'spectator'
            }));
            console.log("Spectator created");
          } else if (data.role === "player") {
            addPlayer(data.gameId, socket.id, socket, false);
            const assignedTeam = activeGames.get(data.gameId).getPlayer(socket.id).team;
            socket.send(JSON.stringify({
              type: "join_confirmed",
              gameId: data.gameId,
              message: `Joined game ${data.gameId} successfully as player!`,
              team: assignedTeam,
              role: 'player'
            }));
            console.log(`Player ${socket.username} created`);
          }

          const playerlist = activeGames.get(data.gameId).getPlayerList();
          activeGames.get(data.gameId).broadcastAll({
            type: "player_list_update",
            players: playerlist
          });
        }
        break;

      case "leave_game":
        {
          const gameId = data.gameId;
          const game = activeGames.get(gameId);
          if (game) {
            if (data.role === "player") {
              game.removePlayer(socket.id);
            } else if (data.role === "spectator") {
              game.removeSpectator(socket.id);
            }
            const updatedPlayerList = game.getPlayerList();
            game.broadcastAll({ type: "player_list_update", players: updatedPlayerList });
          }
        }
        break;

      case "start_game":
        {
          console.log("Game start requested");
          const gameToStart = activeGames.get(data.gameId);
          if (gameToStart) {
            const result = await gameToStart.startGame();
            if (result === "game_ended") {
              activeGames.delete(data.gameId);
            }
          } else {
            sendError(socket, `Game ${data.gameId} not found`, "start_game_error");
          }
        }
        break;

      //handle player shots
       case "player_hit":
        {
          const { gameId, color, username, weapon } = data;
          const game = activeGames.get(gameId);
          if (!game) {
            console.error(`Game ${gameId} not found for player_hit`);
            break;
          }
          
          console.log(`${username} shot at ${color} in game ${gameId} with ${weapon}`);
          game.playerHitEventHandler(socket.id, color, weapon);
        }
        break;

      // WebRTC
      case "webrtc-offer":
        forwardSignalingIfSameGame(data.fromId, data.toId, data);
        break;
      case "webrtc-answer":
        forwardSignalingIfSameGame(data.fromId, data.toId, data);
        break;
      case "webrtc-ice":
        forwardSignalingIfSameGame(data.fromId, data.toId, data);
        break;

      default:
        console.log(`Unknown event type: ${data.type}`);
        break;
    }
  });

  socket.on("close", () => {
    console.log("WebSocket disconnected:", socket.username || socket.id);
    socketById.delete(socket.id);
    activeGames.forEach((game, gameId) => {
      if (game.shooters.has(socket.id) || game.spectators.has(socket.id)) {
        game.removePlayer(socket.id);
        game.removeSpectator(socket.id);
        const updatedPlayerList = game.getPlayerList();
        game.broadcastAll({ type: "player_list_update", players: updatedPlayerList });
      }
    });
  });
});
