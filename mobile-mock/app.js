const api = {
  async get(path) {
    try { const r = await fetch(path); if (!r.ok) return null; return await r.json(); }
    catch { return null; }
  },
  async post(path, body) {
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString()
      });
      return { ok: r.ok, data: await r.json() };
    } catch { return { ok: false, data: { error: 'network_error' } }; }
  },
  async del(path) {
    try { const r = await fetch(path, { method: 'DELETE' }); return { ok: r.ok, data: await r.json() }; }
    catch { return { ok: false, data: { error: 'network_error' } }; }
  }
};

let user = null;
let currentTrack = null;
let currentTrackIndex = 0;
let isPlaying = false;
let currentPage = 'home';
let progressInterval = null;
let queue = [];
let favorites = new Set();

const playIcon = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
const heartIcon = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const heartFilledIcon = '<svg viewBox="0 0 24 24" fill="#e17055"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

// ===== AUTH =====
function showAuthPage(id) {
  document.querySelectorAll('.auth-page').forEach(p => p.style.display = 'none');
  document.getElementById(id).style.display = 'flex';
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';
}

function showLogin() { showAuthPage('pageLogin'); }
function showRegister() { showAuthPage('pageRegister'); }

async function doLogin(e) {
  e.preventDefault();
  const login = document.getElementById('loginInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const err = document.getElementById('loginError');
  if (!login || !password) { err.textContent = 'Fill all fields'; return false; }
  err.textContent = 'Signing in...';
  const res = await api.post('/api/auth/login', { login, password });
  if (!res.ok) { err.textContent = res.data.error === 'invalid_credentials' ? 'Wrong username or password' : (res.data.error || 'Login failed'); return false; }
  user = res.data.user;
  showApp(); return false;
}

async function doRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const err = document.getElementById('registerError');
  if (!username || !email || !password) { err.textContent = 'Fill all fields'; return false; }
  if (password.length < 4) { err.textContent = 'Password too short (min 4)'; return false; }
  err.textContent = 'Creating account...';
  const res = await api.post('/api/auth/register', { username, email, password });
  if (!res.ok) { const map = { username_taken: 'Username taken', email_taken: 'Email already registered' }; err.textContent = map[res.data.error] || (res.data.error || 'Registration failed'); return false; }
  user = res.data.user;
  showApp(); return false;
}

async function doLogout() {
  await api.post('/api/auth/logout', {});
  user = null; favorites.clear();
  document.getElementById('loadingScreen').style.display = 'flex';
  document.querySelector('.app-main').style.display = 'none';
  showLogin();
}

async function checkAuth() {
  const data = await api.get('/api/auth/me');
  if (data && data.id) { user = data; showApp(); }
  else { document.getElementById('loadingScreen').style.display = 'none'; showLogin(); }
}

// ===== APP =====
function showApp() {
  document.querySelectorAll('.auth-page').forEach(p => p.style.display = 'none');
  document.getElementById('loadingScreen').style.display = 'none';
  document.querySelector('.app-main').style.display = 'block';
  setGreeting();
  loadHome();
  loadPlaylists();
  loadFavorites();
  loadHistory();
  updateMiniPlayer();
  updateFullPlayer();
  if (currentPage === 'profile') loadProfile();
}

function setGreeting() {
  const h = new Date().getHours();
  let g = 'Good evening';
  if (h < 12) g = 'Good morning';
  else if (h < 17) g = 'Good afternoon';
  const el = document.querySelector('.greeting');
  if (el) el.textContent = g;
}

// ===== HOME =====
async function loadHome() {
  const data = await api.get('/api/home');
  if (data) {
    document.querySelector('.greeting').textContent = data.greeting || 'Welcome';
    document.querySelector('.header h1').textContent = `Hi${data.username ? ', ' + data.username : ''}`;
    renderList('recentTracks', data.recently_played, t => `
      <div class="track" onclick="playTrack('${t.id}')">
        <div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div>
        <div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div>
        <div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id) ? heartFilledIcon : heartIcon}</div>
      </div>`);
    renderList('madeForYouCards', data.made_for_you, p => `
      <div class="card" onclick="showPlaylistDetail(${p.id},'${p.name}','${p.desc}','${p.color}')">
        <div class="card-img" style="background:${p.color}">${p.emoji}</div>
        <div class="card-body"><h3>${p.name}</h3><p>${p.desc}</p></div>
      </div>`);
    renderList('playlistCards', data.playlists, p => `
      <div class="card" onclick="openPlaylistById(${p.id})">
        <div class="card-img" style="background:${p.cover||'#6c5ce7'}">📋</div>
        <div class="card-body"><h3>${p.title}</h3><p>${p.description||''}</p></div>
      </div>`);
  } else { loadMockHome(); }
}

function loadMockHome() {
  const tracks = [
    {id:'yandex_1',title:'Blinding Lights',artist:'The Weeknd',cover:'#e17055',emoji:'🎵'},
    {id:'yandex_2',title:'Shape of You',artist:'Ed Sheeran',cover:'#00b894',emoji:'🎤'},
  ];
  renderList('recentTracks', tracks, t => `
    <div class="track" onclick="playTrack('${t.id}')">
      <div class="track-cover" style="background:${t.cover}">${t.emoji}</div>
      <div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div>
      <div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilledIcon:heartIcon}</div>
    </div>`);
  document.getElementById('madeForYouCards').innerHTML = '';
  document.getElementById('playlistCards').innerHTML = '';
}

// ===== TRACKS =====
function playTrack(id) {
  const data = api.get('/api/tracks').then(d => {
    if (!d) return;
    const t = d.tracks.find(t => t.id === id);
    if (!t) return;
    currentTrack = t;
    currentTrackIndex = d.tracks.indexOf(t);
    queue = d.tracks;
    isPlaying = true;
    updateMiniPlayer();
    updateFullPlayer();
    setAllPlayButtons(true);
    startProgress();
    api.post('/api/listening_history', { track_id: id, track_data: JSON.stringify(t), artist_name: t.artist, duration: t.duration || 0 });
    showToast('▶ ' + t.title);
  });
}

function togglePlay() {
  if (!currentTrack) return;
  isPlaying = !isPlaying;
  setAllPlayButtons(isPlaying);
  if (isPlaying) startProgress(); else stopProgress();
}

function togglePlayMini() { togglePlay(); }

function nextTrack() {
  if (queue.length === 0) return;
  currentTrackIndex = (currentTrackIndex + 1) % queue.length;
  currentTrack = queue[currentTrackIndex];
  isPlaying = true;
  updateMiniPlayer(); updateFullPlayer(); setAllPlayButtons(true); startProgress();
}

function prevTrack() {
  if (queue.length === 0) return;
  currentTrackIndex = (currentTrackIndex - 1 + queue.length) % queue.length;
  currentTrack = queue[currentTrackIndex];
  isPlaying = true;
  updateMiniPlayer(); updateFullPlayer(); setAllPlayButtons(true); startProgress();
}

function updateMiniPlayer() {
  if (!currentTrack) return;
  document.querySelector('.mini-cover').textContent = currentTrack.emoji || '🎵';
  document.querySelector('.mini-cover').style.background = currentTrack.cover || '#6c5ce7';
  document.querySelector('.mini-info h4').textContent = currentTrack.title;
  document.querySelector('.mini-info p').textContent = currentTrack.artist;
  document.querySelector('.mini-player').classList.remove('hidden');
}

function updateFullPlayer() {
  if (!currentTrack) return;
  const el = document.querySelector('.player-cover');
  el.textContent = currentTrack.emoji || '🎵';
  el.style.background = currentTrack.cover || '#6c5ce7';
  document.querySelector('.player-info h2').textContent = currentTrack.title;
  document.querySelector('.player-info p').textContent = currentTrack.artist;
}

function setAllPlayButtons(playing) {
  document.querySelectorAll('.play-btn').forEach(b => b.innerHTML = playing ? pauseIcon : playIcon);
}

function startProgress() {
  clearInterval(progressInterval);
  const bar = document.querySelector('.mini-progress-bar');
  let w = 0;
  progressInterval = setInterval(() => { w += 0.5; if (w > 100) w = 0; bar.style.width = w + '%'; }, 200);
}

function stopProgress() { clearInterval(progressInterval); }

function openPlayer() { document.getElementById('fullPlayer').classList.add('open'); }
function closePlayer() { document.getElementById('fullPlayer').classList.remove('open'); }

// ===== FAVORITES =====
async function loadFavorites() {
  const data = await api.get('/api/favorites');
  if (data && data.favorites) {
    favorites = new Set(data.favorites.map(t => t.id));
    document.querySelectorAll('.track-like').forEach(el => {
      const track = el.closest('.track');
      if (track && track.dataset.trackId) {
        el.innerHTML = favorites.has(track.dataset.trackId) ? heartFilledIcon : heartIcon;
      }
    });
  }
}

async function toggleFavorite(trackId) {
  if (favorites.has(trackId)) {
    await api.del('/api/favorites/' + trackId);
    favorites.delete(trackId);
    showToast('Removed from favorites');
  } else {
    const track = currentTrack && currentTrack.id === trackId ? currentTrack : null;
    await api.post('/api/favorites/' + trackId, { track_data: JSON.stringify(track || { id: trackId }) });
    favorites.add(trackId);
    showToast('♥ Added to favorites');
  }
  document.querySelectorAll('.track-like').forEach(el => {
    const parent = el.closest('.track');
    if (parent && parent.dataset.trackId === trackId) el.innerHTML = favorites.has(trackId) ? heartFilledIcon : heartIcon;
  });
}

// ===== PLAYLISTS =====
let userPlaylists = [];

async function loadPlaylists() {
  const data = await api.get('/api/playlists');
  if (data && data.playlists) {
    userPlaylists = data.playlists;
    renderList('libraryItems', data.playlists, p => `
      <div class="lib-item" onclick="openPlaylistById(${p.id})">
        <div class="lib-icon" style="background:${p.cover||'#6c5ce7'}22">📋</div>
        <div><h4>${p.title}</h4><p>${p.track_count||0} tracks</p></div>
      </div>`);
    renderList('myPlaylistsSection', data.playlists, p => `
      <div class="track" onclick="openPlaylistById(${p.id})">
        <div class="track-cover" style="background:${p.cover||'#6c5ce7'}">📋</div>
        <div class="track-info"><h4>${p.title}</h4><p>${p.description||'No description'}</p></div>
        <div class="track-more" onclick="event.stopPropagation();deletePlaylist(${p.id})">✕</div>
      </div>`);
  }
}

async function createPlaylist() {
  const title = prompt('Playlist name:');
  if (!title || !title.trim()) return;
  const desc = prompt('Description (optional):') || '';
  const res = await api.post('/api/playlists/create', { title: title.trim(), description: desc });
  if (res.ok) { showToast('✅ Playlist created'); loadPlaylists(); }
  else showToast('❌ ' + (res.data.error || 'Failed'));
}

async function addToPlaylist(playlistId, trackId) {
  const track = currentTrack || { id: trackId };
  await api.post(`/api/playlists/${playlistId}/tracks`, { track_id: trackId, track_data: JSON.stringify(track) });
  showToast('✅ Added to playlist');
}

async function deletePlaylist(id) {
  if (!confirm('Delete this playlist?')) return;
  await api.post(`/api/playlists/${id}/delete`, {});
  showToast('Playlist deleted');
  loadPlaylists();
}

async function openPlaylistById(id) {
  const data = await api.get(`/api/playlists/${id}`);
  if (!data) return;
  const detail = document.getElementById('playlistDetail');
  detail.querySelector('.header').style.background = `linear-gradient(180deg, ${data.cover||'#6c5ce7'}88, var(--bg))`;
  detail.querySelector('.playlist-name').textContent = data.title;
  detail.querySelector('.playlist-desc').textContent = data.description || '';
  const tracksEl = detail.querySelector('.content');
  const tracks = data.tracks || [];
  tracksEl.innerHTML = tracks.map((t, i) => `
    <div class="track" data-track-id="${t.id}" onclick="playTrack('${t.id}');closePlaylist()">
      <div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div>
      <div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div>
      <div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilledIcon:heartIcon}</div>
    </div>`).join('');
  detail.classList.add('open');
}

function closePlaylist() { document.getElementById('playlistDetail').classList.remove('open'); }

// ===== HISTORY =====
async function loadHistory() {
  const data = await api.get('/api/listening_history');
  if (!data || !data.history) return;
  const el = document.getElementById('historyList');
  if (!el) return;
  el.innerHTML = data.history.slice(0, 20).map(h => {
    const t = h.track || {};
    return `<div class="track" onclick="playTrack('${h.track_id}')">
      <div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div>
      <div class="track-info"><h4>${t.title||'Unknown'}</h4><p>${t.artist||h.artist_name||''}</p></div>
      <div style="font-size:11px;color:var(--text3)">${timeAgo(h.played_at)}</div>
    </div>`;
  }).join('');
}

async function clearHistory() {
  if (!confirm('Clear listening history?')) return;
  await api.post('/api/listening_history/clear', {});
  showToast('History cleared');
  loadHistory();
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

// ===== PROFILE =====
function loadProfile() {
  if (!user) return;
  document.querySelector('.profile-avatar').textContent = user.avatarEmoji || '👤';
  document.querySelector('.profile-header h2').textContent = user.displayName || user.username;
  document.querySelector('.profile-header p').textContent = user.email || '';
  document.getElementById('profileName').value = user.displayName || '';
  document.getElementById('profileBio').value = user.bio || '';
  loadStats();
}

async function loadStats() {
  const data = await api.get('/api/stats');
  if (data) {
    document.getElementById('profileStats').innerHTML = `
      <div class="stat"><div class="stat-num">${data.tracks}</div><div class="stat-label">Tracks</div></div>
      <div class="stat"><div class="stat-num">${data.playlists}</div><div class="stat-label">Playlists</div></div>
      <div class="stat"><div class="stat-num">${data.hours}</div><div class="stat-label">Hours</div></div>
      <div class="stat"><div class="stat-num">${data.favorites}</div><div class="stat-label">Favorites</div></div>`;
  }
}

async function saveProfile() {
  const displayName = document.getElementById('profileName').value.trim();
  const bio = document.getElementById('profileBio').value.trim();
  const res = await api.post('/api/profile/update', { display_name: displayName, bio: bio });
  if (res.ok) {
    user = res.data.user;
    document.querySelector('.profile-header h2').textContent = user.displayName;
    showToast('✅ Profile updated');
  } else showToast('❌ ' + (res.data.error || 'Failed'));
}

// ===== SEARCH =====
let searchTimeout = null;

function handleSearch() {
  clearTimeout(searchTimeout);
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { document.getElementById('searchResults').innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    const data = await api.get('/api/search?q=' + encodeURIComponent(q));
    if (!data) return;
    renderList('searchResults', data.results, t => `
      <div class="track" data-track-id="${t.id}" onclick="playTrack('${t.id}')">
        <div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div>
        <div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div>
        <div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilledIcon:heartIcon}</div>
      </div>`);
    document.querySelector('.genres').style.display = q ? 'none' : '';
    document.querySelector('.section-header h2').textContent = q ? 'Results' : 'Browse Genres';
  }, 300);
}

// ===== SWITCH PAGE =====
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
  if (el) el.classList.add('active');
  const navMap = { home: 0, search: 1, library: 2, profile: 3 };
  const items = document.querySelectorAll('.nav-item');
  if (items[navMap[page]]) items[navMap[page]].classList.add('active');
  const pages = document.querySelector('.pages');
  if (pages) pages.scrollTop = 0;
  if (page === 'library') loadPlaylists();
  if (page === 'profile') loadProfile();
  if (page === 'home') loadHome();
}

// ===== UTILITY =====
function renderList(id, items, fn) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = items.map(fn).join('');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => toast.classList.remove('show'), 2000);
}

function init() {
  checkAuth();
  // Pull-to-refresh
  const pages = document.querySelector('.pages');
  let startY = 0;
  if (pages) {
    pages.addEventListener('touchstart', e => startY = e.touches[0].clientY);
    pages.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 80 && pages.scrollTop === 0) { showToast('🔄 Refreshing...'); startY = Infinity; setTimeout(() => location.reload(), 400); }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
