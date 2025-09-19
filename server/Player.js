const { json } = require("express");

class Player {
    constructor(id, socket) {
        this.id = id;
        this.socket = socket;
        this.score = 0;
        this.host = false; // Indicates if this player is the host
        this.spectator = false; // Indicates if this player is a spectator
        this.team = null
        /*(gameId) ? this.gameId = gameId : socket.send(JSON.stringify({
            type: 'error',
            message: 'Game ID is required to join a game.'
        })); // The game this player is currently in*/
    }
    getTeam(){
        return this.team;
    }
    setTeam(team) {
        this.team = team;
    }
    updateScore(points) {
        this.score = Math.max(0, this.score + points);
    }

    setHost(isHost) {
        this.host = isHost;
        try {
            this.checkContradiction();
        } catch (error) {
            this.host = false; // Reset spectator status if contradiction occurs
        }
    }
    setSpectator(isSpectator) {
        this.spectator = isSpectator;
        try {
            this.checkContradiction();
        } catch (error) {
            this.spectator = false; // Reset spectator status if contradiction occurs
        }
        this.checkContradiction();
    }
    checkContradiction(){
        if (this.host && this.spectator) {
            this.socket.send(JSON.stringify({
                type: 'error',
                message: 'A player cannot be both a host and a spectator at the same time.'
            }));
            throw new Error("A player cannot be both a host and a spectator at the same time.");
        }
    }
}

module.exports = Player;