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
            const icon = item.data.icon || 'fa-star';
            const color = item.data.color || '#ffd700';
            preview = '<i class="fas ' + icon + '" style="font-size: 24px; color: ' + color + ';"></i>';
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
