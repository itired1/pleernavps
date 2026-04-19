// Discord Rich Presence via Tauri
// Updates Discord status through native Rust code

class DiscordRPC {
    constructor() {
        this.enabled = false;
        this.title = 'iTired Music';
        this.artist = 'Ready to play';
        this.playing = true;
        this.updateInterval = null;
    }

    async init() {
        // Check if running in Tauri
        if (window.__TAURI__) {
            this.enabled = true;
            const saved = localStorage.getItem('desktopNotifications');
            window.desktopNotificationsEnabled = saved === null ? true : saved !== 'false';
            console.log('Discord RPC: Tauri detected, enabling RPC');
            console.log('Desktop notifications:', window.desktopNotificationsEnabled);
            
            // Initial update
            await this.updateTrack('iTired Music', 'Ready to play', true);
            
            // Update every 30 seconds
            this.updateInterval = setInterval(() => {
                this.updateTrack(this.title, this.artist, this.playing);
            }, 30000);
        } else {
            console.log('Discord RPC: Not in Tauri, RPC disabled');
        }
    }
    
    toggleDesktopNotifications() {
        window.desktopNotificationsEnabled = !window.desktopNotificationsEnabled;
        localStorage.setItem('desktopNotifications', window.desktopNotificationsEnabled);
        console.log('Desktop notifications:', window.desktopNotificationsEnabled);
    }

    setDesktopNotifications(enabled) {
        window.desktopNotificationsEnabled = enabled;
        localStorage.setItem('desktopNotifications', enabled);
    }

    async updateTrack(title, artist, playing = true, albumArt = null) {
        console.log('Discord.updateTrack called:', { title, artist, playing, albumArt, enabled: this.enabled });
        
        if (!this.enabled) {
            console.log('Discord RPC not enabled');
            return;
        }

        try {
            const { invoke } = window.__TAURI__;
            
            await invoke('update_discord_status', {
                title: title || 'Unknown',
                artist: artist || 'Unknown Artist',
                playing: playing,
                album_art: albumArt
            });
            
            this.title = title;
            this.artist = artist;
            this.playing = playing;
            
            console.log(`Discord RPC updated: ${artist} - ${title} (${playing ? 'Playing' : 'Paused'})`);
        } catch (e) {
            console.log('Discord RPC update failed:', e);
        }
    }

    setTrack(title, artist, playing = true, albumArt = null) {
        this.updateTrack(title, artist, playing, albumArt);
    }

    clear() {
        this.updateTrack('iTired Music', 'Ready to play', true);
    }
}

// Create global instance
window.discordRPC = new DiscordRPC();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.discordRPC.init();
});

// Listen for player events
document.addEventListener('player-track-changed', (e) => {
    const { title, artist, playing, albumArt } = e.detail;
    window.discordRPC.setTrack(title, artist, playing, albumArt);
});

document.addEventListener('player-play', () => {
    const track = window.currentTrack;
    if (track) {
        window.discordRPC.setTrack(
            track.title || 'Unknown',
            track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : 'Unknown Artist',
            true,
            track.cover_uri
        );
    }
});

document.addEventListener('player-pause', () => {
    const track = window.currentTrack;
    if (track) {
        window.discordRPC.setTrack(
            track.title || 'Unknown',
            track.artists ? (Array.isArray(track.artists) ? track.artists.join(', ') : track.artists) : 'Unknown Artist',
            false,
            track.cover_uri
        );
    }
});

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

document.addEventListener('player-track-changed', (e) => {
    const { title, artist } = e.detail;
    if (window.desktopNotificationsEnabled) {
        showDesktopNotification('Now Playing', `${artist} - ${title}`);
    }
});
