let shopItems = [];
let userBalance = 0;
let userInventory = [];

const DEFAULT_BANNERS = [
    { id: 'banner_1', name: 'Неоновый закат', type: 'banner', price: 100, rarity: 'common', data: { image: '/static/shop/banners/xz.jpg' } },
    { id: 'banner_2', name: 'Космос', type: 'banner', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/xz1.jpg' } },
    { id: 'banner_3', name: 'Лесной туман', type: 'banner', price: 100, rarity: 'common', data: { image: '/static/shop/banners/xz2.jpg' } },
    { id: 'banner_knight', name: 'Рыцарь', type: 'banner', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/badge_knight.gif' } },
    { id: 'banner_demon', name: 'Демон', type: 'banner', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/badge_demon.gif' } },
    { id: 'banner_skull', name: 'Череп', type: 'banner', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/badge_skull.gif' } },
    { id: 'banner_dragon', name: 'Дракон', type: 'banner', price: 250, rarity: 'epic', data: { image: '/static/shop/banners/badge_dragon.gif' } },
    { id: 'banner_samurai', name: 'Самурай', type: 'banner', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/badge_samurai.jpg' } },
    { id: 'banner_street', name: 'Street Style', type: 'banner', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/badge_street.jpg' } },
    { id: 'banner_graffiti', name: 'Graffiti', type: 'banner', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/badge_graffiti.jpg' } },
    { id: 'banner_knight2', name: 'Рыцарь 2', type: 'banner', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/banner_knight2.gif' } },
    { id: 'banner_demon2', name: 'Демон 2', type: 'banner', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/banner_demon2.gif' } },
    { id: 'banner_skull2', name: 'Череп 2', type: 'banner', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/banner_skull2.gif' } },
    { id: 'banner_dragon2', name: 'Дракон 2', type: 'banner', price: 250, rarity: 'epic', data: { image: '/static/shop/banners/banner_dragon2.gif' } },
];

const DEFAULT_BADGES = [
    { id: 'badge_vip', name: 'VIP', type: 'badge', price: 500, rarity: 'legendary', data: { icon: 'fa-crown', color: '#ffd700' } },
    { id: 'badge_early', name: 'Early Bird', type: 'badge', price: 300, rarity: 'rare', data: { icon: 'fa-rocket', color: '#f97316' } },
    { id: 'badge_meloman', name: 'Меломан', type: 'badge', price: 200, rarity: 'epic', data: { icon: 'fa-music', color: '#ec4899' } },
    { id: 'badge_contributor', name: 'Контрибьютор', type: 'badge', price: 400, rarity: 'legendary', data: { icon: 'fa-code', color: '#22c55e' } },
    { id: 'badge_verified', name: 'Верифицирован', type: 'badge', price: 1000, rarity: 'legendary', data: { icon: 'fa-check-circle', color: '#3b82f6' } },
    { id: 'badge_animemix1', name: 'Anime Mix #1', type: 'badge', price: 100, rarity: 'common', data: { image: '/static/shop/banners/banner_8585.gif' } },
    { id: 'badge_animemix2', name: 'Anime Mix #2', type: 'badge', price: 100, rarity: 'common', data: { image: '/static/shop/banners/banner_3106.gif' } },
    { id: 'badge_onepiece', name: 'One Piece', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/banner_9454.gif' } },
    { id: 'badge_demonslayer', name: 'Demon Slayer', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/banner_5912.gif' } },
    { id: 'badge_aot', name: 'Attack on Titan', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/banner_4868.gif' } },
    { id: 'badge_bleach', name: 'Bleach', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/banner_9862.gif' } },
    { id: 'badge_tokyo', name: 'Tokyo Ghoul', type: 'badge', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/banner_5584.gif' } },
    { id: 'badge_animevibes', name: 'Anime Vibes', type: 'badge', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/banner_4277.gif' } },
    { id: 'badge_darkanime', name: 'Dark Anime', type: 'badge', price: 250, rarity: 'epic', data: { image: '/static/shop/banners/banner_5545.gif' } },
    { id: 'badge_animelegend', name: 'Anime Legend', type: 'badge', price: 300, rarity: 'legendary', data: { image: '/static/shop/banners/banner_9518.gif' } },
    { id: 'badge_knight', name: 'Рыцарь', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/badge_knight.gif' } },
    { id: 'badge_demon', name: 'Демон', type: 'badge', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/badge_demon.gif' } },
    { id: 'badge_skull', name: 'Череп', type: 'badge', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/badge_skull.gif' } },
    { id: 'badge_dragon', name: 'Дракон', type: 'badge', price: 250, rarity: 'epic', data: { image: '/static/shop/banners/badge_dragon.gif' } },
    { id: 'badge_samurai', name: 'Самурай', type: 'badge', price: 200, rarity: 'epic', data: { image: '/static/shop/banners/badge_samurai.jpg' } },
    { id: 'badge_street', name: 'Street Style', type: 'badge', price: 150, rarity: 'rare', data: { image: '/static/shop/banners/badge_street.jpg' } },
    { id: 'badge_graffiti', name: 'Graffiti', type: 'badge', price: 180, rarity: 'rare', data: { image: '/static/shop/banners/badge_graffiti.jpg' } },
];

const DEFAULT_FRAMES = [
    { id: 'frame_gold', name: 'Золотая рамка', type: 'frame', price: 250, rarity: 'epic', data: { color: '#ffd700' } },
    { id: 'frame_rainbow', name: 'Радужная', type: 'frame', price: 350, rarity: 'legendary', data: { color: 'linear-gradient(45deg, red, orange, yellow, green, blue, purple)' } },
    { id: 'frame_fire', name: 'Огненная', type: 'frame', price: 300, rarity: 'epic', data: { color: 'linear-gradient(45deg, #ff6b00, #ff0000)' } },
    { id: 'frame_ice', name: 'Ледяная', type: 'frame', price: 300, rarity: 'epic', data: { color: 'linear-gradient(45deg, #00bfff, #00ffff)' } },
    { id: 'frame_neon', name: 'Неон', type: 'frame', price: 200, rarity: 'rare', data: { color: '#bf00ff' } },
];

const DEFAULT_THEMES = [
    { id: 'theme_purple', name: 'Фиолетовая', type: 'theme', price: 150, rarity: 'common', data: { accent: '#6366f1' } },
    { id: 'theme_green', name: 'Зелёная', type: 'theme', price: 150, rarity: 'common', data: { accent: '#22c55e' } },
    { id: 'theme_orange', name: 'Оранжевая', type: 'theme', price: 150, rarity: 'common', data: { accent: '#f97316' } },
    { id: 'theme_red', name: 'Красная', type: 'theme', price: 150, rarity: 'common', data: { accent: '#ef4444' } },
    { id: 'theme_gold', name: 'Золотая', type: 'theme', price: 250, rarity: 'rare', data: { accent: '#eab308' } },
    { id: 'theme_pink', name: 'Розовая', type: 'theme', price: 200, rarity: 'epic', data: { accent: '#ec4899' } },
];

async function loadShopItems() {
    const container = document.getElementById('shopItemsList');
    if (!container) {
        console.log('Shop container not found');
        return;
    }
    
    container.innerHTML = '<div style="padding: 40px; text-align: center;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><p style="margin-top: 12px;">Загрузка...</p></div>';
    
    userBalance = 0;
    try {
        const balance = await apiCall('currency/balance');
        if (balance && balance.balance !== undefined) {
            userBalance = balance.balance;
        }
    } catch (error) {
        console.error('Balance error:', error);
    }
    
    updateBalanceDisplay();
    
    try {
        const inventory = await apiCall('shop/inventory');
        userInventory = inventory || [];
    } catch (error) {
        console.error('Inventory error:', error);
        userInventory = [];
    }
    
    shopItems = [...DEFAULT_BANNERS, ...DEFAULT_BADGES, ...DEFAULT_FRAMES, ...DEFAULT_THEMES];
    displayShopItems();
}

function displayShopItems(category) {
    const container = document.getElementById('shopItemsList');
    if (!container) {
        console.log('Container shopItemsList not found!');
        return;
    }
    
    if (!shopItems || !shopItems.length) {
        console.log('No shop items loaded!');
        container.innerHTML = '<div style="padding: 40px; text-align: center;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ff6b6b;"></i><p>Товары не загружены</p></div>';
        return;
    }
    
    const filteredItems = (category === 'all' || !category) 
        ? shopItems 
        : shopItems.filter(function(item) { return item.type === category; });
    
    console.log('Displaying ' + filteredItems.length + ' items (category: ' + category + ')');
    
    if (!filteredItems.length) {
        container.innerHTML = '<div style="padding: 40px; text-align: center;"><i class="fas fa-shopping-bag" style="font-size: 3rem; color: var(--text-muted);"></i><p>Пусто</p></div>';
        return;
    }
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;">';
    filteredItems.forEach(function(item) {
        const rarityColors = {
            common: '#9ca3af',
            rare: '#3b82f6',
            epic: '#a855f7',
            legendary: '#f59e0b'
        };
        const rarityColor = rarityColors[item.rarity] || '#9ca3af';
        const owned = userInventory.some(function(inv) { return inv.item_id === item.id; });
        const canAfford = userBalance >= item.price;
        
        let previewContent = '';
        if (item.type === 'badge') {
            const icon = item.data.icon || 'fa-star';
            const color = item.data.color || '#ffd700';
            previewContent = '<i class="fas ' + icon + '" style="font-size: 48px; color: ' + color + ';"></i>';
        } else if (item.type === 'frame') {
            const frameColor = item.data.color || '#ffd700';
            previewContent = '<div style="width: 60px; height: 60px; border-radius: 50%; border: 6px solid ' + frameColor + '; display: flex; align-items: center; justify-content: center;"><i class="fas fa-user" style="font-size: 28px; color: var(--text);"></i></div>';
        } else if (item.type === 'theme') {
            const accent = item.data.accent || '#6366f1';
            previewContent = '<div style="display: flex; gap: 8px;"><div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-secondary);"></div><div style="width: 40px; height: 40px; border-radius: 50%; background: ' + accent + '; box-shadow: 0 0 20px ' + accent + ';"></div></div>';
        } else {
            previewContent = '<img src="' + (item.data.image || '/static/shop/banners/xz.jpg') + '" alt="" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display=\'none\'">';
        }
        
        const typeLabels = { banner: 'Баннер', badge: 'Значок', frame: 'Рамка', theme: 'Тема' };
        
        html += '<div style="background: var(--bg-elevated); border: 2px solid ' + rarityColor + '; border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'" onclick="openShopItemModal(\'' + item.id + '\')">' +
            '<div style="height: 100px; overflow: hidden; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center;">' +
            previewContent +
            '</div>' +
            '<div style="padding: 10px;">' +
            '<div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">' + (typeLabels[item.type] || item.type) + '</div>' +
            '<h4 style="margin: 0 0 4px; font-size: 13px;">' + escapeHtml(item.name) + '</h4>' +
            '<span style="font-size: 10px; color: ' + rarityColor + '; text-transform: uppercase; font-weight: bold;">' + item.rarity + '</span>';
        
        if (owned) {
            html += '<div style="margin-top: 8px; color: #2ed573; font-size: 11px;"><i class="fas fa-check-circle"></i> Куплено</div>';
        } else {
            html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">' +
                '<span style="color: ' + (canAfford ? 'var(--accent)' : '#ff6b6b') + '; font-weight: 600;"><i class="fas fa-coins"></i> ' + item.price + '</span>' +
                '<button class="btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="event.stopPropagation(); buyItem(\'' + item.id + '\')">Купить</button>' +
                '</div>';
        }
        
        html += '</div></div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

window.openShopItemModal = function(itemId) {
    const item = shopItems.find(function(i) { return i.id === itemId; });
    if (!item) return;
    
    const modal = document.getElementById('shopItemModal');
    if (!modal) return;
    
    const previewEl = document.getElementById('shopItemPreview');
    const nameEl = document.getElementById('shopItemName');
    const rarityEl = document.getElementById('shopItemRarity');
    const priceEl = document.getElementById('shopItemPrice');
    const buyBtn = document.getElementById('shopItemBuyBtn');
    const giftBtn = modal.querySelector('.glass-btn');
    
    if (previewEl) {
        previewEl.innerHTML = '<img src="' + (item.data.image || '') + '" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">';
    }
    if (nameEl) nameEl.textContent = item.name;
    if (rarityEl) rarityEl.textContent = item.rarity;
    if (priceEl) priceEl.innerHTML = '<i class="fas fa-coins"></i> ' + item.price;
    
    const owned = userInventory.some(function(inv) { return inv.item_id === itemId; });
    
    if (buyBtn) {
        if (owned) {
            buyBtn.textContent = 'Куплено';
            buyBtn.disabled = true;
            buyBtn.style.opacity = '0.5';
        } else {
            buyBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Купить';
            buyBtn.disabled = userBalance < item.price;
            buyBtn.style.opacity = userBalance < item.price ? '0.5' : '1';
        }
        buyBtn.onclick = function() { 
            if (!owned) buyItem(itemId); 
            closeModal('shopItemModal'); 
        };
    }
    
    if (giftBtn) {
        giftBtn.style.display = owned ? 'none' : 'flex';
        giftBtn.onclick = function() { 
            closeModal('shopItemModal');
            giftItem(itemId); 
        };
    }
    
    modal.dataset.itemId = itemId;
    openModal('shopItemModal');
};

window.buyItem = async function(itemId) {
    const item = shopItems.find(function(i) { return i.id === itemId; });
    if (!item) return;
    
    if (userBalance < item.price) {
        showNotification('Недостаточно монет', 'error');
        return;
    }
    
    try {
        const result = await apiCall('shop/buy', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId })
        });
        
        if (result && result.success) {
            showNotification('Покупка совершена!', 'success');
            userBalance = result.new_balance;
            updateBalanceDisplay();
            loadShopItems();
        } else {
            showNotification(result?.message || 'Ошибка покупки', 'error');
        }
    } catch (error) {
        console.error('Buy item error:', error);
        showNotification('Ошибка покупки', 'error');
    }
};

window.giftItem = async function(itemId) {
    const friendId = prompt('Введите ID пользователя для подарка:');
    if (!friendId) return;
    
    const item = shopItems.find(function(i) { return i.id === itemId; });
    if (!item) return;
    
    if (userBalance < item.price) {
        showNotification('Недостаточно монет', 'error');
        return;
    }
    
    try {
        const result = await apiCall('shop/gift', {
            method: 'POST',
            body: JSON.stringify({ item_id: itemId, friend_id: parseInt(friendId) })
        });
        
        if (result && result.success) {
            showNotification('Подарок отправлен!', 'success');
            userBalance = result.new_balance;
            updateBalanceDisplay();
        } else {
            showNotification(result?.message || 'Ошибка отправки подарка', 'error');
        }
    } catch (error) {
        console.error('Gift item error:', error);
        showNotification('Ошибка отправки подарка', 'error');
    }
};

window.equipBanner = async function(inventoryId) {
    try {
        const result = await apiCall('shop/equip/' + inventoryId, {
            method: 'POST'
        });
        
        if (result && result.success) {
            showNotification('Баннер установлен!', 'success');
            loadInventory();
        } else {
            showNotification(result?.message || 'Ошибка', 'error');
        }
    } catch (error) {
        showNotification('Ошибка установки баннера', 'error');
    }
};

async function loadInventory() {
    try {
        const inventory = await apiCall('shop/inventory');
        userInventory = inventory || [];
        displayInventory();
    } catch (error) {
        console.error('Load inventory error:', error);
    }
}

function displayInventory() {
    const container = document.getElementById('inventoryItems');
    if (!container) return;
    
    if (!userInventory.length) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">У вас пока нет купленных предметов. Купите что-нибудь в магазине!</p>';
        return;
    }
    
    let html = '';
    userInventory.forEach(function(item) {
        const data = item.data || {};
        const rarityColors = {
            common: '#9ca3af',
            rare: '#3b82f6',
            epic: '#a855f7',
            legendary: '#f59e0b'
        };
        const rarityColor = rarityColors[data.rarity] || '#9ca3af';
        
        html += '<div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-elevated); border-radius: 8px; margin-bottom: 8px; border-left: 4px solid ' + rarityColor + ';">' +
            '<img src="' + (data.image || '/static/shop/banners/xz.jpg') + '" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" onerror="this.style.display=\'none\'">' +
            '<div style="flex: 1;">' +
            '<h4 style="margin: 0;">' + escapeHtml(data.name || 'Баннер') + '</h4>' +
            '<span style="font-size: 12px; color: ' + rarityColor + '; text-transform: uppercase;">' + (data.rarity || '') + '</span>' +
            (item.equipped ? '<span style="margin-left: 8px; font-size: 11px; color: #2ed573;">(Установлен)</span>' : '') +
            '</div>' +
            '<button class="btn-primary" onclick="equipBanner(' + item.id + ')" ' + (item.equipped ? 'disabled style="opacity: 0.5;"' : '') + '>' +
            '<i class="fas fa-check"></i> ' + (item.equipped ? 'Установлен' : 'Установить') +
            '</button>' +
            '</div>';
    });
    container.innerHTML = html;
}

window.showInventory = function() {
    const shopList = document.getElementById('shopItemsList');
    const inventoryList = document.getElementById('inventoryList');
    
    if (shopList) shopList.style.display = 'none';
    if (inventoryList) {
        inventoryList.style.display = 'block';
        loadInventory();
    }
    
    document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
};

function updateBalanceDisplay() {
    const els = document.querySelectorAll('#userBalance, #headerBalance, #coinBadge');
    els.forEach(function(el) {
        if (el) {
            if (el.id === 'coinBadge') {
                el.textContent = userBalance > 0 ? userBalance : '';
                el.style.display = userBalance > 0 ? 'inline' : 'none';
            } else {
                el.textContent = userBalance;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.cat-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.cat-chip').forEach(function(c) { c.classList.remove('active'); });
            chip.classList.add('active');
            
            var shopList = document.getElementById('shopItemsList');
            var inventoryList = document.getElementById('inventoryList');
            
            if (chip.dataset.category === 'inventory') {
                if (shopList) shopList.style.display = 'none';
                if (inventoryList) inventoryList.style.display = 'block';
                loadInventory();
            } else {
                if (shopList) shopList.style.display = 'block';
                if (inventoryList) inventoryList.style.display = 'none';
                displayShopItems(chip.dataset.category);
            }
        });
    });
});
