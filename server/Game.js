// server/Game.js
const Player = require("./Player");
class Game {
  constructor(gameId) {
    this.gameId = gameId;
    this.shooters = new Map();
    this.GAME_DURATION = 2 * 60;
    this.gameTimer = null;
    this.gameInProgress = false;
    this.blueTeamScore = 0;
    this.redTeamScore = 0;
    this.spectators = new Map(); // List of spectators
    this.side = "blue"; // Default side for shooters joining the game
  }

  //This function now accepts a JavaScript object and handles stringifying it.
  broadcastAll(messageObject) {
    const JSONmessage = JSON.stringify(messageObject); // Convert the object to a string HERE.
    for (const player of this.shooters.values()) {
      const socket = player.socket;
      if (socket && socket.readyState === 1) {
        // 1 means WebSocket.OPEN
        socket.send(JSONmessage);
      }
    }
    for (const spectator of this.spectators.values()) {
      const socket = spectator.socket;
      if (socket && socket.readyState === 1) {
        socket.send(JSONmessage);
      }
    }
  }

  addSpectator(id, socket) {
    this.spectators.set(id, new Player(id, socket));
    this.spectators.get(id).setSpectator(true);
  }
  addPlayer(id, socket) {
    this.shooters.set(id, new Player(id, socket));
    let player = this.shooters.get(id);
    player.team = this.side;
    this.side = this.side === "blue" ? "red" : "blue"; // Alternate sides for next player
  }
  
  removePlayer(playerId) {
    this.shooters.delete(playerId);
  }

  removeSpectator(spectatorId) {
    this.spectators.delete(spectatorId);
  }

  getPlayer(id) {
    return this.shooters.get(id);
  }

  getPlayerList() {
    return Array.from(this.shooters.values()).map((player) => ({
      id: player.id,
      score: player.score,
      host: player.host,
      username: (player.socket && player.socket.username) ? player.socket.username : `Player-${player.id.slice(0,6)}`,
      spectator: player.spectator,
      team: player.team,
    }));
  }

  async startGame() {
    if (this.gameInProgress) return;
    this.gameInProgress = true;

    for (const player of this.shooters.values()) {
      player.score = 0;
    }
    this.redTeamScore = 0;
    this.blueTeamScore = 0;

    this.broadcastAll({
      type: "game_started",
      gameId: this.gameId,
    });

    let remainingTime = this.GAME_DURATION;
    const TICK_INTERVAL = 1000;
    await new Promise((resolve) => {
      this.gameTimer = setInterval(() => {
        remainingTime -= 1;

        this.broadcastAll({
          type: "timer_tick",
          timeLeftSeconds: Math.max(0, remainingTime),
          gameId: this.gameId,
        });

        if (remainingTime <= 0) {
          clearInterval(this.gameTimer);
          this.gameTimer = null;
          this.endGame();
          resolve("Game ended");
        }
      }, TICK_INTERVAL);
    });
    return "game_ended";
  }

  playerHitEventHandler(shooterId, color, weapon) {
  if (!this.gameInProgress) return;
  const shooter = this.shooters.get(shooterId);
  if (!shooter) return;

  if (color === "blank") {
    // Missed shot: no points
    return;
  } else if (shooter.team === color) {
    // Friendly fire: shooter -5, all teammates -1
    shooter.updateScore(-5);
    for (const player of this.shooters.values()) {
      if (player.team === shooter.team) {
        player.updateScore(-1);
      }
    }
  } else {
    // Hit opposing team
    let shooterPoints = 0;
    if (weapon === "shoot") {
      shooterPoints = 1;
    } else if (weapon === "grenade") {
      shooterPoints = 10;
    } else if (weapon === "bazooka") {
      shooterPoints = 3;
    }
    shooter.updateScore(shooterPoints);

  }
  this.recalculateTeamTotals();
  this.broadcastScoreUpdate(shooterId);
  }

  recalculateTeamTotals() {
    this.redTeamScore = 0;
    this.blueTeamScore = 0;
    for (const player of this.shooters.values()) {
        if (player.team === 'red') {
            this.redTeamScore += player.score;
        } else if (player.team === 'blue') {
            this.blueTeamScore += player.score;
        }
    }
  }

  // Broadcast both the full player list update and an explicit "score_update" message
  broadcastScoreUpdate(updatedPlayerId = null) {
    let playersList = this.getPlayerList();
    // First: existing player_list_update (keeps current client logic intact)
    this.broadcastAll({
      type: "player_list_update",
      players: playersList,
      gameId: this.gameId,
      redTeamScore: this.redTeamScore,
      blueTeamScore: this.blueTeamScore,
    });

    // Second: an explicit score_update message (helps clients immediately refresh score UI)
    this.broadcastAll({
      type: "score_update",
      players: playersList,
      gameId: this.gameId,
      redTeamScore: this.redTeamScore,
      blueTeamScore: this.blueTeamScore,
      updatedPlayerId: updatedPlayerId
    });
  }

  endGame() {
    this.gameInProgress = false;

    // Ensure team totals are accurate at the moment of ending the game.
    // This prevents stale totals causing an incorrect 'draw' result.
    this.recalculateTeamTotals();

    const winner = this.getWinner();
    this.broadcastAll({
      type: "game_over",
      winner: winner, // Send the whole winner object
      players: this.getPlayerList(),
      gameId: this.gameId,
    });

    clearInterval(this.gameTimer);
    this.gameTimer = null;
  }

  getWinner() {
    if (this.blueTeamScore === this.redTeamScore) {
      return "draw";
    } else if (this.blueTeamScore > this.redTeamScore) {
      return "blue";
    } else {
      return "red";
    }
  }
}

module.exports = Game;
