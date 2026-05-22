window.socket = null;
window.currentRoom = null;
window.roomUsers = [];
window.isHost = false;
window.roomHost = null;
window.roomPlaylist = [];
window.currentRoomTrackIndex = -1;

let socketInitialized = false;
let socketInitPromise = null;

function initSocket() {
    console.log('initSocket called, socket exists:', !!socket, 'connected:', socket?.connected);
    if (socket && socket.connected) {
        console.log('Returning existing socket:', socket.id);
        return Promise.resolve(socket);
    }
    
    if (socketInitPromise) {
        console.log('Returning existing promise');
        return socketInitPromise;
    }
    
    socketInitPromise = new Promise((resolve) => {
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsUrl = protocol + window.location.host;
        
        socket = io(wsUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10
        });
        
        socket.on('connect', function() {
            console.log('Socket connected:', socket.id);
            socketInitialized = true;
            if (window.currentRoom) {
                socket.emit('join_room', { room_code: window.currentRoom });
            }
            resolve(socket);
        });
        
        socket.on('disconnect', function() {
            console.log('Socket disconnected');
            socketInitialized = false;
        });
        
        socket.on('room_created', function(data) {
            console.log('=== ROOM_CREATED EVENT ===');
            console.log('Full data:', JSON.stringify(data, null, 2));
            console.log('host_id from server:', data.host_id);
            console.log('users_list from server:', data.users_list);
            console.log('socket.id:', socket.id);
            window.currentRoom = data.room_code;
            window.roomHost = data.host_id;
            window.roomUsers = data.users_list || [];
            console.log('SET roomUsers =', window.roomUsers);
            window.isHost = (String(socket.id) === String(window.roomHost));
            window.currentRoomTrackIndex = -1;
            window.roomPlaylist = data.room ? data.room.playlist || [] : [];
            updateRoomUI();
            showNotification('Комната: ' + data.room_code, 'success');
            openModal('roomModal');
            console.log('After openModal, roomUsers =', window.roomUsers);
            document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
        });
        
        socket.on('room_joined', function(data) {
            console.log('Room joined:', data);
            console.log('host_id from server:', data.host_id);
            console.log('users_list from server:', data.users_list);
            window.currentRoom = data.room_code;
            window.roomHost = data.host_id;
            window.roomUsers = data.users_list || [];
            window.isHost = (String(socket.id) === String(window.roomHost));
            window.currentRoomTrackIndex = data.current_track_index || 0;
            window.roomPlaylist = data.room ? data.room.playlist || [] : [];
            updateRoomUI();
            showNotification('Вы присоединились к комнате!', 'success');
            openModal('roomModal');
            console.log('roomUsers after set:', window.roomUsers);
            console.log('roomHost:', window.roomHost, 'socket.id:', socket.id, 'isHost:', window.isHost);
            document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
            
            if (data.current_track && !window.isHost) {
                setTimeout(() => {
                    playRoomTrack(data.current_track, data.current_time || 0);
                }, 500);
            }
        });
        
        socket.on('room_error', function(data) {
            showNotification(data.message || 'Ошибка комнаты', 'error');
            window.currentRoom = null;
            window.isHost = false;
            updateRoomUI();
        });
        
        socket.on('user_joined', function(data) {
            console.log('User joined:', data);
            window.roomUsers.push({
                id: data.user_id,
                socket_id: data.socket_id || data.user_id,
                username: data.username || 'Пользователь',
                avatar: data.avatar || ''
            });
            updateRoomUI();
            if (document.getElementById('roomModalContent')) {
                document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
            }
            showNotification((data.username || 'Пользователь') + ' присоединился', 'info');
        });
        
        socket.on('user_left', function(data) {
            console.log('User left:', data);
            window.roomUsers = window.roomUsers.filter(u => 
                u.id !== data.user_id && 
                u.socket_id !== data.user_id && 
                u.socket_id !== data.socket_id
            );
            updateRoomUI();
            if (document.getElementById('roomModalContent')) {
                document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
            }
        });
        
        socket.on('host_changed', function(data) {
            window.roomHost = data.new_host;
            window.isHost = (String(socket.id) === String(window.roomHost));
            if (data.new_host_id) {
                const hostUser = window.roomUsers.find(u => u.id === data.new_host_id);
                if (hostUser) {
                    hostUser.socket_id = data.new_host;
                }
            }
            updateRoomUI();
            if (document.getElementById('roomModalContent')) {
                document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
            }
            showNotification('Ведущий сменился', 'info');
        });
        
        socket.on('track_played', function(data) {
            console.log('Track played event received:', data);
            if (!window.isHost) {
                playRoomTrack(data.track, data.current_time || 0);
            }
            window.currentRoomTrackIndex = data.track_index || 0;
            if (document.getElementById('roomPlaylistContainer')) {
                updateRoomPlaylistUI();
            }
        });
        
        socket.on('track_paused', function(data) {
            console.log('=== TRACK PAUSED EVENT ===');
            console.log('isHost:', window.isHost, 'socket.id:', socket.id, 'roomHost:', window.roomHost);
            console.log('data:', data);
            if (!window.isHost && audioPlayer) {
                console.log('Pausing audio for listener');
                audioPlayer.pause();
                audioPlayer.currentTime = data.current_time || 0;
            } else {
                console.log('Skipping pause - this is host or no audioPlayer');
            }
        });
        
        socket.on('time_synced', function(data) {
            if (!isHost && audioPlayer && audioPlayer.src) {
                const diff = Math.abs(audioPlayer.currentTime - (data.current_time || 0));
                if (diff > 2) {
                    audioPlayer.currentTime = data.current_time || 0;
                }
            }
        });
        
        socket.on('playlist_updated', function(data) {
            roomPlaylist = data.playlist || [];
            currentRoomTrackIndex = data.current_index || 0;
            if (document.getElementById('roomPlaylistContainer')) {
                updateRoomPlaylistUI();
            }
        });
        
        socket.on('queue_added', function(data) {
            if (data.track) {
                roomPlaylist.push(data.track);
                if (document.getElementById('roomPlaylistContainer')) {
                    updateRoomPlaylistUI();
                }
            }
        });
    });
    
    return socketInitPromise;
}

async function playRoomTrack(track, startTime = 0) {
    if (!track) return;
    
    try {
        let trackUrl = track.url;
        
        if (!trackUrl && track.id) {
            const response = await fetch('/api/play_track/' + track.id);
            const trackData = await response.json();
            
            if (trackData && trackData.url) {
                trackUrl = trackData.url;
                track = { ...track, ...trackData };
            } else {
                showNotification(trackData.error || 'Не удалось загрузить трек', 'error');
                return;
            }
        }
        
        if (!trackUrl) {
            showNotification('URL трека не найден', 'error');
            return;
        }
        
        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.src = trackUrl;
            audioPlayer.currentTime = startTime;
            await audioPlayer.play().catch(e => {
                console.error('Play error:', e);
            });
            
            currentTrack = window.currentTrack = track;
            updatePlayerUI(track);
            updatePlayButton();
            showMiniNotification(track);
        }
    } catch (error) {
        console.error('Play room track error:', error);
        showNotification('Ошибка воспроизведения', 'error');
    }
}

function syncPlay() {
    if (!socket || !currentRoom || !isHost || !audioPlayer || !currentTrack) return;
    
    const track = currentTrack;
    
    if (!track.url && track.id) {
        fetch('/api/play_track/' + track.id)
            .then(r => r.json())
            .then(trackData => {
                if (trackData && trackData.url) {
                    const fullTrack = {
                        ...track,
                        url: trackData.url,
                        title: trackData.title || track.title,
                        artists: trackData.artist ? [trackData.artist] : track.artists,
                        cover_uri: trackData.cover || track.cover_uri
                    };
                    socket.emit('play_track', {
                        track: fullTrack,
                        track_index: currentRoomTrackIndex,
                        current_time: audioPlayer.currentTime
                    });
                }
            })
            .catch(console.error);
    } else {
        socket.emit('play_track', {
            track: track,
            track_index: currentRoomTrackIndex,
            current_time: audioPlayer.currentTime
        });
    }
}

function syncPause() {
    if (!socket || !window.currentRoom || !window.isHost || !audioPlayer) return;
    socket.emit('pause_track', { current_time: audioPlayer.currentTime });
}

function syncSeek() {
    if (!socket || !window.currentRoom || !window.isHost || !audioPlayer) return;
    socket.emit('seek_sync', { current_time: audioPlayer.currentTime });
}

function updateRoomUI() {
    const roomBtn = document.getElementById('roomBtn');
    const roomContent = document.getElementById('roomModalContent');
    
    if (!roomBtn) return;
    
    if (window.currentRoom) {
        roomBtn.innerHTML = '<i class="fas fa-users"></i> ' + window.currentRoom;
        roomBtn.style.background = 'var(--accent)';
        roomBtn.style.color = 'white';
    } else {
        roomBtn.innerHTML = '<i class="fas fa-users"></i>';
        roomBtn.style.background = '';
        roomBtn.style.color = '';
    }
    
    if (roomContent && !window.currentRoom) {
        roomContent.innerHTML = getRoomDefaultHTML();
    }
}

function getRoomDefaultHTML() {
    return '<div style="text-align:center;padding:20px;"><p style="color:var(--text-secondary);margin-bottom:24px;">Создайте комнату или присоединитесь</p><button onclick="initSocket();createRoom()" class="btn-primary" style="width:100%;margin-bottom:12px;padding:14px;"><i class="fas fa-plus"></i> Создать комнату</button><div style="display:flex;gap:8px;margin-top:20px;"><input type="text" id="joinRoomCode" placeholder="Код комнаты" style="flex:1;padding:12px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;color:#fff;"><button onclick="initSocket();joinRoomByCode()" class="glass-btn" style="padding:12px 16px;"><i class="fas fa-sign-in-alt"></i></button></div></div>';
}

function getRoomJoinedHTML() {
    console.log('getRoomJoinedHTML called - roomUsers:', window.roomUsers, 'roomHost:', window.roomHost, 'currentRoom:', window.currentRoom);
    const usersList = window.roomUsers.map(u => {
        const name = escapeHtml(u.username || u.display_name || 'Пользователь');
        const isRoomHost = (String(u.socket_id || u.id) === String(window.roomHost));
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:6px;"><div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="color:white;font-size:12px;"></i></div><div style="flex:1;font-size:13px;">' + name + '</div>' + (isRoomHost ? '<i class="fas fa-crown" style="color:gold;font-size:12px;"></i>' : '') + '</div>';
    }).join('');
    
    const playlistHTML = window.roomPlaylist && window.roomPlaylist.length > 0 
        ? window.roomPlaylist.slice(0, 10).map((t, i) => {
            const artists = t.artists ? t.artists.join(', ') : (t.artist || '');
            return '<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:4px;cursor:pointer;" onclick="playRoomPlaylistItem(' + i + ')"><div style="width:36px;height:36px;border-radius:4px;background:var(--bg-secondary);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:var(--text-muted);font-size:12px;"></i></div><div style="flex:1;min-width:0;font-size:12px;"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.title || 'Неизвестно') + '</div><div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(artists) + '</div></div></div>';
          }).join('')
        : '<p style="color:var(--text-muted);padding:10px;font-size:12px;">Плейлист пуст</p>';
    
    return '<div style="text-align:center;margin-bottom:20px;"><div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Код комнаты</div><div style="font-size:2rem;font-weight:bold;letter-spacing:0.2em;color:var(--accent);">' + window.currentRoom + '</div><button onclick="shareRoom()" class="btn-primary" style="margin-top:12px;padding:8px 16px;"><i class="fas fa-share"></i> Поделиться</button></div><div style="margin-bottom:16px;"><div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Участники (' + window.roomUsers.length + ')' + (window.isHost ? '<span style="color:var(--accent);">(Вы ведущий)</span>' : '<span style="color:var(--text-muted);">(Слушатель)</span>') + '</div><div style="max-height:150px;overflow-y:auto;">' + (usersList || '<p style="color:var(--text-muted);padding:10px;">Загрузка...</p>') + '</div></div><div style="margin-bottom:16px;"><div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Плейлист</div><div style="max-height:200px;overflow-y:auto;">' + playlistHTML + '</div></div>' + (window.isHost ? '<div style="margin-bottom:16px;"><input type="text" id="roomSearchInput" placeholder="Поиск трека..." style="width:100%;padding:10px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;color:#fff;font-size:13px;" onkeyup="if(event.key==\'Enter\')roomSearch()"><button onclick="roomSearch()" class="btn-primary" style="width:100%;margin-top:8px;padding:10px;"><i class="fas fa-plus"></i> Добавить трек</button></div>' : '') + '<button onclick="leaveRoom()" class="glass-btn" style="width:100%;padding:12px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.3);"><i class="fas fa-sign-out-alt"></i> Покинуть комнату</button>';
}

function updateRoomPlaylistUI() {
    const container = document.getElementById('roomPlaylistContainer');
    if (!container) return;
    
    if (!window.roomPlaylist || window.roomPlaylist.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Плейлист пуст</div>';
        return;
    }
    
    let html = '';
    window.roomPlaylist.forEach((track, index) => {
        const isActive = index === window.currentRoomTrackIndex;
        const artistsText = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : (track.artist || '');
        const cover = track.cover_uri || track.cover || '';
        
        html += '<div onclick="playRoomPlaylistItem(' + index + ')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-radius:8px;' + (isActive ? 'background:var(--bg-tertiary);border-left:3px solid var(--accent);' : '') + '"><div style="width:40px;height:40px;border-radius:6px;overflow:hidden;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (cover ? '<img src="' + cover + '" alt="" style="width:100%;height:100%;object-fit:cover;">' : '<i class="fas fa-music" style="color:var(--text-muted);"></i>') + '</div><div style="flex:1;min-width:0;"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;' + (isActive ? 'color:var(--accent);' : '') + '">' + escapeHtml(track.title || 'Неизвестно') + '</div><div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(artistsText) + '</div></div></div>';
    });
    
    container.innerHTML = html;
}

window.joinRoomByCode = function() {
    const code = document.getElementById('joinRoomCode') ? document.getElementById('joinRoomCode').value.trim() : '';
    if (code) {
        joinRoom(code);
    }
};

window.createRoom = async function() {
    console.log('=== createRoom START ===');
    console.log('Before initSocket - socket:', socket?.id, 'roomUsers:', roomUsers);
    await initSocket();
    console.log('After initSocket - socket:', socket?.id, 'roomUsers:', roomUsers);
    console.log('Emitting create_room...');
    socket.emit('create_room', {});
};

window.joinRoom = async function(roomCode) {
    console.log('joinRoom called with code:', roomCode);
    await initSocket();
    console.log('Socket ready, emitting join_room');
    socket.emit('join_room', { room_code: roomCode });
};

window.leaveRoom = function() {
    if (socket && window.currentRoom) {
        socket.emit('leave_room', {});
        window.currentRoom = null;
        window.roomUsers = [];
        window.isHost = false;
        window.roomHost = null;
        window.roomPlaylist = [];
        window.currentRoomTrackIndex = -1;
        updateRoomUI();
        const modal = document.getElementById('roomModal');
        if (modal) modal.style.display = 'none';
        showNotification('Вы покинули комнату', 'info');
    }
};

window.shareRoom = function() {
    if (!window.currentRoom) return;
    const url = window.location.origin + '?room=' + window.currentRoom;
    
    const modalContent = document.getElementById('roomModalContent');
    if (modalContent) {
        const existing = document.getElementById('roomShareSection');
        if (existing) existing.remove();
        
        const shareDiv = document.createElement('div');
        shareDiv.id = 'roomShareSection';
        shareDiv.style.cssText = 'margin:12px 0;padding:12px;background:var(--bg-tertiary);border-radius:8px;';
        shareDiv.innerHTML = `
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Пригласить по ссылке:</div>
            <div style="display:flex;gap:8px;">
                <input type="text" id="shareLinkInput" value="${url}" readonly style="flex:1;padding:8px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:6px;color:#fff;font-size:12px;" onclick="this.select()">
                <button onclick="navigator.clipboard.writeText('${url}').then(()=>showNotification('Ссылка скопирована!','success'))" class="glass-btn" style="padding:8px 12px;" title="Копировать"><i class="fas fa-copy"></i></button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:6px;"><i class="fas fa-info-circle"></i> По этой ссылке могут зайти как зарегистрированные пользователи, так и гости</div>
        `;
        modalContent.insertBefore(shareDiv, modalContent.querySelector('button:last-child'));
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showNotification('Ссылка скопирована!', 'success');
        }).catch(() => {
            prompt('Скопируйте код комнаты:', window.currentRoom);
        });
    }
};

window.playRoomPlaylistItem = function(index) {
    if (index < 0 || index >= roomPlaylist.length) return;
    
    currentRoomTrackIndex = index;
    const track = roomPlaylist[index];
    
    if (isHost) {
        if (!track.url && track.id) {
            fetch('/api/play_track/' + track.id)
                .then(r => r.json())
                .then(trackData => {
                    if (trackData && trackData.url) {
                        const fullTrack = {
                            ...track,
                            url: trackData.url,
                            title: trackData.title || track.title,
                            artists: trackData.artist ? [trackData.artist] : track.artists,
                            cover_uri: trackData.cover || track.cover_uri
                        };
                        
                        if (audioPlayer) {
                            audioPlayer.pause();
                            audioPlayer.src = fullTrack.url;
                            audioPlayer.currentTime = 0;
                            audioPlayer.play().catch(console.error);
                        }
                        
                        currentTrack = window.currentTrack = fullTrack;
                        updatePlayerUI(fullTrack);
                        updatePlayButton();
                        showMiniNotification(fullTrack);
                        
                        socket.emit('play_track', {
                            track: fullTrack,
                            track_index: index,
                            current_time: 0
                        });
                    }
                })
                .catch(console.error);
        } else if (track.url) {
            if (audioPlayer) {
                audioPlayer.pause();
                audioPlayer.src = track.url;
                audioPlayer.currentTime = 0;
                audioPlayer.play().catch(console.error);
            }
            
            currentTrack = window.currentTrack = track;
            updatePlayerUI(track);
            updatePlayButton();
            showMiniNotification(track);
            
            socket.emit('play_track', {
                track: track,
                track_index: index,
                current_time: 0
            });
        }
    } else {
        socket.emit('request_track', { track_index: index });
    }
    
    if (document.getElementById('roomPlaylistContainer')) {
        updateRoomPlaylistUI();
    }
};

async function checkLoggedIn() {
    try {
        const resp = await fetch('/api/profile');
        return resp.ok;
    } catch {
        return false;
    }
}

async function guestJoin(roomCode, guestName) {
    try {
        const resp = await fetch('/api/room/guest-join', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({room_code: roomCode, guest_name: guestName})
        });
        if (!resp.ok) {
            const err = await resp.json();
            showNotification(err.error || 'Ошибка входа как гость', 'error');
            return;
        }
        await initSocket();
        joinRoom(roomCode);
    } catch (e) {
        console.error('Guest join error:', e);
        showNotification('Ошибка сети', 'error');
    }
}

window.guestJoin = guestJoin;

document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
        const loggedIn = await checkLoggedIn();
        if (loggedIn) {
            initSocket();
            setTimeout(() => joinRoom(roomCode), 1000);
        } else {
            const name = prompt('Введите ваше имя для входа в комнату как гость:', 'Гость');
            if (name) {
                guestJoin(roomCode, name || 'Гость');
            }
        }
    }
});

const originalPlayTrack = window.playTrack;
window.playTrack = function(trackId) {
    if (socket && window.currentRoom && window.isHost) {
        fetch('/api/play_track/' + trackId)
            .then(r => r.json())
            .then(trackData => {
                if (trackData && trackData.url) {
                    const fullTrack = {
                        id: trackId,
                        title: trackData.title,
                        artists: trackData.artist ? [trackData.artist] : [],
                        cover_uri: trackData.cover,
                        url: trackData.url
                    };
                    socket.emit('play_track', {
                        track: fullTrack,
                        track_index: window.currentRoomTrackIndex,
                        current_time: 0
                    });
                }
            })
            .catch(() => {});
    }
    
    if (originalPlayTrack) {
        originalPlayTrack(trackId);
    }
};

const originalPauseTrack = window.pauseTrack;
window.pauseTrack = function() {
    if (originalPauseTrack) originalPauseTrack();
    if (socket && window.currentRoom && window.isHost && audioPlayer) {
        socket.emit('pause_track', { current_time: audioPlayer.currentTime });
    }
};

setInterval(() => {
    if (socket && window.currentRoom && window.isHost && audioPlayer && !audioPlayer.paused && audioPlayer.src) {
        socket.emit('sync_time', { current_time: audioPlayer.currentTime });
    }
}, 2000);

window.roomSearch = async function() {
    const query = document.getElementById('roomSearchInput')?.value;
    if (!query) return;
    
    try {
        const response = await fetch('/api/search?q=' + encodeURIComponent(query));
        const data = await response.json();
        
        if (data.tracks && data.tracks.length > 0) {
            const track = data.tracks[0];
            socket.emit('add_to_playlist', { track: track });
            showNotification('Добавлено в плейлист комнаты', 'success');
        } else {
            showNotification('Трек не найден', 'error');
        }
    } catch (e) {
        console.error('Room search error:', e);
        showNotification('Ошибка поиска', 'error');
    }
};

window.playRoomPlaylistItem = function(index) {
    if (!window.roomPlaylist || !window.roomPlaylist[index]) return;
    
    const track = window.roomPlaylist[index];
    playRoomTrack(track, 0);
};

if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
    document.head.appendChild(script);
}
