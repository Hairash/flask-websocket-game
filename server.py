from random import randint

import eventlet

eventlet.monkey_patch()  # Required for WebSocket support

from flask import Flask, request, render_template
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app)

players = []  # List of players
# Store game rooms (e.g., in-memory dictionary for simplicity)
game_rooms = {}  # {room_id: {'players': {sid: player_data}, 'state': game_state}}
players_rooms = {}  # {sid: room_id}


class GameStatus:
    WAITING = 'waiting'
    PLAYING = 'playing'
    ENDED = 'ended'


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
    # Start the game logic here
    emit('game_started', {'room_id': room_id}, to=room_id)
    game_rooms[room_id]['status'] = GameStatus.PLAYING
    send_room_list()


@app.route('/')
def index():
    return render_template('index.html')


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, use_reloader=False, debug=False)
