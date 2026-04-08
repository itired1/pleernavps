let socket = null;
let currentRoom = null;
let roomUsers = [];
let isHost = false;
let roomHost = null;
let roomPlaylist = [];
let currentRoomTrackIndex = -1;
let isRoomInitialized = false;

function initSocket() {
    if (socket) return socket;
    
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = protocol + window.location.host;
    
    socket = io(wsUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
    });
    
    socket.on('connect', function() {
        console.log('Socket connected');
        if (currentRoom) {
            socket.emit('join_room', { room_code: currentRoom });
        }
    });
    
    socket.on('disconnect', function() {
        console.log('Socket disconnected');
    });
    
    socket.on('room_created', function(data) {
        currentRoom = data.room_code;
        roomHost = data.host_id;
        isHost = socket.id === roomHost;
        currentRoomTrackIndex = -1;
        roomPlaylist = [];
        isRoomInitialized = true;
        updateRoomUI();
        showNotification('Комната создана: ' + data.room_code, 'success');
        
        document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
        loadRoomPlaylist();
    });
    
    socket.on('room_joined', function(data) {
        currentRoom = data.room_code;
        roomHost = data.host_id;
        isHost = socket.id === roomHost;
        roomUsers = data.users || [];
        currentRoomTrackIndex = data.current_track_index || -1;
        roomPlaylist = data.playlist || [];
        isRoomInitialized = true;
        updateRoomUI();
        showNotification('Вы присоединились к комнате', 'success');
        
        document.getElementById('roomModalContent').innerHTML = getRoomJoinedHTML();
        loadRoomPlaylist();
        
        if (data.current_track && !isHost) {
            setTimeout(() => {
                playRoomTrack(data.current_track, data.current_time || 0);
            }, 500);
        }
    });
    
    socket.on('room_error', function(data) {
        showNotification(data.message || 'Ошибка комнаты', 'error');
        currentRoom = null;
        isHost = false;
        updateRoomUI();
    });
    
    socket.on('user_joined', function(data) {
        roomUsers.push(data);
        updateRoomUI();
        showNotification(data.username + ' присоединился', 'info');
    });
    
    socket.on('user_left', function(data) {
        roomUsers = roomUsers.filter(u => u.id !== data.user_id && u.socket_id !== data.user_id);
        updateRoomUI();
    });
    
    socket.on('host_changed', function(data) {
        roomHost = data.new_host;
        isHost = socket.id === roomHost;
        updateRoomUI();
        showNotification('Ведущий сменился', 'info');
    });
    
    socket.on('track_played', function(data) {
        if (!isHost) {
            playRoomTrack(data.track, data.current_time || 0);
        }
        currentRoomTrackIndex = data.track_index || 0;
        updateRoomPlaylistUI();
    });
    
    socket.on('track_paused', function(data) {
        if (!isHost && audioPlayer) {
            audioPlayer.pause();
            audioPlayer.currentTime = data.current_time || 0;
        }
    });
    
    socket.on('time_synced', function(data) {
        if (!isHost && audioPlayer && audioPlayer.src) {
            const diff = Math.abs(audioPlayer.currentTime - (data.current_time || 0));
            if (diff > 1) {
                audioPlayer.currentTime = data.current_time || 0;
            }
        }
    });
    
    socket.on('seek_synced', function(data) {
        if (!isHost && audioPlayer) {
            audioPlayer.currentTime = data.current_time || 0;
        }
    });
    
    socket.on('playlist_updated', function(data) {
        roomPlaylist = data.playlist || [];
        currentRoomTrackIndex = data.current_index || 0;
        updateRoomPlaylistUI();
    });
    
    socket.on('queue_added', function(data) {
        if (data.track) {
            roomPlaylist.push(data.track);
            updateRoomPlaylistUI();
        }
    });
    
    return socket;
}

async function playRoomTrack(track, startTime = 0) {
    if (!track) return;
    
    try {
        let trackUrl = track.url;
        
        if (!trackUrl && track.id) {
            const baseUrl = localStorage.getItem('server_url') || '';
            const response = await fetch(baseUrl + '/api/play_track/' + track.id);
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
            
            currentTrack = track;
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
        const baseUrl = localStorage.getItem('server_url') || '';
        fetch(baseUrl + '/api/play_track/' + track.id)
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
    if (!socket || !currentRoom || !isHost || !audioPlayer) return;
    socket.emit('pause_track', { current_time: audioPlayer.currentTime });
}

function syncSeek() {
    if (!socket || !currentRoom || !isHost || !audioPlayer) return;
    socket.emit('seek_sync', { current_time: audioPlayer.currentTime });
}

function updateRoomUI() {
    const roomBtn = document.getElementById('roomBtn');
    const roomModal = document.getElementById('roomModal');
    const roomContent = document.getElementById('roomModalContent');
    
    if (!roomBtn) return;
    
    if (currentRoom) {
        roomBtn.innerHTML = '<i class="fas fa-users"></i> ' + currentRoom;
        roomBtn.style.background = 'var(--accent)';
        roomBtn.style.color = 'white';
    } else {
        roomBtn.innerHTML = '<i class="fas fa-users"></i>';
        roomBtn.style.background = '';
        roomBtn.style.color = '';
    }
    
    if (roomContent && !currentRoom) {
        roomContent.innerHTML = getRoomDefaultHTML();
    }
}

function getRoomDefaultHTML() {
    return `
        <div style="text-align: center; padding: 20px;">
            <p style="color: var(--text-secondary); margin-bottom: 24px;">Создайте комнату или присоединитесь к существующей</p>
            
            <button onclick="createRoom()" class="btn-primary" style="width: 100%; margin-bottom: 12px; padding: 14px;">
                <i class="fas fa-plus"></i> Создать комнату
            </button>
            
            <div style="display: flex; align-items: center; margin: 20px 0;">
                <div style="flex: 1; height: 1px; background: var(--border);"></div>
                <span style="padding: 0 12px; color: var(--text-muted); font-size: 12px;">ИЛИ</span>
                <div style="flex: 1; height: 1px; background: var(--border);"></div>
            </div>
            
            <div style="display: flex; gap: 8px;">
                <input type="text" id="joinRoomCode" placeholder="Код комнаты" style="flex: 1; padding: 12px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; color: #fff;">
                <button onclick="joinRoomByCode()" class="glass-btn" style="padding: 12px 16px;">
                    <i class="fas fa-sign-in-alt"></i>
                </button>
            </div>
        </div>
    `;
}

window.joinRoomByCode = function() {
    const code = document.getElementById('joinRoomCode').value.trim();
    if (code) {
        joinRoom(code);
    }
};

function getRoomJoinedHTML() {
    return `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">Код комнаты</div>
            <div style="font-size: 2rem; font-weight: bold; letter-spacing: 0.2em; color: var(--accent);">${currentRoom}</div>
            <button onclick="shareRoom()" class="btn-primary" style="margin-top: 12px; padding: 8px 16px;">
                <i class="fas fa-share"></i> Поделиться
            </button>
        </div>
        
        <div style="margin-bottom: 16px;">
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
                Участники (${roomUsers.length})
                ${isHost ? '<span style="color: var(--accent);">(Вы ведущий)</span>' : '<span style="color: var(--text-muted);">(Слушатель)</span>'}
            </div>
            <div style="max-height: 150px; overflow-y: auto;">
                ${roomUsers.map(u => `
                    <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 6px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-user" style="color: white; font-size: 12px;"></i>
                        </div>
                        <div style="flex: 1; font-size: 13px;">
                            ${escapeHtml(u.username || u.display_name || 'Пользователь')}
                        </div>
                        ${u.id === roomHost || u.socket_id === roomHost ? '<i class="fas fa-crown" style="color: gold; font-size: 12px;"></i>' : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 13px; color: var(--text-secondary);">Плейлист комнаты</span>
                ${isHost ? '<button onclick="addToRoomPlaylist()" class="glass-btn" style="padding: 4px 8px; font-size: 11px;"><i class="fas fa-plus"></i> Добавить</button>' : ''}
            </div>
            <div id="roomPlaylistContainer" style="max-height: 200px; overflow-y: auto;">
                <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
            </div>
        </div>
        
        <button onclick="leaveRoom()" class="glass-btn" style="width: 100%; padding: 12px; background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.3);">
            <i class="fas fa-sign-out-alt"></i> Покинуть комнату
        </button>
    `;
}

function updateRoomPlaylistUI() {
    const container = document.getElementById('roomPlaylistContainer');
    if (!container) return;
    
    if (!roomPlaylist || roomPlaylist.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Плейлист пуст</div>';
        return;
    }
    
    let html = '';
    roomPlaylist.forEach((track, index) => {
        const isActive = index === currentRoomTrackIndex;
        const artists = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : '';
        
        html += `
            <div class="search-item ${isActive ? 'active' : ''}" onclick="playRoomPlaylistItem(${index})" style="${isActive ? 'background: var(--bg-tertiary); border-left: 3px solid var(--accent);' : ''}">
                <div style="width: 40px; height: 40px; border-radius: 6px; overflow: hidden; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ${track.cover_uri ? `<img src="${track.cover_uri}" alt="" style="width: 100%; height: 100%; object-fit: cover;">` : '<i class="fas fa-music" style="color: var(--text-muted);"></i>'}
                </div>
                <div class="search-item-info">
                    <div class="search-item-title" style="${isActive ? 'color: var(--accent);' : ''}">${escapeHtml(track.title || 'Неизвестно')}</div>
                    <div class="search-item-artist">${escapeHtml(artists)}</div>
                </div>
                ${isHost ? `<button onclick="event.stopPropagation(); removeFromRoomPlaylist(${index})" style="padding: 6px; background: none; border: none; color: var(--text-secondary); cursor: pointer;"><i class="fas fa-times"></i></button>` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function loadRoomPlaylist() {
    updateRoomPlaylistUI();
}

window.playRoomPlaylistItem = function(index) {
    if (index < 0 || index >= roomPlaylist.length) return;
    
    currentRoomTrackIndex = index;
    const track = roomPlaylist[index];
    
    if (isHost) {
        if (!track.url && track.id) {
            const baseUrl = localStorage.getItem('server_url') || '';
            fetch(baseUrl + '/api/play_track/' + track.id)
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
                        
                        audioPlayer.pause();
                        audioPlayer.src = fullTrack.url;
                        audioPlayer.currentTime = 0;
                        audioPlayer.play().catch(console.error);
                        
                        currentTrack = fullTrack;
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
            audioPlayer.pause();
            audioPlayer.src = track.url;
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(console.error);
            
            currentTrack = track;
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
    
    updateRoomPlaylistUI();
};

window.removeFromRoomPlaylist = function(index) {
    if (!isHost || index < 0 || index >= roomPlaylist.length) return;
    roomPlaylist.splice(index, 1);
    socket.emit('playlist_update', { playlist: roomPlaylist, current_index: currentRoomTrackIndex });
    updateRoomPlaylistUI();
};

window.addToRoomPlaylist = function() {
    showNotification('Добавьте трек в очередь - он появится в комнате', 'info');
};

window.createRoom = function() {
    if (!socket) initSocket();
    socket.emit('create_room', {});
};

window.joinRoom = function(roomCode) {
    if (!socket) initSocket();
    socket.emit('join_room', { room_code: roomCode });
};

window.leaveRoom = function() {
    if (socket && currentRoom) {
        socket.emit('leave_room', {});
        currentRoom = null;
        roomUsers = [];
        isHost = false;
        roomHost = null;
        roomPlaylist = [];
        currentRoomTrackIndex = -1;
        updateRoomUI();
        
        const modal = document.getElementById('roomModal');
        if (modal) modal.style.display = 'none';
        
        showNotification('Вы покинули комнату', 'info');
    }
};

window.shareRoom = function() {
    if (!currentRoom) return;
    const url = window.location.origin + '?room=' + currentRoom;
    navigator.clipboard.writeText(url).then(() => {
        showNotification('Ссылка скопирована!', 'success');
    }).catch(() => {
        prompt('Скопируйте код комнаты:', currentRoom);
    });
};

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
        initSocket();
        setTimeout(() => {
            joinRoom(roomCode);
        }, 1000);
    }
});

const originalPlayTrack = window.playTrack;
window.playTrack = function(trackId) {
    if (socket && currentRoom && isHost) {
        const baseUrl = localStorage.getItem('server_url') || '';
        fetch(baseUrl + '/api/play_track/' + trackId)
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
                        track_index: currentRoomTrackIndex,
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

const originalPause = window.pauseTrack;
window.pauseTrack = function() {
    if (originalPause) originalPause();
    if (socket && currentRoom && isHost && audioPlayer) {
        socket.emit('pause_track', { current_time: audioPlayer.currentTime });
    }
};

setInterval(() => {
    if (socket && currentRoom && isHost && audioPlayer && !audioPlayer.paused && audioPlayer.src) {
        socket.emit('sync_time', { current_time: audioPlayer.currentTime });
    }
}, 2000);

if (typeof io === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.4/socket.io.min.js';
    document.head.appendChild(script);
}
