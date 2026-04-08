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
            console.log('Discord RPC: Tauri detected, enabling RPC');
            
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

    async updateTrack(title, artist, playing = true) {
        if (!this.enabled) return;

        try {
            const { invoke } = window.__TAURI__;
            
            await invoke('update_discord_status', {
                title: title || 'Unknown',
                artist: artist || 'Unknown Artist',
                playing: playing,
                albumArt: null
            });
            
            this.title = title;
            this.artist = artist;
            this.playing = playing;
            
            console.log(`Discord: ${artist} - ${title} (${playing ? 'Playing' : 'Paused'})`);
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
