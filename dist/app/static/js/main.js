if (document.querySelector('.auth-page')) {
    window.switchTab = function() {};
    window.performSearch = function() {};
    window.loadDashboard = function() {};
    window.loadFavorites = function() {};
    window.loadHistory = function() {};
} else {
    document.addEventListener('DOMContentLoaded', function() {
        initApp();
    });
}

async function initApp() {
    applySavedTheme();
    initAudioPlayer();
    
    try {
        await loadProfile();
    } catch (e) {
        console.error('Profile load error:', e);
    }
    
    try {
        await loadDashboard();
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
    
    try {
        await loadMyWave();
    } catch (e) {
        console.error('My Wave load error:', e);
    }
    
    try {
        await loadNotifications();
    } catch (e) {
        console.error('Notifications load error:', e);
    }
    
    setupGlobalEventListeners();
    hideLoadingScreen();
}

async function loadMyWave() {
    await loadLikedTracks('yandex');
}

window.refreshLikedTracks = function() {
    loadLikedTracks('yandex');
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

window.changeWaveSource = function(source) {
    loadLikedTracks(source);
};

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
    var targetNav = document.querySelector('.nav-item[data-tab="' + tabName + '"]');
    if (targetNav) targetNav.classList.add('active');
    
    if (tabName === 'profile' && typeof loadProfileData === 'function') loadProfileData();
    if (tabName === 'playlists' && typeof loadPlaylists === 'function') loadPlaylists();
    if (tabName === 'notifications' && typeof loadNotifications === 'function') loadNotifications();
    if (tabName === 'favorites' && typeof loadFavorites === 'function') loadFavorites();
    if (tabName === 'history' && typeof loadHistory === 'function') loadHistory();
    if (tabName === 'shop' && typeof loadShopItems === 'function') {
        loadShopItems();
    }
};

let searchTimeout = null;

window.performSearch = async function() {
    var query = document.getElementById('globalSearch');
    if (!query || !query.value.trim()) {
        hideSearchDropdown();
        return;
    }
    query = query.value.trim();
    
    showSearchLoading();
    
    try {
        var results = await apiCall('search?q=' + encodeURIComponent(query));
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
    dropdown.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> Поиск...</div>';
}

function showSearchEmpty() {
    var dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '<div class="search-no-results"><i class="fas fa-search"></i>Ничего не найдено</div>';
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
    
    html += '<div class="search-section">Результаты</div>';
    
    tracks.slice(0, 8).forEach(function(t) {
        var artistsText = t.artists ? (Array.isArray(t.artists) ? t.artists.join(', ') : t.artists) : (t.artist || '');
        var cover = t.cover_uri 
            ? '<img src="' + t.cover_uri + '" alt="" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">'
            : '<div style="width: 36px; height: 36px; background: linear-gradient(135deg, var(--accent), var(--accent-hover)); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fas fa-music" style="color: #fff; font-size: 12px;"></i></div>';
        
        html += '<div class="search-item" onclick="playTrack(\'' + t.id + '\'); hideSearchDropdown();">' +
            cover +
            '<div class="search-item-info">' +
            '<div class="search-item-title">' + escapeHtml(t.title) + '</div>' +
            '<div class="search-item-artist">' + escapeHtml(artistsText) + '</div>' +
            '</div>' +
            '<div class="search-item-actions">' +
            '<button onclick="event.stopPropagation(); addToQueue(\'' + t.id + '\')" title="В очередь"><i class="fas fa-list"></i></button>' +
            '</div>' +
            '</div>';
    });
    
    if (tracks.length > 8) {
        html += '<div class="search-more" onclick="document.getElementById(\'globalSearch\').value=\'' + escapeHtml(query) + '\'; performFullSearch(); hideSearchDropdown();">Ещё ' + (tracks.length - 8) + ' результатов →</div>';
    }
    
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
    
    apiCall('search?q=' + encodeURIComponent(query)).then(function(results) {
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
