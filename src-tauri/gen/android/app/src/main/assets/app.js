// ===== TOKEN =====
function getToken() { return localStorage.getItem('session'); }
function setToken(t) { if (t) { localStorage.setItem('session', t); document.cookie = 'session='+t+';path=/;max-age=2592000'; } }
function clearToken() { localStorage.removeItem('session'); document.cookie = 'session=;path=/;max-age=0'; }

const api = {
  _headers() {
    const h = { 'Content-Type': 'application/x-www-form-urlencoded' };
    const t = getToken(); if (t) h['X-Session-Token'] = t;
    return h;
  },
  async get(path) { try { const r = await fetch(path,{headers:this._headers()}); if(!r.ok)return null; return await r.json(); } catch { return null; } },
  async post(path, body) {
    try {
      const r = await fetch(path,{method:'POST',headers:this._headers(),body:new URLSearchParams(body).toString()});
      const d=await r.json(); if(d&&d.token) setToken(d.token); return {ok:r.ok,data:d};
    } catch { return {ok:false,data:{error:'network_error'}}; }
  },
  async del(path) { try{const r=await fetch(path,{method:'DELETE',headers:this._headers()});return{ok:r.ok,data:await r.json()}}catch{return{ok:false,data:{error:'network_error'}}} }
};

// ===== AUDIO ENGINE =====
let audioCtx = null;
let gainNode = null;
let oscillator = null;
let isPlaying = false;
let currentTrack = null;
let currentTrackIndex = 0;
let queue = [];
let progressInterval = null;
let repeatMode = 'all'; // 'none', 'one', 'all'
let shuffleMode = false;
let seekPos = 0;
let trackDuration = 30;
let playStartTime = 0;
let playedDuration = 0;
let audioEl = document.getElementById('audioPlayer');

const playIcon = '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8V4z"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
const heartIcon = '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const heartFilled = '<svg viewBox="0 0 24 24" fill="#e17055"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

// ===== TONE GENERATOR =====
const melodies = {
  'yandex_1': [262,294,330,349,330,294,262,330,349,392,440,392,349,330,294],
  'yandex_2': [392,440,494,523,494,440,392,349,330,294,262,294,330,349,392],
  'yandex_3': [330,349,392,523,587,659,784,659,587,523,392,349,330,294,262],
  'yandex_4': [262,294,330,392,440,494,523,659,523,494,440,392,330,294,262],
  'yandex_5': [261,293,329,349,392,523,587,659,587,523,392,349,329,293,261],
  'yandex_6': [220,261,293,329,349,392,440,523,440,392,349,329,293,261,220],
  'yandex_7': [196,220,261,293,329,349,392,440,523,440,392,349,329,293,261],
  'yandex_8': [349,392,440,523,587,659,784,880,784,659,587,523,440,392,349],
  'yandex_9': [261,293,329,349,392,440,493,523,493,440,392,349,329,293,261],
  'yandex_10': [311,349,392,440,523,587,659,698,659,587,523,440,392,349,311],
};

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.08;
    gainNode.connect(audioCtx.destination);
  }
}

function playMelody(id) {
  initAudio();
  stopOscillator();
  const notes = melodies[id] || melodies['yandex_1'];
  trackDuration = notes.length * 0.25 + 1;
  playedDuration = 0;
  playStartTime = audioCtx.currentTime;
  oscillator = audioCtx.createOscillator();
  const noteGain = audioCtx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = notes[0];
  oscillator.connect(noteGain);
  noteGain.connect(gainNode);
  oscillator.start();
  let noteIdx = 0;
  const noteInterval = setInterval(() => {
    noteIdx++;
    if (noteIdx >= notes.length || !isPlaying) {
      clearInterval(noteInterval);
      oscillator.stop();
      if (isPlaying) onTrackEnd();
      return;
    }
    oscillator.frequency.setValueAtTime(notes[noteIdx], audioCtx.currentTime);
    playedDuration = noteIdx * 0.25;
    updateSeekDisplay();
  }, 250);
  oscillator._interval = noteInterval;
}

function stopOscillator() {
  if (oscillator) {
    try { oscillator.stop(); } catch(e) {}
    clearInterval(oscillator._interval);
    oscillator = null;
  }
}

function onTrackEnd() {
  if (repeatMode === 'one') { playTrack(currentTrack?.id || queue[0]?.id); return; }
  if (repeatMode === 'all' || repeatMode === 'none') {
    if (currentTrackIndex < queue.length - 1 || repeatMode === 'all') {
      if (currentTrackIndex >= queue.length - 1) currentTrackIndex = -1;
      nextTrack();
    } else { stopPlayback(); }
  }
}

// ===== PLAYER CONTROLS =====
function playTrack(id) {
  api.get('/api/tracks').then(d => {
    if (!d) return;
    const t = d.tracks.find(t => t.id === id);
    if (!t) return;
    currentTrack = t;
    currentTrackIndex = d.tracks.indexOf(t);
    queue = d.tracks;
    isPlaying = true;
    playMelody(id);
    updateAllPlayerUI();
    document.querySelector('.mini-player').classList.remove('hidden');
    api.post('/api/listening_history', {track_id:id,track_data:JSON.stringify(t),artist_name:t.artist,duration:t.duration||30});
    showToast('▶ ' + t.title);
    updatePlayerHeart();
  });
}

function togglePlay() {
  if (!currentTrack) {
    if (queue.length) { playTrack(queue[0].id); return; }
    showToast('No track selected'); return;
  }
  if (isPlaying) { isPlaying = false; stopOscillator(); stopProgress(); updatePlayButtons(); }
  else { isPlaying = true; playMelody(currentTrack.id); startProgress(); updatePlayButtons(); }
}

function togglePlayMini() { togglePlay(); }

function nextTrack() {
  if (!queue.length) return;
  if (shuffleMode) { currentTrackIndex = Math.floor(Math.random() * queue.length); }
  else { currentTrackIndex = (currentTrackIndex + 1) % queue.length; }
  currentTrack = queue[currentTrackIndex];
  isPlaying = true;
  playMelody(currentTrack.id);
  updateAllPlayerUI(); startProgress();
}

function prevTrack() {
  if (!queue.length) return;
  currentTrackIndex = (currentTrackIndex - 1 + queue.length) % queue.length;
  currentTrack = queue[currentTrackIndex];
  isPlaying = true;
  playMelody(currentTrack.id);
  updateAllPlayerUI(); startProgress();
}

function toggleShuffle() {
  shuffleMode = !shuffleMode;
  document.getElementById('playerShuffleBtn').classList.toggle('active', shuffleMode);
  showToast(shuffleMode ? '🔀 Shuffle on' : '🔀 Shuffle off');
}

function toggleRepeat() {
  const modes = ['all', 'one', 'none'];
  const idx = (modes.indexOf(repeatMode) + 1) % modes.length;
  repeatMode = modes[idx];
  const btn = document.getElementById('playerRepeatBtn');
  btn.className = 'ctrl-btn';
  if (repeatMode === 'one') { btn.classList.add('active'); showToast('🔂 Repeat one'); }
  else if (repeatMode === 'all') { showToast('🔁 Repeat all'); }
  else { showToast('▶ Repeat off'); }
}

function seekTo(val) {
  const pct = val / 1000;
  if (oscillator) {
    const now = audioCtx.currentTime;
    playStartTime = now - pct * trackDuration;
    playedDuration = pct * trackDuration;
  }
}

function stopPlayback() {
  isPlaying = false; stopOscillator(); stopProgress(); updatePlayButtons();
}

// ===== UI UPDATES =====
function updateAllPlayerUI() {
  if (!currentTrack) return;
  document.getElementById('miniTitle').textContent = currentTrack.title;
  document.getElementById('miniArtist').textContent = currentTrack.artist;
  document.querySelector('.mini-cover').textContent = currentTrack.emoji || '🎵';
  document.querySelector('.mini-cover').style.background = currentTrack.cover || '#6c5ce7';
  document.getElementById('playerTitle').textContent = currentTrack.title;
  document.getElementById('playerArtist').textContent = currentTrack.artist;
  document.getElementById('playerCover').textContent = currentTrack.emoji || '🎵';
  document.getElementById('playerCover').style.background = currentTrack.cover || '#6c5ce7';
  updatePlayButtons();
  updatePlayerHeart();
  updateSeekDisplay();
  renderQueue();
}

function updatePlayButtons() {
  const icon = isPlaying ? pauseIcon : playIcon;
  document.querySelectorAll('.mini-play-btn, .play-btn-lg').forEach(b => b.innerHTML = icon);
}

function updateSeekDisplay() {
  const now = oscillator ? (audioCtx.currentTime - playStartTime) : 0;
  const cur = Math.min(now, trackDuration);
  const pct = Math.min((cur / trackDuration) * 100, 100);
  document.getElementById('miniProgressBar').style.width = pct + '%';
  document.getElementById('seekBar').value = pct * 10;
  document.getElementById('currentTime').textContent = formatTime(cur);
  document.getElementById('totalTime').textContent = formatTime(trackDuration);
}

function updatePlayerHeart() {
  const btn = document.getElementById('playerHeartBtn');
  if (btn && currentTrack) btn.innerHTML = favorites.has(currentTrack.id) ? heartFilled : heartIcon;
}

let user = null;
let favorites = new Set();

// ===== AUTH =====
function showAuthPage(id) { document.querySelectorAll('.auth-page').forEach(p=>p.style.display='none'); document.getElementById(id).style.display='flex'; }
async function doLogin(e) {
  e.preventDefault();
  const login=document.getElementById('loginInput').value.trim(), pw=document.getElementById('passwordInput').value;
  const err=document.getElementById('loginError');
  if(!login||!pw){err.textContent='Fill all fields';return false}
  err.textContent='Signing in...';
  const r=await api.post('/api/auth/login',{login,password});
  if(!r.ok){err.textContent=r.data.error==='invalid_credentials'?'Wrong username or password':(r.data.error||'Login failed');return false}
  user=r.data.user; showApp(); return false;
}
async function doRegister(e) {
  e.preventDefault();
  const u=document.getElementById('regUsername').value.trim(),em=document.getElementById('regEmail').value.trim(),pw=document.getElementById('regPassword').value;
  const err=document.getElementById('registerError');
  if(!u||!em||!pw){err.textContent='Fill all fields';return false}
  if(pw.length<4){err.textContent='Password too short (min 4)';return false}
  err.textContent='Creating account...';
  const r=await api.post('/api/auth/register',{username:u,email:em,password:pw});
  if(!r.ok){const m={username_taken:'Username taken',email_taken:'Email already registered'};err.textContent=m[r.data.error]||(r.data.error||'Registration failed');return false}
  user=r.data.user; showApp(); return false;
}
function showLogin() { showAuthPage('pageLogin'); }
function showRegister() { showAuthPage('pageRegister'); }
async function doLogout() { await api.post('/api/auth/logout',{}); clearToken(); user=null; favorites.clear(); document.getElementById('loadingScreen').style.display='flex'; document.querySelector('.app-main').style.display='none'; showLogin(); }

async function checkAuth() {
  const d=await api.get('/api/auth/me');
  if(d&&d.id){user=d;showApp()}else{document.getElementById('loadingScreen').style.display='none';showLogin()}
}

function showApp() {
  document.querySelectorAll('.auth-page').forEach(p=>p.style.display='none');
  document.getElementById('loadingScreen').style.display='none';
  document.querySelector('.app-main').style.display='block';
  loadHome(); loadPlaylists(); loadFavorites(); loadHistory(); loadBp(); loadShop();
  updateMiniPlayer(); updateFullPlayer(); if(currentPage==='profile') loadProfile();
}

// ===== NAV =====
let currentPage = 'home';
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const el=document.getElementById('page'+page.charAt(0).toUpperCase()+page.slice(1));
  if(el) el.classList.add('active');
  const map={home:0,search:1,library:2,bp:3,shop:4};
  const items=document.querySelectorAll('.nav-item');
  if(items[map[page]]) items[map[page]].classList.add('active');
  const pg=document.querySelector('.pages'); if(pg) pg.scrollTop=0;
  if(page==='library'){loadPlaylists();loadHistory()}
  if(page==='profile') loadProfile();
  if(page==='home') loadHome();
  if(page==='bp') loadBp();
  if(page==='shop') loadShop();
}

// ===== HOME =====
function setGreeting() {
  const h=new Date().getHours();
  let g='Good evening'; if(h<12)g='Good morning'; else if(h<17)g='Good afternoon';
  const el=document.querySelector('.greeting'); if(el) el.textContent=g;
}

async function loadHome() {
  const d=await api.get('/api/home');
  if(d){document.querySelector('.greeting').textContent=d.greeting||'Welcome';document.querySelector('.header h1').textContent=`Hi${d.username?', '+d.username:''}`;
    renderList('recentTracks',d.recently_played,t=>`<div class="track" onclick="playTrack('${t.id}')"><div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div><div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div><div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilled:heartIcon}</div></div>`);
    renderList('madeForYouCards',d.made_for_you||[],p=>`<div class="card" onclick="showPlaylistDetail(${p.id},'${p.name}','${p.desc}','${p.color}')"><div class="card-img" style="background:${p.color}">${p.emoji}</div><div class="card-body"><h3>${p.name}</h3><p>${p.desc}</p></div></div>`);
    renderList('playlistCards',d.playlists||[],p=>`<div class="card" onclick="openPlaylistById(${p.id})"><div class="card-img" style="background:${p.cover||'#6c5ce7'}">📋</div><div class="card-body"><h3>${p.title}</h3><p>${p.description||''}</p></div></div>`);
  }
}

// ===== FAVORITES =====
async function loadFavorites() {
  const d=await api.get('/api/favorites');
  if(d&&d.favorites){favorites=new Set(d.favorites.map(t=>t.id));document.getElementById('favCount').textContent=favorites.size+' favorites'}
}
async function toggleFavorite(id) {
  if(favorites.has(id)){await api.del('/api/favorites/'+id);favorites.delete(id);showToast('Removed from favorites')}
  else{const t=currentTrack&&currentTrack.id===id?currentTrack:null;await api.post('/api/favorites/'+id,{track_data:JSON.stringify(t||{id})});favorites.add(id);showToast('♥ Added to favorites')}
  document.querySelectorAll('.track-like').forEach(el=>{const p=el.closest('.track');if(p&&p.dataset.trackId===id)el.innerHTML=favorites.has(id)?heartFilled:heartIcon});
  document.getElementById('favCount').textContent=favorites.size+' favorites';
  updatePlayerHeart();
}

// ===== PLAYLISTS =====
async function loadPlaylists() {
  const d=await api.get('/api/playlists');
  if(d&&d.playlists){renderList('libraryItems',d.playlists,p=>`<div class="lib-item" onclick="openPlaylistById(${p.id})"><div class="lib-icon" style="background:${p.cover||'#6c5ce7'}22">📋</div><div><h4>${p.title}</h4><p>${p.track_count||0} tracks</p></div></div>`);
    renderList('myPlaylistsSection',d.playlists,p=>`<div class="track" onclick="openPlaylistById(${p.id})"><div class="track-cover" style="background:${p.cover||'#6c5ce7'}">📋</div><div class="track-info"><h4>${p.title}</h4><p>${p.description||'No description'}</p></div><div class="track-more" onclick="event.stopPropagation();deletePlaylist(${p.id})">✕</div></div>`);}
}
async function createPlaylist() {
  const t=prompt('Playlist name:'); if(!t||!t.trim()) return;
  const d=prompt('Description (optional):')||'';
  const r=await api.post('/api/playlists/create',{title:t.trim(),description:d});
  if(r.ok){showToast('✅ Playlist created');loadPlaylists()}else showToast('❌ '+(r.data.error||'Failed'));
}
async function deletePlaylist(id) { if(!confirm('Delete this playlist?'))return; await api.post(`/api/playlists/${id}/delete`,{}); showToast('Playlist deleted'); loadPlaylists(); }
async function openPlaylistById(id) {
  const d=await api.get(`/api/playlists/${id}`);
  if(!d)return;
  const dt=document.getElementById('playlistDetail');
  dt.querySelector('.header').style.background=`linear-gradient(180deg,${d.cover||'#6c5ce7'}88,var(--bg))`;
  dt.querySelector('.playlist-name').textContent=d.title; dt.querySelector('.playlist-desc').textContent=d.description||'';
  const tracks=d.tracks||[];
  dt.querySelector('.content').innerHTML=tracks.map(t=>`<div class="track" data-track-id="${t.id}" onclick="playTrack('${t.id}');closePlaylist()"><div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div><div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div><div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilled:heartIcon}</div></div>`).join('');
  dt.classList.add('open');
}
function closePlaylist(){document.getElementById('playlistDetail').classList.remove('open');}

// ===== HISTORY =====
async function loadHistory() {
  const d=await api.get('/api/listening_history');
  if(!d||!d.history)return;
  const el=document.getElementById('historyList'); if(!el)return;
  el.innerHTML=d.history.slice(0,20).map(h=>{const t=h.track||{};return`<div class="track" onclick="playTrack('${h.track_id}')"><div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div><div class="track-info"><h4>${t.title||'Unknown'}</h4><p>${t.artist||h.artist_name||''}</p></div><div style="font-size:11px;color:var(--text3)">${timeAgo(h.played_at)}</div></div>`}).join('');
}
async function clearHistory(){if(!confirm('Clear listening history?'))return;await api.post('/api/listening_history/clear',{});showToast('History cleared');loadHistory()}
function timeAgo(ts){const d=Date.now()-ts;if(d<60000)return'just now';if(d<3600000)return Math.floor(d/60000)+'m ago';if(d<86400000)return Math.floor(d/3600000)+'h ago';return Math.floor(d/86400000)+'d ago'}

// ===== SEARCH =====
let searchTimeout=null;
function handleSearch() {
  clearTimeout(searchTimeout);
  const q=document.getElementById('searchInput').value.trim();
  if(!q){document.getElementById('searchResults').innerHTML='';return}
  searchTimeout=setTimeout(async()=>{
    const d=await api.get('/api/search?q='+encodeURIComponent(q));
    if(!d)return;
    renderList('searchResults',d.results,t=>`<div class="track" data-track-id="${t.id}" onclick="playTrack('${t.id}')"><div class="track-cover" style="background:${t.cover||'#6c5ce7'}">${t.emoji||'🎵'}</div><div class="track-info"><h4>${t.title}</h4><p>${t.artist}</p></div><div class="track-like" onclick="event.stopPropagation();toggleFavorite('${t.id}')">${favorites.has(t.id)?heartFilled:heartIcon}</div></div>`);
    document.querySelector('.genres').style.display=q?'none':'';document.querySelector('.section-header h2').textContent=q?'Results':'Browse Genres';
  },300);
}

// ===== PROFILE =====
function loadProfile() {
  if(!user)return;
  document.querySelector('.profile-avatar').textContent=user.avatarEmoji||'👤';
  document.querySelector('.profile-header h2').textContent=user.displayName||user.username;
  document.querySelector('.profile-header p').textContent=user.email||'';
  document.getElementById('profileName').value=user.displayName||'';
  document.getElementById('profileBio').value=user.bio||'';
  api.get('/api/stats').then(d=>{if(d)document.getElementById('profileStats').innerHTML=`<div class="stat"><div class="stat-num">${d.tracks}</div><div class="stat-label">Tracks</div></div><div class="stat"><div class="stat-num">${d.playlists}</div><div class="stat-label">Playlists</div></div><div class="stat"><div class="stat-num">${d.hours}</div><div class="stat-label">Hours</div></div><div class="stat"><div class="stat-num">${d.favorites}</div><div class="stat-label">Fav</div></div>`});
}
async function saveProfile(){const n=document.getElementById('profileName').value.trim(),b=document.getElementById('profileBio').value.trim();const r=await api.post('/api/profile/update',{display_name:n,bio:b});if(r.ok){user=r.data.user;document.querySelector('.profile-header h2').textContent=user.displayName;showToast('✅ Profile updated')}else showToast('❌ '+(r.data.error||'Failed'))}

// ===== BATTLE PASS =====
async function loadBp() {
  const d=await api.get('/api/battle-pass/status');
  if(!d)return;
  document.getElementById('bpLevel').textContent=d.level;
  document.getElementById('bpSeasonName').textContent=d.season?.name||'Season 1';
  document.getElementById('bpXpText').textContent=d.xp+' / '+d.xp_for_next+' XP';
  document.getElementById('bpProgressBar').style.width=Math.min((d.progress||0)*100,100)+'%';
  document.getElementById('claimFreeBtn').disabled=d.claimed_free?.includes(d.level);
  document.getElementById('claimPremiumBtn').disabled=d.claimed_premium?.includes(d.level)||!d.has_premium;
  // Rewards
  if(d.rewards){const r=d.rewards;
    document.getElementById('bpRewards').innerHTML=`<div class="bp-reward-card"><div class="bp-reward-title">Level ${d.level} Rewards</div><div class="bp-reward-row"><span>Free:</span><span>${r.free?.coins||0} 🪙</span></div><div class="bp-reward-row"><span>Premium:</span><span>${r.premium?.coins||0} 🪙 ${r.premium?.item||''}</span></div></div>`;}
  // Quests
  const qd=await api.get('/api/battle-pass/quests');
  if(qd&&qd.quests){
    const daily=qd.quests.filter(q=>q.type==='daily'),weekly=qd.quests.filter(q=>q.type==='weekly');
    renderList('bpDailyQuests',daily,q=>`<div class="bp-quest"><div class="bp-quest-info"><span>${q.description}</span><span class="bp-quest-progress">${q.progress}/${q.required}</span></div><div class="bp-quest-bar-wrap"><div class="bp-quest-bar" style="width:${Math.min(q.progress/q.required*100,100)}%"></div></div>${q.completed&&!q.claimed?`<button class="btn-sm" onclick="claimQuest(${q.id})" style="margin-top:4px">Claim ${q.xp_reward}XP</button>`:q.claimed?'<span style="font-size:11px;color:var(--text3)">✅ Claimed</span>':''}</div>`);
    renderList('bpWeeklyQuests',weekly,q=>`<div class="bp-quest"><div class="bp-quest-info"><span>${q.description}</span><span class="bp-quest-progress">${q.progress}/${q.required}</span></div><div class="bp-quest-bar-wrap"><div class="bp-quest-bar" style="width:${Math.min(q.progress/q.required*100,100)}%"></div></div>${q.completed&&!q.claimed?`<button class="btn-sm" onclick="claimQuest(${q.id})" style="margin-top:4px">Claim ${q.xp_reward}XP</button>`:q.claimed?'<span style="font-size:11px;color:var(--text3)">✅ Claimed</span>':''}</div>`);
  }
}

async function claimBpReward(tier) {
  const d=await api.get('/api/battle-pass/status');
  if(!d)return;
  const r=await api.post('/api/battle-pass/claim',{level:d.level,tier});
  if(r.ok){showToast('✅ Claimed '+tier+' reward!');loadBp();loadShop()}else showToast('❌ '+(r.data.error||'Failed'));
}

async function claimQuest(id) {
  const r=await api.post('/api/battle-pass/claim-quest',{quest_id:id});
  if(r.ok){showToast('✅ +'+r.data.xp+' XP!');loadBp()}else showToast('❌ '+(r.data.error||'Failed'));
}

async function claimDailyBonus() {
  const r=await api.post('/api/battle-pass/daily-bonus',{});
  if(r.ok){showToast('🎁 +20 XP, +5 coins!');loadBp();loadShop()}else showToast('⏰ Already claimed today');
}

// ===== SHOP =====
async function loadShop() {
  const bal=await api.get('/api/currency/balance');
  if(bal) document.getElementById('shopBalance').textContent=bal.balance;
  const items=await api.get('/api/shop/items');
  if(items) renderList('shopItems',items.items,si=>`<div class="shop-card" data-id="${si.id}"><div class="shop-card-header" style="border-color:${rarityColor(si.rarity)}"><span class="shop-card-rarity" style="color:${rarityColor(si.rarity)}">${si.rarity}</span><span class="shop-card-type">${si.type}</span></div><div class="shop-card-body"><h4>${si.name}</h4><div class="shop-card-price">🪙 ${si.price}</div><button class="btn-sm" onclick="buyItem(${si.id})">Buy</button></div></div>`);
  const inv=await api.get('/api/shop/inventory');
  if(inv) renderList('shopInventory',inv.inventory,iv=>`<div class="shop-card ${iv.equipped?'equipped':''}"><div class="shop-card-body"><h4>${iv.item_type} #${iv.item_id}</h4><p style="font-size:11px;color:var(--text3)">${new Date(iv.purchased_at).toLocaleDateString()}</p>${iv.equipped?'<span style="color:#6c5ce7;font-size:12px">✅ Equipped</span>':`<button class="btn-sm" onclick="equipItem(${iv.id})">Equip</button>`}</div></div>`);
}

function rarityColor(r){return r==='legendary'?'#fdcb6e':r==='rare'?'#6c5ce7':'#636e72'}
async function buyItem(id){
  const r=await api.post('/api/shop/buy',{item_id:id});
  if(r.ok){showToast('✅ Purchased!');loadShop()}else showToast('❌ '+(r.data.error||'Failed'));
}
async function equipItem(id){
  const r=await api.post('/api/shop/equip/'+id,{});
  if(r.ok){showToast('✅ Equipped!');loadShop()}else showToast('❌ '+(r.data.error||'Failed'));
}

// ===== UTILITY =====
function renderList(id,items,fn){const el=document.getElementById(id);if(el)el.innerHTML=items.map(fn).join('')}
function formatTime(s){const m=Math.floor(s/60);return m+':'+String(Math.floor(s%60)).padStart(2,'0')}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._hide);t._hide=setTimeout(()=>t.classList.remove('show'),2000)}

// ===== INIT =====
function init() {
  checkAuth();
  const pages=document.querySelector('.pages');let startY=0;
  if(pages){pages.addEventListener('touchstart',e=>startY=e.touches[0].clientY);pages.addEventListener('touchmove',e=>{const dy=e.touches[0].clientY-startY;if(dy>80&&pages.scrollTop===0){showToast('🔄 Refreshing...');startY=Infinity;setTimeout(()=>location.reload(),400)}})}
  // Progress updater
  setInterval(()=>{if(isPlaying)updateSeekDisplay()},200);
}

document.addEventListener('DOMContentLoaded', init);
