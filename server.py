import copy
import os
import threading
import time
from random import randint

import eventlet

eventlet.monkey_patch()  # Required for WebSocket support

from flask import Flask, request, render_template
from flask_socketio import SocketIO, join_room, leave_room, emit


COLLISION_DISTANCE = 25
BALL_KICK_FORCE = 0.1
BALL_FRICTION = 0.99
UPDATE_INTERVAL = float(os.getenv('UPDATE_INTERVAL', 1 / 60))  # seconds
WIDTH = 300
HEIGHT = 450


app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app, async_mode='eventlet', cors_allowed_origins="*", message_compression=True)

players = []  # List of players
# Store game rooms (e.g., in-memory dictionary for simplicity)
game_rooms = {}  # {room_id: {'players': {sid: player_data}, 'state': game_state}}
players_rooms = {}  # {sid: room_id}


class GameStatus:
    WAITING = 'waiting'
    PLAYING = 'playing'
    ENDED = 'ended'


class GameState:
    def __init__(self):
        self.players = {}
        self.ball = {'x': WIDTH / 2, 'y': HEIGHT / 2, 'vx': 0, 'vy': 0}
        self._team_ctr = 0

    def reset_ball(self):
        self.ball['x'] = WIDTH / 2
        self.ball['y'] = HEIGHT / 2
        self.ball['vx'] = 0
        self.ball['vy'] = 0

    def init_players(self, player_ids):
        for player_id in player_ids:
            self.init_player(player_id)

    def init_player(self, player_id):
        self.players[player_id] = {
            'x': WIDTH / 2,
            'y': HEIGHT / 4 + self._team_ctr * HEIGHT / 2,
            'last_update': time.time(),
            'team': self._team_ctr,
        }
        self._team_ctr += 1
        self._team_ctr %= 2

    def update_player(self, player_id, x, y):
        if player_id not in self.players:
            raise ValueError(f"Player {player_id} not found in game state.")
        self.players[player_id]['x'] = x
        self.players[player_id]['y'] = y

    def to_json(self):
        return {
            'players': self.players,
            'ball': self.ball,
        }


# MAIN_ROOM = 'main_room'  # Default room for all players

@socketio.on('connect')
def handle_connect():
    print(f'Client {request.sid} connected')
    players.append(request.sid)
    # join_room(MAIN_ROOM)
    emit('connected', {'sid': request.sid})
    send_room_list()
    # emit('player_list', {'players': players}, to=MAIN_ROOM)


@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client {request.sid} disconnected')
    del players[players.index(request.sid)]
    # leave_room(MAIN_ROOM)
    # Clean up: Remove player from any room
    for room_id, room in game_rooms.items():
        if request.sid in room['players']:
            leave_room(room_id)
            # Remove player from the room['players'] list
            room['players'].remove(request.sid)
            players_rooms.pop(request.sid, None)
            if len(room['players']) == 0:
                del game_rooms[room_id]
            else:
                # Notify other players in the room
                emit('player_left', {'player_id': request.sid}, room=room_id)
            break
    send_room_list()
    # emit('player_list', {'players': players}, to=MAIN_ROOM)


@socketio.on('create_game')
def handle_create_game():
    print(f'Client {request.sid} requested to create a room')
    if players_rooms.get(request.sid) is not None:
        emit('already_in_room', {'room_id': players_rooms[request.sid]})
        return

    room_id = randint(1000, 9999)
    while room_id in game_rooms:
        room_id = randint(1000, 9999)
    join_room(room_id)
    game_rooms[room_id] = {
        'players': [request.sid],
        'status': GameStatus.WAITING,
        'state': GameState(),
        'thread': None,
        'last_update': time.time(),
    }
    players_rooms[request.sid] = room_id
    send_room_list()
    emit(
        'game_created',
        {'room_id': room_id},
        # , 'players': game_rooms[room_id]['players']},
        # broadcast=True,
    )


@socketio.on('join_game')
def handle_join_game(data):
    print('Handle join game by client:', request.sid)
    room_id = int(data['room_id'])
    if room_id not in game_rooms:
        emit('room_not_found', {'room_id': room_id})
        return

    if players_rooms.get(request.sid) is not None:
        emit('already_in_room', {'room_id': players_rooms[request.sid]})
        return

    if game_rooms[room_id]['status'] != GameStatus.WAITING:
        emit('game_already_started', {'room_id': room_id})
        return

    join_room(room_id)
    game_rooms[room_id]['players'].append(request.sid)
    players_rooms[request.sid] = room_id
    emit('game_joined', {'room_id': room_id})
    send_room_list()
    # emit(
    #     'player_joined',
    #     {'room_id': room_id, 'players': game_rooms[room_id]['players']},
    #     broadcast=True,
    # )

@socketio.on('leave_game')
def handle_leave_game(data):
    print('Handle leave game by client:', request.sid)
    room_id = players_rooms.get(request.sid)
    if room_id is not None:
        leave_room(room_id)
        game_rooms[room_id]['players'].remove(request.sid)
        players_rooms.pop(request.sid, None)
        if len(game_rooms[room_id]['players']) == 0:
            del game_rooms[room_id]
        else:
            emit('player_left', {'player_id': request.sid}, to=room_id)
        emit('game_left', {'room_id': room_id})
        # TODO: If host leaves, close room
        send_room_list()

def send_room_list():
    room_list = [
        {'room_id': room_id, 'players': room['players'], 'status': room['status']}
        for room_id, room in game_rooms.items()
    ]
    socketio.emit('room_list', {'rooms': room_list})


@socketio.on('start_game')
def handle_start_game():
    print('Handle start game by client:', request.sid)
    room_id = players_rooms.get(request.sid)
    if room_id is None:
        emit('not_in_room', {'error': 'You are not in any room'})
        return
    room = game_rooms.get(room_id)
    if room is None:
        emit('room_not_found', {'error': 'Room not found'})
        return
    # Start the game logic here
    emit('game_started', {'room_id': room_id}, to=room_id)
    room['status'] = GameStatus.PLAYING
    send_room_list()
    room['state'].init_players(game_rooms[room_id]['players'])
    send_game_state(room_id)
    room['thread'] = threading.Thread(
        target=game_loop,
        args=(room_id,),
        daemon=True
    )
    room['thread'].start()


def send_game_state(room_id):
    game_state = game_rooms[room_id]['state'].to_json()
    socketio.emit('game_state', game_state, to=room_id)


@socketio.on('player_move')
def handle_player_move(data):
    # print('Handle player move by client:', request.sid)
    # print('Player move data:', data)
    room_id = players_rooms.get(request.sid)
    if room_id is None:
        emit('not_in_room', {'error': 'You are not in any room'})
        return
    room = game_rooms.get(room_id)
    if room is None:
        emit('room_not_found', {'error': 'Room not found'})
        return

    delta_x = data.get('x')
    delta_y = data.get('y')
    x = room['state'].players[request.sid]['x'] + delta_x
    y = room['state'].players[request.sid]['y'] + delta_y
    timestamp = data.get('timestamp', time.time())
    last_update = room['state'].players[request.sid]['last_update']
    # print(last_update, timestamp, last_update < timestamp)
    if timestamp < last_update:
        return
    # print(x, y)
    # Handle ball collision
    ball = room['state'].ball
    if (x - ball['x']) ** 2 + (y - ball['y']) ** 2 < COLLISION_DISTANCE ** 2:
        dx = x - ball['x']
        dy = y - ball['y']
        ball['vx'] -= dx * BALL_KICK_FORCE
        ball['vy'] -= dy * BALL_KICK_FORCE
    room['state'].update_player(request.sid, x, y)
    room['state'].players[request.sid]['last_update'] = timestamp
    # send_game_state(room_id)

def game_loop(room_id):
    print("Game loop started for room:", room_id)
    while True:
        # print('Game loop iteration for room:', room_id)
        eventlet.sleep(UPDATE_INTERVAL)  # Simulate game loop delay
        room = game_rooms.get(room_id)
        if room is None:
            break  # Exit if the room is deleted

        # prev_state = copy.deepcopy(room['state'])
        ball = room['state'].ball
        prev_ball = copy.deepcopy(ball)

        # Update ball physics
        ball['x'] += ball['vx']
        ball['y'] += ball['vy']
        ball['vx'] *= BALL_FRICTION
        ball['vy'] *= BALL_FRICTION

        # Check goal
        if ball['y'] < 10 and WIDTH / 4 < ball['x'] < WIDTH * 3 / 4:
            print("Goal to team 0")
            socketio.emit('goal_scored', {'team': 1}, to=room_id)
            room['state'].reset_ball()
        elif ball['y'] > HEIGHT - 10 and WIDTH / 4 < ball['x'] < WIDTH * 3 / 4:
            print("Goal to team 1")
            socketio.emit('goal_scored', {'team': 0}, to=room_id)
            room['state'].reset_ball()

        # Boundary checks
        if (ball['x'] < min(10, prev_ball['x'])) or (ball['x'] > max(WIDTH - 10, prev_ball['x'])):
            ball['vx'] *= -1
        if (ball['y'] < min(10, prev_ball['y'])) or (ball['y'] > max(HEIGHT - 10, prev_ball['y'])):
            ball['vy'] *= -1

        # TODO: Broadcast state only if smth changed
        # if room['state'] != prev_state:
        # print(room['state'])
        send_game_state(room_id)
        # time.sleep(UPDATE_INTERVAL)
        # print("Game state sent to room:", room_id)

@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, use_reloader=False, debug=False)
