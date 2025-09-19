## Player Class
### File: Player.js
*Represents a single player in the game.*

### Methods:

**constructor(id, socket)**  
**Description:** Creates a new player with a unique ID and Socket  
**Parameters:**  
    - id (string) -> Unique ID for the player  
    - socket (WebSocket) -> The player's WebSocket connection  
**Returns:** A new Player instance  

**updateScore(points)**  
**Description:** Adds point to the player's current score  
**Parameters:**  
    - points(number) - Number of points to add  
**Returns:** void  


## Game Class  
### File: Game.js  
*Handles all logic for a single session*  

### Methods:

**constructor(gameId)**  
**Description:** Creates a new game instance with a unique ID  
**Parameters:**  
    -gameId(string) -> Unique ID for the game session  
**Returns:** A new Game instance  

**addPlayer(id, socket)**  
**Description:** Adds a new player to this game  
**Parameters:**  
    - id (string) -> Unique player ID  
    - socket (WebSocket) -> They player's WebSocket connection  
**Retursn:** void  

**startGame()**  
**Description:** Starts the game timer, sets all player scores to zero, and broadcasts a start message and timer updates.  
**Parameters:** None  
**Returns:** void  

**playerHitEventHandler(shooterId, targetId)**  
**Description:** Handles a player hitting another player. Increases the shooter's score by 1 and broadcasts the updated score to all players  
**Parameters:**  
    - shooterId (string) -> ID of the shooting player  
    - targetId (string) -> ID of the player who was hit  
**Returns:** void  

**endGamae()**  
**Description:** Ends the game, stops the timer, determines the winner, and broadcasts a game-over message  
**Parameters:** None  
**Returns:** void  

**getWinner()**  
**Description:** Finds and returns the player with the highest score in this game  
**Parameters:** None  
**Returns:**  
 - Player object of the winning player  
 - null if no players exist  

**broadcastAll(message)**  
**Description:** Sends a JSON message to all the players in the game via their sockets  
**Parameters:**  
 - message (object) -> JSON object to send to all players  
**Returns:** void  


## Index Class  
### File: index.js  
*Manages multiple games and routes commands to the correct game instance*  

### Methods:

**createGame(gameId)**  
**Description:** Creates a new game if one does not exist for the given ID  
**Parameters:**  
    - gameId (string) -> Unique ID for the game  
**Returns:** Game instance  

**addPlayer(gameId, playerId, socket)**  
**Description:** Adds a player to the specified game  
**Parameters:**  
    - gameId (string) -> ID of the game  
    - playerId (string) -> Unique ID of the player  
    - socket (WebCocket) -> Player's WebSocket connection  
**Returns:** void  

**startGame(gameId)**  
**Description:** Starts the specified game  
**Parameters:**  
    - gameId (string) -> ID of the game  
**Returns:** void  

**playerHitEventHandler(gameId, shooterId, targetId)**  
**Description:** Handles a hit event in the specified game  
**Parameters:**  
    - gameId (string) -> ID of the game  
    - shooterId (string) -> ID of the player who shot  
    - targetId (string) -> ID of the player who was hit  
**Returns:** void  

### Protocols

#### Message Types

**update_players**  
- **Description:** Returns a new list of players that have joined the room.  
- **Parameters:** None  
- **Returns:** Array of player objects  

**join**  
- **Description:** Joins a game room.  
- **Parameters:**  
    - gameId (string): The game room ID  
    - role (string): Either "player" or "spectator"
    - username(string)  
- **Returns:** (join_confirmed)Confirmation and updated player list object  

**leave**  
- **Description:** Removes a player from a game room and updates the list with a "left" flag.  
- **Parameters:**  
    - gameId (string): The game room ID  
    - playerId (string): The player's unique ID  
- **Returns:** Confirmation and updated player list  

**start_game**  
- **Description:** Starts the game if all players are even, randomly assigns players to teams, assigns initial scores, and returns the full player list.  
- **Parameters:**  
    - gameId (string): The game room ID  
- **Returns:** Confirmation and updated player list  

**side_hit**  
- **Description:** Sends the updated group score to all users.  
- **Parameters:**  
    - group (string): The group/team affected  
    - score (number): The new group score  
- **Returns:** Updated group score  

**login**  
- **Description:** Logs in a user and sends the user ID to the client.  
- **Parameters:**  
    - username (string): The player's username  
- **Returns:** User ID and (login_success)confirmation  

**timer_tick**  
- **Description:** Sends the current game timer to all users.  
- **Parameters:**  
    - time (number): Time remaining in seconds  
- **Returns:** Current timer value  

**update_scores**  
- **Description:** Returns the current group scores.  
- **Parameters:** None  
- **Returns:** List of group scores  

**player_list_update**  
- **Description:** A request you make to the server to request players list.  
- **Parameters:** None  
- **Returns:** an object with confirmation of type(player_list_update) and a list of players

**end_game**  
- **Description:** Ends the game, deletes the game room instance, and cleans up all related data.  
- **Parameters:**  
    - gameId (string): The game room ID  
- **Returns:** (game_ended)Confirmation

**create_game**  
- **Description:** Instantiates a new game room and waits for all players to join.  
- **Parameters:**  
    - hostId (string): The host player's ID  
- **Returns:** The new game room ID and (game_created)confirmation 
**error**
-  **Description:** It is used to communicate error messages between the client and server
- **parameters**
    - message: Describe the error
    - protocol: (string || Null) explains where the error originated from (chosen between on of the other **types**)
- **returns** Nothing

#### Roles

- **player**
- **spectator**

#### isHost

- **true** or **false**

#### group

- **Blue**
- **Red**