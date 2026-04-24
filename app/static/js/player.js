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
let hlsPlayer = null;

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
        const savedUserId = localStorage.getItem('itired_user_id');
        const currentUserId = document.body.dataset.userId;
        
        if (saved && savedUserId && savedUserId !== currentUserId) {
            localStorage.removeItem('itired_queue');
            return false;
        }
        
        if (saved) {
            const state = JSON.parse(saved);
            if (state.queue && state.queue.length > 0) {
                queue = state.queue;
                currentTrackIndex = state.currentTrackIndex || 0;
                isShuffle = state.isShuffle || false;
                repeatMode = state.repeatMode || 'off';
                
                if (state.currentTrack) {
                    currentTrack = window.currentTrack = state.currentTrack;
                    updatePlayerUI(currentTrack);
                    updatePlayButton();
                    
                    const playBtn = document.getElementById('playPauseBtn');
                    if (playBtn) {
                        playBtn.dataset.autoPlay = 'true';
                        playBtn.addEventListener('click', function autoPlayHandler() {
                            if (playBtn.dataset.autoPlay === 'true') {
                                playBtn.dataset.autoPlay = 'false';
                                playBtn.removeEventListener('click', autoPlayHandler);
                                const trackId = currentTrack.id || currentTrack;
                                if (trackId) {
                                    playTrack(trackId);
                                }
                            }
                        }, { once: true });
                    }
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
        console.log('Audio source:', audioPlayer.src);
        console.log('Error code:', audioPlayer.error?.code);
        console.log('Error message:', audioPlayer.error?.message);
        
        if (audioPlayer.src && audioPlayer.src.includes('api/stream/sc')) {
            showNotification('SoundCloud: ошибка потока', 'error');
        } else {
            showNotification('Ошибка воспроизведения', 'error');
        }
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

let crossfadeEnabled = localStorage.getItem('crossfade') !== 'false';
let crossfadeDuration = parseInt(localStorage.getItem('crossfadeDuration') || '3');
let nextTrackPreloaded = null;
let isCrossfading = false;

function handleTrackEnd() {
    if (isCrossfading) return;
    
    const listenedSeconds = audioPlayer.duration ? Math.floor(audioPlayer.duration) : 0;
    if (listenedSeconds > 0 && currentTrack && currentTrack.id) {
        fetch('/api/listen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_id: currentTrack.id,
                title: currentTrack.title || '',
                artist: currentTrack.artist || '',
                duration: listenedSeconds
            })
        }).catch(function(e) { console.error('Listen tracking error:', e); });
    }
    
    if (repeatMode === 'one') {
        audioPlayer.currentTime = 0;
        audioPlayer.play().catch(console.error);
    } else if (repeatMode === 'all') {
        nextTrack();
    } else if (currentTrackIndex >= queue.length - 1) {
        if (window.autoRefreshWave || window.currentSource === 'wave') {
            window.refreshWave();
        }
    } else {
        if (crossfadeEnabled) {
            preloadNextTrackAndCrossfade();
        } else {
            nextTrack();
        }
    }
}

async function preloadNextTrackAndCrossfade() {
    const nextIdx = currentTrackIndex + 1;
    if (nextIdx >= queue.length) return;
    
    isCrossfading = true;
    const nextTrackData = queue[nextIdx];
    
    try {
        const response = await fetch('/api/play_track/' + nextTrackData.id);
        const trackInfo = await response.json();
        
        if (trackInfo && trackInfo.url) {
            const nextPlayer = new Audio();
            nextPlayer.src = trackInfo.url;
            nextPlayer.volume = 0;
            
            nextTrackPreloaded = { player: nextPlayer, track: trackInfo };
            
            const fadeOutInterval = setInterval(() => {
                if (audioPlayer.volume > 0.1) {
                    audioPlayer.volume -= 0.1 / (crossfadeDuration * 10);
                } else {
                    clearInterval(fadeOutInterval);
                }
            }, 100);
            
            await nextPlayer.play();
            
            const fadeInInterval = setInterval(() => {
                if (nextPlayer.volume < 1) {
                    nextPlayer.volume += 0.1 / (crossfadeDuration * 10);
                } else {
                    clearInterval(fadeInInterval);
                    audioPlayer.pause();
                    audioPlayer = nextPlayer;
                    window.audioPlayer = nextPlayer;
                    currentTrack = nextTrackPreloaded.track;
                    currentTrackIndex = nextIdx;
                    window.currentTrack = currentTrack;
                    window.currentRoomTrackIndex = nextIdx;
                    updatePlayerUI(currentTrack);
                    updateQueueUI();
                    isCrossfading = false;
                    nextTrackPreloaded = null;
                }
            }, 100);
        } else {
            isCrossfading = false;
            nextTrack();
        }
    } catch (e) {
        console.error('Crossfade error:', e);
        isCrossfading = false;
        nextTrack();
    }
}

window.toggleCrossfade = function() {
    crossfadeEnabled = !crossfadeEnabled;
    localStorage.setItem('crossfade', crossfadeEnabled);
    showNotification(crossfadeEnabled ? 'Кроссфейд включен' : 'Кроссфейд выключен', 'info');
};

window.togglePlay = function() {
    console.log('=== togglePlay ===');
    console.log('socket:', !!window.socket, 'currentRoom:', window.currentRoom, 'isHost:', window.isHost);
    
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может управлять воспроизведением', 'info');
        return;
    }
    
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
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может управлять', 'info');
        return;
    }
    if (audioPlayer) {
        audioPlayer.pause();
    }
};

window.testPause = function() {
    if (window.socket && window.currentRoom && window.isHost) {
        window.socket.emit('pause_track', { current_time: audioPlayer ? audioPlayer.currentTime : 0 });
    }
};

window.seekTrack = function(event) {
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может перематывать', 'info');
        return;
    }
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
    localStorage.setItem('volume', value);
};

window.loadVolume = function() {
    const vol = localStorage.getItem('volume') || 70;
    const slider = document.getElementById('volumeSlider');
    if (slider) slider.value = vol;
    const player = document.getElementById('audioPlayer');
    if (player) player.volume = vol / 100;
};

window.nextTrack = function() {
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может управлять', 'info');
        return;
    }
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
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может управлять', 'info');
        return;
    }
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

window.playNext = function(track) {
    if (typeof track === 'string') {
        track = { id: track };
    }
    const insertIndex = currentTrackIndex + 1;
    queue.splice(insertIndex, 0, track);
    if (currentPlaylist.length === 0) {
        currentPlaylist = [track];
        currentTrackIndex = 0;
    }
    saveQueueState();
    updateQueueUI();
    showNotification('Будет воспроизведено следующим', 'success');
    
    if (window.socket && window.currentRoom && !window.isHost) {
        showNotification('Только ведущий может управлять', 'info');
    }
};
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
    currentPlaylist = [];
    currentTrackIndex = 0;
    saveQueueState();
    updateQueueUI();
    showNotification('Очередь очищена', 'info');
};

window.shuffleQueue = function() {
    if (queue.length <= 1) return;
    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    saveQueueState();
    updateQueueUI();
    showNotification('Очередь перемешана', 'success');
};

window.saveCurrentQueue = async function() {
    if (!queue.length) {
        showNotification('Очередь пуста', 'error');
        return;
    }
    try {
        const response = await fetch('/api/queue/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tracks: queue, name: 'Сохранённая очередь' })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('Очередь сохранена', 'success');
        } else {
            showNotification(result.error || 'Ошибка', 'error');
        }
    } catch (e) {
        console.error('Save queue error:', e);
        showNotification('Ошибка сохранения', 'error');
    }
};

window.loadSavedQueue = async function(queueId) {
    try {
        const response = await fetch('/api/queue/saved/' + queueId);
        const result = await response.json();
        if (result.tracks) {
            queue = result.tracks;
            currentPlaylist = [].concat(queue);
            currentTrackIndex = 0;
            saveQueueState();
            updateQueueUI();
            if (queue.length > 0) {
                playTrack(queue[0].id);
            }
            showNotification('Очередь загружена', 'success');
        }
    } catch (e) {
        console.error('Load queue error:', e);
        showNotification('Ошибка загрузки', 'error');
    }
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

window.updateQueueUI = function() {
    const container = document.getElementById('queueContainer');
    if (!container) return;
    
    if (!queue || queue.length === 0) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-list"></i><p>Очередь пуста</p></div>';
        return;
    }
    
    let html = '<div style="padding: 16px; display: flex; gap: 10px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg, var(--bg-elevated), transparent);">' +
        '<button onclick="saveCurrentQueue()" style="flex:1; padding: 10px; background: var(--accent); border:none;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;"><i class="fas fa-save"></i> Сохранить</button>' +
        '<button onclick="clearQueue(); showNotification(\'Очередь очищена\', \'info\')" style="padding: 10px 14px; background: rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:8px;cursor:pointer;font-size:13px;"><i class="fas fa-trash"></i></button>' +
        '<button onclick="shuffleQueue()" style="padding: 10px; background: rgba(99,102,241,0.15); border:1px solid rgba(99,102,241,0.3);color:var(--accent);border-radius:8px;cursor:pointer;font-size:13px;" title="Перемешать"><i class="fas fa-shuffle"></i></button>' +
        '</div>' +
        '<div style="max-height: 400px; overflow-y: auto; padding: 8px;">';
    queue.forEach(function(track, index) {
        const artistsText = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : (track.artist || '');
        const cover = track.cover_uri || track.coverUrl || '';
        const isActive = index === currentTrackIndex && audioPlayer.src;
        
        html += '<div class="queue-item ' + (isActive ? 'active' : '') + '" draggable="true" data-index="' + index + '" style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;margin-bottom:4px;background:rgba(255,255,255,0.02);">' +
            '<div class="queue-drag-handle" style="cursor: grab; padding: 4px; color: var(--text-muted);"><i class="fas fa-grip-lines"></i></div>' +
            '<div class="queue-item-cover" onclick="playQueueItem(' + index + ')">' + 
            (cover ? '<img src="' + cover + '" alt="">' : '<i class="fas fa-music"></i>') +
            '</div>' +
            '<div class="queue-item-info" onclick="playQueueItem(' + index + ')">' +
            '<div class="queue-item-title">' + escapeHtml(track.title || 'Неизвестно') + '</div>' +
            '<div class="queue-item-artist">' + escapeHtml(artistsText) + '</div>' +
            '</div>' +
            '<div class="queue-playing-icon" style="padding:4px;"><i class="fas fa-volume-high"></i></div>' +
            '<button class="queue-item-remove" onclick="event.stopPropagation(); removeFromQueue(' + index + ')" style="padding: 8px; background: none; border: none; color: var(--text-secondary); cursor: pointer; border-radius: 6px;">' +
            '<i class="fas fatimes"></i>' +
            '</button>' +
            '</div>';
    });
    container.innerHTML = html + '</div>';
    
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
        if (hlsPlayer) {
            hlsPlayer.destroy();
            hlsPlayer = null;
        }
        
        const trackInfo = await apiCall('play_track/' + trackId);
        
        if (trackInfo && trackInfo.url) {
            audioPlayer.pause();
            
            if (trackInfo.service === 'soundcloud') {
                showNotification('SoundCloud: загрузка...', 'info');
                console.log('Playing from SoundCloud:', trackInfo.url, 'stream_url:', trackInfo.stream_url);
                
                if (trackInfo.stream_url) {
                    const scUrl = trackInfo.stream_url;
                    
                    if (scUrl.includes('.m3u8') && Hls.isSupported()) {
                        hlsPlayer = new Hls({
                            xhrSetup: function(xhr) {
                                xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
                                xhr.setRequestHeader('Referer', 'https://soundcloud.com/');
                            }
                        });
                        hlsPlayer.loadSource(scUrl);
                        hlsPlayer.attachMedia(audioPlayer);
                        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                            audioPlayer.play().then(function() {
                                showNotification('SoundCloud ▶', 'success');
                            }).catch(function(e) {
                                console.error('SC play error:', e);
                                showNotification('SoundCloud: ошибка', 'error');
                            });
                        });
                        hlsPlayer.on(Hls.Events.ERROR, function(event, data) {
                            console.error('HLS error:', data);
                            if (data.fatal) {
                                showNotification('SoundCloud: ошибка HLS', 'error');
                            }
                        });
                    } else {
                        audioPlayer.src = trackInfo.url;
                        audioPlayer.play().then(function() {
                            showNotification('SoundCloud ▶', 'success');
                        }).catch(function(e) {
                            console.error('SC play error:', e);
                            showNotification('SoundCloud: ошибка', 'error');
                        });
                    }
                } else {
                    audioPlayer.src = trackInfo.url;
                    audioPlayer.play().then(function() {
                        showNotification('SoundCloud ▶', 'success');
                    }).catch(function(e) {
                        console.error('SC play error:', e);
                        showNotification('SoundCloud: ошибка', 'error');
                    });
                }
            } else if (trackInfo.url && trackInfo.url.includes('.m3u8')) {
                showNotification('HLS: загрузка...', 'info');
                if (Hls.isSupported()) {
                    hlsPlayer = new Hls();
                    hlsPlayer.loadSource(trackInfo.url);
                    hlsPlayer.attachMedia(audioPlayer);
                    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, function() {
                        audioPlayer.play();
                    });
                } else {
                    audioPlayer.src = trackInfo.url;
                    audioPlayer.play();
                }
            } else {
                audioPlayer.src = trackInfo.url;
                audioPlayer.play();
            }
            
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
    setTimeout(initAudioPlayer, 100);
    
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
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function(e) { changeVolume(e.target.value); });
        loadVolume();
    }
    
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
