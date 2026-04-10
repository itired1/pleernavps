async function loadProfileData() {
    try {
        const profile = await apiCall('profile');
        if (profile) updateProfileForm(profile);
    } catch (error) {
        console.error('Load profile error:', error);
        showNotification('Ошибка загрузки профиля', 'error');
    }
}

function updateProfileForm(profile) {
    if (!profile.local) return;
    const local = profile.local;
    
    localStorage.setItem('itired_user_id', local.id || '');
    document.body.dataset.userId = local.id || '';
    
    const displayName = document.getElementById('display_name');
    const bio = document.getElementById('bio');
    const yandexToken = document.getElementById('yandex_token');
    const vkToken = document.getElementById('vk_token');
    const soundcloudClientId = document.getElementById('soundcloud_client_id');
    const soundcloudProxy = document.getElementById('soundcloud_proxy');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileUsername = document.getElementById('profileUsername');
    const joinDate = document.getElementById('joinDate');
    const profileAvatar = document.getElementById('profileAvatar');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const headerAvatar = document.getElementById('headerUserAvatar');
    const yandexCheck = document.getElementById('yandexCheck');
    const vkCheck = document.getElementById('vkCheck');
    const soundcloudCheck = document.getElementById('soundcloudCheck');
    
    if (displayName) displayName.value = local.display_name || '';
    if (bio) bio.value = local.bio || '';
    if (yandexToken) yandexToken.value = local.yandex_token_set ? '***' : '';
    if (vkToken) vkToken.value = local.vk_token_set ? '***' : '';
    if (soundcloudClientId) soundcloudClientId.value = local.soundcloud_client_id_set ? '***' : '';
    if (soundcloudProxy) soundcloudProxy.value = local.soundcloud_proxy || '';
    
    if (yandexCheck) yandexCheck.style.display = local.yandex_token_set ? 'inline' : 'none';
    if (vkCheck) vkCheck.style.display = local.vk_token_set ? 'inline' : 'none';
    if (soundcloudCheck) soundcloudCheck.style.display = local.soundcloud_client_id_set ? 'inline' : 'none';
    
    if (local.current_source) {
        document.querySelectorAll('#profile .source-btn').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.source === local.current_source);
        });
    }
    
    if (profileDisplayName) profileDisplayName.textContent = local.display_name || local.username;
    if (profileUsername) profileUsername.textContent = '@' + local.username;
    if (joinDate && local.created_at) {
        joinDate.textContent = 'На платформе с ' + formatDate(local.created_at);
    }
    
    if (local.avatar_url) {
        updateAllAvatars(local.avatar_url);
    }
    
    if (local.equipped_badge) {
        updateProfileBadge(local.equipped_badge);
    }
    
    loadActiveBanner();
}

async function loadActiveBanner() {
    try {
        const response = await apiCall('shop/active-banner');
        if (response && response.image) {
            const bannerImg = document.querySelector('.profile-banner');
            if (bannerImg) {
                bannerImg.style.backgroundImage = 'url(' + response.image + ')';
                bannerImg.style.backgroundSize = 'cover';
                bannerImg.style.backgroundPosition = 'center';
            }
        }
    } catch (error) {
        console.error('Load active banner error:', error);
    }
}

function updateAllAvatars(url) {
    const avatarHtml = '<img src="' + url + '" alt="" style="width: 100%; height: 100%; object-fit: cover;">';
    
    ['profileAvatar', 'sidebarAvatar', 'headerUserAvatar'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = avatarHtml;
    });
}

function updateProfileBadge(badgeId) {
    const BADGES_DATA = {
        'badge_vip': { icon: 'fa-crown', color: '#ffd700' },
        'badge_early': { icon: 'fa-rocket', color: '#f97316' },
        'badge_meloman': { icon: 'fa-music', color: '#ec4899' },
        'badge_contributor': { icon: 'fa-code', color: '#22c55e' },
        'badge_verified': { icon: 'fa-check-circle', color: '#3b82f6' },
    };
    
    let badgeHtml = '';
    if (badgeId) {
        const data = BADGES_DATA[badgeId];
        if (data) {
            badgeHtml = '<i class="fas ' + data.icon + '" style="color: ' + data.color + '; font-size: 16px;"></i>';
        } else {
            const imageMap = {
                'badge_animemix1': '/static/shop/banners/banner_8585.gif',
                'badge_animemix2': '/static/shop/banners/banner_3106.gif',
                'badge_onepiece': '/static/shop/banners/banner_9454.gif',
                'badge_demonslayer': '/static/shop/banners/banner_5912.gif',
                'badge_aot': '/static/shop/banners/banner_4868.gif',
                'badge_bleach': '/static/shop/banners/banner_9862.gif',
                'badge_tokyo': '/static/shop/banners/banner_5584.gif',
                'badge_animevibes': '/static/shop/banners/banner_4277.gif',
                'badge_darkanime': '/static/shop/banners/banner_5545.gif',
                'badge_animelegend': '/static/shop/banners/banner_9518.gif',
                'badge_knight': '/static/shop/banners/badge_knight.gif',
                'badge_demon': '/static/shop/banners/badge_demon.gif',
                'badge_skull': '/static/shop/banners/badge_skull.gif',
                'badge_dragon': '/static/shop/banners/badge_dragon.gif',
                'badge_samurai': '/static/shop/banners/badge_samurai.jpg',
                'badge_street': '/static/shop/banners/badge_street.jpg',
                'badge_graffiti': '/static/shop/banners/badge_graffiti.jpg',
            };
            if (imageMap[badgeId]) {
                badgeHtml = '<img src="' + imageMap[badgeId] + '" style="width: 20px; height: 20px; object-fit: cover;">';
            }
        }
    }
    
    document.querySelectorAll('.user-badge').forEach(function(el) { el.innerHTML = badgeHtml; });
}

document.querySelectorAll('#profile .source-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        document.querySelectorAll('#profile .source-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
    });
});

const avatarInput = document.getElementById('avatarInput');
if (avatarInput) {
    avatarInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        var formData = new FormData();
        formData.append('avatar', file);
        
        try {
            var response = await fetch('/api/upload/avatar', {
                method: 'POST',
                body: formData
            });
            var result = await response.json();
            
            if (result.success) {
                showNotification('Аватарка загружена!', 'success');
                updateAllAvatars(result.avatar_url);
                loadProfileData();
            } else {
                showNotification(result.message || 'Ошибка загрузки', 'error');
            }
        } catch (error) {
            console.error('Avatar upload error:', error);
            showNotification('Ошибка загрузки аватарки', 'error');
        }
    });
}

window.triggerAvatarUpload = function() {
    var input = document.getElementById('avatarInput');
    if (input) input.click();
};

const profileForm = document.getElementById('profileForm');
if (profileForm) {
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        var activeSource = document.querySelector('#profile .source-btn.active');
        var data = {
            display_name: document.getElementById('display_name')?.value || '',
            bio: document.getElementById('bio')?.value || '',
            yandex_token: document.getElementById('yandex_token')?.value || '',
            vk_token: document.getElementById('vk_token')?.value || '',
            soundcloud_client_id: document.getElementById('soundcloud_client_id')?.value || '',
            soundcloud_proxy: document.getElementById('soundcloud_proxy')?.value || '',
            current_source: activeSource?.dataset.source || 'yandex'
        };
        
        if (data.yandex_token === '***') delete data.yandex_token;
        if (data.vk_token === '***') delete data.vk_token;
        
        try {
            var result = await fetch('/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).then(function(r) { return r.json(); });
            
            if (result.success) {
                showNotification('Профиль сохранён', 'success');
                loadProfileData();
            } else {
                showNotification(result.message || 'Ошибка сохранения', 'error');
            }
        } catch (error) {
            console.error('Save profile error:', error);
            showNotification('Ошибка сохранения', 'error');
        }
    });
}

if (document.getElementById('profileDisplayName')) {
    loadProfileData();
}

window.openProfileCustomize = async function() {
    openModal('profileCustomizeModal');
    
    document.getElementById('profileCustomizeLoading').style.display = 'block';
    document.getElementById('profileCustomizeContent').style.display = 'none';
    
    try {
        const inventory = await apiCall('shop/inventory');
        const profile = await apiCall('profile');
        
        const badges = (inventory || []).filter(function(item) { return item.data && item.data.type === 'badge'; });
        const frames = (inventory || []).filter(function(item) { return item.data && item.data.type === 'frame'; });
        const themes = (inventory || []).filter(function(item) { return item.data && item.data.type === 'theme'; });
        
        let equippedBadge = profile.local?.equipped_badge;
        let equippedFrame = profile.local?.equipped_frame;
        let equippedTheme = profile.local?.equipped_theme;
        
        document.getElementById('badgeList').innerHTML = renderCustomizeItems(badges, 'badge', equippedBadge);
        document.getElementById('frameList').innerHTML = renderCustomizeItems(frames, 'frame', equippedFrame);
        document.getElementById('themeList').innerHTML = renderCustomizeItems(themes, 'theme', equippedTheme);
        
        document.getElementById('profileCustomizeLoading').style.display = 'none';
        document.getElementById('profileCustomizeContent').style.display = 'block';
    } catch (error) {
        console.error('Load customize error:', error);
        showNotification('Ошибка загрузки', 'error');
    }
};

function renderCustomizeItems(items, type, equippedId) {
    if (!items.length) {
        return '<p style="color: var(--text-muted); font-size: 13px;">Нет купленных предметов</p>';
    }
    
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    
    items.forEach(function(item) {
        const isEquipped = item.item_id === equippedId;
        let preview = '';
        
        if (type === 'badge') {
            if (item.data.image) {
                preview = '<img src="' + item.data.image + '" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;">';
            } else {
                const icon = item.data.icon || 'fa-star';
                const color = item.data.color || '#ffd700';
                preview = '<i class="fas ' + icon + '" style="font-size: 24px; color: ' + color + ';"></i>';
            }
        } else if (type === 'frame') {
            const color = item.data.color || '#ffd700';
            preview = '<div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid ' + color + '; display: flex; align-items: center; justify-content: center;"><i class="fas fa-user" style="font-size: 16px;"></i></div>';
        } else if (type === 'theme') {
            const accent = item.data.accent || '#6366f1';
            preview = '<div style="width: 40px; height: 40px; border-radius: 8px; background: ' + accent + '; box-shadow: 0 0 10px ' + accent + ';"></div>';
        }
        
        html += '<div onclick="equipCustomizeItem(\'' + item.item_id + '\', \'' + type + '\')" ' +
            'style="width: 60px; height: 60px; background: var(--bg-elevated); border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid ' + (isEquipped ? 'var(--accent)' : 'transparent') + '; transition: all 0.2s;" ' +
            'title="' + escapeHtml(item.data.name || item.item_id) + '">' +
            preview +
            '</div>';
    });
    
    html += '</div>';
    return html;
}

window.equipCustomizeItem = async function(itemId, type) {
    try {
        let result;
        if (type === 'badge') {
            result = await apiCall('shop/equip-badge', {
                method: 'POST',
                body: JSON.stringify({ badge_id: itemId })
            });
        } else if (type === 'frame') {
            result = await apiCall('shop/equip-frame', {
                method: 'POST',
                body: JSON.stringify({ frame_id: itemId })
            });
        } else if (type === 'theme') {
            result = await apiCall('shop/equip-theme', {
                method: 'POST',
                body: JSON.stringify({ theme_id: itemId })
            });
        }
        
        if (result && result.success) {
            showNotification('Изменения сохранены', 'success');
            openProfileCustomize();
            loadProfileData();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Equip error:', error);
        showNotification('Ошибка', 'error');
    }
};

window.loadStats = async function() {
    document.getElementById('statsLoading').style.display = 'block';
    document.getElementById('statsContent').style.display = 'none';
    
    try {
        const stats = await apiCall('stats');
        
        document.getElementById('statHours').textContent = stats.total_hours || 0;
        document.getElementById('statTracks').textContent = stats.total_tracks || 0;
        document.getElementById('statLiked').textContent = stats.liked_count || 0;
        document.getElementById('statPlaylists').textContent = stats.playlist_count || 0;
        
        const topArtistsEl = document.getElementById('topArtists');
        if (stats.top_artists && stats.top_artists.length > 0) {
            let artistsHtml = '';
            stats.top_artists.forEach(function(artist, i) {
                const colors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                const medal = i < 3 ? '<span style="color: ' + colors[i] + '; margin-right: 8px;">' + (i + 1) + '.</span>' : '<span style="margin-right: 8px; color: var(--text-muted);">' + (i + 1) + '.</span>';
                artistsHtml += '<div class="glass-card" style="padding: 12px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated);">' +
                    '<div style="display: flex; align-items: center; gap: 12px;">' + medal +
                    '<i class="fas fa-user" style="color: var(--accent);"></i> ' + escapeHtml(artist.name || 'Неизвестный') + '</div>' +
                    '<span style="color: var(--text-muted); font-size: 13px;">' + artist.count + ' треков</span></div>';
            });
            topArtistsEl.innerHTML = artistsHtml;
        } else {
            topArtistsEl.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Слушайте музыку, чтобы увидеть статистику</p>';
        }
        
        const recentEl = document.getElementById('recentTracks');
        if (stats.recent_tracks && stats.recent_tracks.length > 0) {
            let recentHtml = '';
            stats.recent_tracks.slice(0, 10).forEach(function(track) {
                recentHtml += '<div class="glass-card" style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated);">' +
                    '<div><i class="fas fa-music" style="color: var(--accent); margin-right: 8px;"></i> ' + escapeHtml(track.artist || 'Неизвестный') + '</div>' +
                    '<span style="color: var(--text-muted); font-size: 12px;">' + formatTimeAgo(track.played_at) + '</span></div>';
            });
            recentEl.innerHTML = recentHtml;
        } else {
            recentEl.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Недавних треков нет</p>';
        }
        
        document.getElementById('statsLoading').style.display = 'none';
        document.getElementById('statsContent').style.display = 'block';
    } catch (error) {
        console.error('Load stats error:', error);
        document.getElementById('statsLoading').innerHTML = '<p style="color: var(--text-muted);">Ошибка загрузки статистики</p>';
    }
};

function formatTimeAgo(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
    if (diff < 604800) return Math.floor(diff / 86400) + ' дн назад';
    return date.toLocaleDateString('ru');
}
