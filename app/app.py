from flask import Flask, render_template, request, jsonify, session, redirect, url_for, current_app, send_file
import requests
import re
from config import Config
from models import db, User, UserCurrency, UserSetting, Friend, UserActivity, ListeningHistory, LikedTrack, UserInventory, ShopItem, Playlist, PlaylistTrack
from utils import send_verification_email, get_yandex_client, get_vk_api, Recommender
import bcrypt
import uuid
import os
from datetime import datetime, timedelta
import json
import random
import string
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache
from flask_socketio import SocketIO, emit, join_room, leave_room
import logging
from logging.handlers import RotatingFileHandler
import time

app = Flask(__name__)
app.config.from_object(Config)
app.config['SECRET_KEY'] = Config.SECRET_KEY if hasattr(Config, 'SECRET_KEY') else 'your-secret-key-change-me'
db.init_app(app)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

limiter = Limiter(get_remote_address, app=app, default_limits=["200 per day", "50 per hour"])
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

track_cache = {}

def get_cached_track(track_id, token, max_retries=3):
    cache_key = f"track:{track_id}"
    
    if cache_key in track_cache:
        cached = track_cache[cache_key]
        if cached.get('url') and cached.get('expires', 0) > time.time():
            return cached
    
    for attempt in range(max_retries):
        try:
            if track_id.startswith('yandex_'):
                track_num = track_id.replace('yandex_', '')
                client = get_yandex_client(token)
                if client:
                    track = client.tracks(track_num)[0]
                    cover = None
                    if hasattr(track, 'cover_uri') and track.cover_uri:
                        cover = f"https://{track.cover_uri.replace('%%', '200x200')}"
                    elif hasattr(track, 'albums') and track.albums and track.albums[0]:
                        cover = f"https://{track.albums[0].cover_uri.replace('%%', '200x200')}"
                    
                    download_info = client.tracks_download_info(track_num, get_direct_links=True)
                    if download_info and len(download_info) > 0:
                        url = download_info[0].direct_link if hasattr(download_info[0], 'direct_link') and download_info[0].direct_link else None
                        
                        if url:
                            result = {
                                'url': url,
                                'title': track.title if hasattr(track, 'title') else 'Unknown',
                                'artist': ', '.join([a.name if hasattr(a, 'name') else str(a) for a in track.artists]) if hasattr(track, 'artists') and track.artists else 'Unknown',
                                'cover': cover,
                                'duration': track.duration_ms if hasattr(track, 'duration_ms') else 0,
                                'service': 'yandex'
                            }
                            track_cache[cache_key] = {**result, 'expires': time.time() + 1800}
                            return result
                        else:
                            return {'error': 'Трек недоступен', 'code': 'NO_URL'}
                    else:
                        return {'error': 'Трек недоступен для скачивания', 'code': 'NO_DOWNLOAD'}
            
            elif track_id.startswith('vk_'):
                vk_id = track_id.replace('vk_', '')
                user = db.session.get(User, session.get('user_id'))
                if user and user.vk_token:
                    vk = get_vk_api(user.vk_token)
                    if vk:
                        try:
                            audio_list = vk.call('audio.getById', {'audios': f"-136022133_{vk_id}"})
                            if audio_list:
                                audio = audio_list[0]
                                result = {
                                    'url': audio['url'],
                                    'title': audio['title'],
                                    'artist': audio['artist'],
                                    'cover': audio.get('album', {}).get('thumb', {}).get('photo_300'),
                                    'duration': audio['duration'] * 1000,
                                    'service': 'vk'
                                }
                                track_cache[cache_key] = {**result, 'expires': time.time() + 1800}
                                return result
                        except Exception as e:
                            print(f"VK track error: {e}")
                            return {'error': 'Ошибка VK', 'code': 'VK_ERROR'}
            
            return {'error': 'Трек не найден', 'code': 'NOT_FOUND'}
            
        except Exception as e:
            print(f"Track fetch attempt {attempt + 1} error: {e}")
            if attempt < max_retries - 1:
                time.sleep(0.5 * (attempt + 1))
            if attempt == max_retries - 1:
                return {'error': f'Ошибка загрузки: {str(e)[:50]}', 'code': 'TIMEOUT'}
    
    return {'error': 'Не удалось загрузить трек', 'code': 'FAILED'}

def clear_expired_cache():
    global track_cache
    now = time.time()
    expired_keys = [k for k, v in track_cache.items() if v.get('expires', 0) < now]
    for k in expired_keys:
        del track_cache[k]

import threading
threading.Thread(target=lambda: None).start()
clear_expired_cache()
threading.Timer(300, clear_expired_cache).start()

rooms = {}
room_codes = {}

log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
file_handler = RotatingFileHandler(
    os.path.join(log_dir, 'itired.log'),
    maxBytes=10*1024*1024,
    backupCount=5
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [%(pathname)s:%(lineno)d]'
))
file_handler.setLevel(logging.INFO)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)

def log_info(msg):
    app.logger.info(msg)
    
def log_error(msg):
    app.logger.error(msg)

def cleanup_old_history():
    try:
        user_ids = db.session.query(ListeningHistory.user_id).distinct().all()
        for (uid,) in user_ids:
            count = db.session.query(ListeningHistory).filter_by(user_id=uid).count()
            if count > 1000:
                old_records = db.session.query(ListeningHistory).filter_by(user_id=uid).order_by(ListeningHistory.played_at.asc()).limit(count - 1000).all()
                for record in old_records:
                    db.session.delete(record)
                db.session.commit()
                log_info(f"Cleaned {len(old_records)} old history records for user {uid}")
    except Exception as e:
        log_error(f"History cleanup error: {e}")

def init_db():
    with app.app_context():
        db.create_all()
        try:
            from sqlalchemy import text
            db.session.execute(text('ALTER TABLE users ADD COLUMN yandex_uid VARCHAR(50)'))
            db.session.commit()
        except:
            pass
        if not db.session.query(User).filter_by(username='admin').first():
            admin = User(username='admin', email='admin@itired.com', is_admin=True, email_verified=True)
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()
            db.session.add(UserCurrency(user_id=admin.id, balance=1000))
            db.session.commit()
            log_info("Admin user created: admin / admin123")
    
    import atexit
    atexit.register(cleanup_old_history)

init_db()

@app.route('/api/health')
def health_check():
    return jsonify({
        'status': 'online',
        'version': '1.0.0',
        'features': ['yandex', 'vk', 'friends', 'rooms', 'shop']
    })

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/discord-rpc', methods=['POST'])
@login_required
def discord_rpc():
    data = request.get_json()
    user = db.session.query(User).filter_by(id=session['user_id']).first()
    
    if user and user.discord_enabled and user.discord_webhook:
        try:
            import requests
            state = data.get('state', 'iTired Music')
            details = data.get('details', '')
            
            embed = {
                "title": "🎧 Сейчас играет",
                "description": f"**{state}**\n{details}",
                "color": 0x6366f1,
                "footer": {"text": "iTired Music"}
            }
            
            requests.post(user.discord_webhook, json={"embeds": [embed]})
        except:
            pass
    
    return jsonify({'ok': True})

@app.route('/api/discord/settings')
def discord_settings():
    if 'user_id' not in session:
        return jsonify({'webhook_url': None, 'enabled': False})
    user = db.session.query(User).filter_by(id=session['user_id']).first()
    if user:
        return jsonify({
            'webhook_url': user.discord_webhook if user.discord_enabled else None,
            'enabled': user.discord_enabled
        })
    return jsonify({'webhook_url': None, 'enabled': False})

def add_currency(user_id, amount, reason):
    curr = db.session.query(UserCurrency).filter_by(user_id=user_id).first()
    if curr:
        curr.balance += amount
    else:
        curr = UserCurrency(user_id=user_id, balance=amount)
        db.session.add(curr)
    db.session.commit()
    return curr.balance

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        telegram_code = request.form.get('telegram_code')
        
        user = db.session.query(User).filter((User.username == username) | (User.email == username)).first()
        
        if not user or not user.check_password(password):
            return render_template('auth.html', mode='login', error='Неверные данные')
        
        if user.telegram_2fa_enabled and user.telegram_chat_id:
            if not telegram_code:
                return render_template('auth.html', mode='login', 
                    error='Введите код из Telegram', 
                    telegram_required=True,
                    username=username)
            
            if user.verification_code != telegram_code:
                return render_template('auth.html', mode='login', 
                    error='Неверный код', 
                    telegram_required=True,
                    username=username)
            
            if datetime.utcnow() > user.verification_code_expires:
                return render_template('auth.html', mode='login', 
                    error='Код истёк', 
                    telegram_required=True,
                    username=username)
            
            user.verification_code = None
            user.verification_code_expires = None
            db.session.commit()
        
        session.permanent = True
        session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('auth.html', mode='login')

def generate_captcha():
    num1 = random.randint(1, 20)
    num2 = random.randint(1, 20)
    operators = ['+', '-', '*']
    op = random.choice(operators)
    
    if op == '*':
        num2 = min(num2, 10)
        answer = num1 * num2
    elif op == '-':
        if num1 < num2:
            num1, num2 = num2, num1
        answer = num1 - num2
    else:
        answer = num1 + num2
    
    session['captcha_num1'] = num1
    session['captcha_num2'] = num2
    session['captcha_operator'] = op
    session['captcha_answer'] = answer
    
    return num1, op, num2

@app.route('/register', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def register():
    captcha_num1 = session.get('captcha_num1', 0)
    captcha_num2 = session.get('captcha_num2', 0)
    captcha_op = session.get('captcha_operator', '+')
    captcha_answer = session.get('captcha_answer', 0)
    
    if request.method == 'POST':
        username = request.form.get('username')
        email = request.form.get('email')
        password = request.form.get('password')
        confirm = request.form.get('confirm_password')
        display_name = request.form.get('display_name')
        user_captcha = request.form.get('captcha')
        
        if not user_captcha or int(user_captcha) != captcha_answer:
            num1, op, num2 = generate_captcha()
            return render_template('auth.html', mode='register', 
                error='Неверный ответ на капчу',
                captcha_num1=num1, captcha_num2=num2, captcha_op=op)
        
        if password != confirm:
            num1, op, num2 = generate_captcha()
            return render_template('auth.html', mode='register', 
                error='Пароли не совпадают',
                captcha_num1=num1, captcha_num2=num2, captcha_op=op)
        
        if len(password) < 6:
            num1, op, num2 = generate_captcha()
            return render_template('auth.html', mode='register', 
                error='Пароль минимум 6 символов',
                captcha_num1=num1, captcha_num2=num2, captcha_op=op)
        
        if db.session.query(User).filter((User.username == username) | (User.email == email)).first():
            num1, op, num2 = generate_captcha()
            return render_template('auth.html', mode='register', 
                error='Пользователь уже существует',
                captcha_num1=num1, captcha_num2=num2, captcha_op=op)
        
        user = User(username=username, email=email, display_name=display_name or username, email_verified=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        db.session.add(UserCurrency(user_id=user.id, balance=500))
        db.session.add(UserSetting(user_id=user.id))
        db.session.commit()
        
        session.pop('captcha_num1', None)
        session.pop('captcha_num2', None)
        session.pop('captcha_answer', None)
        
        session['user_id'] = user.id
        return redirect(url_for('index'))
    
    num1, op, num2 = generate_captcha()
    return render_template('auth.html', mode='register',
        captcha_num1=num1, captcha_num2=num2, captcha_op=op)

@app.route('/api/captcha/refresh')
def refresh_captcha():
    generate_captcha()
    return jsonify({
        'num1': session.get('captcha_num1'),
        'num2': session.get('captcha_num2'),
        'operator': session.get('captcha_operator')
    })

@app.route('/api/profile')
@login_required
def api_profile():
    user = db.session.get(User, session['user_id'])
    yandex_info = None
    vk_info = None
    
    if user and user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            try:
                acc = client.account_status()
                yandex_info = {'login': acc.account.login, 'premium': acc.account.premium}
            except: pass
    
    if user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                vk_user = vk.users.get()[0]
                vk_info = {'name': f"{vk_user['first_name']} {vk_user['last_name']}"}
            except: pass
    
    if user:
        return jsonify({
            'local': {
                'username': user.username,
                'display_name': user.display_name,
                'email': user.email,
                'bio': user.bio,
                'avatar_url': user.avatar_url,
                'yandex_token_set': bool(user.yandex_token),
                'vk_token_set': bool(user.vk_token),
                'soundcloud_token_set': False,
                'current_source': user.current_source or 'yandex',
                'created_at': user.created_at.isoformat()
            },
            'yandex': yandex_info,
            'vk': vk_info
        })
    return jsonify({'error': 'User not found'}), 404

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile_page():
    if request.method == 'POST':
        data = request.get_json()
        user = db.session.get(User, session['user_id'])
        
        if 'display_name' in data:
            user.display_name = data['display_name']
        if 'bio' in data:
            user.bio = data['bio']
        if 'avatar_url' in data:
            user.avatar_url = data['avatar_url']
        if 'current_source' in data:
            user.current_source = data['current_source']
            session['active_sources'] = [data['current_source']] if data['current_source'] != 'all' else ['yandex', 'vk']
        if 'yandex_token' in data and data['yandex_token']:
            user.yandex_token = data['yandex_token']
            client = get_yandex_client(data['yandex_token'])
            if client:
                db.session.commit()
                return jsonify({'success': True, 'message': 'Токен Яндекс.Музыки сохранён', 'source': 'yandex'})
            return jsonify({'success': False, 'message': 'Неверный токен Яндекс.Музыки'})
        if 'vk_token' in data and data['vk_token']:
            user.vk_token = data['vk_token']
            vk = get_vk_api(data['vk_token'])
            if vk:
                db.session.commit()
                return jsonify({'success': True, 'message': 'Токен VK сохранён', 'source': 'vk'})
            return jsonify({'success': False, 'message': 'Неверный токен VK'})
        
        db.session.commit()
        return jsonify({'success': True, 'message': 'Профиль обновлён'})
    return redirect(url_for('index'))

@app.route('/api/home')
@login_required
def home():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    result = {
        'recommendations': [],
        'playlists': [],
        'stats': {'total_playlists': 0, 'total_liked_tracks': 0},
        'history': [],
        'favorites': []
    }
    
    result['recommendations'] = Recommender.get_recommendations(user.id if user else None, services)
    
    total_playlists = 0
    total_liked = 0
    
    if 'yandex' in services and user and user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            try:
                plists = client.users_playlists_list()
                total_playlists = len(plists)
                for p in plists[:10]:
                    if p.collective:
                        continue
                    cover = None
                    if p.cover and p.cover.uri:
                        cover = f"https://{p.cover.uri.replace('%%', '300x300')}"
                    result['playlists'].append({
                        'id': f"yandex_{p.kind}",
                        'title': p.title,
                        'track_count': p.track_count,
                        'cover_uri': cover,
                        'service': 'yandex'
                    })
                liked = client.users_likes_tracks()
                total_liked = len(liked.tracks) if liked and liked.tracks else 0
            except: pass
    
    if 'vk' in services and user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                plists = vk.call('audio.getPlaylists', {'count': 50})
                if 'items' in plists:
                    total_playlists += len(plists['items'])
                    for p in plists['items'][:5]:
                        result['playlists'].append({
                            'id': f"vk_{p['id']}",
                            'title': p['title'],
                            'track_count': p['count'],
                            'cover_uri': p.get('photo', {}).get('photo_300'),
                            'service': 'vk'
                        })
            except: pass
    
    user_playlists = db.session.query(Playlist).filter_by(user_id=session['user_id']).order_by(Playlist.created_at.desc()).limit(10).all()
    for p in user_playlists:
        track_count = db.session.query(PlaylistTrack).filter_by(playlist_id=p.id).count()
        result['playlists'].insert(0, {
            'id': f"local_{p.id}",
            'title': p.title,
            'track_count': track_count,
            'cover_uri': None,
            'service': 'local'
        })
    
    result['stats'] = {'total_playlists': total_playlists, 'total_liked_tracks': total_liked}
    
    history = db.session.query(ListeningHistory).filter_by(user_id=session['user_id']).order_by(ListeningHistory.played_at.desc()).limit(10).all()
    for h in history:
        data = json.loads(h.track_data) if h.track_data else {}
        data['id'] = h.track_id
        data['played_at'] = h.played_at.isoformat()
        result['history'].append(data)
    
    favorites = db.session.query(LikedTrack).filter_by(user_id=session['user_id']).order_by(LikedTrack.liked_at.desc()).limit(10).all()
    for f in favorites:
        data = json.loads(f.track_data) if f.track_data else {}
        data['id'] = f.track_id
        data['liked'] = True
        result['favorites'].append(data)
    
    return jsonify(result)

@app.route('/api/recommendations')
@login_required
def recommendations():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    recs = Recommender.get_recommendations(user.id if user else None, services)
    return jsonify(recs)

@app.route('/api/stats')
@login_required
def stats():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    total_playlists = 0
    total_liked = 0
    
    if 'yandex' in services and user and user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            try:
                total_playlists = len(client.users_playlists_list())
                total_liked = len(client.users_likes_tracks())
            except: pass
    
    return jsonify({
        'total_playlists': total_playlists,
        'total_liked_tracks': total_liked
    })

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/change_password/request', methods=['POST'])
def change_password_request():
    data = request.get_json()
    username = data.get('username')
    
    user = db.session.query(User).filter((User.username == username) | (User.email == username)).first()
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404
    
    if not user.telegram_chat_id:
        return jsonify({'error': 'Telegram не привязан'}), 400
    
    code = ''.join(random.choices(string.digits, k=6))
    user.verification_code = code
    user.verification_code_expires = datetime.utcnow() + timedelta(minutes=10)
    db.session.commit()
    
    try:
        requests.post(f'https://api.telegram.org/bot{os.environ.get("TELEGRAM_BOT_TOKEN")}/sendMessage', json={
            'chat_id': user.telegram_chat_id,
            'text': f'🔑 <b>Смена пароля iTired</b>\n\nКод для смены пароля:\n\n<code>{code}</code>\n\n⏰ Действует 10 минут\n\nЕсли это были не вы - проигнорируйте это сообщение.',
            'parse_mode': 'HTML'
        }, timeout=10)
    except:
        pass
    
    return jsonify({'success': True, 'expires': 10})

@app.route('/api/change_password/verify', methods=['POST'])
def change_password_verify():
    data = request.get_json()
    username = data.get('username')
    code = data.get('code')
    new_password = data.get('new_password')
    
    if not new_password or len(new_password) < 6:
        return jsonify({'error': 'Пароль минимум 6 символов'}), 400
    
    user = db.session.query(User).filter((User.username == username) | (User.email == username)).first()
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 404
    
    if not user.verification_code or user.verification_code != code:
        return jsonify({'error': 'Неверный код'}), 400
    
    if datetime.utcnow() > user.verification_code_expires:
        return jsonify({'error': 'Код истёк'}), 400
    
    user.set_password(new_password)
    user.verification_code = None
    user.verification_code_expires = None
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/api/settings', methods=['GET', 'POST'])
@login_required
def user_settings():
    user = db.session.get(User, session['user_id'])
    setting = user.settings if user else None
    if not setting:
        setting = UserSetting(user_id=user.id)
        db.session.add(setting)
        db.session.commit()
    
    if request.method == 'GET':
        return jsonify({
            'theme': setting.theme,
            'music_service': setting.music_service,
            'active_sources': session.get('active_sources', ['yandex']),
            'bypass_censorship': session.get('bypass_censorship', True),
            'discord_webhook': user.discord_webhook if user else None,
            'discord_enabled': user.discord_enabled if user else False
        })
    else:
        data = request.get_json()
        setting.theme = data.get('theme', setting.theme)
        setting.music_service = data.get('music_service', setting.music_service)
        
        if 'active_sources' in data:
            session['active_sources'] = data['active_sources']
        if 'bypass_censorship' in data:
            session['bypass_censorship'] = data['bypass_censorship']
        
        if 'discord_webhook' in data:
            user.discord_webhook = data['discord_webhook']
            user.discord_enabled = bool(data['discord_webhook'])
        
        db.session.commit()
        return jsonify({'success': True})

@app.route('/api/currency/balance')
@login_required
def currency_balance():
    user = db.session.get(User, session['user_id'])
    return jsonify({'balance': user.get_balance() if user else 0})

@app.route('/api/search')
@login_required
def search():
    q = request.args.get('q', '')
    services = request.args.getlist('services') or session.get('active_sources', ['yandex'])
    
    if not q:
        return jsonify({'tracks': []})
    
    result = {'tracks': []}
    user = db.session.get(User, session['user_id'])
    
    if 'yandex' in services and user and user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            try:
                search_res = client.search(q)
                if search_res.tracks:
                    for t in search_res.tracks.results[:15]:
                        cover = f"https://{t.cover_uri.replace('%%', '300x300')}" if t.cover_uri else None
                        result['tracks'].append({
                            'id': f"yandex_{t.id}",
                            'title': t.title,
                            'artists': [a.name if hasattr(a, 'name') else str(a) for a in t.artists] if t.artists else [],
                            'duration': t.duration_ms,
                            'cover_uri': cover,
                            'service': 'yandex'
                        })
            except Exception as e:
                print(f"Yandex search error: {e}")
    
    if 'vk' in services and user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                search_res = vk.call('audio.search', {'q': q, 'count': 15})
                if 'items' in search_res:
                    for t in search_res['items']:
                        result['tracks'].append({
                            'id': f"vk_{t['id']}",
                            'title': t['title'],
                            'artists': [t['artist']],
                            'duration': t['duration'] * 1000,
                            'cover_uri': t.get('album', {}).get('thumb', {}).get('photo_300'),
                            'service': 'vk'
                        })
            except Exception as e:
                print(f"VK search error: {e}")
    
    return jsonify(result)

@app.route('/api/playlists')
@login_required
def playlists():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    result = []
    
    if 'yandex' in services and user and user.yandex_token:
        try:
            client = get_yandex_client(user.yandex_token)
            if client:
                plists = client.users_playlists_list()
                for p in plists:
                    if p.collective:
                        continue
                    cover = None
                    if p.cover and p.cover.uri:
                        cover = f"https://{p.cover.uri.replace('%%', '300x300')}"
                    result.append({
                        'id': f"yandex_{p.kind}",
                        'title': p.title,
                        'track_count': p.track_count,
                        'cover_uri': cover,
                        'service': 'yandex'
                    })
        except Exception as e:
            print(f"Yandex playlists error: {e}")
    
    if 'vk' in services and user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                plists = vk.call('audio.getPlaylists', {'count': 50})
                if 'items' in plists:
                    for p in plists['items']:
                        result.append({
                            'id': f"vk_{p['id']}",
                            'title': p['title'],
                            'track_count': p['count'],
                            'cover_uri': p.get('photo', {}).get('photo_300'),
                            'service': 'vk'
                        })
            except Exception as e:
                print(f"VK playlists error: {e}")
    
    user_playlists = db.session.query(Playlist).filter_by(user_id=session['user_id']).order_by(Playlist.created_at.desc()).all()
    print(f"DEBUG: Found {len(user_playlists)} local playlists for user_id={session['user_id']}")
    for p in user_playlists:
        track_count = db.session.query(PlaylistTrack).filter_by(playlist_id=p.id).count()
        result.insert(0, {
            'id': f"local_{p.id}",
            'title': p.title,
            'track_count': track_count,
            'cover_uri': None,
            'service': 'local'
        })
    
    return jsonify({'playlists': result})

@app.route('/api/playlists/create', methods=['POST'])
@login_required
def create_playlist():
    data = request.get_json()
    name = data.get('name', 'Новый плейлист')
    description = data.get('description', '')
    is_public = data.get('is_public', False)
    
    playlist = Playlist(
        user_id=session['user_id'],
        title=name,
        description=description,
        is_public=is_public
    )
    db.session.add(playlist)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'Плейлист создан',
        'playlist': {
            'id': f"local_{playlist.id}",
            'title': playlist.title,
            'track_count': 0,
            'cover_uri': None,
            'service': 'local'
        }
    })

@app.route('/api/liked-tracks')
@login_required
def liked_tracks():
    user = db.session.get(User, session['user_id'])
    source = request.args.get('source', 'yandex')
    tracks = []
    
    if source == 'yandex' and user and user.yandex_token:
        try:
            client = get_yandex_client(user.yandex_token)
            if not client:
                return jsonify({'error': 'Неверный токен Яндекс.Музыки', 'tracks': []})
            
            liked = client.users_likes_tracks()
            if liked and liked.tracks:
                for item in liked.tracks:
                    try:
                        track = item.track if hasattr(item, 'track') and item.track else item
                        if not track or not hasattr(track, 'id') or not track.id:
                            continue
                        
                        cover = None
                        if hasattr(track, 'cover_uri') and track.cover_uri:
                            cover = f"https://{track.cover_uri.replace('%%', '300x300')}"
                        elif hasattr(track, 'albums') and track.albums:
                            for album in track.albums:
                                if album and hasattr(album, 'cover_uri') and album.cover_uri:
                                    cover = f"https://{album.cover_uri.replace('%%', '300x300')}"
                                    break
                                if album and hasattr(album, 'get_cover_url'):
                                    cover = album.get_cover_url('300x300')
                                    break
                        
                        artists = []
                        if hasattr(track, 'artists') and track.artists:
                            for a in track.artists:
                                if not a:
                                    continue
                                if hasattr(a, 'name'):
                                    artists.append(a.name)
                                elif isinstance(a, dict):
                                    artists.append(a.get('name', 'Unknown'))
                                else:
                                    artists.append(str(a))
                        
                        duration = 0
                        if hasattr(track, 'duration_ms') and track.duration_ms:
                            duration = track.duration_ms
                        elif hasattr(track, 'albums') and track.albums:
                            for album in track.albums:
                                if album and hasattr(album, 'duration_ms') and album.duration_ms:
                                    duration = album.duration_ms
                                    break
                        
                        title = 'Неизвестно'
                        if hasattr(track, 'title') and track.title:
                            title = track.title
                        
                        tracks.append({
                            'id': f"yandex_{track.id}",
                            'title': title,
                            'artists': artists if artists else ['Unknown'],
                            'duration': duration,
                            'cover_uri': cover,
                            'service': 'yandex'
                        })
                    except Exception as te:
                        print(f"Track parse error: {te}")
                        continue
            else:
                return jsonify({'tracks': [], 'message': 'Лайкнутые треки пусты'})
        except Exception as e:
            print(f"Liked tracks error: {e}")
            return jsonify({'error': str(e), 'tracks': []})
    
    return jsonify({'tracks': tracks})

@app.route('/api/listening_history')
@login_required
def listening_history():
    history = db.session.query(ListeningHistory).filter_by(user_id=session['user_id']).order_by(ListeningHistory.played_at.desc()).limit(50).all()
    result = []
    for h in history:
        data = json.loads(h.track_data) if h.track_data else {}
        data['id'] = h.track_id
        data['played_at'] = h.played_at.isoformat()
        result.append(data)
    return jsonify(result)

@app.route('/api/listening_history/clear', methods=['POST'])
@login_required
def clear_listening_history():
    db.session.query(ListeningHistory).filter_by(user_id=session['user_id']).delete()
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/favorites')
@login_required
def get_favorites():
    favorites = db.session.query(LikedTrack).filter_by(user_id=session['user_id']).order_by(LikedTrack.liked_at.desc()).all()
    result = []
    for f in favorites:
        data = json.loads(f.track_data) if f.track_data else {}
        data['id'] = f.track_id
        data['liked'] = True
        result.append(data)
    return jsonify(result)

@app.route('/api/favorites/<track_id>', methods=['POST', 'DELETE'])
@login_required
def toggle_favorite(track_id):
    user_id = session['user_id']
    existing = db.session.query(LikedTrack).filter_by(user_id=user_id, track_id=track_id).first()
    
    if request.method == 'POST':
        if existing:
            return jsonify({'liked': True, 'message': 'Уже в избранном'})
        
        data = request.get_json() if request.is_json else {}
        track_data = data.get('track_data', {})
        
        favorite = LikedTrack(
            user_id=user_id,
            track_id=track_id,
            track_data=json.dumps(track_data) if track_data else None
        )
        db.session.add(favorite)
        db.session.commit()
        return jsonify({'liked': True, 'message': 'Добавлено в избранное'})
    
    elif request.method == 'DELETE':
        if existing:
            db.session.delete(existing)
            db.session.commit()
        return jsonify({'liked': False, 'message': 'Удалено из избранного'})

@app.route('/api/favorites/<track_id>/check')
@login_required
def check_favorite(track_id):
    existing = db.session.query(LikedTrack).filter_by(user_id=session['user_id'], track_id=track_id).first()
    return jsonify({'liked': existing is not None})

@app.route('/api/playlists/<playlist_id>/tracks')
@login_required
def playlist_tracks(playlist_id):
    user = db.session.get(User, session['user_id'])
    tracks = []
    
    if playlist_id.startswith('yandex_'):
        if user and user.yandex_token:
            try:
                kind = int(playlist_id.replace('yandex_', ''))
                headers = {'Authorization': f'OAuth {user.yandex_token}'}
                
                yandex_uid = user.yandex_uid
                if not yandex_uid:
                    account_resp = requests.get('https://api.music.yandex.net/account/status', headers=headers, timeout=10)
                    if account_resp.status_code == 200:
                        yandex_uid = account_resp.json().get('account', {}).get('uid')
                    elif client and hasattr(client, 'account_status'):
                        try:
                            acc = client.account_status()
                            if hasattr(acc, 'account') and acc.account:
                                yandex_uid = getattr(acc.account, 'uid', None)
                        except: pass
                
                if not yandex_uid:
                    print("Cannot find Yandex UID")
                    return jsonify({'tracks': []})
                
                all_tracks = []
                page = 0
                per_page = 100
                
                while True:
                    api_url = f'https://api.music.yandex.net/users/{yandex_uid}/playlists/{kind}/tracks'
                    params = {'page': page, 'pageSize': per_page}
                    resp = requests.get(api_url, headers=headers, params=params, timeout=15)
                    
                    if resp.status_code != 200:
                        print(f"Yandex API error: {resp.status_code}")
                        break
                    
                    data = resp.json()
                    result = data.get('result', {})
                    playlist_tracks_data = result.get('tracks', [])
                    
                    if not playlist_tracks_data:
                        break
                    
                    all_tracks.extend(playlist_tracks_data)
                    
                    if len(playlist_tracks_data) < per_page:
                        break
                    
                    page += 1
                    if page > 50:
                        break
                
                for item in all_tracks:
                    try:
                        track_data = item.get('track') or item
                        if not track_data:
                            continue
                        
                        track_id = track_data.get('id')
                        if not track_id:
                            continue
                        
                        cover = None
                        cover_uri = track_data.get('coverUri') or track_data.get('album', {}).get('coverUri')
                        if cover_uri:
                            cover = f"https://{cover_uri.replace('%%', '300x300')}"
                        
                        artists = []
                        for a in track_data.get('artists', []):
                            if isinstance(a, dict):
                                artists.append(a.get('name', 'Unknown'))
                            elif hasattr(a, 'name'):
                                artists.append(a.name)
                            else:
                                artists.append(str(a))
                        
                        duration = track_data.get('durationMs', 0) or track_data.get('album', {}).get('durationMs', 0)
                        
                        tracks.append({
                            'id': f"yandex_{track_id}",
                            'title': track_data.get('title', 'Неизвестно'),
                            'artists': artists if artists else ['Unknown'],
                            'duration': duration,
                            'cover_uri': cover,
                            'service': 'yandex'
                        })
                    except Exception as te:
                        print(f"Track parse error: {te}")
                        continue
                        
            except Exception as e:
                print(f"Playlist tracks error: {e}")
                import traceback
                traceback.print_exc()
    
    elif playlist_id.startswith('vk_'):
        if user and user.vk_token:
            vk = get_vk_api(user.vk_token)
            if vk:
                try:
                    parts = playlist_id.replace('vk_', '').split('_')
                    if len(parts) == 2:
                        owner_id, playlist_id_vk = parts
                        audio_list = vk.call('audio.get', {'owner_id': owner_id, 'album_id': playlist_id_vk})
                    else:
                        owner_id = parts[0]
                        audio_list = vk.call('audio.get', {'owner_id': owner_id})
                    
                    if 'items' in audio_list:
                        for t in audio_list['items']:
                            tracks.append({
                                'id': f"vk_{t['id']}",
                                'title': t['title'],
                                'artists': [t['artist']],
                                'duration': t['duration'] * 1000,
                                'cover_uri': t.get('album', {}).get('thumb', {}).get('photo_300'),
                                'service': 'vk'
                            })
                except Exception as e:
                    print(f"VK playlist error: {e}")
    
    elif playlist_id.startswith('local_'):
        local_id = int(playlist_id.replace('local_', ''))
        print(f"DEBUG: Loading local playlist tracks for local_{local_id}")
        pts = db.session.query(PlaylistTrack).filter_by(playlist_id=local_id).all()
        print(f"DEBUG: Found {len(pts)} tracks for playlist {local_id}")
        for pt in pts:
            if pt.track_data:
                data = json.loads(pt.track_data)
                data['id'] = pt.track_id
                tracks.append(data)
            else:
                print(f"DEBUG: Track {pt.track_id} has no track_data")
    
    return jsonify(tracks)

@app.route('/api/play_track/<track_id>')
@login_required
def play_track(track_id):
    user = db.session.get(User, session['user_id'])
    
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 401
    
    if track_id.startswith('yandex_'):
        if user and user.yandex_token:
            result = get_cached_track(track_id, user.yandex_token)
            
            if result.get('error'):
                return jsonify(result), 404 if result.get('code') == 'NOT_FOUND' else 500
            
            history = ListeningHistory(
                user_id=session['user_id'],
                track_id=track_id,
                track_data=json.dumps({
                    'title': result.get('title'),
                    'artists': result.get('artist', '').split(', '),
                    'cover_uri': result.get('cover')
                })
            )
            db.session.add(history)
            db.session.commit()
            
            return jsonify(result)
        else:
            return jsonify({'error': 'Токен Яндекс.Музыки не настроен', 'code': 'NO_TOKEN'}), 400
    
    elif track_id.startswith('vk_'):
        result = get_cached_track(track_id, user.vk_token if user else None)
        
        if result.get('error'):
            return jsonify(result), 404 if result.get('code') == 'NOT_FOUND' else 500
        
        history = ListeningHistory(
            user_id=session['user_id'],
            track_id=track_id,
            track_data=json.dumps({
                'title': result.get('title'),
                'artists': [result.get('artist', '')],
                'cover_uri': result.get('cover')
            })
        )
        db.session.add(history)
        db.session.commit()
        
        return jsonify(result)
    
    return jsonify({'error': 'Трек не найден', 'code': 'NOT_FOUND'}), 404

@app.route('/api/friends')
@login_required
def friends_list():
    user = db.session.get(User, session['user_id'])
    friends = []
    sent = db.session.query(Friend).filter_by(user_id=user.id).all()
    received = db.session.query(Friend).filter_by(friend_id=user.id).all()
    for f in sent:
        other = db.session.get(User, f.friend_id)
        if other:
            friends.append({
                'id': other.id,
                'username': other.username,
                'display_name': other.display_name,
                'avatar_url': other.avatar_url,
                'status': f.status,
                'direction': 'outgoing'
            })
    for f in received:
        other = db.session.get(User, f.user_id)
        if other:
            friends.append({
                'id': other.id,
                'username': other.username,
                'display_name': other.display_name,
                'avatar_url': other.avatar_url,
                'status': f.status,
                'direction': 'incoming'
            })
    return jsonify(friends)

@app.route('/api/friends/add/<int:friend_id>', methods=['POST'])
@login_required
def add_friend(friend_id):
    try:
        user = db.session.get(User, session['user_id'])
        if user.id == friend_id:
            return jsonify({'success': False, 'message': 'Нельзя добавить себя'}), 400
        
        friend_user = db.session.get(User, friend_id)
        if not friend_user:
            return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
        
        existing = db.session.query(Friend).filter(
            ((Friend.user_id == user.id) & (Friend.friend_id == friend_id)) |
            ((Friend.user_id == friend_id) & (Friend.friend_id == user.id))
        ).first()
        
        if existing:
            if existing.status == 'accepted':
                return jsonify({'success': False, 'message': 'Вы уже друзья'}), 400
            elif existing.status == 'pending':
                if existing.user_id == friend_id:
                    existing.status = 'accepted'
                    db.session.commit()
                    return jsonify({'success': True, 'message': 'Запрос принят'})
                return jsonify({'success': False, 'message': 'Запрос уже существует'}), 400
        
        friend = Friend(user_id=user.id, friend_id=friend_id, status='accepted', taste_match=random.randint(40, 95))
        db.session.add(friend)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Друг добавлен'})
    except Exception as e:
        db.session.rollback()
        print(f"Add friend error: {e}")
        return jsonify({'success': False, 'message': 'Ошибка сервера'}), 500

@app.route('/api/friends/accept/<int:friend_id>', methods=['POST'])
@login_required
def accept_friend(friend_id):
    user = db.session.get(User, session['user_id'])
    req = db.session.query(Friend).filter_by(user_id=friend_id, friend_id=user.id, status='pending').first()
    if not req:
        return jsonify({'success': False, 'message': 'Запрос не найден'}), 404
    req.status = 'accepted'
    db.session.commit()
    return jsonify({'success': True, 'message': 'Друг добавлен'})

@app.route('/api/friends/search')
@login_required
def search_friends():
    query = request.args.get('q', '')
    if not query or len(query) < 2:
        return jsonify([])
    
    user = db.session.get(User, session['user_id'])
    
    users = db.session.query(User).filter(
        User.id != user.id,
        User.username.ilike(f'%{query}%') | User.display_name.ilike(f'%{query}%')
    ).limit(10).all()
    
    existing_friend_ids = [f.friend_id for f in db.session.query(Friend).filter_by(user_id=user.id).all()]
    existing_friend_ids.extend([f.user_id for f in db.session.query(Friend).filter_by(friend_id=user.id).all()])
    
    result = []
    for u in users:
        result.append({
            'id': u.id,
            'username': u.username,
            'display_name': u.display_name,
            'avatar_url': u.avatar_url,
            'is_friend': u.id in existing_friend_ids
        })
    
    return jsonify(result)

@app.route('/api/notifications')
@login_required
def get_notifications():
    user_id = session['user_id']
    notifications = []
    
    pending_requests = db.session.query(Friend).filter_by(friend_id=user_id, status='pending').all()
    for req in pending_requests:
        sender = db.session.get(User, req.user_id)
        if sender:
            notifications.append({
                'id': f"fr_{req.id}",
                'type': 'friend_request',
                'title': 'Запрос в друзья',
                'message': f'{sender.display_name or sender.username} хочет добавить вас',
                'action_id': sender.id,
                'read': False
            })
    
    gift_activities = db.session.query(UserActivity).filter_by(user_id=user_id, activity_type='gift_received').order_by(UserActivity.created_at.desc()).limit(10).all()
    for act in gift_activities:
        gift_data = json.loads(act.activity_data) if act.activity_data else {}
        notifications.append({
            'id': f"gift_{act.id}",
            'type': 'gift_received',
            'title': 'Подарок!',
            'message': f'{gift_data.get("from_username", "Друг")} подарил вам {gift_data.get("item_name", "предмет")}',
            'gift_data': gift_data,
            'read': False,
            'created_at': act.created_at.isoformat()
        })
    
    notifications.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify(notifications[:20])

@app.route('/api/notifications/<notif_id>/read', methods=['POST'])
@login_required
def mark_notification_read(notif_id):
    return jsonify({'success': True})

@app.route('/api/user/<int:user_id>')
@login_required
def get_user_profile(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'bio': user.bio,
        'avatar_url': user.avatar_url
    })

BANNERS = {
    'banner_1': {'name': 'Неоновый закат', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/xz.jpg'},
    'banner_2': {'name': 'Космос', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/xz1.jpg'},
    'banner_3': {'name': 'Лесной туман', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/xz2.jpg'},
    'banner_4': {'name': 'Крутой GIF', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/kruto.gif'},
    'banner_5': {'name': 'Дракон', 'price': 300, 'rarity': 'legendary', 'image': '/static/shop/banners/dragon.gif'},
    'banner_6': {'name': 'Крутой 2', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/kruto1.gif'},
    'banner_7': {'name': 'Крутой 3', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/kruto2.gif'},
    'banner_8': {'name': 'Крутой 4', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/kruto3.gif'},
}

@app.route('/api/shop/buy', methods=['POST'])
@login_required
def buy_item():
    data = request.get_json()
    item_id = data.get('item_id')
    
    if item_id not in BANNERS:
        return jsonify({'success': False, 'message': 'Предмет не найден'}), 404
    
    item = BANNERS[item_id]
    user = db.session.get(User, session['user_id'])
    balance = user.get_balance()
    
    if balance < item['price']:
        return jsonify({'success': False, 'message': 'Недостаточно монет'})
    
    existing = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=item_id).first()
    if existing:
        return jsonify({'success': False, 'message': 'Предмет уже куплен'})
    
    add_currency(user.id, -item['price'], f'Покупка: {item["name"]}')
    
    inv = UserInventory(user_id=user.id, item_id=item_id, data=json.dumps({
        'type': 'banner', 
        'name': item['name'],
        'image': item.get('image', ''),
        'rarity': item['rarity']
    }))
    db.session.add(inv)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Покупка совершена', 'new_balance': user.get_balance()})

@app.route('/api/shop/gift', methods=['POST'])
@login_required
def gift_item():
    data = request.get_json()
    item_id = data.get('item_id')
    friend_id = data.get('friend_id')
    
    if item_id not in BANNERS:
        return jsonify({'success': False, 'message': 'Предмет не найден'}), 404
    
    if not friend_id:
        return jsonify({'success': False, 'message': 'Укажите получателя'})
    
    friend = db.session.get(User, friend_id)
    if not friend:
        return jsonify({'success': False, 'message': 'Пользователь не найден'})
    
    item = BANNERS[item_id]
    user = db.session.get(User, session['user_id'])
    balance = user.get_balance()
    
    if balance < item['price']:
        return jsonify({'success': False, 'message': 'Недостаточно монет'})
    
    add_currency(user.id, -item['price'], f'Подарок: {item["name"]} для {friend.username}')
    
    inv = UserInventory(user_id=friend_id, item_id=item_id, data=json.dumps({
        'type': 'banner', 
        'name': item['name'],
        'image': item.get('image', ''),
        'rarity': item['rarity'],
        'from_user': user.username,
        'gifted': True
    }))
    db.session.add(inv)
    
    notif = UserActivity(user_id=friend_id, activity_type='gift_received', activity_data=json.dumps({
        'item_name': item['name'],
        'from_username': user.username
    }))
    db.session.add(notif)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Подарок отправлен', 'new_balance': user.get_balance()})

@app.route('/api/shop/inventory')
@login_required
def get_inventory():
    inventory = db.session.query(UserInventory).filter_by(user_id=session['user_id']).all()
    items = []
    for inv in inventory:
        items.append({
            'id': inv.id,
            'item_id': inv.item_id,
            'data': json.loads(inv.data) if inv.data else {},
            'equipped': inv.equipped
        })
    return jsonify(items)

@app.route('/api/shop/equip/<int:inventory_id>', methods=['POST'])
@login_required
def equip_banner(inventory_id):
    user = db.session.get(User, session['user_id'])
    
    inv = db.session.query(UserInventory).filter_by(id=inventory_id, user_id=user.id).first()
    if not inv:
        return jsonify({'success': False, 'message': 'Предмет не найден'}), 404
    
    db.session.query(UserInventory).filter_by(user_id=user.id).update({'equipped': False})
    inv.equipped = True
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Баннер установлен'})

@app.route('/api/upload/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'Нет файла'}), 400
    
    file = request.files['avatar']
    if not file.filename:
        return jsonify({'success': False, 'message': 'Нет файла'}), 400
    
    import os
    from PIL import Image
    from io import BytesIO
    
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    
    if ext not in allowed_extensions:
        return jsonify({'success': False, 'message': 'Неподдерживаемый формат'}), 400
    
    try:
        img = Image.open(file)
        img = img.convert('RGBA')
        
        size = (256, 256)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        new_img = Image.new('RGBA', size, (0, 0, 0, 0))
        x = (size[0] - img.size[0]) // 2
        y = (size[1] - img.size[1]) // 2
        new_img.paste(img, (x, y))
        
        os.makedirs('static/uploads/avatars', exist_ok=True)
        filename = f"avatar_{session['user_id']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.png"
        filepath = os.path.join('static/uploads/avatars', filename)
        
        buffer = BytesIO()
        new_img.save(buffer, format='PNG')
        buffer.seek(0)
        
        with open(filepath, 'wb') as f:
            f.write(buffer.getvalue())
        
        avatar_url = '/' + filepath
        
        user = db.session.get(User, session['user_id'])
        user.avatar_url = avatar_url
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Аватарка загружена', 'avatar_url': avatar_url})
    
    except Exception as e:
        print(f"Avatar upload error: {e}")
        return jsonify({'success': False, 'message': 'Ошибка загрузки'}), 500

@app.route('/api/shop/active-banner')
@login_required
def get_active_banner():
    inv = db.session.query(UserInventory).filter_by(user_id=session['user_id'], equipped=True).first()
    if inv and inv.data:
        return jsonify(json.loads(inv.data))
    return jsonify(None)

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    for room_code, room in list(rooms.items()):
        for user_id in list(room['users'].keys()):
            if room['users'][user_id]['sid'] == request.sid:
                leave_room(room_code)
                del room['users'][user_id]
                emit('user_left', {'user_id': user_id}, room=room_code)
                if len(room['users']) == 0:
                    del rooms[room_code]
                    if room_code in room_codes:
                        del room_codes[room_code]
                break

@socketio.on('create_room')
def handle_create_room(data):
    user_id = session.get('user_id')
    if not user_id:
        emit('room_error', {'message': 'Не авторизован'})
        return
    
    user = db.session.get(User, user_id)
    if not user:
        emit('room_error', {'message': 'Пользователь не найден'})
        return
    
    room_code = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))
    rooms[room_code] = {
        'host': user_id,
        'users': {},
        'current_track': None,
        'is_playing': False,
        'current_time': 0,
        'playlist': []
    }
    
    rooms[room_code]['users'][user_id] = {
        'sid': request.sid,
        'username': user.display_name or user.username,
        'avatar': user.avatar_url
    }
    
    room_codes[user_id] = room_code
    join_room(room_code)
    
    emit('room_created', {
        'room_code': room_code,
        'room': rooms[room_code]
    })

@socketio.on('join_room')
def handle_join_room(data):
    user_id = session.get('user_id')
    if not user_id:
        emit('room_error', {'message': 'Не авторизован'})
        return
    
    room_code = data.get('room_code', '').upper()
    
    if room_code not in rooms:
        emit('room_error', {'message': 'Комната не найдена'})
        return
    
    user = db.session.get(User, user_id)
    if not user:
        return
    
    rooms[room_code]['users'][user_id] = {
        'sid': request.sid,
        'username': user.display_name or user.username,
        'avatar': user.avatar_url
    }
    
    room_codes[user_id] = room_code
    join_room(room_code)
    
    emit('room_joined', {
        'room_code': room_code,
        'room': rooms[room_code],
        'users_list': [{'id': uid, **u} for uid, u in rooms[room_code]['users'].items()]
    })
    
    emit('user_joined', {
        'user_id': user_id,
        'username': user.display_name or user.username,
        'avatar': user.avatar_url
    }, room=room_code, include_self=False)

@socketio.on('leave_room')
def handle_leave_room(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code in rooms:
        if user_id in rooms[room_code]['users']:
            del rooms[room_code]['users'][user_id]
        
        emit('user_left', {'user_id': user_id}, room=room_code)
        
        if len(rooms[room_code]['users']) == 0:
            del rooms[room_code]
        elif rooms[room_code]['host'] == user_id:
            new_host = list(rooms[room_code]['users'].keys())[0]
            rooms[room_code]['host'] = new_host
            emit('host_changed', {'new_host': new_host}, room=room_code)
    
    leave_room(room_code)
    del room_codes[user_id]
    emit('room_left')

@socketio.on('play_track')
def handle_play_track(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    track = data.get('track')
    current_time = data.get('current_time', 0)
    
    rooms[room_code]['current_track'] = track
    rooms[room_code]['is_playing'] = True
    rooms[room_code]['current_time'] = current_time
    
    emit('track_played', {
        'track': track,
        'current_time': current_time,
        'user_id': user_id
    }, room=room_code, include_self=False)

@socketio.on('pause_track')
def handle_pause_track(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['is_playing'] = False
    rooms[room_code]['current_time'] = current_time
    
    emit('track_paused', {
        'current_time': current_time,
        'user_id': user_id
    }, room=room_code, include_self=False)

@socketio.on('sync_time')
def handle_sync_time(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['current_time'] = current_time
    
    emit('time_synced', {
        'current_time': current_time
    }, room=room_code, include_self=False)

@socketio.on('seek_sync')
def handle_seek_sync(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    current_time = data.get('current_time', 0)
    rooms[room_code]['current_time'] = current_time
    
    emit('seek_synced', {
        'current_time': current_time
    }, room=room_code, include_self=False)

@socketio.on('queue_sync')
def handle_queue_sync(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    room = rooms[room_code]
    if room['host'] != user_id:
        return
    
    queue = data.get('queue', [])
    current_index = data.get('current_index', 0)
    current_track = data.get('current_track')
    
    rooms[room_code]['playlist'] = queue
    rooms[room_code]['current_track'] = current_track
    rooms[room_code]['current_time'] = data.get('current_time', 0)
    rooms[room_code]['is_playing'] = data.get('is_playing', False)
    
    emit('queue_synced', {
        'queue': queue,
        'current_index': current_index,
        'current_track': current_track,
        'current_time': data.get('current_time', 0),
        'is_playing': data.get('is_playing', False)
    }, room=room_code, include_self=False)

@socketio.on('add_to_room_playlist')
def handle_add_to_playlist(data):
    user_id = session.get('user_id')
    if not user_id or user_id not in room_codes:
        return
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return
    
    track = data.get('track')
    if track:
        rooms[room_code]['playlist'].append(track)
        emit('playlist_updated', {
            'playlist': rooms[room_code]['playlist']
        }, room=room_code)

@app.route('/api/room/current')
@login_required
def get_current_room():
    user_id = session['user_id']
    if user_id in room_codes:
        room_code = room_codes[user_id]
        if room_code in rooms:
            room = rooms[room_code]
            return jsonify({
                'in_room': True,
                'room_code': room_code,
                'is_host': room['host'] == user_id,
                'users': [{'id': uid, **u} for uid, u in room['users'].items()],
                'playlist': room.get('playlist', []),
                'current_track': room.get('current_track'),
                'is_playing': room.get('is_playing', False),
                'current_time': room.get('current_time', 0)
            })
    return jsonify({'in_room': False})

@app.route('/api/room/status')
@login_required
def room_status():
    user_id = session['user_id']
    if user_id not in room_codes:
        return jsonify({'in_room': False, 'message': 'Не в комнате'})
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return jsonify({'in_room': False, 'message': 'Комната не найдена'})
    
    room = rooms[room_code]
    return jsonify({
        'in_room': True,
        'room_code': room_code,
        'is_host': room['host'] == user_id,
        'users_count': len(room['users']),
        'playlist_length': len(room.get('playlist', [])),
        'current_track': room.get('current_track'),
        'is_playing': room.get('is_playing', False),
        'current_time': room.get('current_time', 0),
        'queue': room.get('playlist', [])
    })

@app.route('/api/room/sync', methods=['POST'])
@login_required
def sync_room_queue():
    user_id = session['user_id']
    if user_id not in room_codes:
        return jsonify({'error': 'Не в комнате'}), 400
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return jsonify({'error': 'Комната не найдена'}), 404
    
    room = rooms[room_code]
    if room['host'] != user_id:
        return jsonify({'error': 'Только ведущий может синхронизировать'}), 403
    
    data = request.get_json()
    queue = data.get('queue', [])
    current_index = data.get('current_index', 0)
    current_track = data.get('current_track')
    current_time = data.get('current_time', 0)
    is_playing = data.get('is_playing', False)
    
    rooms[room_code]['playlist'] = queue
    rooms[room_code]['current_track'] = current_track
    rooms[room_code]['current_time'] = current_time
    rooms[room_code]['is_playing'] = is_playing
    
    socketio.emit('queue_synced', {
        'queue': queue,
        'current_index': current_index,
        'current_track': current_track,
        'current_time': current_time,
        'is_playing': is_playing
    }, room=room_code)
    
    return jsonify({'success': True})

@app.route('/api/room/poll')
@login_required
def poll_room():
    user_id = session['user_id']
    if user_id not in room_codes:
        return jsonify({'in_room': False})
    
    room_code = room_codes[user_id]
    if room_code not in rooms:
        return jsonify({'in_room': False})
    
    room = rooms[room_code]
    return jsonify({
        'in_room': True,
        'room_code': room_code,
        'current_track': room.get('current_track'),
        'is_playing': room.get('is_playing', False),
        'current_time': room.get('current_time', 0),
        'queue': room.get('playlist', []),
        'is_host': room['host'] == user_id
    })

@app.route('/api/playlist/add', methods=['POST'])
@login_required
def add_playlist_by_link():
    """Добавление плейлиста по ссылке"""
    data = request.get_json()
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'Введите ссылку на плейлист'}), 400
    
    user = db.session.get(User, session['user_id'])
    
    yandex_match = re.search(r'yandex\.ru/(?:music/)?playlists?/([a-zA-Z0-9_-]+)', url)
    vk_match = re.search(r'vk\.com/(?:audios|wall-?\d+.*?album=(\d+))', url)
    
    print(f"DEBUG: URL={url}")
    print(f"DEBUG: user={user}, user.yandex_token={getattr(user, 'yandex_token', None)[:20] + '...' if user and user.yandex_token else None}")
    
    if yandex_match:
        playlist_id = yandex_match.group(1)
        print(f"DEBUG: playlist_id={playlist_id}")
        if not user:
            return jsonify({'error': 'Не авторизован'}), 401
        if not user.yandex_token:
            return jsonify({'error': 'Токен Яндекс.Музыки не настроен. Добавьте токен в профиле.'}), 400
        try:
            client = get_yandex_client(user.yandex_token)
            if not client:
                return jsonify({'error': 'Не удалось подключиться к Яндекс.Музыке'}), 500
            
            playlist_data = None
            if playlist_id.isdigit():
                kind = int(playlist_id)
                playlist_obj = client.users_playlists(kind=kind)
                if playlist_obj:
                    playlist_data = playlist_obj.to_dict()
            else:
                headers = {'Authorization': f'OAuth {user.yandex_token}'}
                api_url = f'https://api.music.yandex.net/playlist/{playlist_id}'
                resp = requests.get(api_url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    result = resp.json()
                    if result and 'playlist' in result:
                        playlist_data = result['playlist']
                    elif result:
                        playlist_data = result
            
            if not playlist_data:
                return jsonify({'error': 'Плейлист не найден или недоступен'}), 404
            
            title = playlist_data.get('title', 'Яндекс Плейлист')
            cover = None
            cover_data = playlist_data.get('cover')
            if cover_data and isinstance(cover_data, dict):
                cover_uri = cover_data.get('uri', '')
                if cover_uri:
                    cover = f"https://{cover_uri.replace('%%', '300x300')}"
            
            new_playlist = Playlist(
                user_id=user.id,
                title=title,
                description='Импортирован из Яндекс.Музыки',
                is_public=False
            )
            db.session.add(new_playlist)
            db.session.commit()
            
            track_count = 0
            tracks_data = playlist_data.get('tracks', [])
            if isinstance(tracks_data, dict):
                tracks_data = tracks_data.get('results', [])
            if not tracks_data:
                tracks_data = playlist_data.get('trackIds', [])
            
            print(f"DEBUG: tracks_data type={type(tracks_data)}, length={len(tracks_data) if tracks_data else 0}")
            
            for track_info in tracks_data:
                try:
                    if isinstance(track_info, dict):
                        track_id = track_info.get('id')
                        if not track_id:
                            continue
                        track_title = track_info.get('title', 'Unknown')
                        track_cover = None
                        if track_info.get('coverUri'):
                            track_cover = f"https://{track_info.get('coverUri').replace('%%', '300x300')}"
                        artists = []
                        for artist in track_info.get('artists', []):
                            if isinstance(artist, dict):
                                artists.append(artist.get('name', 'Unknown'))
                            elif hasattr(artist, 'name'):
                                artists.append(artist.name)
                        
                        pt = PlaylistTrack(
                            playlist_id=new_playlist.id,
                            track_id=f"yandex_{track_id}",
                            track_data=json.dumps({
                                'title': track_title,
                                'artists': artists,
                                'cover_uri': track_cover,
                                'duration': track_info.get('durationMs', 0)
                            })
                        )
                        db.session.add(pt)
                        track_count += 1
                    else:
                        print(f"DEBUG: track_info is not a dict, type={type(track_info)}, value={track_info}")
                except Exception as te:
                    print(f"Track parse error: {te}")
                    continue
            
            db.session.commit()
            
            print(f"DEBUG: Playlist saved - id={new_playlist.id}, title={new_playlist.title}, tracks={track_count}")
            
            return jsonify({
                'success': True,
                'playlist': {
                    'id': f"local_{new_playlist.id}",
                    'title': new_playlist.title,
                    'track_count': track_count,
                    'cover_uri': cover,
                    'service': 'local'
                }
            })
        except Exception as e:
            print(f"Yandex playlist import error: {e}")
            return jsonify({'error': f'Ошибка импорта: {str(e)[:100]}'}), 500
    
    elif vk_match:
        album_id = vk_match.group(1) if vk_match.group(1) else None
        owner_id_match = re.search(r'vk\.com/(?:audios|wall)(-?\d+)', url)
        owner_id = owner_id_match.group(1) if owner_id_match else None
        
        if user and user.vk_token:
            try:
                vk = get_vk_api(user.vk_token)
                if vk:
                    if album_id:
                        audios = vk.call('audio.get', {'owner_id': owner_id, 'album_id': album_id})
                    else:
                        audios = vk.call('audio.get', {'owner_id': owner_id})
                    
                    if 'items' in audios:
                        new_playlist = Playlist(
                            user_id=user.id,
                            title=f'VK Плейлист {owner_id}',
                            description='Импортирован из VK',
                            is_public=False
                        )
                        db.session.add(new_playlist)
                        db.session.commit()
                        
                        for t in audios['items']:
                            pt = PlaylistTrack(
                                playlist_id=new_playlist.id,
                                track_id=f"vk_{t['id']}",
                                track_data=json.dumps({
                                    'title': t['title'],
                                    'artists': [t['artist']],
                                    'cover_uri': t.get('album', {}).get('thumb', {}).get('photo_300'),
                                    'duration': t['duration'] * 1000
                                })
                            )
                            db.session.add(pt)
                        
                        db.session.commit()
                        
                        return jsonify({
                            'success': True,
                            'playlist': {
                                'id': f"local_{new_playlist.id}",
                                'title': new_playlist.title,
                                'track_count': len(audios['items']),
                                'cover_uri': None,
                                'service': 'local'
                            }
                        })
            except Exception as e:
                print(f"VK playlist import error: {e}")
                return jsonify({'error': f'Ошибка импорта: {str(e)[:100]}'}), 500
        return jsonify({'error': 'Токен VK не настроен'}), 400
    
    return jsonify({'error': 'Неподдерживаемый формат ссылки. Используйте ссылку на плейлист Яндекс.Музыки или VK'}), 400

@app.route('/setup.html')
def setup_page():
    return send_file('dist/setup.html')

if __name__ == '__main__':
    print("🚀 Starting iTired server...")
    socketio.run(app, debug=True, host='0.0.0.0', port=5001)
