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
    
    const displayName = document.getElementById('display_name');
    const bio = document.getElementById('bio');
    const yandexToken = document.getElementById('yandex_token');
    const vkToken = document.getElementById('vk_token');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileUsername = document.getElementById('profileUsername');
    const joinDate = document.getElementById('joinDate');
    const profileAvatar = document.getElementById('profileAvatar');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const headerAvatar = document.getElementById('headerUserAvatar');
    const yandexCheck = document.getElementById('yandexCheck');
    const vkCheck = document.getElementById('vkCheck');
    
    if (displayName) displayName.value = local.display_name || '';
    if (bio) bio.value = local.bio || '';
    if (yandexToken) yandexToken.value = local.yandex_token_set ? '***' : '';
    if (vkToken) vkToken.value = local.vk_token_set ? '***' : '';
    
    if (yandexCheck) yandexCheck.style.display = local.yandex_token_set ? 'inline' : 'none';
    if (vkCheck) vkCheck.style.display = local.vk_token_set ? 'inline' : 'none';
    
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
    loadTelegramStatus();
}

async function loadTelegramStatus() {
    try {
        const status = await apiCall('telegram/status');
        updateTelegramUI(status);
    } catch (error) {
        console.error('Telegram status error:', error);
        updateTelegramUI({ linked: false, two_factor_enabled: false });
    }
}

function updateTelegramUI(status) {
    const linkedIcon = document.getElementById('telegramLinked');
    const enabledIcon = document.getElementById('telegram2FAEnabled');
    const statusText = document.getElementById('telegramStatus');
    const actionsDiv = document.getElementById('telegramActions');
    
    if (!statusText) return;
    
    if (status.linked) {
        if (linkedIcon) linkedIcon.style.display = 'inline';
        statusText.textContent = 'Telegram привязан';
        
        if (status.two_factor_enabled) {
            if (enabledIcon) enabledIcon.style.display = 'inline';
            statusText.textContent = '✅ Telegram привязан | 🔐 2FA включён';
            actionsDiv.innerHTML = `
                <button type="button" class="source-btn" onclick="disableTelegram2FA()" style="margin-top: 8px;">
                    <i class="fas fa-shield-alt"></i> Отключить 2FA
                </button>
                <button type="button" class="glass-btn" onclick="unlinkTelegram()" style="margin-top: 8px; margin-left: 8px;">
                    <i class="fas fa-unlink"></i> Отвязать
                </button>
            `;
        } else {
            if (enabledIcon) enabledIcon.style.display = 'none';
            statusText.textContent = '✅ Telegram привязан | 2FA выключен';
            actionsDiv.innerHTML = `
                <button type="button" class="source-btn" onclick="enableTelegram2FA()" style="margin-top: 8px; background: var(--accent);">
                    <i class="fas fa-shield-alt"></i> Включить 2FA
                </button>
                <button type="button" class="glass-btn" onclick="unlinkTelegram()" style="margin-top: 8px; margin-left: 8px;">
                    <i class="fas fa-unlink"></i> Отвязать
                </button>
            `;
        }
    } else {
        if (linkedIcon) linkedIcon.style.display = 'none';
        if (enabledIcon) enabledIcon.style.display = 'none';
        statusText.textContent = 'Telegram не привязан';
        actionsDiv.innerHTML = `
            <button type="button" class="source-btn" id="generateCodeBtn" onclick="generateTelegramCode()" style="margin-top: 8px;">
                <i class="fas fa-key"></i> Привязать Telegram
            </button>
        `;
    }
}

async function generateTelegramCode() {
    const btn = document.getElementById('generateCodeBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерация...';
    }
    
    try {
        const result = await apiCall('telegram/generate_link', {
            method: 'POST'
        });
        
        if (result.success) {
            showNotification('Код сгенерирован!', 'success');
            showTelegramCodeModal(result.code, result.expires);
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Generate code error:', error);
        showNotification('Ошибка генерации кода', 'error');
    }
    
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-key"></i> Привязать Telegram';
    }
}

function showTelegramCodeModal(code, expires) {
    const modal = document.createElement('div');
    modal.id = 'telegramCodeModal';
    modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    modal.innerHTML = `
        <div style="background: var(--bg-card); border-radius: 16px; padding: 32px; max-width: 400px; width: 90%; text-align: center;">
            <i class="fab fa-telegram" style="font-size: 48px; color: #0088cc; margin-bottom: 16px;"></i>
            <h3 style="margin-bottom: 16px;">Привязка Telegram</h3>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">
                1. Откройте Telegram<br>
                2. Найдите ботора <b>@YourBotName</b><br>
                3. Отправьте команду:
            </p>
            <div style="background: var(--bg-elevated); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                <code style="font-size: 1.5rem; letter-spacing: 2px; color: var(--accent);">/link ${code}</code>
            </div>
            <p style="font-size: 12px; color: var(--text-muted);">
                Код действует ${expires} минут
            </p>
            <button onclick="closeTelegramModal()" class="btn-primary" style="margin-top: 20px; width: 100%;">
                Понятно
            </button>
            <button onclick="refreshTelegramStatus()" class="glass-btn" style="margin-top: 12px; width: 100%;">
                <i class="fas fa-sync"></i> Проверить привязку
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeTelegramModal() {
    const modal = document.getElementById('telegramCodeModal');
    if (modal) modal.remove();
    closeModal('telegramCodeModal');
}

async function refreshTelegramStatus() {
    await loadTelegramStatus();
    closeTelegramModal();
}

async function enableTelegram2FA() {
    try {
        const result = await apiCall('telegram/enable_2fa', {
            method: 'POST'
        });
        
        if (result.success) {
            showNotification('2FA включён!', 'success');
            await loadTelegramStatus();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Enable 2FA error:', error);
        showNotification('Ошибка включения 2FA', 'error');
    }
}

async function disableTelegram2FA() {
    try {
        const result = await apiCall('telegram/disable_2fa', {
            method: 'POST'
        });
        
        if (result.success) {
            showNotification('2FA отключён', 'success');
            await loadTelegramStatus();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Disable 2FA error:', error);
        showNotification('Ошибка отключения 2FA', 'error');
    }
}

async function unlinkTelegram() {
    if (!confirm('Отвязать Telegram от аккаунта?')) return;
    
    try {
        const result = await apiCall('telegram/unlink', {
            method: 'POST'
        });
        
        if (result.success) {
            showNotification('Telegram отвязан', 'success');
            await loadTelegramStatus();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error('Unlink error:', error);
        showNotification('Ошибка отвязки', 'error');
    }
}
