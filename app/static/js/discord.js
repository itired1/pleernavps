// Discord Rich Presence — браузер + Tauri
// Client ID: замени на свой из https://discord.com/developers/applications
const DISCORD_CLIENT_ID = '1479783995435647107';

class DiscordRPC {
    constructor() {
        this.ws = null;
        this.enabled = false;
        this.title = '';
        this.artist = '';
        this.playing = false;
        this.albumArt = null;
        this.startTimestamp = null;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.connecting = false;
    }

    get enabled() {
        return localStorage.getItem('discord_rpc_enabled') === 'true';
    }

    set enabled(val) {
        localStorage.setItem('discord_rpc_enabled', val ? 'true' : 'false');
        if (!val) this.disconnect();
    }

    async init() {
        if (window.__TAURI__) {
            this.enabled = true;
            return;
        }
        if (this.enabled) this.connect();
    }

    async connect() {
        if (this.connecting || this.ws) return;
        if (!this.enabled) return;
        this.connecting = true;

        for (let port = 6463; port <= 6472; port++) {
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${DISCORD_CLIENT_ID}`);
                await new Promise((resolve, reject) => {
                    ws.onopen = () => resolve(ws);
                    ws.onerror = () => reject();
                    setTimeout(() => { ws.close(); reject(); }, 300);
                });
                this.ws = ws;
                break;
            } catch { continue; }
        }

        if (!this.ws) {
            console.log('Discord RPC: Discord Desktop не найден');
            this.connecting = false;
            return;
        }

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
                    console.log('Discord RPC: Подключено');
                    this.updateActivity();
                }
            } catch {}
        };

        this.ws.onclose = () => {
            this.ws = null;
            this.connecting = false;
            if (this.enabled) {
                this.reconnectTimer = setTimeout(() => this.connect(), 15000);
            }
        };

        this.ws.onerror = () => {};

        this.heartbeatInterval = setInterval(() => {
            if (this.ws) this.ws.send(JSON.stringify({ cmd: 'HEARTBEAT', args: {} }));
        }, 15000);

        this.connecting = false;
    }

    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.connecting = false;
    }

    async updateTrack(title, artist, playing = true, albumArt = null) {
        this.title = title || 'iTired Music';
        this.artist = artist || '';
        this.playing = playing !== false;
        this.albumArt = albumArt;

        if (playing) this.startTimestamp = Date.now();

        if (window.__TAURI__) {
            try {
                await window.__TAURI__.invoke('update_discord_status', {
                    title: this.title, artist: this.artist,
                    playing: this.playing, album_art: this.albumArt
                });
            } catch {}
            return;
        }

        this.updateActivity();
    }

    updateActivity() {
        if (!this.enabled || !this.ws || !this.playing) return;

        var smallIcon = localStorage.getItem('discord_small_icon') || 'itired_icon';
        var activity = {
            state: this.artist,
            details: this.title,
            assets: {
                large_image: this.albumArt || undefined,
                large_text: 'iTired Music',
                small_image: smallIcon,
                small_text: 'iTired Music'
            },
            timestamps: this.startTimestamp ? { start: Math.floor(this.startTimestamp / 1000) } : undefined,
            instance: false
        };

        this.ws.send(JSON.stringify({
            cmd: 'SET_ACTIVITY',
            args: { pid: 0, activity: activity }
        }));
    }

    setTrack(title, artist, playing = true, albumArt = null) {
        this.updateTrack(title, artist, playing, albumArt);
    }

    clear() {
        if (this.ws) {
            this.ws.send(JSON.stringify({
                cmd: 'SET_ACTIVITY', args: { pid: 0, activity: null }
            }));
        }
    }
}

window.discordRPC = new DiscordRPC();

document.addEventListener('DOMContentLoaded', function() {
    window.discordRPC.init();
});

document.addEventListener('player-play', function() {
    var t = window.currentTrack;
    if (t) window.discordRPC.setTrack(
        t.title, t.artists ? (Array.isArray(t.artists) ? t.artists.join(', ') : t.artists) : '',
        true, t.cover_uri
    );
});

document.addEventListener('player-pause', function() {
    var t = window.currentTrack;
    if (t) window.discordRPC.setTrack(t.title, t.artist || '', false);
});

async function showDesktopNotification(title, body) {
    if (window.__TAURI__) {
        try { await window.__TAURI__.invoke('show_notification', { title, body }); } catch {}
    }
}

document.addEventListener('player-track-changed', function(e) {
    var d = e.detail;
    if (window.desktopNotificationsEnabled) showDesktopNotification('Now Playing', d.artist + ' - ' + d.title);
});

window.toggleDiscordRpc = function() {
    var toggle = document.getElementById('discordRpcToggle');
    if (!toggle) return;
    var enabled = toggle.checked;
    window.discordRPC.enabled = enabled;
    if (enabled) {
        window.discordRPC.connect();
        var t = window.currentTrack;
        if (t) window.discordRPC.setTrack(t.title, t.artist || '', true, t.cover_uri);
    } else {
        window.discordRPC.clear();
        window.discordRPC.disconnect();
    }
};
