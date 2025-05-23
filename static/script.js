const Status = {
  DISCONNECTED: 'disconnected',
  CONNECTED: 'connected',
  JOINED: 'joined',
  GAME_STARTED: 'game_started',
  GAME_ENDED: 'game_ended',
}
const GAME_WIDTH = 300;
const GAME_HEIGHT = 450;
const PLAYER_RADIUS = 15;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 2;
const UPDATE_RATE = 50; // 30 updates/sec (ms)
// Colors
const BALL_COLOR = 'white';
const PLAYER_TEAM0_COLOR = 'blue';
const PLAYER_TEAM1_COLOR = 'red';
const BACKGROUND_COLOR = '#4CAF50';

let status = Status.DISCONNECTED;
const DOM = {};
let playerId = null;
let currentRoom = null;
let position = null;
let keysPressed = {};
let lastUpdateTime = 0; // For throttling player_move

window.onload = () => {
  DOM.lobby = document.getElementById('lobby');
  DOM.playerIdLabel = document.getElementById('player-id-label');
  // DOM.playersList = document.getElementById('players-list');
  DOM.roomList = document.getElementById('room-list');
  DOM.createGameBtn = document.getElementById('create-game-btn');
  DOM.roomIdInput = document.getElementById('room-id-input');
  DOM.joinGameBtn = document.getElementById('join-game-btn');
  DOM.startGameBtn = document.getElementById('start-game-btn');
  DOM.leaveGameBtn = document.getElementById('leave-game-btn');
  DOM.gameCanvas = document.getElementById('game-canvas');
  DOM.gameContainer = document.getElementById('game-container');
  DOM.ctx = DOM.gameCanvas.getContext('2d');
  DOM.scores = [
    document.getElementById('score0'),
    document.getElementById('score1'),
  ];

  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
  DOM.gameContainer.querySelector('#touch-controls').style.display = isTouchDevice ? 'grid' : 'none';

  // Set up event listeners
  DOM.createGameBtn.addEventListener('click', handleCreateGame);
  DOM.joinGameBtn.addEventListener('click', handleJoinGame);
  DOM.leaveGameBtn.addEventListener('click', handleLeaveGame);
  DOM.startGameBtn.addEventListener('click', handleStartGame);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);


// Touch button handling
  DOM.touchButtons = [
    document.getElementById('touch-up'),
    document.getElementById('touch-left'),
    document.getElementById('touch-right'),
    document.getElementById('touch-down')
  ];

  DOM.touchButtons.forEach(button => {
    if (button) {
      button.addEventListener('touchstart', (event) => {
        event.preventDefault();
        const key = button.dataset.key;
        keysPressed[key] = true;
      });
      button.addEventListener('touchend', (event) => {
        event.preventDefault();
        const key = button.dataset.key;
        keysPressed[key] = false;
      });
    }
  });
}


const socket = io();

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
    if (!room.players.includes(playerId)) {
      return;
    }
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
    roomIdLabel.textContent = `Game ID: ${room.room_id}`;
    roomDiv.appendChild(roomIdLabel);

    const playerListDiv = document.createElement('div');
    playerListDiv.classList.add('player-list', 'bg-gray-800', 'p-2', 'rounded-lg');
    roomDiv.appendChild(playerListDiv);

    room.players.forEach(playerId => {
      const playerLi = document.createElement('p');
      playerLi.classList.add('player', 'text-gray-300', 'py-1', 'pl-2');
      playerLi.textContent = playerId;
      playerListDiv.appendChild(playerLi);
    });
  });
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

socket.on('game_started', (data) => {
  console.log('Game started:', data);
  status = Status.GAME_STARTED;
  DOM.lobby.style.display = 'none';
  DOM.gameContainer.style.display = 'block';
  // DOM.gameCanvas.width = GAME_WIDTH;
  // DOM.gameCanvas.height = GAME_HEIGHT;
  gameLoop();
});

socket.on('game_state', (state) => {
  // console.log('Game state:', state);
  position = state.players[playerId];
  // console.log('Player position:', position);
  renderGame(state);
});

socket.on('goal_scored', (data) => {
  console.log('Goal scored:', data);
  const teamIndex = data.team;
  const scoreElement = DOM.scores[teamIndex];
  let score = parseInt(scoreElement.textContent) || 0;
  score += 1;
  scoreElement.textContent = score;
});


function renderGame(state) {
  const ctx = DOM.ctx;
  // Clear the canvas
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Draw goals
  ctx.fillStyle = 'white';
  ctx.fillRect(GAME_WIDTH / 4, 0, GAME_WIDTH / 2, 5); // Top goal
  ctx.fillRect(GAME_WIDTH / 4, GAME_HEIGHT, GAME_WIDTH / 2, -5); // Bottom goal

  // Draw ball
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = BALL_COLOR;
  ctx.fill();

  // Draw players
  Object.entries(state.players).forEach(([id, player]) => {
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = player.team === 0 ? PLAYER_TEAM0_COLOR : PLAYER_TEAM1_COLOR;
    ctx.fill();
    // TODO: Stroke current player only after others
    if (id === playerId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'black';
      ctx.stroke();
    }
  });
}

// ===== Input Handling =====
function handleKeyDown(e) {
  const key = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    keysPressed[key] = true;
  }
}

function handleKeyUp(e) {
  const key = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    keysPressed[key] = false;
  }
}

// ===== Game Loop =====
function gameLoop() {
  // TODO: Check if game is started
  // console.log('Game loop running');
  if (position) {
    const prevPosition = {...position};

    // Update position
    if (keysPressed['ArrowUp']) position.y -= PLAYER_SPEED;
    if (keysPressed['ArrowDown']) position.y += PLAYER_SPEED;
    if (keysPressed['ArrowLeft']) position.x -= PLAYER_SPEED;
    if (keysPressed['ArrowRight']) position.x += PLAYER_SPEED;

    // Boundary check
    // position.x = Math.max(PLAYER_RADIUS, Math.min(GAME_WIDTH - PLAYER_RADIUS, position.x));
    // position.y = Math.max(PLAYER_RADIUS, Math.min(GAME_HEIGHT - PLAYER_RADIUS, position.y));

    // Send update if changed
    const now = Date.now();
    // console.log(now, lastUpdateTime, now - lastUpdateTime);
    if (now - lastUpdateTime >= UPDATE_RATE && (position.x !== prevPosition.x || position.y !== prevPosition.y)) {
      // console.log(position);
      // Unsafe - better to send position delta
      socket.emit('player_move', {
        x: position.x - prevPosition.x,
        y: position.y - prevPosition.y,
        timestamp: now,
      });
      lastUpdateTime = now;
    }
  }

  requestAnimationFrame(gameLoop);
}

// function updateUI() {
//   DOM.playersList.innerHTML = ''; // Clear the list
//   players.forEach(player => {
//     const li = document.createElement('li');
//     li.textContent = player;
//     DOM.playersList.appendChild(li);
//   });
// }

