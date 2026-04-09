async function loadAdminData() {
    try {
        const stats = await apiCall('admin/stats');
        document.getElementById('adminTotalUsers').textContent = stats.total_users || 0;
        document.getElementById('adminOnlineUsers').textContent = stats.online_users || 0;
        document.getElementById('adminTotalCoins').textContent = stats.total_coins || 0;
        
        const users = await apiCall('admin/users');
        displayAdminUsers(users);
    } catch (error) {
        console.error('Admin load error:', error);
    }
}

function displayAdminUsers(users) {
    const container = document.getElementById('adminUsersList');
    if (!container) return;
    
    if (!users.length) {
        container.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: var(--text-muted);">Нет пользователей</td></tr>';
        return;
    }
    
    let html = '';
    users.forEach(function(user) {
        const statusClass = user.is_online ? '#2ed573' : 'var(--text-muted)';
        const statusText = user.is_online ? '🟢 онлайн' : '⚫ офлайн';
        const adminBadge = user.is_admin ? '<span style="background: var(--accent); padding: 2px 6px; border-radius: 4px; font-size: 10px;">ADMIN</span>' : '';
        
        html += '<tr style="border-bottom: 1px solid var(--border);">' +
            '<td style="padding: 8px;">' + user.id + '</td>' +
            '<td style="padding: 8px;">' + escapeHtml(user.username) + ' ' + adminBadge + '</td>' +
            '<td style="padding: 8px;"><i class="fas fa-coins" style="color: #ffd700;"></i> ' + user.balance + '</td>' +
            '<td style="padding: 8px; color: ' + statusClass + ';">' + statusText + '</td>' +
            '</tr>';
    });
    
    container.innerHTML = html;
}

window.adminAddCoins = async function() {
    const userId = document.getElementById('adminCoinUserId').value;
    const amount = document.getElementById('adminCoinAmount').value;
    
    if (!userId || !amount) {
        showNotification('Введите ID и сумму', 'warning');
        return;
    }
    
    try {
        const result = await apiCall('admin/add-coins', {
            method: 'POST',
            body: JSON.stringify({ user_id: parseInt(userId), amount: parseInt(amount) })
        });
        
        if (result.success) {
            showNotification('+' + amount + ' монет добавлено', 'success');
            loadAdminData();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
};

window.adminRemoveCoins = async function() {
    const userId = document.getElementById('adminCoinUserId').value;
    const amount = document.getElementById('adminCoinAmount').value;
    
    if (!userId || !amount) {
        showNotification('Введите ID и сумму', 'warning');
        return;
    }
    
    try {
        const result = await apiCall('admin/remove-coins', {
            method: 'POST',
            body: JSON.stringify({ user_id: parseInt(userId), amount: parseInt(amount) })
        });
        
        if (result.success) {
            showNotification('-' + amount + ' монет списано', 'success');
            loadAdminData();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
};

window.adminLoadShopItems = async function() {
    try {
        const items = await apiCall('admin/shop/list');
        displayAdminShopList(items);
    } catch (error) {
        console.error('Shop list error:', error);
    }
};

function displayAdminShopList(items) {
    const container = document.getElementById('adminShopList');
    if (!container) return;
    
    if (!items.length) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Нет предметов</p>';
        return;
    }
    
    const rarityColors = {
        common: '#9ca3af',
        rare: '#3b82f6',
        epic: '#a855f7',
        legendary: '#f59e0b'
    };
    
    let html = '<div style="display: flex; flex-direction: column; gap: 6px;">';
    items.forEach(function(item) {
        const color = rarityColors[item.rarity] || '#9ca3af';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg-elevated); border-radius: 6px; font-size: 12px;">' +
            '<span><span style="color: ' + color + ';">[' + item.type + ']</span> ' + escapeHtml(item.name) + ' - <i class="fas fa-coins" style="color: #ffd700;"></i> ' + item.price + '</span>' +
            '<span style="color: var(--text-muted);">' + item.id + '</span>' +
            '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
}

window.adminRemoveShopItem = async function() {
    const itemId = document.getElementById('adminShopItemId').value;
    
    if (!itemId) {
        showNotification('Введите ID предмета', 'warning');
        return;
    }
    
    if (!confirm('Удалить предмет ' + itemId + '?')) return;
    
    try {
        const result = await apiCall('admin/shop/remove', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId })
        });
        
        if (result.success) {
            showNotification('Предмет удалён', 'success');
            adminLoadShopItems();
        } else {
            showNotification(result.message || 'Ошибка', 'error');
        }
    } catch (error) {
        showNotification('Ошибка', 'error');
    }
};

async function checkAdminAccess() {
    try {
        const response = await apiCall('profile');
        if (response && response.local && response.local.is_admin) {
            document.querySelectorAll('.admin-nav').forEach(function(el) {
                el.style.display = 'flex';
            });
            return true;
        }
    } catch (error) {
        console.error('Admin check error:', error);
    }
    return false;
}

document.addEventListener('DOMContentLoaded', async function() {
    const isAdmin = await checkAdminAccess();
    
    const adminTab = document.querySelector('[data-tab="admin"]');
    if (adminTab) {
        adminTab.addEventListener('click', function() {
            switchTab('admin');
            loadAdminData();
        });
    }
});
