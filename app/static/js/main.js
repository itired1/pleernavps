if (document.querySelector('.auth-page')) {
    window.switchTab = function() {};
    window.performSearch = function() {};
    window.loadDashboard = function() {};
    window.loadFavorites = function() {};
    window.loadHistory = function() {};
} else {
    console.log('Main JS loaded, adding DOMContentLoaded listener');
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOMContentLoaded fired');
        initApp();
    });
}

let userBalance = 0;

function updateBalanceDisplay() {
    const el = document.getElementById('userBalance');
    if (el) el.textContent = userBalance;
    const headerEl = document.getElementById('headerBalance');
    if (headerEl) headerEl.textContent = userBalance;
    const badge = document.getElementById('coinBadge');
    if (badge) badge.textContent = userBalance > 0 ? userBalance : '';
}

async function initApp() {
    console.log('initApp started');
    applySavedTheme();
    if (typeof initAudioPlayer === 'function') {
        setTimeout(initAudioPlayer, 100);
    }
    
    // Load balance on start
    try {
        console.log('Loading balance...');
        const balance = await apiCall('currency/balance');
        console.log('Balance:', balance);
        if (balance && balance.balance !== undefined) {
            userBalance = balance.balance;
            updateBalanceDisplay();
        }
    } catch (e) {
        console.error('Balance error:', e);
    }
    
    try {
        await loadProfile();
    } catch (e) {
        console.error('Profile load error:', e);
    }
    
    try {
        var tokenStatus = await apiCall('validate-tokens', {cache: false});
        if (tokenStatus.yandex) {
            if (tokenStatus.yandex.valid === false) {
                showNotification('⚠ ' + (tokenStatus.yandex.error || 'Токен Яндекс истёк'), 'error', 'fa-exclamation-triangle');
            } else if (!tokenStatus.yandex.token_set) {
                showNotification('Токен Яндекс.Музыки не настроен', 'warning', 'fa-exclamation-triangle');
            }
        }
        if (tokenStatus.vk) {
            if (tokenStatus.vk.valid === false) {
                showNotification('⚠ ' + (tokenStatus.vk.error || 'Токен VK истёк'), 'error', 'fa-exclamation-triangle');
            } else if (!tokenStatus.vk.token_set) {
                showNotification('Токен VK не настроен', 'warning', 'fa-exclamation-triangle');
            }
        }
        if (tokenStatus.soundcloud && !tokenStatus.soundcloud.client_id_set) {
            showNotification('SoundCloud Client ID не настроен', 'warning', 'fa-exclamation-triangle');
        }
    } catch (e) {
        console.error('Token validation error:', e);
    }
    
    try {
        await loadDashboard();
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
    
    try {
        loadMyWave();
    } catch (e) {
        console.error('My Wave load error:', e);
    }
    
    try {
        loadLikedTracks('yandex');
    } catch (e) {
        console.error('Liked tracks load error:', e);
    }
    
    try {
        await loadNotifications();
    } catch (e) {
        console.error('Notifications load error:', e);
    }
    
    setupGlobalEventListeners();
    hideLoadingScreen();
}

window.playMyWave = async function() {
    const container = document.getElementById('myWaveContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="flex: 1; min-width: 200px; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent);"></i><p style="margin-top: 16px;">Загрузка волны...</p></div>';
    
    console.log('playMyWave: loading...');
    try {
        let tracks = [];
        
        // Load liked tracks from Yandex
        const yandexLiked = await apiCall('liked-tracks?source=yandex');
        if (yandexLiked && yandexLiked.tracks && yandexLiked.tracks.length > 0) {
            tracks = tracks.concat(yandexLiked.tracks);
        }
        
        // Load liked tracks from VK
        const vkLiked = await apiCall('liked-tracks?source=vk');
        if (vkLiked && vkLiked.tracks && vkLiked.tracks.length > 0) {
            tracks = tracks.concat(vkLiked.tracks);
        }
        
        // Load liked tracks from SoundCloud
        const scLiked = await apiCall('liked-tracks?source=soundcloud');
        if (scLiked && scLiked.tracks && scLiked.tracks.length > 0) {
            tracks = tracks.concat(scLiked.tracks);
        }
        
        // Shuffle combined tracks
        if (tracks.length > 0) {
            tracks.sort(() => Math.random() - 0.5);
        }
        
        if (tracks.length === 0) {
            // Fallback to recommendations
            const recs = await apiCall('recommendations');
            tracks = recs || [];
        }
        
        if (!tracks || tracks.length === 0) {
            const msg = 'Добавьте треки в библиотеку для персонализации';
            container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-music" style="font-size: 2rem; color: var(--text-muted);"></i><p style="margin-top: 12px; color: var(--text-muted);">' + msg + '</p></div>';
            showNotification(msg, 'info');
            return;
        }
        
        let html = '';
        tracks.forEach(function(track) {
            let artistsText = '';
            if (track.artists && Array.isArray(track.artists) && track.artists.length > 0) {
                artistsText = track.artists.join(', ');
            } else if (track.artist) {
                artistsText = track.artist;
            }
            
            let coverUrl = track.cover_uri || '';
            if (coverUrl && coverUrl.includes('%%')) {
                coverUrl = coverUrl.replace('%%', '200x200');
            }
            
            const coverHtml = coverUrl 
                ? '<img src="' + coverUrl + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">'
                : '<i class="fas fa-music" style="font-size: 2rem;"></i>';
            
            // Handle duration - can be in seconds or milliseconds
            let durationMs = track.duration;
            if (durationMs && durationMs < 1000) {
                durationMs = durationMs * 1000; // Convert seconds to ms
            }
            const duration = durationMs ? formatDuration(durationMs) : '';
            const trackId = track.id || '';
            
            html += '<div class="track-item" data-track-id="' + trackId + '" onclick="playTrack(\'' + trackId + '\')" style="min-width: 180px; flex-shrink: 0; cursor: pointer;">' +
                '<div class="track-item-cover">' + coverHtml + '</div>' +
                '<div class="track-item-info">' +
                '<div class="track-item-title">' + escapeHtml(track.title || 'Неизвестно') + '</div>' +
                '<div class="track-item-artist">' + escapeHtml(artistsText) + '</div>' +
                '</div>' +
                '<div class="track-duration">' + duration + '</div>' +
                '</div>';
        });
        
        container.innerHTML = html;
        
        window.currentSource = 'wave';
        window.currentSourceTracks = tracks;
        
        if (tracks.length > 0) {
            playTrack(tracks[0].id);
            const hasVk = tracks.some(t => t.service === 'vk' || t.id.toString().startsWith('vk_'));
            const hasYa = tracks.some(t => t.service === 'yandex' || t.id.toString().startsWith('yandex_'));
            const hasSc = tracks.some(t => t.service === 'soundcloud' || t.id.toString().startsWith('sc_'));
            var services = [];
            if (hasYa) services.push('Яндекс');
            if (hasVk) services.push('VK');
            if (hasSc) services.push('SoundCloud');
            showNotification('▶ Моя Волна (' + services.join(' + ') + ')', 'success');
        }
        
    } catch (error) {
        console.error('Play wave error:', error);
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ff6b6b;"></i><p style="margin-top: 12px; color: var(--text-muted);">Ошибка загрузки</p></div>';
    }
};

window.loadMyWave = function() {
    const container = document.getElementById('myWaveContainer');
    if (container) {
        container.innerHTML = '<div style="flex: 1; min-width: 200px; text-align: center; padding: 40px;"><i class="fas fa-music" style="font-size: 3rem; color: var(--text-muted);"></i><p style="margin-top: 16px; font-size: 14px; color: var(--text-muted);">Нажми "Слушать" для запуска персональной подборки</p></div>';
    }
};

window.refreshLikedTracks = function() {
    var activeBtn = document.querySelector('#likedSourceSelector .source-btn.active');
    var source = activeBtn ? activeBtn.dataset.source : 'yandex';
    loadLikedTracks(source);
};

window.loadLikedTracks = async function(source) {
    document.querySelectorAll('#likedSourceSelector .source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.source === source);
    });
    
    const container = document.getElementById('likedTracksContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="flex: 1; min-width: 200px; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Загрузка...</p></div>';
    
    try {
        const data = await apiCall('liked-tracks?source=' + source + '&t=' + Date.now());
        displayLikedTracks(data.tracks || []);
    } catch (error) {
        console.error('Load liked tracks error:', error);
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ff6b6b;"></i><p style="margin-top: 12px;">Ошибка загрузки</p></div>';
    }
};

function displayLikedTracks(tracks) {
    const container = document.getElementById('likedTracksContainer');
    if (!container) return;
    
    window.currentSource = 'liked';
    window.currentSourceTracks = tracks;
    
    if (!tracks.length) {
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-heart" style="font-size: 2rem; color: var(--text-muted);"></i><p style="margin-top: 12px; color: var(--text-muted);">Треки не найдены. Настройте токен в профиле.</p></div>';
        return;
    }
    
    let html = '';
    tracks.slice(0, 10).forEach(function(track) {
        let artistsText = '';
        if (track.artists && Array.isArray(track.artists) && track.artists.length > 0) {
            artistsText = track.artists.join(', ');
        } else if (track.artists && typeof track.artists === 'string' && track.artists) {
            artistsText = track.artists;
        } else if (track.artist) {
            artistsText = track.artist;
        }
        let coverUrl = track.cover_uri || '';
        if (coverUrl && coverUrl.includes('%%')) {
            coverUrl = coverUrl.replace('%%', '200x200');
        }
        
        const serviceIcon = track.service === 'yandex' 
            ? '<i class="fab fa-yandex" style="color: #ff3333;"></i>' 
            : track.service === 'vk' 
            ? '<i class="fab fa-vk" style="color: #4a76a8;"></i>' 
            : '<i class="fas fa-music"></i>';
        
        const cover = coverUrl ? '<div style="width: 180px; height: 180px; overflow: hidden; border-radius: 12px;"><img src="' + coverUrl + '" alt="" style="width: 180px; height: 180px; object-fit: cover;" onerror="this.parentElement.innerHTML=\'<div style=width:180px;height:180px;background:linear-gradient(135deg,var(--accent),var(--accent-hover));border-radius:12px;display:flex;align-items:center;justify-content:center;><i class=fas fa-music fa-2x style=color:#fff;></i></div>\'"></div>' : '<div style="width: 180px; height: 180px; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-music fa-2x" style="color: #fff;"></i></div>';
        
        html += '<div class="wave-track-card" onclick="playTrack(\'' + track.id + '\')" style="min-width: 180px; flex-shrink: 0; cursor: pointer;">' +
            '<div style="position: relative;">' + cover +
            '<div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">' + serviceIcon + '</div>' +
            '<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-play" style="color: #fff;"></i></div>' +
            '</div>' +
            '<h4 style="margin: 8px 0 4px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(track.title || 'Неизвестно') + '</h4>' +
            '<p style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(artistsText) + '</p>' +
            '</div>';
    });
    container.innerHTML = html;
}

window.refreshWave = async function() {
    const source = document.querySelector('#waveSourceSelector .source-btn.active')?.dataset.source || 'all';
    await window.changeWaveSource(source);
};

function displayWaveTracks(tracks) {
    const container = document.getElementById('waveTracksContainer');
    if (!container) return;
    
    window.currentSource = 'wave';
    window.currentSourceTracks = tracks;
    
    if (!tracks.length) {
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-music" style="font-size: 2rem; color: var(--text-muted);"></i><p style="margin-top: 12px; color: var(--text-muted);">Настройте токены для воспроизведения</p></div>';
        return;
    }
    
    let html = '';
    tracks.slice(0, 10).forEach(function(track) {
        const artistsText = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : (track.artist || '');
        const serviceIcon = track.service === 'yandex' 
            ? '<i class="fab fa-yandex" style="color: #ff3333;"></i>' 
            : track.service === 'vk' 
            ? '<i class="fab fa-vk" style="color: #4a76a8;"></i>' 
            : '';
        const cover = track.cover_uri ? '<img src="' + track.cover_uri + '" alt="" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px;">' : '<div style="width: 100%; aspect-ratio: 1; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-music fa-2x" style="color: #fff;"></i></div>';
        
        html += '<div class="wave-track-card" onclick="playTrack(\'' + track.id + '\')" style="min-width: 180px; flex-shrink: 0; cursor: pointer;">' +
            '<div style="position: relative;">' + cover +
            '<div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">' + serviceIcon + '</div>' +
            '<div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.7); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-play" style="color: #fff;"></i></div>' +
            '</div>' +
            '<h4 style="margin: 8px 0 4px; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(track.title || 'Неизвестно') + '</h4>' +
            '<p style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(artistsText) + '</p>' +
            '</div>';
    });
    container.innerHTML = html;
}

function displayWavesList(waves) {
    const container = document.getElementById('waveTracksContainer');
    const playlistsContainer = document.getElementById('wavePlaylistsContainer');
    
    if (!container || !playlistsContainer) return;
    
    if (waves.length === 0) {
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-music" style="font-size: 2rem; color: var(--text-muted);"></i><p style="margin-top: 12px; color: var(--text-muted);">Миксы не найдены</p></div>';
        return;
    }
    
    playlistsContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">Выберите микс:</span>';
    waves.slice(0, 10).forEach(function(wave) {
        const btn = document.createElement('button');
        btn.className = 'source-btn';
        btn.style.fontSize = '11px';
        btn.style.padding = '6px 12px';
        btn.innerHTML = escapeHtml(wave.title);
        btn.onclick = function() { loadWavePlaylist(wave.id); };
        playlistsContainer.appendChild(btn);
    });
    playlistsContainer.style.display = 'flex';
    container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-hand-pointer" style="font-size: 1.5rem;"></i><p style="margin-top: 12px;">Выберите микс сверху</p></div>';
}

async function loadWavePlaylist(playlistId) {
    const container = document.getElementById('waveTracksContainer');
    if (!container) return;
    
    container.innerHTML = '<div style="flex: 1; min-width: 200px; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Загрузка...</p></div>';
    
    try {
        const data = await apiCall('playlists/' + playlistId + '/tracks');
        displayWaveTracks(data.tracks || []);
    } catch (error) {
        console.error('Load wave playlist error:', error);
        container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ff6b6b;"></i><p style="margin-top: 12px;">Ошибка загрузки</p></div>';
    }
}

window.changeWaveSource = function(source) {
    document.querySelectorAll('#waveSourceSelector .source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.source === source);
    });
    
    const container = document.getElementById('waveTracksContainer');
    if (container) {
        container.innerHTML = '<div style="flex: 1; min-width: 200px; text-align: center; padding: 40px;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Загрузка...</p></div>';
        
        fetch('/api/recommendations')
            .then(function(response) { return response.json(); })
            .then(function(data) {
                var filteredTracks = [];
                if (source === 'all') {
                    filteredTracks = data;
                } else {
                    filteredTracks = data.filter(function(t) { return t.service === source; });
                }
                displayWaveTracks(filteredTracks || []);
            })
            .catch(function() {
                container.innerHTML = '<div style="flex: 1; text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Ошибка загрузки</p></div>';
            });
    }
};

function hideLoadingScreen() {
    setTimeout(function() {
        var loading = document.getElementById('loadingScreen');
        if (loading) {
            loading.style.opacity = '0';
            loading.style.pointerEvents = 'none';
            setTimeout(function() {
                if (loading.parentNode) loading.parentNode.removeChild(loading);
            }, 500);
        }
    }, 500);
}

async function loadProfile() {
    try {
        var profile = await apiCall('profile');
        if (profile && profile.local) {
            var local = profile.local;
            var nameEls = ['userName', 'sidebarUsername', 'headerUsername'];
            nameEls.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.textContent = local.display_name || local.username;
            });
            
            if (local.avatar_url) {
                var avatarHtml = '<img src="' + local.avatar_url + '" alt="">';
                ['sidebarAvatar', 'headerUserAvatar'].forEach(function(id) {
                    var el = document.getElementById(id);
                    if (el) el.innerHTML = avatarHtml;
                });
            }
            if (typeof applyFrame === 'function') {
                applyFrame(local.equipped_frame);
            }
        }
    } catch (error) {
        console.error('Load profile error:', error);
    }
}

async function loadDashboard() {
    var grid = document.getElementById('recommendationsGrid');
    if (!grid) {
        console.log('Grid not found, dashboard skipped');
        return;
    }
    
    grid.innerHTML = '<div class="glass-card" style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Загрузка...</p></div>';
    
    try {
        var homeData = await apiCall('home');
        
        if (homeData && homeData.stats) {
            if (homeData.stats.total_liked_tracks !== undefined) {
                var tracksEl = document.getElementById('welcomeTracks');
                if (tracksEl) tracksEl.textContent = homeData.stats.total_liked_tracks;
            }
            if (homeData.stats.total_playlists !== undefined) {
                var playlistsEl = document.getElementById('welcomePlaylists');
                if (playlistsEl) playlistsEl.textContent = homeData.stats.total_playlists;
            }
        }
        
        displayRecommendations(homeData ? homeData.recommendations : []);
    } catch (error) {
        console.error('Load dashboard error:', error);
        grid.innerHTML = '<div class="glass-card" style="text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ff6b6b;"></i><p style="margin-top: 12px;">Ошибка загрузки. Настройте токены в профиле.</p></div>';
    }
}

function displayRecommendations(items) {
    var grid = document.getElementById('recommendationsGrid');
    if (!grid) return;
    
    if (!items || !items.length) {
        grid.innerHTML = '<div class="glass-card" style="text-align: center; padding: 40px;"><i class="fas fa-music" style="font-size: 3rem; color: var(--accent);"></i><p style="margin-top: 12px;">Нет рекомендаций</p><p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">Настройте токены в профиле</p></div>';
        return;
    }
    
    var html = '';
    items.forEach(function(item) {
        var artistsText = item.artists ? (Array.isArray(item.artists) ? item.artists.join(', ') : item.artists) : (item.artist || '');
        var coverHtml = item.cover_uri 
            ? '<img src="' + item.cover_uri + '" alt="" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px;">'
            : '<div style="width: 100%; aspect-ratio: 1; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 12px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-music fa-2x" style="color: #fff;"></i></div>';
        
        html += '<div class="glass-card playlist-card" onclick="playAndSetQueue(\'' + item.id + '\', JSON.parse(\'' + JSON.stringify(items).replace(/'/g, "\\'") + '\'))">' +
            '<div class="playlist-cover">' + coverHtml + '</div>' +
            '<h4 style="margin-bottom: 4px;">' + escapeHtml(item.title) + '</h4>' +
            '<p style="font-size: 0.85rem; color: var(--text-secondary);">' + escapeHtml(artistsText) + '</p>' +
            '</div>';
    });
    grid.innerHTML = html;
}

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
    var targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
    document.querySelectorAll('.mobile-nav-item').forEach(function(n) { n.classList.remove('active'); });
    var targetNav = document.querySelector('.nav-item[data-tab="' + tabName + '"]');
    var targetMobileNav = document.querySelector('.mobile-nav-item[data-tab="' + tabName + '"]');
    if (targetNav) targetNav.classList.add('active');
    if (targetMobileNav) targetMobileNav.classList.add('active');
    
    if (tabName === 'profile' && typeof loadProfileData === 'function') loadProfileData();
    if (tabName === 'playlists' && typeof loadPlaylists === 'function') loadPlaylists();
    if (tabName === 'notifications' && typeof loadNotifications === 'function') loadNotifications();
    if (tabName === 'favorites' && typeof loadFavorites === 'function') loadFavorites();
    if (tabName === 'history' && typeof loadHistory === 'function') loadHistory();
    if (tabName === 'shop' && typeof initShop === 'function') initShop();
    if (tabName === 'stats' && typeof loadStats === 'function') loadStats();
    if (tabName === 'battlepass') {
        if (typeof loadBattlePass === 'function') loadBattlePass();
        hideBpNewBadge();
    }
};

let searchTimeout = null;
window.currentSearchService = 'all';

window.setSearchService = function(service) {
    window.currentSearchService = service;
    document.querySelectorAll('.search-service-selector .source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.service === service);
    });
    if (document.getElementById('globalSearch').value.trim().length >= 2) {
        performSearch();
    }
};

window.performSearch = async function() {
    var query = document.getElementById('globalSearch');
    if (!query || !query.value.trim()) {
        hideSearchDropdown();
        return;
    }
    query = query.value.trim();
    
    showSearchLoading();
    
    try {
        var service = window.currentSearchService || 'all';
        var apiUrl = 'search?q=' + encodeURIComponent(query);
        if (service !== 'all') {
            apiUrl += '&services=' + service;
        }
        var results = await apiCall(apiUrl);
        displaySearchDropdown(results);
    } catch (error) {
        console.error('Search error:', error);
        showSearchEmpty();
    }
};

function showSearchLoading() {
    var dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;
    dropdown.style.display = 'block';
    dropdown.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px;"></i><br><span style="font-size: 13px;">Поиск...</span></div>';
}

function showSearchEmpty(message) {
    var dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;
    var msg = message || 'Ничего не найдено';
    dropdown.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);"><i class="fas fa-search" style="font-size: 20px; margin-bottom: 8px;"></i><br><span style="font-size: 13px;">' + msg + '</span></div>';
}

function hideSearchDropdown() {
    var dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function displaySearchDropdown(results) {
    var dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;
    
    var tracks = results.tracks || [];
    var query = document.getElementById('globalSearch').value.trim();
    
    if (!tracks.length) {
        showSearchEmpty();
        return;
    }
    
    var html = '';
    
    html += '<div style="padding: 8px 12px; background: var(--bg-elevated); border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">' +
        '<span style="font-size: 12px; color: var(--text-muted); font-weight: 600;">Результаты (' + tracks.length + ')</span>' +
        '<span style="font-size: 11px; color: var(--accent); cursor: pointer;" onclick="document.getElementById(\'globalSearch\').value=\'' + escapeHtml(query) + '\'; performFullSearch(); hideSearchDropdown();">Все →</span>' +
        '</div>';
    
    tracks.slice(0, 6).forEach(function(t) {
        var artistsText = t.artists ? (Array.isArray(t.artists) ? t.artists.join(', ') : t.artists) : (t.artist || '');
        var serviceIcon = t.service === 'soundcloud' ? '<i class="fab fa-soundcloud" style="color: #ff5500; font-size: 10px;"></i> ' : '';
        var cover = t.cover_uri 
            ? '<img src="' + t.cover_uri + '" alt="" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">'
            : '<div style="width: 40px; height: 40px; background: var(--bg-elevated); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fas fa-music" style="color: var(--text-muted); font-size: 14px;"></i></div>';
        
        html += '<div class="search-item" style="padding: 8px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; transition: background 0.15s; border-radius: 0;" onmouseover="this.style.background=\'var(--bg-elevated)\'" onmouseout="this.style.background=\'transparent\'" onclick="playTrack(\'' + t.id + '\'); hideSearchDropdown();">' +
            cover +
            '<div style="flex: 1; min-width: 0;">' +
            '<div style="font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text);">' + serviceIcon + escapeHtml(t.title) + '</div>' +
            '<div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(artistsText) + '</div>' +
            '</div>' +
            '<button onclick="event.stopPropagation(); addToQueue(\'' + t.id + '\')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px;" title="В очередь"><i class="fas fa-plus"></i></button>' +
            '<button onclick="event.stopPropagation(); playNext(\'' + t.id + '\')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px;" title="Воспроизвести следующим"><i class="fas fa-step-forward"></i></button>' +
            '<button onclick="event.stopPropagation(); showAddToPlaylistModal(' + JSON.stringify(t).replace(/'/g, "\\'") + ')" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px;" title="В плейлист"><i class="fas fa-list-plus"></i></button>' +
            '</div>';
    });
    
    dropdown.innerHTML = html;
}

function performFullSearch() {
    var query = document.getElementById('globalSearch');
    if (!query || !query.value.trim()) return;
    query = query.value.trim();
    
    var grid = document.getElementById('recommendationsGrid');
    if (grid) {
        grid.innerHTML = '<div class="glass-card" style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin"></i></div>';
    }
    
    var service = window.currentSearchService || 'all';
    var apiUrl = 'search?q=' + encodeURIComponent(query);
    if (service !== 'all') {
        apiUrl += '&services=' + service;
    }
    
    apiCall(apiUrl).then(function(results) {
        displaySearchResults(results);
    }).catch(function(error) {
        console.error('Search error:', error);
    });
}

function displaySearchResults(results) {
    var container = document.getElementById('recommendationsGrid');
    if (!container) return;
    
    window.currentSource = 'search';
    window.currentSourceTracks = results.tracks || [];
    
    var html = '<div class="glass-card"><h3 style="margin-bottom: 16px;"><i class="fas fa-search" style="color: var(--accent);"></i> Результаты поиска</h3>';
    
    if (results.tracks && results.tracks.length) {
        html += '<div style="display: flex; flex-direction: column; gap: 4px;">';
        results.tracks.forEach(function(t) {
            var artistsText = '';
            if (t.artists && Array.isArray(t.artists) && t.artists.length > 0) {
                artistsText = t.artists.join(', ');
            } else if (t.artists && typeof t.artists === 'string' && t.artists) {
                artistsText = t.artists;
            } else if (t.artist) {
                artistsText = t.artist;
            }
            var coverUrl = t.cover_uri || '';
            if (coverUrl) {
                coverUrl = coverUrl.replace('%%', '40x40');
                if (!coverUrl.includes('https://')) {
                    coverUrl = 'https://' + coverUrl;
                }
            }
            var coverHtml = coverUrl 
                ? '<div style="width: 40px; height: 40px; flex-shrink: 0; overflow: hidden; border-radius: 6px; background: var(--bg-tertiary);"><img src="' + coverUrl + '" alt="" style="width: 40px; height: 40px; object-fit: cover;" onerror="this.parentElement.innerHTML=\'<i class=&quot;fas fa-music&quot; style=&quot;color: var(--text-muted);&quot;></i>\'"></div>'
                : '<div style="width: 40px; height: 40px; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fas fa-music" style="color: #fff; font-size: 14px;"></i></div>';
            
            var serviceIcon = t.service === 'yandex' 
                ? '<i class="fab fa-yandex" style="color: #ff3333; font-size: 10px;"></i>' 
                : t.service === 'vk' 
                ? '<i class="fab fa-vk" style="color: #4a76a8; font-size: 10px;"></i>' 
                : t.service === 'soundcloud'
                ? '<i class="fab fa-soundcloud" style="color: #ff5500; font-size: 10px;"></i>'
                : '';
            
            var duration = '';
            if (t.duration) {
                var mins = Math.floor(t.duration / 60000);
                var secs = Math.floor((t.duration % 60000) / 1000);
                duration = mins + ':' + (secs < 10 ? '0' : '') + secs;
            }
            
            html += '<div onclick="playTrack(\'' + t.id + '\')" style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 8px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.05)\'" onmouseout="this.style.background=\'transparent\'">' +
                coverHtml +
                '<div style="flex: 1; min-width: 0;">' +
                '<div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px;">' + escapeHtml(t.title) + ' ' + serviceIcon + '</div>' +
                '<div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + escapeHtml(artistsText) + '</div>' +
                '</div>' +
                '<div style="color: var(--text-secondary); font-size: 12px; flex-shrink: 0;">' + duration + '</div>' +
                '</div>';
        });
        html += '</div>';
    } else {
        html += '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-search" style="font-size: 2rem; margin-bottom: 8px;"></i><p>Ничего не найдено</p></div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function setupGlobalEventListeners() {
    var globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
        globalSearch.addEventListener('input', function(e) {
            var query = e.target.value.trim();
            
            if (searchTimeout) clearTimeout(searchTimeout);
            
            if (query.length < 2) {
                hideSearchDropdown();
                return;
            }
            
            searchTimeout = setTimeout(function() {
                performSearch();
            }, 300);
        });
        
        globalSearch.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchTimeout) clearTimeout(searchTimeout);
                performSearch();
            }
            if (e.key === 'Escape') {
                hideSearchDropdown();
                globalSearch.blur();
            }
        });
        
        globalSearch.addEventListener('focus', function() {
            if (globalSearch.value.trim().length >= 2) {
                performSearch();
            }
        });
    }
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-box')) {
            hideSearchDropdown();
        }
    });
    
    document.querySelectorAll('.nav-item[data-tab]').forEach(function(item) {
        item.addEventListener('click', function() {
            var tab = item.dataset.tab;
            if (tab) switchTab(tab);
        });
    });
    
    document.querySelectorAll('#waveSourceSelector .source-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var source = btn.dataset.source;
            if (source) changeWaveSource(source);
        });
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(function(m) {
                if (m.style.display === 'flex') closeModal(m.id);
            });
        }
        
        if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (window.togglePlay) window.togglePlay();
        }
    });
    
    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal(modal.id);
        });
    });
    
    var settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            var theme = document.getElementById('themeSelect');
            var musicService = document.getElementById('musicService');
            theme = theme ? theme.value : 'dark';
            musicService = musicService ? musicService.value : 'yandex';
            
            if (theme) {
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
            }
            
            try {
                await apiCall('settings', {
                    method: 'POST',
                    body: JSON.stringify({ theme: theme, music_service: musicService })
                });
                showNotification('Настройки сохранены', 'success');
                closeModal('settingsModal');
            } catch (error) {
                showNotification('Ошибка сохранения', 'error');
            }
        });
        
        var savedTheme = localStorage.getItem('theme') || 'dark';
        var themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.value = savedTheme;
    }
}

async function loadFavorites() {
    var container = document.getElementById('favoritesList');
    if (!container) return;
    
    container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Загрузка...</p></div>';
    
    try {
        var favorites = await apiCall('favorites');
        displayFavorites(favorites);
    } catch (error) {
        console.error('Load favorites error:', error);
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки</p></div>';
    }
}

function displayFavorites(tracks) {
    var container = document.getElementById('favoritesList');
    if (!container) return;
    
    if (!tracks || !tracks.length) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-heart" style="font-size: 2rem;"></i><p>Избранное пусто</p></div>';
        return;
    }
    
    var html = '';
    tracks.forEach(function(track) {
        html += createTrackItemHTML(track, true);
    });
    container.innerHTML = html;
}

async function loadHistory() {
    var container = document.getElementById('historyList');
    if (!container) return;
    
    container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Загрузка...</p></div>';
    
    try {
        var history = await apiCall('listening_history');
        displayHistory(history);
    } catch (error) {
        console.error('Load history error:', error);
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-exclamation-triangle"></i><p>Ошибка загрузки</p></div>';
    }
}

function displayHistory(tracks) {
    var container = document.getElementById('historyList');
    if (!container) return;
    
    if (!tracks || !tracks.length) {
        container.innerHTML = '<div class="queue-placeholder"><i class="fas fa-history" style="font-size: 2rem;"></i><p>История пуста</p></div>';
        return;
    }
    
    var html = '';
    tracks.forEach(function(track) {
        var timeAgo = track.played_at ? formatTimeAgo(track.played_at) : '';
        html += createTrackItemHTML(track, null, timeAgo);
    });
    container.innerHTML = html;
}

window.clearHistory = async function() {
    if (!confirm('Очистить историю прослушиваний?')) return;
    
    try {
        await fetch('/api/listening_history/clear', { method: 'POST' });
        loadHistory();
        showNotification('История очищена', 'success');
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
};

window.toggleFavorite = async function(trackId, trackData) {
    try {
        var isLiked = await fetch('/api/favorites/' + trackId + '/check').then(function(r) { return r.json(); });
        
        if (isLiked.liked) {
            await fetch('/api/favorites/' + trackId, { method: 'DELETE' });
            showNotification('Удалено из избранного', 'success');
        } else {
            await fetch('/api/favorites/' + trackId, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ track_data: trackData || {} })
            });
            showNotification('Добавлено в избранное', 'success');
        }
        
        document.querySelectorAll('[data-track-id="' + trackId + '"] .like-btn').forEach(function(btn) {
            updateLikeButton(btn, !isLiked.liked);
        });
    } catch (error) {
        console.error('Toggle favorite error:', error);
    }
};

function updateLikeButton(btn, isLiked) {
    if (!btn) return;
    btn.classList.toggle('liked', isLiked);
    btn.innerHTML = isLiked ? '<i class="fas fa-heart"></i>' : '<i class="far fa-heart"></i>';
}

function createTrackItemHTML(track, isFavorite, timeAgo) {
    isFavorite = isFavorite !== undefined ? isFavorite : null;
    timeAgo = timeAgo || '';
    
    var artists = track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : (track.artist || '');
    var title = track.title || 'Неизвестно';
    var cover = track.cover_uri || track.coverUrl || '';
    var duration = track.duration ? formatDuration(track.duration) : (track.duration_ms ? formatDuration(track.duration_ms) : '');
    var trackId = track.id || track.track_id || '';
    
    var coverHtml = cover 
        ? '<img src="' + cover + '" alt="">' 
        : '<i class="fas fa-music"></i>';
    
    var likedClass = isFavorite !== null ? (isFavorite ? 'liked' : '') : (track.liked ? 'liked' : '');
    var heartIcon = likedClass ? 'fas fa-heart' : 'far fa-heart';
    var timeAgoHtml = timeAgo ? '<span style="font-size: 11px; color: var(--text-muted); margin-left: auto;">' + timeAgo + '</span>' : '';
    
    return '<div class="track-item" data-track-id="' + trackId + '">' +
        '<div class="track-item-cover">' + coverHtml + '</div>' +
        '<div class="track-item-info">' +
        '<div class="track-item-title">' + escapeHtml(title) + '</div>' +
        '<div class="track-item-artist">' + escapeHtml(artists) + '</div>' +
        '</div>' +
        timeAgoHtml +
        '<button class="like-btn ' + likedClass + '" onclick="event.stopPropagation(); toggleFavorite(\'' + trackId + '\', JSON.parse(\'' + JSON.stringify(track).replace(/'/g, "\\'") + '\'))" style="background: none; border: none; color: var(--accent); font-size: 18px; cursor: pointer; padding: 8px;">' +
        '<i class="' + heartIcon + '"></i>' +
        '</button>' +
        '<button onclick="event.stopPropagation(); showAddToPlaylistModal(' + JSON.stringify(track).replace(/'/g, "\\'") + ')" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 8px;" title="В плейлист">' +
        '<i class="fas fa-list-plus"></i>' +
        '</button>' +
        '<div class="track-duration">' + duration + '</div>' +
        '<button class="play-item-btn" onclick="playTrack(\'' + trackId + '\')" style="background: none; border: none; color: var(--text); font-size: 18px; cursor: pointer; padding: 8px;">' +
        '<i class="fas fa-play"></i>' +
        '</button>' +
        '</div>';
}

window.playAndSetQueue = function(trackId, playlist) {
    window.queue = [].concat(playlist);
    window.currentPlaylist = [].concat(playlist);
    var idx = playlist.findIndex(function(t) { return t.id === trackId; });
    window.currentTrackIndex = idx >= 0 ? idx : 0;
    playTrack(trackId);
};

window.currentRadioService = 'yandex';
window.currentRadioStation = null;
window.radioTracks = [];

window.selectRadioService = function(service) {
    window.currentRadioService = service;
    document.querySelectorAll('#radioServiceSelector .source-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.service === service);
    });
    loadRadioStations();
};

window.loadRadioStations = async function() {
    document.getElementById('radioLoading').style.display = 'block';
    document.getElementById('radioError').style.display = 'none';
    document.getElementById('radioContent').style.display = 'none';
    
    try {
        var data = await apiCall('radio/stations?service=' + window.currentRadioService);
        
        if (data.error) {
            document.getElementById('radioErrorText').textContent = data.error;
            document.getElementById('radioLoading').style.display = 'none';
            document.getElementById('radioError').style.display = 'block';
            return;
        }
        
        displayRadioStations(data.categories || []);
        
        document.getElementById('radioLoading').style.display = 'none';
        document.getElementById('radioContent').style.display = 'block';
    } catch (error) {
        console.error('Load radio stations error:', error);
        document.getElementById('radioErrorText').textContent = 'Ошибка загрузки станций';
        document.getElementById('radioLoading').style.display = 'none';
        document.getElementById('radioError').style.display = 'block';
    }
};

function displayRadioStations(categories) {
    var container = document.getElementById('radioStationsList');
    var html = '';
    
    categories.forEach(function(category) {
        html += '<div style="margin-bottom: 24px;">' +
            '<h4 style="margin-bottom: 12px; color: var(--text-secondary);">' + escapeHtml(category.name) + '</h4>' +
            '<div class="services-grid" style="gap: 12px;">';
        
        category.stations.forEach(function(station) {
            var cover = station.cover_uri 
                ? '<img src="' + station.cover_uri + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">'
                : '<i class="fas fa-radio" style="font-size: 2rem; color: #fff;"></i>';
            
            html += '<div class="glass-card" onclick="startRadio(\'' + station.station_id + '\', \'' + escapeHtml(station.name || '').replace(/'/g, "\\'") + '\', \'' + (station.cover_uri || '').replace(/'/g, "\\'") + '\')" ' +
                'style="cursor: pointer; text-align: center; padding: 16px; transition: transform 0.2s, box-shadow 0.2s;" ' +
                'onmouseenter="this.style.transform=\'scale(1.05)\'; this.style.boxShadow=\'0 8px 32px rgba(99,102,241,0.3)\';" ' +
                'onmouseleave="this.style.transform=\'scale(1)\'; this.style.boxShadow=\'none\';">' +
                '<div style="width: 80px; height: 80px; border-radius: 12px; background: var(--accent); margin: 0 auto 12px; overflow: hidden; display: flex; align-items: center; justify-content: center;">' + cover + '</div>' +
                '<h5 style="margin: 0 0 4px; font-size: 14px;">' + escapeHtml(station.name || 'Станция') + '</h5>' +
                '<p style="margin: 0; font-size: 12px; color: var(--text-muted);">' + escapeHtml(station.description || '') + '</p>' +
                '</div>';
        });
        
        html += '</div></div>';
    });
    
    if (!html) {
        html = '<p style="text-align: center; color: var(--text-muted); padding: 40px;">Станции не найдены. Настройте токен Яндекс.Музыки в профиле.</p>';
    }
    
    container.innerHTML = html;
}

window.startRadio = async function(stationId, stationName, coverUri) {
    try {
        document.getElementById('radioNowPlaying').style.display = 'block';
        document.getElementById('radioStationName').textContent = stationName;
        
        if (coverUri) {
            document.getElementById('radioStationCover').innerHTML = '<img src="' + coverUri + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">';
        }
        
        window.currentRadioStation = {
            id: stationId,
            name: stationName,
            cover: coverUri
        };
        
        await loadMoreRadioTracks();
        
    } catch (error) {
        console.error('Start radio error:', error);
        showNotification('Ошибка запуска радио', 'error');
    }
};

window.loadMoreRadioTracks = async function() {
    if (!window.currentRadioStation) return;
    
    try {
        var data = await apiCall('radio/tracks?service=' + window.currentRadioService + '&station_id=' + encodeURIComponent(window.currentRadioStation.id));
        
        if (data.tracks && data.tracks.length > 0) {
            window.radioTracks = window.radioTracks.concat(data.tracks);
            updateRadioQueue();
        }
    } catch (error) {
        console.error('Load radio tracks error:', error);
    }
};

function updateRadioQueue() {
    if (window.radioTracks.length > 0) {
        var nextTrack = window.radioTracks[0];
        document.getElementById('radioTrackInfo').textContent = escapeHtml(nextTrack.title) + ' - ' + escapeHtml(nextTrack.artist);
        
        window.currentSource = 'radio';
        window.currentSourceTracks = window.radioTracks;
        window.queue = window.radioTracks.slice();
        
        playTrack(nextTrack.id);
        
        window.radioTracks.shift();
        
        if (window.radioTracks.length < 5) {
            loadMoreRadioTracks();
        }
    }
}

window.skipRadioTrack = function() {
    if (window.radioTracks.length > 0) {
        var nextTrack = window.radioTracks[0];
        document.getElementById('radioTrackInfo').textContent = escapeHtml(nextTrack.title) + ' - ' + escapeHtml(nextTrack.artist);
        
        playTrack(nextTrack.id);
        
        window.radioTracks.shift();
        
        if (window.radioTracks.length < 5) {
            loadMoreRadioTracks();
        }
    } else {
        loadMoreRadioTracks();
    }
};

window.stopRadio = function() {
    window.currentRadioStation = null;
    window.radioTracks = [];
    document.getElementById('radioNowPlaying').style.display = 'none';
    
    if (window.audioPlayer) {
        window.audioPlayer.pause();
    }
};

if (typeof window.openProfileCustomize !== 'function') {
    window.openProfileCustomize = function() {
        openModal('profileCustomizeModal');
    };
}

if (typeof window.loadActiveBanner !== 'function') {
    window.loadActiveBanner = function() {};
}

window.loadBattlePass = async function() {
    var loading = document.getElementById('bpLoading');
    var content = document.getElementById('bpContent');
    if (loading) loading.style.display = 'block';
    if (content) content.style.display = 'none';
    try {
        var data = await apiCall('battle-pass/status');
        if (!data.active) {
            if (loading) loading.innerHTML = '<div style="color: var(--text-muted);">Нет активного сезона</div>';
            return;
        }
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'block';

        document.getElementById('bpSeasonName').textContent = data.season.name;
        document.getElementById('bpDaysLeft').textContent = 'Осталось ' + data.season.days_left + ' дн.';

        var bpBalance = document.getElementById('bpBalance');
        if (bpBalance) {
            apiCall('currency/balance').then(function(b) {
                bpBalance.textContent = b.balance || 0;
            }).catch(function(){});
        }

        var activated = data.user.activated;
        var activateSection = document.getElementById('bpActivateSection');
        var passSection = document.getElementById('bpPassSection');
        if (!activated) {
            if (activateSection) activateSection.style.display = 'block';
            if (passSection) passSection.style.display = 'none';
            return;
        }
        if (activateSection) activateSection.style.display = 'none';
        if (passSection) passSection.style.display = 'block';

        apiCall('battle-pass/restore-rewards', {method: 'POST', body: '{}'}).then(function(r) {
            if (r.success && r.restored > 0) console.log('Restored', r.restored, 'rewards');
        }).catch(function(){});

        document.getElementById('bpLevel').textContent = data.user.level;
        var pct = 0;
        if (data.user.xp_to_next > 0) {
            pct = Math.min(100, Math.round((data.user.xp / data.user.xp_to_next) * 100));
        }
        document.getElementById('bpProgressFill').style.width = pct + '%';
        document.getElementById('bpXpText').textContent = data.user.xp + ' XP';
        document.getElementById('bpXpNext').textContent = data.user.xp_to_next > 0 ? data.user.xp + ' / ' + data.user.xp_to_next + ' XP' : 'Максимальный уровень!';

        var claimedFree = data.user.claimed_free || [];
        var userLevel = data.user.level;

        var container = document.getElementById('bpTimelineInner');
        if (!container) return;
        container.innerHTML = '';

        (data.levels || []).forEach(function(lvl) {
            var cell = document.createElement('div');
            cell.className = 'bp-level-cell';

            var isFreeClaimed = claimedFree.indexOf(lvl.level) !== -1;
            var isFreeAvail = lvl.level <= userLevel;
            var isCurrent = lvl.level === userLevel;

            cell.setAttribute('data-level', lvl.level);
            if (isCurrent) cell.classList.add('current');
            if (lvl.level <= userLevel) cell.classList.add('unlocked');

            var content = document.createElement('div');
            content.className = 'bp-level-content';

            var num = document.createElement('div');
            num.className = 'bp-level-num';
            if (lvl.level % 10 === 0 || lvl.level === 1 || lvl.level === data.season.max_level) {
                num.textContent = lvl.level;
            }
            content.appendChild(num);

            var freeSlot = document.createElement('div');
            freeSlot.className = 'bp-reward-slot free' + (isFreeAvail ? ' avail' : ' locked') + (isFreeClaimed ? ' claimed' : '') + (lvl.free_reward ? ' has-reward' : '');
            freeSlot.title = lvl.free_reward ? (lvl.free_reward.name || 'Награда') : 'Нет награды';
            if (lvl.free_reward && lvl.free_reward.image) {
                var img = document.createElement('img');
                img.src = lvl.free_reward.image;
                img.className = 'bp-reward-img';
                freeSlot.appendChild(img);
            } else if (lvl.free_reward) {
                freeSlot.innerHTML = '<i class="fas fa-gift"></i>';
            }
            if (isFreeClaimed) freeSlot.innerHTML += '<div class="bp-check"><i class="fas fa-check"></i></div>';
            content.appendChild(freeSlot);

            cell.appendChild(content);

            cell.onclick = function() {
                showBpLevelDetail(lvl, isFreeClaimed, isFreeAvail);
            };

            container.appendChild(cell);
        });

        loadBattlePassQuests();
    } catch (e) {
        console.error('Battle pass load error:', e);
        if (loading) loading.innerHTML = '<div style="color: var(--text-muted);">Ошибка загрузки</div>';
    }
};

function showBpLevelDetail(lvl, isFreeClaimed, isFreeAvail) {
    var detail = document.getElementById('bpLevelDetail');
    if (!detail) return;
    detail.style.display = 'block';
    var html = '<div class="glass-card" style="padding:16px;border:1px solid rgba(255,215,0,0.2);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
    html += '<h4 style="margin:0;"><i class="fas fa-trophy" style="color:#ffd700;"></i> Уровень ' + lvl.level + '</h4>';
    html += '<span style="font-size:12px;color:var(--text-muted);">' + lvl.xp_required + ' XP</span>';
    html += '</div>';
    html += '<div style="text-align:center;padding:12px;border-radius:12px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);">';
    if (lvl.free_reward && lvl.free_reward.image) {
        html += '<img src="' + lvl.free_reward.image + '" style="width:64px;height:64px;object-fit:cover;border-radius:8px;margin-bottom:8px;">';
    } else {
        html += '<div style="width:64px;height:64px;border-radius:8px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;"><i class="fas fa-gift" style="font-size:24px;color:var(--text-muted);"></i></div>';
    }
    html += '<div style="font-size:12px;">' + (lvl.free_reward ? lvl.free_reward.name || 'Награда' : '—') + '</div>';
    if (isFreeAvail && !isFreeClaimed && lvl.free_reward) {
        html += '<button class="btn-primary" style="margin-top:8px;padding:4px 12px;font-size:12px;" onclick="doBpClaim(' + lvl.level + ')"><i class="fas fa-gift"></i> Забрать</button>';
    } else if (isFreeClaimed) {
        html += '<div style="margin-top:8px;font-size:12px;color:#22c55e;"><i class="fas fa-check-circle"></i> Получено</div>';
    } else {
        html += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted);"><i class="fas fa-lock"></i> Уровень ' + lvl.level + '</div>';
    }
    html += '</div></div>';
    detail.innerHTML = html;
}

function loadBattlePassQuests() {
    var container = document.getElementById('bpQuests');
    if (!container) return;
    apiCall('battle-pass/quests').then(function(data) {
        if (!data.quests || data.quests.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Нет заданий</div>';
            return;
        }
        var html = '';
        data.quests.forEach(function(q) {
            var pct = q.requirement_value > 0 ? Math.min(100, Math.round((q.progress / q.requirement_value) * 100)) : 0;
            var typeLabel = q.type === 'daily' ? 'Ежедневно' : 'Еженедельно';
            var typeIcon = q.type === 'daily' ? 'fa-sun' : 'fa-calendar-week';
            var isDone = q.completed && !q.claimed;
            var isClaimed = q.claimed;
            html += '<div class="glass-card" style="padding: 12px 16px; display: flex; align-items: center; gap: 12px;' + (isClaimed ? ' opacity: 0.5;' : '') + '">';
            html += '<div style="flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: var(--bg-elevated); display: flex; align-items: center; justify-content: center;"><i class="fas ' + typeIcon + '" style="color: var(--accent);"></i></div>';
            html += '<div style="flex: 1; min-width: 0;">';
            html += '<div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">';
            html += '<span style="font-size: 14px; font-weight: 600;">' + q.description + '</span>';
            html += '<span style="font-size: 12px; color: #ffd700; white-space: nowrap;"><i class="fas fa-star"></i> +' + q.xp_reward + ' XP</span>';
            html += '</div>';
            html += '<div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">';
            html += '<div class="progress-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px;"><div class="progress-fill" style="height: 100%; width: ' + pct + '%; border-radius: 3px; background: var(--accent);"></div></div>';
            html += '<span style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">' + q.progress + '/' + q.requirement_value + '</span>';
            if (isDone) {
                html += '<button class="btn-primary" style="padding: 4px 12px; font-size: 12px;" onclick="claimQuest(' + q.id + ')"><i class="fas fa-gift"></i></button>';
            } else if (isClaimed) {
                html += '<span style="font-size: 12px; color: #22c55e;"><i class="fas fa-check"></i></span>';
            } else {
                html += '<span style="font-size: 11px; color: var(--text-muted);">' + typeLabel + '</span>';
            }
            html += '</div></div></div>';
        });
        container.innerHTML = html;
    }).catch(function(e) {
        console.error('Load quests error:', e);
    });
}

window.claimQuest = function(questId) {
    apiCall('battle-pass/claim-quest', {method: 'POST', body: JSON.stringify({quest_id: questId})}).then(function(r) {
        if (r.success) {
            loadBattlePass();
        } else {
            alert(r.message);
        }
    }).catch(function(e) {
        console.error('Claim quest error:', e);
    });
};

function doBpClaim(levelNum) {
    apiCall('battle-pass/claim', {method: 'POST', body: JSON.stringify({level: levelNum})}).then(function(r) {
        if (r.success) {
            loadBattlePass();
        } else {
            alert(r.message);
        }
    }).catch(function(e) {
        console.error('Claim error:', e);
    });
}

window.activateBp = async function() {
    try {
        var r = await apiCall('battle-pass/activate', {method: 'POST', body: JSON.stringify({})});
        if (r.success) {
            location.reload();
        } else {
            alert(r.message);
        }
    } catch (e) {
        console.error('Activate error:', e);
    }
};

function hideBpNewBadge() {
    localStorage.setItem('bp_seen', '1');
    var badge = document.getElementById('bpNewBadge');
    if (badge) badge.style.display = 'none';
    var mobileBadge = document.getElementById('bpNewBadgeMobile');
    if (mobileBadge) mobileBadge.style.display = 'none';
}

(function showBpNewBadgeIfNeeded() {
    if (!localStorage.getItem('bp_seen')) {
        var badge = document.getElementById('bpNewBadge');
        if (badge) badge.style.display = 'inline';
        var mobileBadge = document.getElementById('bpNewBadgeMobile');
        if (mobileBadge) mobileBadge.style.display = 'inline';
    }
})();

window.startYandexDeviceAuth = async function() {
    try {
        var resp = await apiCall('yandex/device-auth/start', {method: 'POST', body: '{}'});
        if (!resp.success) {
            showNotification(resp.error || 'Ошибка', 'error');
            return;
        }
        var codeStr = resp.user_code;
        var url = resp.verification_url;
        var deviceId = resp.device_id;
        var expiresIn = resp.expires_in;

        var modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal" style="max-width:400px;text-align:center;padding:24px;">' +
            '<h3 style="margin-bottom:16px;">Авторизация Яндекс</h3>' +
            '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">1. Открой <a href="' + url + '" target="_blank" style="color:var(--accent);">' + url + '</a></p>' +
            '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">2. Введи код:</p>' +
            '<div style="font-size:32px;font-weight:800;letter-spacing:8px;background:var(--bg-tertiary);padding:12px 20px;border-radius:12px;display:inline-block;margin-bottom:16px;font-family:monospace;">' + codeStr + '</div>' +
            '<p style="margin-bottom:16px;color:var(--text-secondary);font-size:12px;">Код действителен ' + expiresIn + ' сек</p>' +
            '<div id="deviceAuthStatus" style="color:var(--text-muted);font-size:13px;">Ожидание авторизации...</div>' +
            '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;">' +
            '<button class="glass-btn" onclick="this.closest(\'.modal-overlay\').remove()">Отмена</button>' +
            '</div></div>';
        document.body.appendChild(modal);

        var pollInterval = setInterval(async function() {
            try {
                var pollResp = await apiCall('yandex/device-auth/poll', {method: 'POST', body: JSON.stringify({device_id: deviceId})});
                if (pollResp.success && pollResp.token) {
                    clearInterval(pollInterval);
                    document.getElementById('yandex_token').value = pollResp.token;
                    document.getElementById('deviceAuthStatus').textContent = '✅ Токен получен! Сохрани профиль.';
                    document.getElementById('deviceAuthStatus').style.color = '#2ed573';
                    setTimeout(function() { modal.remove(); }, 2000);
                    showNotification('Токен Яндекс получен! Нажми Сохранить.', 'success');
                } else if (pollResp.code === 'EXPIRED') {
                    clearInterval(pollInterval);
                    document.getElementById('deviceAuthStatus').textContent = '❌ Код истёк, попробуй снова';
                    document.getElementById('deviceAuthStatus').style.color = '#ff6b6b';
                }
            } catch (e) {
                console.error('Poll error:', e);
            }
        }, 3000);
    } catch (e) {
        console.error('Device auth error:', e);
        showNotification('Ошибка запуска авторизации', 'error');
    }
};
