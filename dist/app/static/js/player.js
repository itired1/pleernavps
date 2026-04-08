console.log('=== player.js loading ===');
let audioPlayer = null;
window.currentTrack = null;
let currentPlaylist = [];
let queue = [];
let currentTrackIndex = 0;
let isShuffle = false;
let isRepeat = false;
let repeatMode = 'off';
let bypassCensorship = true;
let listenHistory = [];
window.currentSource = null;
window.currentSourceTracks = [];

function saveQueueState() {
    const state = {
        queue: queue,
        currentTrackIndex: currentTrackIndex,
        currentTrack: currentTrack,
        isShuffle: isShuffle,
        repeatMode: repeatMode
    };
    localStorage.setItem('itired_queue', JSON.stringify(state));
}

function loadQueueState() {
    try {
        const saved = localStorage.getItem('itired_queue');
        if (saved) {
            const state = JSON.parse(saved);
            if (state.queue && state.queue.length > 0) {
                queue = state.queue;
                currentTrackIndex = state.currentTrackIndex || 0;
                isShuffle = state.isShuffle || false;
                repeatMode = state.repeatMode || 'off';
                
                if (state.currentTrack) {
                    currentTrack = window.currentTrack = state.currentTrack;
                    if (state.currentTrack.url && audioPlayer) {
                        audioPlayer.src = state.currentTrack.url;
                    }
                    updatePlayerUI(currentTrack);
                    updatePlayButton();
                }
                
                updateQueueUI();
                updateShuffleButton();
                updateRepeatButton();
                return true;
            }
        }
    } catch (e) {
        console.error('Load queue error:', e);
    }
    return false;
}

window.addToQueue = async function(trackId) {
    try {
        const track = await apiCall('track/' + trackId);
        if (track) {
            queue.push({
                id: track.id,
                title: track.title,
                artists: track.artists,
                cover_uri: track.cover_uri,
                service: track.service,
                url: track.url
            });
            showNotification('Добавлено в очередь', 'success');
            updateQueueDisplay();
        }
    } catch (error) {
        console.error('Add to queue error:', error);
        showNotification('Ошибка добавления', 'error');
    }
};

function updateQueueDisplay() {
    const container = document.getElementById('queueContainer');
    if (!container) return;
    
    if (!queue.length) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-list"></i><p>Очередь пуста</p></div>';
        return;
    }
    
    let html = '<div style="max-height: 400px; overflow-y: auto;">';
    
    if (currentTrack) {
        html += '<div style="padding: 8px 12px; font-size: 11px; color: var(--accent); text-transform: uppercase; border-bottom: 1px solid var(--border);">Сейчас играет</div>';
        html += '<div class="search-item" style="background: var(--bg-tertiary); cursor: default;">';
        var cover = currentTrack.cover_uri 
            ? '<img src="' + currentTrack.cover_uri + '" alt="" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;">'
            : '<div style="width: 44px; height: 44px; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-play" style="color: #fff;"></i></div>';
        var currentArtists = currentTrack.artists ? (Array.isArray(currentTrack.artists) ? currentTrack.artists.join(', ') : currentTrack.artists) : (currentTrack.artist || '');
        html += cover +
            '<div class="search-item-info">' +
            '<div class="search-item-title" style="color: var(--accent);">' + escapeHtml(currentTrack.title) + '</div>' +
            '<div class="search-item-artist">' + escapeHtml(currentArtists) + '</div>' +
            '</div></div>';
    }
    
    if (queue.length) {
        html += '<div style="padding: 8px 12px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--border); margin-top: 8px;">В очереди (' + queue.length + ')</div>';
        
        queue.forEach(function(item, index) {
            var cover = item.cover_uri 
                ? '<img src="' + item.cover_uri + '" alt="" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;">'
                : '<div style="width: 44px; height: 44px; background: var(--bg-tertiary); border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-music" style="color: var(--text-secondary);"></i></div>';
            var itemArtists = item.artists ? (Array.isArray(item.artists) ? item.artists.join(', ') : item.artists) : (item.artist || '');
            
            html += '<div class="search-item" onclick="playFromQueue(' + index + ')">' +
                cover +
                '<div class="search-item-info">' +
                '<div class="search-item-title">' + escapeHtml(item.title) + '</div>' +
                '<div class="search-item-artist">' + escapeHtml(itemArtists) + '</div>' +
                '</div>' +
                '<button onclick="event.stopPropagation(); removeFromQueue(' + index + ')" style="padding: 6px; background: none; border: none; color: var(--text-secondary); cursor: pointer;"><i class="fas fa-times"></i></button>' +
                '</div>';
        });
    }
    
    html += '</div>';
    html += '<button onclick="queue=[];updateQueueDisplay();" class="glass-btn" style="width: 100%; margin-top: 12px; padding: 10px;"><i class="fas fa-trash"></i> Очистить очередь</button>';
    
    container.innerHTML = html;
}

window.playFromQueue = function(index) {
    if (index >= 0 && index < queue.length) {
        var item = queue.splice(index, 1)[0];
        playTrack(item.id);
        updateQueueDisplay();
    }
};

window.removeFromQueue = function(index) {
    if (index >= 0 && index < queue.length) {
        queue.splice(index, 1);
        updateQueueDisplay();
    }
};

function addToHistory(track) {
    if (!track) return;
    
    listenHistory = listenHistory.filter(function(t) { return t.id !== track.id; });
    listenHistory.unshift({
        id: track.id,
        title: track.title,
        artists: track.artists,
        cover_uri: track.cover_uri,
        service: track.service,
        playedAt: new Date().toISOString()
    });
    
    if (listenHistory.length > 50) {
        listenHistory = listenHistory.slice(0, 50);
    }
}

window.switchQueueTab = function(tab) {
    document.getElementById('queueTabBtn').classList.toggle('active', tab === 'queue');
    document.getElementById('historyTabBtn').classList.toggle('active', tab === 'history');
    
    if (tab === 'queue') {
        updateQueueDisplay();
    } else {
        showHistory();
    }
};

function showHistory() {
    const container = document.getElementById('queueContainer');
    if (!container) return;
    
    if (!listenHistory.length) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-history"></i><p>История пуста</p></div>';
        return;
    }
    
    let html = '<div style="padding: 8px 12px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--border);">Недавно слушали (' + listenHistory.length + ')</div>';
    html += '<div style="max-height: 400px; overflow-y: auto;">';
    
    listenHistory.forEach(function(item) {
        var cover = item.cover_uri 
            ? '<img src="' + item.cover_uri + '" alt="" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;">'
            : '<div style="width: 44px; height: 44px; background: var(--bg-tertiary); border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-music" style="color: var(--text-secondary);"></i></div>';
        var histArtists = item.artists ? (Array.isArray(item.artists) ? item.artists.join(', ') : item.artists) : (item.artist || '');
        
        html += '<div class="search-item" onclick="playTrack(\'' + item.id + '\')">' +
            cover +
            '<div class="search-item-info">' +
            '<div class="search-item-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="search-item-artist">' + escapeHtml(histArtists) + '</div>' +
            '</div></div>';
    });
    
    html += '</div>';
    html += '<button onclick="listenHistory=[];showHistory();" class="glass-btn" style="width: 100%; margin-top: 12px; padding: 10px;"><i class="fas fa-trash"></i> Очистить историю</button>';
    
    container.innerHTML = html;
}

function initAudioPlayer() {
    audioPlayer = document.getElementById('audioPlayer');
    if (!audioPlayer) {
        audioPlayer = document.createElement('audio');
        audioPlayer.id = 'audioPlayer';
        audioPlayer.hidden = true;
        document.body.appendChild(audioPlayer);
    }
    audioPlayer.addEventListener('timeupdate', updateProgress);
    audioPlayer.addEventListener('ended', handleTrackEnd);
    audioPlayer.addEventListener('pause', function() {
        updatePlayButton();
        document.dispatchEvent(new CustomEvent('player-pause'));
    });
    audioPlayer.addEventListener('play', function() {
        updatePlayButton();
        document.dispatchEvent(new CustomEvent('player-play'));
    });
    audioPlayer.addEventListener('loadedmetadata', function() {
        const totalEl = document.getElementById('totalTime');
        if (totalEl) totalEl.textContent = formatDuration(audioPlayer.duration * 1000);
    });
    audioPlayer.addEventListener('error', function(e) {
        console.error('Audio error:', e);
        showNotification('Ошибка воспроизведения', 'error');
    });
}

function updateProgress() {
    const fill = document.getElementById('progressFill');
    const current = document.getElementById('currentTime');
    if (fill && current && audioPlayer && audioPlayer.duration) {
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        fill.style.width = percent + '%';
        current.textContent = formatDuration(audioPlayer.currentTime * 1000);
    }
}

function updatePlayButton() {
    const icon = document.getElementById('playPauseBtn')?.querySelector('i');
    if (icon) {
        icon.className = audioPlayer.paused ? 'fas fa-play' : 'fas fa-pause';
    }
}

function handleTrackEnd() {
    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(console.error);
    } else if (repeatMode === 'all') {
        nextTrack();
    } else {
        if (currentTrackIndex < queue.length - 1) {
            nextTrack();
        }
    }
}

window.togglePlay = function() {
    console.log('=== togglePlay ===');
    console.log('socket:', !!window.socket, 'currentRoom:', window.currentRoom, 'isHost:', window.isHost);
    if (!audioPlayer.src || audioPlayer.src === window.location.href) {
        if (queue.length > 0) {
            playQueueItem(0);
        } else {
            showNotification('Выберите трек', 'info');
        }
        return;
    }
    if (audioPlayer.paused) {
        audioPlayer.play().catch(function(err) {
            console.error('Play error:', err);
            showNotification('Не удалось воспроизвести', 'error');
        });
        if (window.socket && window.currentRoom && window.isHost) {
            console.log('Emitting play_track');
            window.socket.emit('play_track', {
                track: currentTrack,
                track_index: window.currentRoomTrackIndex,
                current_time: 0
            });
        }
    } else {
        audioPlayer.pause();
        if (window.socket && window.currentRoom && window.isHost) {
            console.log('Emitting pause_track, time:', audioPlayer.currentTime);
            window.socket.emit('pause_track', { current_time: audioPlayer.currentTime });
        }
    }
};

window.pauseTrack = function() {
    if (audioPlayer) {
        audioPlayer.pause();
    }
};

window.testPause = function() {
    console.log('=== testPause called ===');
    console.log('socket:', window.socket ? window.socket.id : 'null');
    console.log('currentRoom:', window.currentRoom);
    console.log('isHost:', window.isHost);
    console.log('roomHost:', window.roomHost);
    if (window.socket && window.currentRoom && window.isHost) {
        console.log('Sending pause_track...');
        window.socket.emit('pause_track', { current_time: audioPlayer ? audioPlayer.currentTime : 0 });
    } else {
        console.log('Skipping - missing conditions');
    }
};

window.seekTrack = function(event) {
    const bar = event.currentTarget;
    const rect = bar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    if (audioPlayer && audioPlayer.duration) {
        audioPlayer.currentTime = audioPlayer.duration * percent;
    }
};

window.changeVolume = function(value) {
    if (audioPlayer) {
        audioPlayer.volume = value / 100;
    }
};

window.nextTrack = function() {
    if (queue.length === 0 || queue.length === 1) return;
    
    if (isShuffle) {
        currentTrackIndex = Math.floor(Math.random() * queue.length);
    } else {
        if (currentTrackIndex < queue.length - 1) {
            currentTrackIndex++;
        } else if (repeatMode === 'all') {
            currentTrackIndex = 0;
        } else {
            return;
        }
    }
    playQueueItem(currentTrackIndex);
};

window.previousTrack = function() {
    if (queue.length === 0) return;
    if (audioPlayer.currentTime > 3) {
        audioPlayer.currentTime = 0;
    } else {
        if (currentTrackIndex > 0) {
            currentTrackIndex--;
        } else {
            if (repeatMode === 'all') {
                currentTrackIndex = queue.length - 1;
            } else {
                currentTrackIndex = 0;
            }
        }
        playQueueItem(currentTrackIndex);
    }
};

window.toggleShuffle = function() {
    isShuffle = !isShuffle;
    saveQueueState();
    updateShuffleButton();
    showNotification(isShuffle ? 'Перемешивание включено' : 'Выключено', 'info');
};

window.toggleRepeat = function() {
    if (repeatMode === 'off') {
        repeatMode = 'all';
    } else if (repeatMode === 'all') {
        repeatMode = 'one';
    } else {
        repeatMode = 'off';
    }
    saveQueueState();
    updateRepeatButton();
    const messages = { off: 'Повтор выключен', all: 'Повтор всех', one: 'Повтор одного' };
    showNotification(messages[repeatMode], 'info');
};

function updateShuffleButton() {
    const btn = document.getElementById('shuffleBtn');
    if (btn) {
        btn.style.color = isShuffle ? 'var(--accent)' : '';
    }
}

function updateRepeatButton() {
    const btn = document.getElementById('repeatBtn');
    if (btn) {
        btn.style.color = repeatMode !== 'off' ? 'var(--accent)' : '';
        if (btn.querySelector('i')) {
            btn.querySelector('i').className = repeatMode === 'one' ? 'fas fa-redo' : 'fas fa-redo';
        }
    }
}

window.addToQueue = function(track) {
    if (typeof track === 'string') {
        track = { id: track };
    }
    queue.push(track);
    saveQueueState();
    updateQueueUI();
    showNotification('Добавлено в очередь', 'success');
    
    if (currentPlaylist.length === 0) {
        currentPlaylist = [track];
        currentTrackIndex = 0;
    }
};

window.removeFromQueue = function(index) {
    if (index < currentTrackIndex) {
        currentTrackIndex--;
    } else if (index === currentTrackIndex && audioPlayer.src) {
        audioPlayer.pause();
        audioPlayer.src = '';
    }
    queue.splice(index, 1);
    saveQueueState();
    updateQueueUI();
};

window.clearQueue = function() {
    queue = [];
    saveQueueState();
    updateQueueUI();
    showNotification('Очередь очищена', 'info');
};

window.reorderQueue = function(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= queue.length) return;
    if (toIndex < 0 || toIndex >= queue.length) return;
    
    const item = queue.splice(fromIndex, 1)[0];
    queue.splice(toIndex, 0, item);
    
    if (currentTrackIndex === fromIndex) {
        currentTrackIndex = toIndex;
    } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
        currentTrackIndex--;
    } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
        currentTrackIndex++;
    }
    
    saveQueueState();
    updateQueueUI();
};

function updateQueueUI() {
    const container = document.getElementById('queueContainer');
    if (!container) return;
    
    if (!queue || queue.length === 0) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-list"></i><p>Очередь пуста</p></div>';
        return;
    }
    
    let html = '';
    queue.forEach(function(track, index) {
        const artistsText = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : (track.artist || '');
        const cover = track.cover_uri || track.coverUrl || '';
        const isActive = index === currentTrackIndex && audioPlayer.src;
        
        html += '<div class="queue-item ' + (isActive ? 'active' : '') + '" draggable="true" data-index="' + index + '">' +
            '<div class="queue-drag-handle" style="cursor: grab; padding: 4px; color: var(--text-muted);"><i class="fas fa-grip-lines"></i></div>' +
            '<div class="queue-item-cover" onclick="playQueueItem(' + index + ')">' + 
            (cover ? '<img src="' + cover + '" alt="">' : '<i class="fas fa-music"></i>') +
            '</div>' +
            '<div class="queue-item-info" onclick="playQueueItem(' + index + ')">' +
            '<div class="queue-item-title">' + escapeHtml(track.title || 'Неизвестно') + '</div>' +
            '<div class="queue-item-artist">' + escapeHtml(artistsText) + '</div>' +
            '</div>' +
            '<button class="queue-item-remove" onclick="event.stopPropagation(); removeFromQueue(' + index + ')" style="padding: 6px; background: none; border: none; color: var(--text-secondary); cursor: pointer;">' +
            '<i class="fas fa-times"></i>' +
            '</button>' +
            '</div>';
    });
    container.innerHTML = html;
    
    initQueueDragDrop();
}

function initQueueDragDrop() {
    const container = document.getElementById('queueContainer');
    if (!container) return;
    
    const items = container.querySelectorAll('.queue-item');
    let draggedIndex = null;
    
    items.forEach(item => {
        item.addEventListener('dragstart', function(e) {
            draggedIndex = parseInt(this.dataset.index);
            this.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = 'move';
        });
        
        item.addEventListener('dragend', function() {
            this.style.opacity = '1';
            draggedIndex = null;
        });
        
        item.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        
        item.addEventListener('drop', function(e) {
            e.preventDefault();
            const toIndex = parseInt(this.dataset.index);
            if (draggedIndex !== null && draggedIndex !== toIndex) {
                reorderQueue(draggedIndex, toIndex);
            }
        });
    });
}

window.playQueueItem = async function(index) {
    if (index < 0 || index >= queue.length) return;
    
    currentTrackIndex = index;
    const track = queue[index];
    
    try {
        const trackData = await apiCall('play_track/' + track.id);
        
        if (trackData && trackData.url) {
            audioPlayer.pause();
            audioPlayer.src = trackData.url;
            await audioPlayer.play();
            
            currentTrack = window.currentTrack = { ...track, ...trackData };
            updatePlayerUI(currentTrack);
            updatePlayButton();
            updateQueueUI();
            showMiniNotification(currentTrack);
            saveQueueState();
            
            checkAndUpdateLikeButton(track.id);
            
            if (window.socket && window.currentRoom && window.isHost) {
                window.socket.emit('play_track', {
                    track: currentTrack,
                    track_index: index,
                    current_time: 0
                });
            }
        } else if (trackData && trackData.error) {
            showNotification(trackData.error, 'error');
        } else if (trackData && trackData.bypassed) {
            audioPlayer.pause();
            audioPlayer.src = trackData.url;
            await audioPlayer.play();
            
            currentTrack = window.currentTrack = { ...track, ...trackData };
            updatePlayerUI(currentTrack);
            updatePlayButton();
            showMiniNotification(currentTrack);
            saveQueueState();
            showNotification('Воспроизводится через SoundCloud (обход блокировки)', 'info');
            
            if (window.socket && window.currentRoom && window.isHost) {
                window.socket.emit('play_track', {
                    track: currentTrack,
                    track_index: index,
                    current_time: 0
                });
            }
        }
    } catch (error) {
        console.error('Play queue item error:', error);
        showNotification('Ошибка воспроизведения', 'error');
    }
};

async function playTrackById(trackId, trackData) {
    try {
        const trackInfo = await apiCall('play_track/' + trackId);
        
        if (trackInfo && trackInfo.url) {
            audioPlayer.pause();
            audioPlayer.src = trackInfo.url;
            await audioPlayer.play();
            
            currentTrack = window.currentTrack = trackInfo;
            
            if (window.currentSourceTracks && window.currentSourceTracks.length > 1) {
                queue = [...window.currentSourceTracks];
                currentPlaylist = [...window.currentSourceTracks];
                currentTrackIndex = queue.findIndex(t => t.id === trackId);
                if (currentTrackIndex === -1) currentTrackIndex = 0;
            } else {
                currentPlaylist = [{ id: trackId, ...trackInfo }];
                currentTrackIndex = 0;
                queue = [{ id: trackId, ...trackInfo }];
            }
            
            addToHistory(currentTrack);
            updatePlayerUI(currentTrack);
            updatePlayButton();
            updateQueueUI();
            showMiniNotification(currentTrack);
            checkAndUpdateLikeButton(trackId);
        } else if (trackInfo && trackInfo.error) {
            showNotification(trackInfo.error, 'error');
        }
    } catch (error) {
        console.error('Play track error:', error);
        showNotification('Ошибка воспроизведения', 'error');
    }
}

function checkAndUpdateLikeButton(trackId) {
    const likeBtn = document.getElementById('playerLikeBtn');
    if (!likeBtn) return;
    
    fetch('/api/favorites/' + trackId + '/check')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            likeBtn.classList.toggle('liked', data.liked);
            likeBtn.innerHTML = data.liked ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
        })
        .catch(console.error);
}

function updatePlayerUI(track) {
    const titleEl = document.getElementById('currentTrack');
    const artistEl = document.getElementById('currentArtist');
    const coverEl = document.getElementById('playerCover');
    
    if (titleEl) titleEl.textContent = track.title || 'Неизвестно';
    
    let artistText = '-';
    if (track.artists && Array.isArray(track.artists) && track.artists.length > 0) {
        artistText = track.artists.join(', ');
    } else if (track.artists && typeof track.artists === 'string' && track.artists) {
        artistText = track.artists;
    } else if (track.artist) {
        artistText = track.artist;
    }
    if (artistEl) artistEl.textContent = artistText;
    
    if (coverEl) {
        if (track.cover_uri) {
            coverEl.innerHTML = '<img src="' + track.cover_uri + '" alt="">';
        } else {
            coverEl.innerHTML = '<i class="fas fa-music"></i>';
        }
    }
    
    document.dispatchEvent(new CustomEvent('player-track-changed', {
        detail: {
            title: track.title,
            artist: artistText,
            cover_uri: track.cover_uri,
            playing: !audioPlayer.paused
        }
    }));
}

function showMiniNotification(track) {
    const existing = document.querySelector('.mini-notification');
    if (existing) existing.remove();
    
    let artistText = '-';
    if (track.artists && Array.isArray(track.artists) && track.artists.length > 0) {
        artistText = track.artists.join(', ');
    } else if (track.artists && typeof track.artists === 'string' && track.artists) {
        artistText = track.artists;
    } else if (track.artist) {
        artistText = track.artist;
    }
    
    const notification = document.createElement('div');
    notification.className = 'mini-notification';
    notification.innerHTML = '<i class="fas fa-music"></i>' +
        '<div class="mini-notification-text">' +
        '<strong>Сейчас играет</strong>' +
        '<span>' + escapeHtml(track.title || 'Неизвестно') + ' - ' + escapeHtml(artistText) + '</span>' +
        '</div>';
    document.body.appendChild(notification);
    
    setTimeout(function() { 
        if (notification.parentNode) notification.remove(); 
    }, 3000);
}

window.playTrack = playTrackById;

window.togglePlayerLike = function() {
    if (!currentTrack) return;
    const trackId = currentTrack.id || currentTrack.track_id;
    if (!trackId) return;
    
    toggleFavorite(trackId, currentTrack);
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('=== player.js DOMContentLoaded ===');
    initAudioPlayer();
    
    loadQueueState();
    
    const playBtn = document.getElementById('playPauseBtn');
    console.log('playBtn found:', !!playBtn);
    if (playBtn) {
        playBtn.addEventListener('click', togglePlay);
        console.log('togglePlay listener attached');
    }
    
    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.addEventListener('click', previousTrack);
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) nextBtn.addEventListener('click', nextTrack);
    
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) volumeSlider.addEventListener('input', function(e) { changeVolume(e.target.value); });
    
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.addEventListener('click', seekTrack);
    
    const likeBtn = document.getElementById('playerLikeBtn');
    if (likeBtn) likeBtn.addEventListener('click', togglePlayerLike);
    
    updateQueueUI();
    updateShuffleButton();
    updateRepeatButton();
    
    window.addEventListener('beforeunload', function() {
        saveQueueState();
    });
});
