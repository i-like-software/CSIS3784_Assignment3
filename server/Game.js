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
        // Event: Missed shot (0 points for the shooter)
        shooter.updateScore(0);

    } else if (shooter.team === color) {
        // Event: Hit own team / Friendly Fire
        // -5 points for the shooter.
        shooter.updateScore(-5);
        // -1 point for EACH player on the shooter's team (including the shooter again).
        for (const player of this.shooters.values()) {
            if (player.team === shooter.team) {
                player.updateScore(-1);
            }
        }

    } else { 
        // Event: Hit opposing team
        if (weapon === "shoot") {
            shooter.updateScore(1);
            this.DeductOpponentPoints(1, shooter.team === "blue" ? "red" : "blue");
        } else if (weapon === "grenade") {
            shooter.updateScore(10);
            this.DeductOpponentPoints(3, shooter.team === "blue" ? "red" : "blue");
        } else if (weapon === "bazooka") {
            shooter.updateScore(3);
            this.DeductOpponentPoints(2, shooter.team === "blue" ? "red" : "blue");
        }
        shooter.updateScore(5);
        // +2 points for EACH player on the shooter's team.
        for (const player of this.shooters.values()) {
            if (player.team === shooter.team) {
                player.updateScore(2);
            }
        }
    }
    
    this.recalculateTeamTotals();
    // Broadcast updates (provide shooterId so clients can know who caused the change immediately)
    this.broadcastScoreUpdate(shooterId);
  }

  //Helper to apply damage to opposing team players
  DeductOpponentPoints(damage, color){
          for (const player of this.shooters.values()) {
              if (player.team === color) { 
                  player.updateScore(damage);
              }
          }
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
