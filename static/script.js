const socket = io();
const Status = {
  DISCONNECTED: 'disconnected',
  CONNECTED: 'connected',
  JOINED: 'joined',
  GAME_STARTED: 'game_started',
  GAME_ENDED: 'game_ended',
}
let status = Status.DISCONNECTED;
const DOM = {};
let playerId = null;
let currentRoom = null;
// let players = [];

window.onload = () => {
  DOM.playerIdLabel = document.getElementById('player-id-label');
  DOM.playersList = document.getElementById('players-list');
  DOM.roomList = document.getElementById('room-list');
  DOM.createGameBtn = document.getElementById('create-game-btn');
  DOM.roomIdInput = document.getElementById('room-id-input');
  DOM.joinGameBtn = document.getElementById('join-game-btn');
  DOM.startGameBtn = document.getElementById('start-game-btn');
  DOM.leaveGameBtn = document.getElementById('leave-game-btn');

  // Set up event listeners
  DOM.createGameBtn.addEventListener('click', handleCreateGame);
  DOM.joinGameBtn.addEventListener('click', handleJoinGame);
  DOM.leaveGameBtn.addEventListener('click', handleLeaveGame);
  DOM.startGameBtn.addEventListener('click', handleStartGame);
}


socket.on('connected', (data) => {
  console.log(`Connected with ID: ${data.sid}`);
  status = Status.CONNECTED;
  playerId = data.sid;
  DOM.playerIdLabel.textContent = `Your ID: ${playerId}`;
});

function handleCreateGame() {
  socket.emit('create_game');
}

socket.on('game_created', (data) => {
  // console.log(`Game created with ID: ${data.room_id}`);
  status = Status.JOINED;
  currentRoom = data.room_id;
  DOM.createGameBtn.style.display = 'none';
  DOM.roomIdInput.style.display = 'none';
  DOM.joinGameBtn.style.display = 'none';

  DOM.startGameBtn.style.display = 'block';
  DOM.leaveGameBtn.style.display = 'block';
});

socket.on('room_list', (data) => {
  console.log('Room list:', data);
  DOM.roomList.innerHTML = ''; // Clear existing rooms

  data.rooms.forEach(room => {
    const roomDiv = document.createElement('div');
    roomDiv.id = `room-${room.room_id}`;
    roomDiv.classList.add('room', 'p-4', 'rounded-lg', 'shadow-md', 'mb-4');
    if (room.status === 'playing') {
      roomDiv.classList.add('bg-green-800');
    } else {
      roomDiv.classList.add('bg-gray-700');
    }
    DOM.roomList.appendChild(roomDiv);

    const roomIdLabel = document.createElement('p');
    roomIdLabel.classList.add('room-id-label', 'text-lg', 'font-semibold', 'text-blue-400', 'mb-2');
    roomIdLabel.textContent = room.room_id;
    roomDiv.appendChild(roomIdLabel);

    const playerListDiv = document.createElement('div');
    playerListDiv.classList.add('player-list', 'bg-gray-800', 'p-2', 'rounded-lg');
    roomDiv.appendChild(playerListDiv);

    room.players.forEach(playerId => {
      const playerLi = document.createElement('p');
      playerLi.classList.add('player', 'text-gray-300', 'py-1', 'pl-2');
      playerLi.textContent = playerId;
      playerListDiv.appendChild(playerLi);
    })
  })
});

function handleLeaveGame() {
  socket.emit('leave_game', {room_id: DOM.roomIdInput.value.trim()});
}

socket.on('game_left', () => {
  status = Status.CONNECTED;
  DOM.createGameBtn.style.display = 'block';
  DOM.roomIdInput.style.display = 'block';
  DOM.joinGameBtn.style.display = 'block';

  DOM.startGameBtn.style.display = 'none';
  DOM.leaveGameBtn.style.display = 'none';
});

function handleJoinGame() {
  const roomId = DOM.roomIdInput.value.trim();
  if (!roomId) {
    alert('Please enter a room ID');
    return;
  }
  socket.emit('join_game', {room_id: roomId});
}

socket.on('game_joined', (data) => {
  console.log(`Joined game with ID: ${data.room_id}`);
  status = Status.JOINED;
  currentRoom = data.room_id;
  DOM.createGameBtn.style.display = 'none';
  DOM.roomIdInput.style.display = 'none';
  DOM.joinGameBtn.style.display = 'none';

  DOM.leaveGameBtn.style.display = 'block';
});

socket.on('player_joined', (data) => {
});

function handleStartGame() {
  socket.emit('start_game');
}

// function updateUI() {
//   DOM.playersList.innerHTML = ''; // Clear the list
//   players.forEach(player => {
//     const li = document.createElement('li');
//     li.textContent = player;
//     DOM.playersList.appendChild(li);
//   });
// }


// Handle game state updates
socket.on('game_state_updated', (gameState) => {
  console.log('Game state updated:', gameState);
  // Update game UI
});

// Send a player action
function sendPlayerAction(roomId, action) {
  socket.emit('player_action', {room_id: roomId, player_id: 'player1', action});
}

