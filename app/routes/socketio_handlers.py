from flask import request, session, jsonify
from models import db, User
from app import app, socketio
from extensions import rooms, room_codes, guest_users, guest_id_counter
from flask_socketio import emit, join_room, leave_room
import random
import string

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    guest_id = session.get('guest_id')
    if guest_id and guest_id in guest_users:
        guest_users[guest_id]['sid'] = request.sid

@socketio.on('disconnect')
def handle_disconnect():
    for room_code, room in list(rooms.items()):
        for uid in list(room['users'].keys()):
            if room['users'][uid]['sid'] == request.sid:
                leave_room(room_code)
                del room['users'][uid]
                emit('user_left', {'user_id': uid}, room=room_code)
                if len(room['users']) == 0:
                    del rooms[room_code]
                    for rc in list(room_codes.keys()):
                        if room_codes[rc] == room_code:
                            del room_codes[rc]
                if uid < 0 and uid in guest_users:
                    del guest_users[uid]
                break

@socketio.on('create_room')
def handle_create_room(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid < 0:
        emit('room_error', {'message': 'Не авторизован'})
        return
    
    room_code = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))
    rooms[room_code] = {
        'host': uid,
        'users': {},
        'current_track': None,
        'is_playing': False,
        'current_time': 0,
        'playlist': []
    }
    
    rooms[room_code]['users'][uid] = {
        'sid': request.sid,
        'username': uname,
        'avatar': uavatar
    }
    
    room_codes[uid] = room_code
    join_room(room_code)
    
    users_list = [{
        'id': uid,
        'socket_id': request.sid,
        'username': uname,
        'avatar': uavatar
    }]
    
    emit('room_created', {
        'room_code': room_code,
        'room': rooms[room_code],
        'host_id': request.sid,
        'users_list': users_list
    })

@socketio.on('join_room')
def handle_join_room(data):
    uid, uname, uavatar = _resolve_user()
    if not uid:
        emit('room_error', {'message': 'Не авторизован'})
        return
    
    room_code = data.get('room_code', '').upper()
    if room_code not in rooms:
        emit('room_error', {'message': 'Комната не найдена'})
        return
    
    rooms[room_code]['users'][uid] = {
        'sid': request.sid,
        'username': uname,
        'avatar': uavatar
    }
    
    room_codes[uid] = room_code
    join_room(room_code)
    
    host_user_id = rooms[room_code]['host']
    host_sid = rooms[room_code]['users'].get(host_user_id, {}).get('sid', '')
    
    users_list = []
    for k, v in rooms[room_code]['users'].items():
        users_list.append({
            'id': k,
            'socket_id': v.get('sid', ''),
            'username': v.get('username', ''),
            'avatar': v.get('avatar', '')
        })
    
    emit('room_joined', {
        'room_code': room_code,
        'room': rooms[room_code],
        'host_id': host_sid,
        'users_list': users_list,
        'current_track': rooms[room_code].get('current_track'),
        'is_playing': rooms[room_code].get('is_playing', False),
        'current_time': rooms[room_code].get('current_time', 0)
    })
    
    emit('user_joined', {
        'user_id': uid,
        'socket_id': request.sid,
        'username': uname,
        'avatar': uavatar
    }, room=room_code, include_self=False)

@socketio.on('leave_room')
def handle_leave_room(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code in rooms:
        user_sid = request.sid
        if uid in rooms[room_code]['users']:
            del rooms[room_code]['users'][uid]
        
        emit('user_left', {'user_id': uid, 'socket_id': user_sid}, room=room_code)
        
        if len(rooms[room_code]['users']) == 0:
            del rooms[room_code]
        elif rooms[room_code]['host'] == uid:
            new_uid = list(rooms[room_code]['users'].keys())[0]
            rooms[room_code]['host'] = new_uid
    leave_room(room_code)
    del room_codes[uid]

@socketio.on('play_track')
def handle_play_track(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    track = data.get('track')
    current_time = data.get('current_time', 0)
    track_index = data.get('track_index', 0)
    
    rooms[room_code]['current_track'] = track
    rooms[room_code]['is_playing'] = True
    rooms[room_code]['current_time'] = current_time
    rooms[room_code]['current_track_index'] = track_index
    
    emit('track_played', {
        'track': track,
        'current_time': current_time,
        'track_index': track_index,
        'user_id': uid
    }, room=room_code, include_self=False)

@socketio.on('pause_track')
def handle_pause_track(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['is_playing'] = False
    rooms[room_code]['current_time'] = current_time
    
    emit('track_paused', {
        'current_time': current_time,
        'user_id': uid
    }, room=room_code)

@socketio.on('sync_time')
def handle_sync_time(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['current_time'] = current_time
    
    emit('time_synced', {
        'current_time': current_time
    }, room=room_code, include_self=False)

@socketio.on('seek_sync')
def handle_seek_sync(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['current_time'] = current_time
    
    emit('seek_synced', {
        'current_time': current_time
    }, room=room_code, include_self=False)

@socketio.on('queue_sync')
def handle_queue_sync(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    room = rooms[room_code]
    if room['host'] != uid:
        return
    
    queue = data.get('queue', [])
    current_index = data.get('current_index', 0)
    current_track = data.get('current_track')
    
    rooms[room_code]['playlist'] = queue
    rooms[room_code]['current_track'] = current_track
    rooms[room_code]['current_time'] = data.get('current_time', 0)
    rooms[room_code]['is_playing'] = data.get('is_playing', False)
    
    emit('queue_synced', {
        'queue': queue,
        'current_index': current_index,
        'current_track': current_track,
        'current_time': data.get('current_time', 0),
        'is_playing': data.get('is_playing', False)
    }, room=room_code, include_self=False)

@socketio.on('add_to_room_playlist')
def handle_add_to_playlist(data):
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return
    
    track = data.get('track')
    if track:
        rooms[room_code]['playlist'].append(track)
        emit('playlist_updated', {
            'playlist': rooms[room_code]['playlist']
        }, room=room_code)

