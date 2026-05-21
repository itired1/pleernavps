// Discord Rich Presence — browser + Tauri
// Для браузера: подключается к локальному RPC серверу Discord через WebSocket
// (требуется запущенный Discord Desktop и Client ID из discord.com/developers/applications)

class DiscordRPC {
    constructor() {
        this.enabled = false;
        this.ws = null;
        this.clientId = localStorage.getItem('discord_client_id') || '';
        this.title = '';
        this.artist = '';
        this.playing = false;
        this.albumArt = null;
        this.startTimestamp = null;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.connecting = false;
    }

    async init() {
        if (window.__TAURI__) {
            this.enabled = true;
            const saved = localStorage.getItem('desktopNotifications');
            window.desktopNotificationsEnabled = saved === null ? true : saved !== 'false';
            console.log('Discord RPC: Tauri mode');
            await this.updateTrack('iTired Music', 'Ready to play', true);
            return;
        }

        // Browser mode — ищем Discord RPC через WebSocket на localhost:6463-6472
        if (!this.clientId) {
            console.log('Discord RPC: Client ID не настроен (discord_client_id в localStorage)');
            return;
        }

        await this.connect();
    }

    setClientId(clientId) {
        this.clientId = clientId;
        localStorage.setItem('discord_client_id', clientId);
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.connect();
    }

    async findDiscordPort() {
        for (let port = 6463; port <= 6472; port++) {
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${this.clientId}`);
                const result = await new Promise((resolve, reject) => {
                    ws.onopen = () => { ws.close(); resolve(port); };
                    ws.onerror = () => reject();
                    setTimeout(() => { ws.close(); reject(); }, 300);
                });
                return result;
            } catch { continue; }
        }
        return null;
    }

    async connect() {
        if (this.connecting) return;
        this.connecting = true;

        try {
            const port = await this.findDiscordPort();
            if (!port) {
                console.log('Discord RPC: Discord Desktop не найден');
                this.connecting = false;
                this.enabled = false;
                return;
            }

            console.log(`Discord RPC: Подключение к 127.0.0.1:${port}`);

            this.ws = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${this.clientId}`);
            this.ws.onopen = () => {
                console.log('Discord RPC: WebSocket открыт');
                this.send({ v: 1, client_id: this.clientId });
                this.startHeartbeat();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (e) {
                    console.error('Discord RPC parse error:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('Discord RPC: WebSocket закрыт');
                this.ws = null;
                this.stopHeartbeat();
                this.reconnectTimer = setTimeout(() => this.connect(), 15000);
            };

            this.ws.onerror = (err) => {
                console.error('Discord RPC: WebSocket ошибка:', err);
            };

            this.enabled = true;
        } catch (error) {
            console.error('Discord RPC: Ошибка подключения:', error);
            this.enabled = false;
        }

        this.connecting = false;
    }

    send(payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        }
    }

    handleMessage(data) {
        if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
            console.log('Discord RPC: Готов, пользователь:', data.data?.user?.username);
            this.send({
                cmd: 'SUBSCRIBE',
                args: { evt: 'ACTIVITY_JOIN' }
            });
            this.updateActivity();
        }

        if (data.cmd === 'SET_ACTIVITY') {
            console.log('Discord RPC: Activity обновлён');
        }

        // Heartbeat ACK
        if (data.cmd === 'HEARTBEAT_ACK') {
            console.log('Discord RPC: Heartbeat OK');
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.send({ cmd: 'HEARTBEAT', args: {} });
        }, 15000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async updateTrack(title, artist, playing = true, albumArt = null) {
        this.title = title || 'iTired Music';
        this.artist = artist || 'Ready to play';
        this.playing = playing !== false;
        this.albumArt = albumArt;

        if (this.playing) {
            this.startTimestamp = Date.now();
        }

        if (window.__TAURI__) {
            try {
                const { invoke } = window.__TAURI__;
                await invoke('update_discord_status', {
                    title: this.title,
                    artist: this.artist,
                    playing: this.playing,
                    album_art: this.albumArt
                });
            } catch (e) {
                console.log('Tauri RPC error:', e);
            }
            return;
        }

        this.updateActivity();
    }

    updateActivity() {
        if (!this.enabled || !this.ws || !this.clientId) return;

        var smallIcon = localStorage.getItem('discord_small_icon') || 'itired_icon';
        var largeText = localStorage.getItem('discord_large_text') || 'iTired Music';

        var activity = {
            state: this.artist,
            details: this.title,
            assets: {
                large_text: largeText,
                small_image: smallIcon,
                small_text: 'iTired Music'
            },
            instance: false
        };

        if (this.albumArt) {
            activity.assets.large_image = this.albumArt;
        }

        if (this.playing && this.startTimestamp) {
            activity.timestamps = {
                start: Math.floor(this.startTimestamp / 1000)
            };
        }

        this.send({
            cmd: 'SET_ACTIVITY',
            args: {
                pid: 0,
                activity: activity
            }
        });
    }

    setTrack(title, artist, playing = true, albumArt = null) {
        this.updateTrack(title, artist, playing, albumArt);
    }

    clear() {
        if (this.ws) {
            this.send({
                cmd: 'SET_ACTIVITY',
                args: { pid: 0, activity: null }
            });
        }
        this.updateTrack('iTired Music', 'Ready to play', false, null);
    }
}

// Глобальный экземпляр
window.discordRPC = new DiscordRPC();

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    window.discordRPC.init();
});

// События плеера
document.addEventListener('player-track-changed', function(e) {
    var detail = e.detail;
    window.discordRPC.setTrack(detail.title, detail.artist, detail.playing, detail.albumArt);
});

document.addEventListener('player-play', function() {
    var track = window.currentTrack;
    if (track) {
        window.discordRPC.setTrack(
            track.title || 'Unknown',
            track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : 'Unknown Artist',
            true,
            track.cover_uri
        );
    }
});

document.addEventListener('player-pause', function() {
    var track = window.currentTrack;
    if (track) {
        window.discordRPC.setTrack(
            track.title || 'Unknown',
            track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : 'Unknown Artist',
            false
        );
    }
});

// Уведомления (Tauri)
async function showDesktopNotification(title, body) {
    if (window.__TAURI__) {
        try {
            const { invoke } = window.__TAURI__;
            await invoke('show_notification', { title, body });
        } catch (e) {
            console.log('Notification error:', e);
        }
    }
}

document.addEventListener('player-track-changed', function(e) {
    var detail = e.detail;
    if (window.desktopNotificationsEnabled) {
        showDesktopNotification('Now Playing', detail.artist + ' - ' + detail.title);
    }
});
