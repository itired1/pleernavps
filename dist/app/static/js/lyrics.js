// Lyrics functionality using LRCLIB API

let currentLyrics = [];
let currentLyricsIndex = -1;
let lyricsUpdateInterval = null;
let plainLyricsText = '';
let artistName = '';
let trackTitle = '';
let syncMode = false;
let syncLines = [];

function getTrackKey() {
    const track = window.currentTrack;
    if (!track) return null;
    let artist = '';
    if (track.artists && Array.isArray(track.artists)) {
        artist = track.artists.join(', ');
    } else if (track.artists) {
        artist = track.artists;
    } else if (track.artist) {
        artist = track.artist;
    }
    return `${artist}-${track.title}`.toLowerCase().replace(/\s+/g, '-');
}

function saveCustomLyrics(key, lines) {
    const saved = JSON.parse(localStorage.getItem('customLyrics') || '{}');
    saved[key] = lines;
    localStorage.setItem('customLyrics', JSON.stringify(saved));
}

function loadCustomLyrics(key) {
    const saved = JSON.parse(localStorage.getItem('customLyrics') || '{}');
    return saved[key] || null;
}

function parseLRCLines(lrcText) {
    const lines = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    
    lrcText.split('\n').forEach(line => {
        const match = line.match(timeRegex);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const ms = parseInt(match[3].padEnd(3, '0'));
            const time = minutes * 60 + seconds + ms / 1000;
            const text = match[4].trim();
            
            if (text) {
                lines.push({ time, text });
            }
        }
    });
    
    return lines.sort((a, b) => a.time - b.time);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

async function showLyrics() {
    const track = window.currentTrack;
    if (!track) {
        showNotification('Включите трек', 'info');
        return;
    }
    
    openModal('lyricsModal');
    
    const loading = document.getElementById('lyricsLoading');
    const content = document.getElementById('lyricsContent');
    const title = document.getElementById('lyricsTitle');
    
    loading.style.display = 'flex';
    content.innerHTML = '';
    syncMode = false;
    
    if (track.artists && Array.isArray(track.artists)) {
        artistName = track.artists.join(', ');
    } else if (track.artists) {
        artistName = track.artists;
    } else if (track.artist) {
        artistName = track.artist;
    }
    trackTitle = track.title || '';
    
    title.textContent = `${trackTitle} - ${artistName}`;
    
    // Проверяем кастомные тексты
    const trackKey = getTrackKey();
    const custom = loadCustomLyrics(trackKey);
    
    if (custom && custom.length > 0) {
        loading.style.display = 'none';
        currentLyrics = custom;
        renderSyncedLyrics(true);
        startLyricsSync();
        return;
    }
    
    try {
        const response = await fetch(`/api/lyrics?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(trackTitle)}`);
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.lyrics) {
            if (data.synced) {
                currentLyrics = parseLRCLines(data.lyrics);
                renderSyncedLyrics(true);
                startLyricsSync();
            } else {
                plainLyricsText = data.lyrics;
                renderPlainLyrics();
            }
        } else {
            content.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Текст не найден. <br><br><button class="btn-primary" onclick="startSyncMode()"><i class="fas fa-microphone"></i> Создать синхронизацию</button></p>';
            stopLyricsSync();
        }
    } catch (error) {
        loading.style.display = 'none';
        content.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Ошибка загрузки текста</p>';
        stopLyricsSync();
    }
}

function renderSyncedLyrics(hasTimings) {
    const content = document.getElementById('lyricsContent');
    
    let html = '<div style="margin-bottom: 16px; text-align: center;">';
    html += `<button class="btn-primary" onclick="startSyncMode()" style="margin-right: 8px;"><i class="fas fa-edit"></i> Редактировать</button>`;
    html += `<button class="glass-btn" onclick="deleteSync()"><i class="fas fa-trash"></i> Удалить</button>`;
    html += '</div>';
    html += '<div class="lyrics-display">';
    
    currentLyrics.forEach((line, i) => {
        html += `<div class="lyrics-text" data-index="${i}" id="lyric-${i}">${escapeHtml(line.text)}</div>`;
    });
    
    html += '</div>';
    content.innerHTML = html;
}

function renderPlainLyrics() {
    const content = document.getElementById('lyricsContent');
    
    const lines = plainLyricsText.split('\n').filter(l => l.trim());
    
    let html = '<div style="margin-bottom: 16px; text-align: center;">';
    html += `<button class="btn-primary" onclick="startSyncMode()"><i class="fas fa-microphone"></i> Создать синхронизацию</button>`;
    html += '</div>';
    html += '<div class="lyrics-display">';
    
    lines.forEach((line, i) => {
        html += `<div class="lyrics-text" data-index="${i}" id="lyric-${i}" onclick="addSyncTime(${i})">${escapeHtml(line)}</div>`;
    });
    
    html += '</div>';
    content.innerHTML = html;
    
    syncLines = lines.map((text, i) => ({ text: text.trim(), time: null }));
}

function startSyncMode() {
    syncMode = true;
    const content = document.getElementById('lyricsContent');
    
    if (syncLines.length === 0) {
        const lines = plainLyricsText.split('\n').filter(l => l.trim());
        syncLines = lines.map((text, i) => ({ text: text.trim(), time: null }));
    }
    
    let html = '<div style="margin-bottom: 16px; text-align: center;">';
    html += '<p style="color: var(--accent); margin-bottom: 12px;"><i class="fas fa-music"></i> Нажми на строку когда она поётся</p>';
    html += `<button class="btn-primary" onclick="saveSync()" style="margin-right: 8px;"><i class="fas fa-save"></i> Сохранить</button>`;
    html += `<button class="glass-btn" onclick="cancelSync()"><i class="fas fa-times"></i> Отмена</button>`;
    html += '</div>';
    html += '<div class="lyrics-display">';
    
    syncLines.forEach((line, i) => {
        const hasTime = line.time !== null;
        html += `<div class="lyrics-text ${hasTime ? 'synced' : ''}" data-index="${i}" id="lyric-${i}" onclick="addSyncTime(${i})">${escapeHtml(line.text)}</div>`;
    });
    
    html += '</div>';
    content.innerHTML = html;
    
    if (audioPlayer) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    }
}

function addSyncTime(index) {
    if (!audioPlayer) return;
    
    const currentTime = audioPlayer.currentTime;
    syncLines[index].time = currentTime;
    
    const el = document.getElementById(`lyric-${index}`);
    if (el) {
        el.classList.add('synced');
    }
}

function saveSync() {
    const trackKey = getTrackKey();
    const syncedLines = syncLines
        .filter(l => l.time !== null)
        .map(l => ({ time: l.time, text: l.text }));
    
    if (syncedLines.length === 0) {
        showNotification('Добавьте хотя бы один тайминг', 'warning');
        return;
    }
    
    saveCustomLyrics(trackKey, syncedLines);
    currentLyrics = syncedLines;
    syncMode = false;
    syncLines = [];
    
    renderSyncedLyrics(true);
    startLyricsSync();
    showNotification('Синхронизация сохранена!', 'success');
}

function cancelSync() {
    syncMode = false;
    syncLines = [];
    
    if (currentLyrics.length > 0) {
        renderSyncedLyrics(true);
    } else if (plainLyricsText) {
        renderPlainLyrics();
    }
}

function deleteSync() {
    const trackKey = getTrackKey();
    const saved = JSON.parse(localStorage.getItem('customLyrics') || '{}');
    delete saved[trackKey];
    localStorage.setItem('customLyrics', JSON.stringify(saved));
    
    currentLyrics = [];
    showNotification('Синхронизация удалена', 'info');
    showLyrics();
}

function startLyricsSync() {
    stopLyricsSync();
    
    lyricsUpdateInterval = setInterval(() => {
        updateLyricsSync();
    }, 100);
}

function stopLyricsSync() {
    if (lyricsUpdateInterval) {
        clearInterval(lyricsUpdateInterval);
        lyricsUpdateInterval = null;
    }
    currentLyricsIndex = -1;
}

function updateLyricsSync() {
    if (!audioPlayer || currentLyrics.length === 0 || syncMode) return;
    
    const currentTime = audioPlayer.currentTime;
    let newIndex = -1;
    
    for (let i = currentLyrics.length - 1; i >= 0; i--) {
        if (currentLyrics[i].time !== null && currentTime >= currentLyrics[i].time) {
            newIndex = i;
            break;
        }
    }
    
    if (newIndex !== currentLyricsIndex) {
        if (currentLyricsIndex >= 0) {
            const oldEl = document.getElementById(`lyric-${currentLyricsIndex}`);
            if (oldEl) oldEl.classList.remove('active');
        }
        
        currentLyricsIndex = newIndex;
        
        if (currentLyricsIndex >= 0) {
            const newEl = document.getElementById(`lyric-${currentLyricsIndex}`);
            if (newEl) {
                newEl.classList.add('active');
                newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const lyricsModal = document.getElementById('lyricsModal');
    if (lyricsModal) {
        lyricsModal.addEventListener('click', (e) => {
            if (e.target === lyricsModal) {
                closeModal('lyricsModal');
            }
        });
    }
});

window.showLyrics = showLyrics;
window.startSyncMode = startSyncMode;
window.addSyncTime = addSyncTime;
window.saveSync = saveSync;
window.cancelSync = cancelSync;
window.deleteSync = deleteSync;
