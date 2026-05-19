let shopItems = [];
// userBalance is globally defined in main.js
let userInventory = [];
let currentCategory = 'all';

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
    { id: 'frame_skull', name: 'Череп', type: 'frame', price: 350, rarity: 'legendary', data: { image: '/static/shop/banners/badge_skull.gif' } },
    { id: 'frame_dragon', name: 'Дракон', type: 'frame', price: 400, rarity: 'legendary', data: { image: '/static/shop/banners/badge_dragon.gif' } },
    { id: 'frame_demon', name: 'Демон', type: 'frame', price: 400, rarity: 'legendary', data: { image: '/static/shop/banners/badge_demon.gif' } },
    { id: 'frame_knight', name: 'Рыцарь', type: 'frame', price: 350, rarity: 'legendary', data: { image: '/static/shop/banners/badge_knight.gif' } },
    { id: 'frame_samurai', name: 'Самурай', type: 'frame', price: 350, rarity: 'legendary', data: { image: '/static/shop/banners/badge_samurai.jpg' } },
    { id: 'frame_street', name: 'Street Style', type: 'frame', price: 300, rarity: 'epic', data: { image: '/static/shop/banners/badge_street.jpg' } },
    { id: 'frame_graffiti', name: 'Граффити', type: 'frame', price: 300, rarity: 'epic', data: { image: '/static/shop/banners/badge_graffiti.jpg' } },
    { id: 'frame_anime1', name: 'Anime Wave #1', type: 'frame', price: 350, rarity: 'legendary', data: { image: '/static/shop/banners/banner_8585.gif' } },
    { id: 'frame_anime2', name: 'Anime Wave #2', type: 'frame', price: 350, rarity: 'legendary', data: { image: '/static/shop/banners/banner_3106.gif' } },
];

const DEFAULT_THEMES = [
    { id: 'theme_purple', name: 'Фиолетовая', type: 'theme', price: 150, rarity: 'common', data: { accent: '#6366f1' } },
    { id: 'theme_green', name: 'Зелёная', type: 'theme', price: 150, rarity: 'common', data: { accent: '#22c55e' } },
    { id: 'theme_orange', name: 'Оранжевая', type: 'theme', price: 150, rarity: 'common', data: { accent: '#f97316' } },
    { id: 'theme_red', name: 'Красная', type: 'theme', price: 150, rarity: 'common', data: { accent: '#ef4444' } },
    { id: 'theme_gold', name: 'Золотая', type: 'theme', price: 250, rarity: 'rare', data: { accent: '#eab308' } },
    { id: 'theme_pink', name: 'Розовая', type: 'theme', price: 200, rarity: 'epic', data: { accent: '#ec4899' } },
];

function initShop() {
    const container = document.getElementById('shopItemsList');
    if (!container) {
        console.log('SHOP: container not found');
        return;
    }
    
    container.innerHTML = '<p style="text-align:center;padding:40px;">Загрузка...</p>';
    
    Promise.all([
        fetch('/api/currency/balance', { credentials: 'include' }).then(r => r.json()).catch(() => ({ balance: 0 })),
        fetch('/api/shop/inventory', { credentials: 'include' }).then(r => r.json()).catch(() => [])
    ])
    .then(([balanceData, inventoryData]) => {
        userBalance = balanceData?.balance || 0;
        userInventory = inventoryData || [];
        
        const be = document.getElementById('userBalance');
        if (be) be.textContent = userBalance;
        const he = document.getElementById('headerBalance');
        if (he) he.textContent = userBalance;
        
        shopItems = [...DEFAULT_BANNERS, ...DEFAULT_BADGES, ...DEFAULT_FRAMES, ...DEFAULT_THEMES];
        displayShopItems(currentCategory);
    })
    .catch(err => {
        console.error('SHOP init error:', err);
        container.innerHTML = '<p style="text-align:center;padding:40px;color:var(--error);">Ошибка загрузки</p>';
    });
}

function displayShopItems(category) {
    currentCategory = category || 'all';
    const container = document.getElementById('shopItemsList');
    if (!container || !shopItems.length) {
        if (container) container.innerHTML = '<p>Товары не загружены</p>';
        return;
    }
    
    const filtered = currentCategory === 'all' ? shopItems : shopItems.filter(i => i.type === currentCategory);
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;">';
    filtered.forEach(item => {
        const owned = userInventory.some(inv => inv.item_id === item.id);
        const canAfford = userBalance >= item.price;
        const rarityColor = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b' }[item.rarity] || '#9ca3af';
        
        let preview = '';
        if (item.type === 'badge') {
            if (item.data.image) preview = '<img src="' + item.data.image + '" style="width:100%;height:100%;object-fit:cover;">';
            else preview = '<i class="fas ' + (item.data.icon || 'fa-star') + '" style="font-size:48px;color:' + (item.data.color || '#ffd700') + '"></i>';
        } else if (item.type === 'frame') {
            if (item.data.image) {
                preview = '<div style="width:60px;height:60px;border-radius:50%;padding:3px;background:url(' + item.data.image + ') center/cover no-repeat;display:flex;align-items:center;justify-content:center;"><div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:var(--bg-elevated,#1e1e2e);display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="font-size:28px;color:var(--accent,#6366f1);"></i></div></div>';
            } else {
                preview = '<div style="width:60px;height:60px;border-radius:50%;padding:3px;background:' + item.data.color + ';display:flex;align-items:center;justify-content:center;"><div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:var(--bg-elevated,#1e1e2e);display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="font-size:28px;color:var(--accent,#6366f1);"></i></div></div>';
            }
        } else if (item.type === 'theme') {
            preview = '<div style="width:60px;height:60px;border-radius:8px;background:' + item.data.accent + ';box-shadow:0 0 20px ' + item.data.accent + ';"></div>';
        } else {
            preview = '<img src="' + (item.data.image || '/static/shop/banners/xz.jpg') + '" style="width:100%;height:100%;object-fit:cover;">';
        }
        
        const typeLabel = { banner: 'Баннер', badge: 'Значок', frame: 'Рамка', theme: 'Тема' }[item.type] || item.type;
        
        html += '<div style="background:var(--bg-elevated);border:2px solid ' + rarityColor + ';border-radius:12px;overflow:hidden;cursor:pointer;" onclick="openShopItemModal(\'' + item.id + '\')">' +
            '<div style="height:100px;overflow:hidden;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;">' + preview + '</div>' +
            '<div style="padding:10px;">' +
            '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px;">' + typeLabel + '</div>' +
            '<h4 style="margin:0 0 4px;font-size:13px;">' + item.name + '</h4>' +
            '<span style="font-size:10px;color:' + rarityColor + ';text-transform:uppercase;font-weight:bold;">' + item.rarity + '</span>';
        
        if (owned) {
            html += '<div style="margin-top:8px;color:#2ed573;font-size:11px;"><i class="fas fa-check-circle"></i> Куплено</div>';
        } else {
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
                '<span style="color:' + (canAfford ? 'var(--accent)' : '#ff6b6b') + ';font-weight:600;"><i class="fas fa-coins"></i> ' + item.price + '</span>' +
                '<button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="event.stopPropagation();buyItem(\'' + item.id + '\')">Купить</button></div>';
        }
        
        html += '</div></div>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

window.loadShopItems = initShop;

function loadShopItemsFresh() {
    const container = document.getElementById('shopItemsList');
    if (!container) return;
    
    container.innerHTML = '<div style="padding:40px;text-align:center;"><i class="fas fa-spinner fa-spin" style="font-size:2rem;"></i><p>Загрузка...</p></div>';
    
    shopItems = [...DEFAULT_BANNERS, ...DEFAULT_BADGES, ...DEFAULT_FRAMES, ...DEFAULT_THEMES];
    displayShopItems(currentCategory);
}

window.openShopItemModal = function(itemId) {
    const item = shopItems.find(i => i.id === itemId);
    if (!item) return;
    
    const modal = document.getElementById('shopItemModal');
    if (!modal) return;
    
    const previewEl = document.getElementById('shopItemPreview');
    if (previewEl) {
        if (item.data.image) previewEl.innerHTML = '<img src="' + item.data.image + '" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">';
        else if (item.type === 'badge') previewEl.innerHTML = '<i class="fas ' + (item.data.icon || 'fa-star') + '" style="font-size:80px;color:' + (item.data.color || '#ffd700') + '"></i>';
        else previewEl.innerHTML = '';
    }
    
    const nameEl = document.getElementById('shopItemName');
    if (nameEl) nameEl.textContent = item.name;
    
    const buyBtn = document.getElementById('shopItemBuyBtn');
    const owned = userInventory.some(inv => inv.item_id === itemId);
    
    if (buyBtn) {
        if (owned) {
            buyBtn.textContent = 'Куплено';
            buyBtn.disabled = true;
        } else {
            buyBtn.innerHTML = '<i class="fas fa-shopping-cart"></i> Купить';
            buyBtn.disabled = userBalance < item.price;
            buyBtn.onclick = function() { buyItem(itemId); };
        }
    }
    
    openModal('shopItemModal');
};

window.buyItem = async function(itemId) {
    const item = shopItems.find(i => i.id === itemId);
    if (!item) return;
    
    if (userBalance < item.price) {
        showNotification('Недостаточно монет', 'error');
        return;
    }
    
    try {
        const result = await fetch('/api/shop/buy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ item_id: itemId })
        });
        
        const data = await result.json();
        
        if (data && data.success) {
            showNotification('Покупка совершена!', 'success');
            
            fetch('/api/currency/balance', { credentials: 'include' })
                .then(r => r.json())
                .then(b => {
                    userBalance = b?.balance || 0;
                    const be = document.getElementById('userBalance');
                    if (be) be.textContent = userBalance;
                });
            
            initShop();
            loadInventory();
        } else {
            showNotification(data?.message || 'Ошибка', 'error');
        }
    } catch (error) {
        console.error(error);
        showNotification('Ошибка покупки', 'error');
    }
};

window.loadInventory = function() {
    const container = document.getElementById('inventoryList');
    if (!container) return;
    
    container.innerHTML = '<div style="padding:40px;text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
    
    fetch('/api/shop/inventory', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
        const items = data || [];
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Инвентарь пуст</p>';
            return;
        }
        
        let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">';
        items.forEach(item => {
            const itemData = item.data || {};
            const isEquipped = item.equipped ? 'border:2px solid var(--accent);' : '';
            
            let icon = '';
            if (itemData.image) {
                icon = '<img src="' + itemData.image + '" style="width:50px;height:50px;object-fit:cover;border-radius:8px;">';
            } else if (itemData.icon) {
                icon = '<i class="fas ' + itemData.icon + '" style="font-size:24px;color:' + (itemData.color || '#ffd700') + ';"></i>';
            } else if (itemData.color) {
                icon = '<div style="width:50px;height:50px;background:' + itemData.color + ';border-radius:8px;"></div>';
            } else {
                icon = '<i class="fas fa-gift" style="font-size:24px;"></i>';
            }
            
            html += '<div style="background:var(--bg-elevated);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;' + isEquipped + '">' +
                '<div style="flex-shrink:0;">' + icon + '</div>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:600;">' + (itemData.name || item.item_id) + '</div>' +
                    '<div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;">' + (itemData.rarity || item.item_type) + '</div>' +
                '</div>' +
                '<button class="btn-primary" style="padding:8px 16px;font-size:12px;" onclick="equipItem(' + item.id + ')">' +
                    (item.equipped ? 'Снять' : 'Надеть') +
                '</button>' +
            '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    })
    .catch(() => {
        container.innerHTML = '<p style="text-align:center;color:var(--error);">Ошибка загрузки</p>';
    });
};

window.equipItem = function(inventoryId) {
    fetch('/api/shop/equip/' + inventoryId, {
        method: 'POST',
        credentials: 'include'
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message || 'Готово!', 'success');
            loadInventory();
        } else {
            showNotification(data.message || 'Ошибка', 'error');
        }
    })
    .catch(() => showNotification('Ошибка', 'error'));
};

// Category chips
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            if (chip.dataset.category === 'inventory') {
                document.getElementById('shopItemsList').style.display = 'none';
                document.getElementById('inventoryList').style.display = 'block';
                loadInventory();
            } else {
                document.getElementById('shopItemsList').style.display = 'block';
                document.getElementById('inventoryList').style.display = 'none';
                displayShopItems(chip.dataset.category);
            }
        });
    });
});