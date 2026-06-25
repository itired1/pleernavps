from flask import session, request, jsonify, redirect, url_for, render_template, send_file, Response, stream_with_context
import requests
import re
from sqlalchemy import func
from models import db, User, UserCurrency, UserSetting, Friend, UserActivity, ListeningHistory, LikedTrack, UserInventory, ShopItem, Playlist, PlaylistTrack, SavedQueue, BattlePassSeason, BattlePassLevel, UserBattlePass, BattlePassQuest, UserQuest
from utils import send_verification_email, get_yandex_client, get_vk_api, get_vk_audio, Recommender
import bcrypt
import uuid
import os as os_module
from datetime import datetime, timedelta
import json
import random
import string
from functools import wraps
from extensions import socketio, limiter, cache, track_cache, rooms, room_codes, guest_users, guest_id_counter
from helpers import get_cached_track, clear_expired_cache, log_info, log_error, cleanup_old_history, add_currency, generate_captcha, populate_battle_pass_rewards, populate_battle_pass_quests
from app import app
import logging
import time
import threading
from flask import current_app

_migrated = False

def _ensure_bp_migration():
    global _migrated
    if _migrated:
        return
    try:
        from sqlalchemy import text
        db.session.execute(text('ALTER TABLE user_battle_pass ADD COLUMN last_daily_bonus DATE'))
        db.session.commit()
    except:
        pass
    _migrated = True


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
            state = data.get('state', 'iTired Music')
            details = data.get('details', '')
            
            embed = {
                "title": "🎧 Сейчас играет",
                "description": f"**{state}**\n{details}",
                "color": 0x6366f1,
                "footer": {"text": "iTired Music"}
            }
            
            requests.post(user.discord_webhook, json={"embeds": [embed]})
        except Exception:
            logging.warning(f"Failed to send Discord webhook for user {user.id}")
    
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

@app.errorhandler(404)
def error_404(e):
    return render_template('error.html', code=404, title='404', message='Страница не найдена', desc='Запрошенная страница не существует или была перемещена.'), 404

@app.errorhandler(500)
def error_500(e):
    return render_template('error.html', code=500, title='500', message='Ошибка сервера', desc='Что-то пошло не так. Попробуйте позже.'), 500

@app.route('/')
def index():
    saved_url = request.args.get('server_url') or request.headers.get('X-Server-Url')
    if saved_url and saved_url != 'http://localhost:5001':
        return render_template('setup_redirect.html', server_url=saved_url)
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html')

@app.route('/setup')
def setup_page():
    return render_template('setup.html')

@app.route('/login', methods=['GET', 'POST'])
@limiter.limit("5 per minute")
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = db.session.query(User).filter((User.username == username) | (User.email == username)).first()
        
        if not user or not user.check_password(password):
            return render_template('auth.html', mode='login', error='Неверные данные')
        
        user.last_seen = datetime.utcnow()
        db.session.commit()
        
        session.permanent = True
        session['user_id'] = user.id
        return redirect(url_for('index'))
    return render_template('auth.html', mode='login')

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
        db.session.add(UserCurrency(user_id=user.id, balance=1500))
        db.session.add(UserSetting(user_id=user.id))
        db.session.commit()
        add_currency(user.id, 0, f'Бонус за регистрацию: 1500 монет')
        
        session.pop('captcha_num1', None)
        session.pop('captcha_num2', None)
        session.pop('captcha_answer', None)
        
        session['user_id'] = user.id
        return redirect(url_for('index'))
    
    num1, op, num2 = generate_captcha()
    return render_template('auth.html', mode='register',
        captcha_num1=session.get('captcha_num1'), captcha_num2=session.get('captcha_num2'), captcha_op=session.get('captcha_operator'))

@app.route('/api/captcha/refresh')
def refresh_captcha():
    num1, op, num2 = generate_captcha()
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
    yandex_token_valid = None
    yandex_token_error = None
    vk_token_valid = None
    vk_token_error = None
    
    if user and user.yandex_token:
        try:
            client = get_yandex_client(user.yandex_token)
            if client:
                try:
                    acc = client.account_status()
                    yandex_info = {'login': acc.account.login, 'premium': getattr(acc.account, 'premium', False)}
                    yandex_token_valid = True
                except Exception as e:
                    yandex_token_valid = False
                    if 'Unauthorized' in str(e) or '401' in str(e):
                        yandex_token_error = 'Токен недействителен. Получите новый на https://music.yandex.ru/settings'
                    else:
                        yandex_token_error = f'Ошибка: {str(e)[:50]}'
        except Exception:
            yandex_token_valid = False
            yandex_token_error = 'Ошибка проверки токена'
    
    if user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                vk_user = vk.users.get()[0]
                vk_info = {'name': f"{vk_user['first_name']} {vk_user['last_name']}"}
                vk_token_valid = True
            except Exception as e:
                vk_token_valid = False
                if 'Unauthorized' in str(e) or '401' in str(e) or 'access' in str(e).lower():
                    vk_token_error = 'Токен VK недействителен. Получите новый на https://vk.com/dev'
                else:
                    vk_token_error = f'Ошибка VK: {str(e)[:50]}'
    
    if user:
        badge_data = None
        frame_data = None
        if user.equipped_badge:
            inv = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=user.equipped_badge, item_type='badge').first()
            if inv and inv.data:
                badge_data = json.loads(inv.data)
        if user.equipped_frame:
            inv = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=user.equipped_frame, item_type='frame').first()
            if inv and inv.data:
                frame_data = json.loads(inv.data)
        return jsonify({
            'local': {
                'id': user.id,
                'username': user.username,
                'display_name': user.display_name,
                'email': user.email,
                'bio': user.bio,
                'avatar_url': user.avatar_url,
                'yandex_token_set': bool(user.yandex_token),
                'vk_token_set': bool(user.vk_token),
                'soundcloud_client_id_set': bool(user.soundcloud_client_id),
                'discord_client_id': user.discord_client_id or '',
                'current_source': user.current_source or 'yandex',
                'created_at': user.created_at.isoformat(),
                'is_admin': user.is_admin,
                'equipped_badge': user.equipped_badge,
                'equipped_badge_data': badge_data,
                'equipped_frame': user.equipped_frame,
                'equipped_frame_data': frame_data,
                'equipped_theme': user.equipped_theme
            },
            'yandex': yandex_info,
            'vk': vk_info,
            'yandex_token_valid': yandex_token_valid,
            'yandex_token_error': yandex_token_error,
            'vk_token_valid': vk_token_valid,
            'vk_token_error': vk_token_error
        })
    return jsonify({'error': 'User not found'}), 404

@app.route('/api/validate-tokens')
@login_required
def api_validate_tokens():
    user = db.session.get(User, session['user_id'])
    result = {'yandex': {'token_set': bool(user.yandex_token) if user else False, 'valid': None, 'error': None}, 'vk': {'token_set': bool(user.vk_token) if user else False, 'valid': None, 'error': None}, 'soundcloud': {'client_id_set': bool(user.soundcloud_client_id) if user else False}}
    if user and user.yandex_token:
        try:
            client = get_yandex_client(user.yandex_token)
            if client:
                try:
                    client.account_status()
                    result['yandex']['valid'] = True
                except Exception as e:
                    result['yandex']['valid'] = False
                    if 'Unauthorized' in str(e) or '401' in str(e):
                        result['yandex']['error'] = 'Токен Яндекс.Музыки истёк. Обновите в профиле.'
                    else:
                        result['yandex']['error'] = f'Ошибка: {str(e)[:50]}'
        except Exception:
            result['yandex']['valid'] = False
            result['yandex']['error'] = 'Ошибка проверки токена'
    if user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                vk.users.get()[0]
                result['vk']['valid'] = True
            except Exception as e:
                result['vk']['valid'] = False
                if 'Unauthorized' in str(e) or '401' in str(e) or 'access' in str(e).lower():
                    result['vk']['error'] = 'Токен VK истёк. Обновите в профиле.'
                else:
                    result['vk']['error'] = f'Ошибка VK: {str(e)[:50]}'
    return jsonify(result)

@app.route('/api/listen', methods=['POST'])
@login_required
def record_listen():
    data = request.get_json()
    user_id = session['user_id']
    from models import ListeningHistory
    
    track_id = data.get('track_id')
    artist = data.get('artist', '')
    duration = data.get('duration', 0)
    title = data.get('title', '')
    
    print(f"[LISTEN] track_id={track_id}, duration={duration}, title={title}, artist={artist}")
    
    if duration and duration > 0:
        if duration > 3600:
            duration = 180
        if duration < 10:
            duration = 10
    else:
        duration = 0
    
    track_data = json.dumps({'title': title, 'artist': artist}) if title else None
    
    entry = ListeningHistory(
        user_id=user_id,
        track_id=track_id,
        track_data=track_data,
        artist_name=artist,
        duration_seconds=duration or 0
    )
    db.session.add(entry)
    db.session.commit()
    
    add_battle_pass_xp(user_id, max(10, min(300, duration or 0)))
    update_quest_progress(user_id, 'listen_count')
    if duration and duration >= 60:
        update_quest_progress(user_id, 'listen_minutes', amount=max(1, duration // 60))
    
    return jsonify({'success': True})

def add_battle_pass_xp(user_id, xp_amount):
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season or xp_amount <= 0:
        return
    now = datetime.utcnow()
    if now < season.start_date or now > season.end_date:
        return
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        ubp = UserBattlePass(user_id=user_id, season_id=season.id, level=1, xp=0)
        db.session.add(ubp)
    ubp.xp = (ubp.xp or 0) + xp_amount
    max_lvl = season.max_level or 100
    while ubp.level < max_lvl:
        lvl_rec = db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=ubp.level).first()
        if not lvl_rec:
            break
        needed = lvl_rec.xp_required
        if ubp.xp >= needed:
            ubp.xp -= needed
            ubp.level += 1
        else:
            break
    if ubp.xp < 0:
        ubp.xp = 0
    db.session.commit()

@app.route('/api/battle-pass/status')
@login_required
def battle_pass_status():
    _ensure_bp_migration()
    user_id = session['user_id']
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'active': False, 'message': 'Нет активного сезона'})
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        ubp = UserBattlePass(user_id=user_id, season_id=season.id, level=1, xp=0)
        db.session.add(ubp)
        db.session.commit()
    levels = db.session.query(BattlePassLevel).filter_by(season_id=season.id).order_by(BattlePassLevel.level).all()
    now = datetime.utcnow()
    return jsonify({
        'active': True,
        'season': {
            'id': season.id,
            'name': season.name,
            'start_date': season.start_date.isoformat(),
            'end_date': season.end_date.isoformat(),
            'max_level': season.max_level,
            'days_left': max(0, (season.end_date - now).days)
        },
        'user': {
            'level': ubp.level,
            'xp': ubp.xp,
            'xp_to_next': (db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=ubp.level).first().xp_required) if ubp.level < season.max_level else 0,
            'activated': ubp.has_premium,
            'claimed_free': json.loads(ubp.claimed_free or '[]'),
            'daily_bonus_claimed': ubp.last_daily_bonus == now.date() if ubp.last_daily_bonus else False
        },
        'levels': [{
            'level': l.level,
            'xp_required': l.xp_required,
            'free_reward': json.loads(l.free_reward_json) if l.free_reward_json else None
        } for l in levels]
    })

@app.route('/api/battle-pass/claim', methods=['POST'])
@login_required
def battle_pass_claim():
    user_id = session['user_id']
    data = request.get_json()
    level_num = data.get('level')
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'success': False, 'message': 'Нет активного сезона'})
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        return jsonify({'success': False, 'message': 'Нет прогресса'})
    if not ubp.has_premium:
        return jsonify({'success': False, 'message': 'Пропуск не активирован'})
    if ubp.level < level_num:
        return jsonify({'success': False, 'message': 'Уровень ещё не достигнут'})
    lvl = db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=level_num).first()
    if not lvl:
        return jsonify({'success': False, 'message': 'Уровень не найден'})
    claimed = json.loads(ubp.claimed_free or '[]')
    if level_num in claimed:
        lvl = db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=level_num).first()
        if lvl and lvl.free_reward_json:
            reward = json.loads(lvl.free_reward_json)
            item_id = f"bp_{reward['type']}_{level_num}"
            existing_inv = db.session.query(UserInventory).filter_by(user_id=user_id, item_id=item_id).first()
            if not existing_inv:
                inv = UserInventory(
                    user_id=user_id, item_id=item_id, item_type=reward['type'],
                    data=json.dumps({'type': reward['type'], 'name': reward.get('name', f'Уровень {level_num}'), 'image': reward.get('image', ''), 'rarity': 'common'})
                )
                db.session.add(inv)
                db.session.commit()
                return jsonify({'success': True, 'reward': reward, 'restored': True})
        return jsonify({'success': False, 'message': 'Награда уже получена'})
    if not lvl.free_reward_json:
        return jsonify({'success': False, 'message': 'Нет награды на этом уровне'})
    claimed.append(level_num)
    ubp.claimed_free = json.dumps(claimed)
    reward = json.loads(lvl.free_reward_json)
    item_id = f"bp_{reward['type']}_{level_num}"
    existing_inv = db.session.query(UserInventory).filter_by(user_id=user_id, item_id=item_id).first()
    if not existing_inv:
        inv = UserInventory(
            user_id=user_id,
            item_id=item_id,
            item_type=reward['type'],
            data=json.dumps({
                'type': reward['type'],
                'name': reward.get('name', f'Уровень {level_num}'),
                'image': reward.get('image', ''),
                'rarity': 'common'
            })
        )
        db.session.add(inv)
    db.session.commit()
    return jsonify({'success': True, 'reward': reward})

@app.route('/api/battle-pass/activate', methods=['POST'])
@login_required
def battle_pass_activate():
    user_id = session['user_id']
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'success': False, 'message': 'Нет активного сезона'})
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        ubp = UserBattlePass(user_id=user_id, season_id=season.id)
        db.session.add(ubp)
    if ubp.has_premium:
        return jsonify({'success': False, 'message': 'Пропуск уже активирован'})
    ubp.has_premium = True
    db.session.commit()
    return jsonify({'success': True, 'message': 'Сезонный пасс активирован!'})

@app.route('/api/battle-pass/restore-rewards', methods=['POST'])
@login_required
def battle_pass_restore_rewards():
    user_id = session['user_id']
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'success': False, 'message': 'Нет активного сезона'})
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        return jsonify({'success': False, 'message': 'Нет прогресса'})
    claimed = json.loads(ubp.claimed_free or '[]')
    restored = 0
    for level_num in claimed:
        lvl = db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=level_num).first()
        if not lvl or not lvl.free_reward_json:
            continue
        reward = json.loads(lvl.free_reward_json)
        item_id = f"bp_{reward['type']}_{level_num}"
        existing = db.session.query(UserInventory).filter_by(user_id=user_id, item_id=item_id).first()
        if not existing:
            inv = UserInventory(
                user_id=user_id, item_id=item_id, item_type=reward['type'],
                data=json.dumps({'type': reward['type'], 'name': reward.get('name', f'Уровень {level_num}'), 'image': reward.get('image', ''), 'rarity': 'common'})
            )
            db.session.add(inv)
            restored += 1
    db.session.commit()
    return jsonify({'success': True, 'restored': restored, 'message': f'Восстановлено {restored} наград'})

@app.route('/api/battle-pass/quests')
@login_required
def battle_pass_quests():
    user_id = session['user_id']
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'quests': []})
    from datetime import date
    today = date.today()
    quests = db.session.query(BattlePassQuest).filter_by(season_id=season.id, is_active=True).all()
    result = []
    for q in quests:
        uq = db.session.query(UserQuest).filter_by(user_id=user_id, quest_id=q.id).first()
        if not uq:
            if q.type == 'daily':
                uq = UserQuest(user_id=user_id, quest_id=q.id, assigned_date=today)
            elif q.type == 'weekly':
                uq = UserQuest(user_id=user_id, quest_id=q.id, assigned_date=today)
            else:
                continue
            db.session.add(uq)
            db.session.commit()
        elif q.type == 'daily' and uq.assigned_date != today:
            uq.progress = 0
            uq.completed = False
            uq.claimed = False
            uq.assigned_date = today
            db.session.commit()
        elif q.type == 'weekly' and (today - uq.assigned_date).days >= 7:
            uq.progress = 0
            uq.completed = False
            uq.claimed = False
            uq.assigned_date = today
            db.session.commit()
        result.append({
            'id': q.id,
            'type': q.type,
            'description': q.description,
            'xp_reward': q.xp_reward,
            'requirement_type': q.requirement_type,
            'requirement_value': q.requirement_value,
            'progress': uq.progress,
            'completed': uq.completed,
            'claimed': uq.claimed,
        })
    return jsonify({'quests': result})

@app.route('/api/battle-pass/claim-quest', methods=['POST'])
@login_required
def battle_pass_claim_quest():
    user_id = session['user_id']
    data = request.get_json()
    quest_id = data.get('quest_id')
    uq = db.session.query(UserQuest).filter_by(user_id=user_id, quest_id=quest_id).first()
    if not uq or not uq.completed or uq.claimed:
        return jsonify({'success': False, 'message': 'Нельзя получить награду'})
    uq.claimed = True
    add_battle_pass_xp(user_id, uq.quest.xp_reward)
    db.session.commit()
    return jsonify({'success': True, 'xp_added': uq.quest.xp_reward})

def update_quest_progress(user_id, req_type, amount=1):
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return
    from datetime import date
    today = date.today()
    quests = db.session.query(BattlePassQuest).filter_by(season_id=season.id, requirement_type=req_type, is_active=True).all()
    for q in quests:
        uq = db.session.query(UserQuest).filter_by(user_id=user_id, quest_id=q.id).first()
        if not uq:
            continue
        if q.type == 'daily' and uq.assigned_date != today:
            continue
        if q.type == 'weekly' and (today - uq.assigned_date).days >= 7:
            continue
        if uq.completed or uq.claimed:
            continue
        uq.progress = min(uq.progress + amount, q.requirement_value)
        if uq.progress >= q.requirement_value:
            uq.completed = True
    db.session.commit()

@app.route('/api/battle-pass/daily-bonus', methods=['POST'])
@login_required
def battle_pass_daily_bonus():
    _ensure_bp_migration()
    user_id = session['user_id']
    season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'success': False, 'message': 'Нет активного сезона'})
    ubp = db.session.query(UserBattlePass).filter_by(user_id=user_id, season_id=season.id).first()
    if not ubp:
        ubp = UserBattlePass(user_id=user_id, season_id=season.id, level=1, xp=0)
        db.session.add(ubp)
        db.session.flush()
    today = datetime.utcnow().date()
    if ubp.last_daily_bonus == today:
        return jsonify({'success': False, 'message': 'Бонус уже получен сегодня'})
    if ubp.level >= season.max_level:
        return jsonify({'success': False, 'message': 'Максимальный уровень'})
    xp_amount = ubp.level * 100
    ubp.xp = (ubp.xp or 0) + xp_amount
    max_lvl = season.max_level or 100
    while ubp.level < max_lvl:
        lvl_rec = db.session.query(BattlePassLevel).filter_by(season_id=season.id, level=ubp.level).first()
        if not lvl_rec: break
        if ubp.xp >= lvl_rec.xp_required:
            ubp.xp -= lvl_rec.xp_required
            ubp.level += 1
        else: break
    if ubp.xp < 0: ubp.xp = 0
    ubp.last_daily_bonus = today
    db.session.commit()
    return jsonify({'success': True, 'xp_given': xp_amount, 'new_level': ubp.level, 'new_xp': ubp.xp})

@app.route('/api/battle-pass/init-season', methods=['POST'])
def init_battle_pass_season():
    data = request.get_json()
    name = data.get('name', 'Сезон 1')
    max_level = data.get('max_level', 100)
    days = data.get('days', 90)
    now = datetime.utcnow()
    db.session.query(BattlePassSeason).filter_by(is_active=True).update({'is_active': False})
    db.session.commit()
    season = BattlePassSeason(
        name=name, start_date=now, end_date=now + timedelta(days=days),
        max_level=max_level, is_active=True
    )
    db.session.add(season)
    db.session.flush()
    for lvl in range(1, max_level + 1):
        needed = lvl * 100
        bl = BattlePassLevel(season_id=season.id, level=lvl, xp_required=needed)
        db.session.add(bl)
    populate_battle_pass_rewards(season.id, max_level)
    populate_battle_pass_quests(season.id)
    db.session.commit()
    return jsonify({'success': True, 'season_id': season.id, 'name': name, 'max_level': max_level})

@app.route('/api/battle-pass/populate-rewards', methods=['POST'])
def populate_bp_rewards():
    data = request.get_json()
    season_id = data.get('season_id')
    season = db.session.get(BattlePassSeason, season_id) if season_id else db.session.query(BattlePassSeason).filter_by(is_active=True).first()
    if not season:
        return jsonify({'success': False, 'message': 'Сезон не найден'})
    populate_battle_pass_rewards(season.id, season.max_level)
    db.session.commit()
    return jsonify({'success': True, 'message': f'Награды для {season.max_level} уровней добавлены'})

@app.route('/user/<int:user_id>')
@login_required
def public_profile(user_id):
    from models import Playlist, LikedTrack
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    playlists = db.session.query(Playlist).filter_by(user_id=user_id, is_public=True).all()
    liked_count = db.session.query(LikedTrack).filter_by(user_id=user_id).count()
    
    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'bio': user.bio,
        'avatar_url': user.avatar_url,
        'created_at': user.created_at.isoformat(),
        'equipped_badge': user.equipped_badge,
        'playlists': [
            {'id': p.id, 'title': p.title, 'track_count': db.session.query(func.count(PlaylistTrack.id)).filter(PlaylistTrack.playlist_id == p.id).scalar() or 0}
            for p in playlists
        ],
        'liked_count': liked_count
    })

@app.route('/profile', methods=['GET', 'POST'])
@login_required
def profile_page():
    if request.method == 'POST':
        data = request.get_json()
        user = db.session.get(User, session['user_id'])
        
        if not user:
            return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
        
        if 'display_name' in data:
            user.display_name = data['display_name']
        if 'bio' in data:
            user.bio = data['bio']
        if 'avatar_url' in data:
            user.avatar_url = data['avatar_url']
        if 'current_source' in data:
            user.current_source = data['current_source']
            session['active_sources'] = [data['current_source']] if data['current_source'] != 'all' else ['yandex', 'vk', 'soundcloud']
        
        if 'yandex_token' in data and data['yandex_token']:
            print(f"[PROFILE] Saving yandex_token")
            user.yandex_token = data['yandex_token']
            db.session.commit()
            
            # Don't test token - just save
            print(f"[PROFILE] Token saved (no validation)")
            return jsonify({'success': True, 'message': 'Токен Яндекс.Музыки сохранён', 'source': 'yandex'})
        
        if 'vk_token' in data and data['vk_token']:
            print(f"[PROFILE] Saving vk_token")
            user.vk_token = data['vk_token']
            db.session.commit()
            
            # Test if token works
            try:
                vk = get_vk_api(user.vk_token)
                if vk:
                    print(f"[PROFILE] VK token WORKS!")
                    return jsonify({'success': True, 'message': 'Токен VK сохранён', 'source': 'vk'})
                else:
                    print(f"[PROFILE] VK token invalid - vk is None")
            except Exception as e:
                print(f"[PROFILE] VK token error: {e}")
            
            return jsonify({'success': True, 'message': 'Токен VK сохранён', 'source': 'vk'})
        if 'soundcloud_client_id' in data:
            user.soundcloud_client_id = data['soundcloud_client_id'] or None
        if 'discord_client_id' in data:
            user.discord_client_id = data['discord_client_id'] or None
        
        db.session.commit()
        return jsonify({'success': True, 'message': 'Профиль обновлён'})
    return redirect(url_for('index'))

@app.route('/api/home')
@login_required
@limiter.limit("30 per minute")
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
            except Exception as e:
                print(f"[HOME] Yandex likes error: {e}")
    
    if 'vk' in services and user and user.vk_token:
        vk = get_vk_api(user.vk_token)
        if vk:
            try:
                audio = get_vk_audio(user.vk_token)
                if audio:
                    plists = audio.get_albums()
                    total_playlists += len(plists)
                    for p in plists[:10]:
                        result['playlists'].append({
                            'id': f"vk_{p['owner_id']}_{p['id']}",
                            'title': p['title'],
                            'track_count': 0,
                            'cover_uri': None,
                            'service': 'vk'
                        })
            except Exception as e:
                print(f"[HOME] VK playlists error: {e}")
            try:
                audio = get_vk_audio(user.vk_token)
                if audio:
                    vk_tracks = list(audio.get())
                    total_liked += len(vk_tracks)
            except Exception as e:
                print(f"[HOME] VK tracks error: {e}")
    
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
@limiter.limit("30 per minute")
def recommendations():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    recs = Recommender.get_recommendations(user.id if user else None, services)
    return jsonify(recs)

@app.route('/api/radio/stations')
@login_required
def radio_stations():
    user = db.session.get(User, session['user_id'])
    service = request.args.get('service', 'yandex')
    
    if service == 'yandex':
        if not user or not user.yandex_token:
            return jsonify({'error': 'Токен Яндекса не настроен'}), 400
        
        client = get_yandex_client(user.yandex_token)
        if not client:
            return jsonify({'error': 'Ошибка подключения к Яндексу'}), 500
        
        try:
            stations = client.rotor_stations_list()
            result = []
            
            categories = {}
            for item in stations:
                s = getattr(item, 'station', None) or item
                name = getattr(s, 'name', str(s)) or 'Радио'
                station_id = getattr(s, 'id', None)
                
                if station_id is None:
                    continue
                
                cat = 'Радио'
                
                if cat not in categories:
                    categories[cat] = {
                        'name': cat,
                        'icon': 'fa-radio',
                        'stations': []
                    }
                
                station_id_str = f"yandex:{station_id}" if isinstance(station_id, str) else str(station_id)
                
                cover_uri = None
                if hasattr(s, 'cover') and s.cover:
                    cover = getattr(s.cover, 'uri', None)
                    if cover:
                        cover_uri = f"https://{cover.replace('%%', '300x300')}"
                
                categories[cat]['stations'].append({
                    'id': station_id_str,
                    'station_id': station_id_str,
                    'name': name,
                    'description': getattr(s, 'description', '') or '',
                    'cover_uri': cover_uri,
                    'service': 'yandex'
                })
            
            for cat in categories:
                result.append(categories[cat])
            
            return jsonify({
                'service': 'yandex',
                'categories': result
            })
        except Exception as e:
            print(f"Radio stations error: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Сервис не поддерживается'}), 400

@app.route('/api/radio/tracks')
@login_required
def radio_tracks():
    user = db.session.get(User, session['user_id'])
    service = request.args.get('service', 'yandex')
    station_id = request.args.get('station_id', '')
    
    if service == 'yandex':
        if not user or not user.yandex_token:
            return jsonify({'error': 'Токен Яндекса не настроен'}), 400
        
        client = get_yandex_client(user.yandex_token)
        if not client:
            return jsonify({'error': 'Ошибка подключения к Яндексу'}), 500
        
        try:
            if station_id.startswith('yandex:'):
                station_id = station_id.replace('yandex:', '')
            
            tracks_data = client.rotor_station_tracks(station_id, queue=[])
            
            tracks = []
            if tracks_data and hasattr(tracks_data, 'sequence'):
                for item in tracks_data.sequence:
                    track = item.track if hasattr(item, 'track') else item
                    if track:
                        artists = []
                        if hasattr(track, 'artists') and track.artists:
                            artists = [a.name for a in track.artists]
                        elif hasattr(track, 'artist') and track.artist:
                            artists = [track.artist]
                        
                        tracks.append({
                            'id': f"yandex_{track.id}",
                            'title': track.title,
                            'artists': artists,
                            'artist': ', '.join(artists) if artists else 'Неизвестный',
                            'cover_uri': f"https://{track.cover_uri.replace('%%', '300x300')}" if hasattr(track, 'cover_uri') and track.cover_uri else None,
                            'duration': track.duration_ms if hasattr(track, 'duration_ms') else 0,
                            'service': 'yandex'
                        })
            
            return jsonify({
                'tracks': tracks,
                'station_id': station_id,
                'service': 'yandex'
            })
        except Exception as e:
            print(f"Radio tracks error: {e}")
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Сервис не поддерживается'}), 400

@app.route('/api/stats')
@login_required
def stats():
    user = db.session.get(User, session['user_id'])
    services = session.get('active_sources', ['yandex'])
    total_playlists = 0
    total_liked = 0
    total_listening_seconds = db.session.query(db.func.coalesce(db.func.sum(ListeningHistory.duration_seconds), 0)).filter_by(user_id=user.id).scalar() or 0
    
    # Convert to readable format
    hours = total_listening_seconds // 3600
    minutes = (total_listening_seconds % 3600) // 60
    
    if 'yandex' in services and user and user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            try:
                total_playlists = len(client.users_playlists_list())
                total_liked = len(client.users_likes_tracks())
            except Exception as e:
                print(f"[STATS] Yandex error: {e}")
    
    return jsonify({
        'total_playlists': total_playlists,
        'total_liked_tracks': total_liked,
        'total_listening_hours': hours,
        'total_listening_minutes': minutes,
        'total_listening_formatted': f'{hours}ч {minutes}м'
    })

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

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

@app.route('/api/lyrics')
def get_lyrics():
    artist = request.args.get('artist', '')
    title = request.args.get('title', '')
    
    if not artist or not title:
        return jsonify({'lyrics': None, 'synced': False})
    
    # Пробуем LRCLIB (английские + популярные)
    try:
        response = requests.get(
            'https://lrclib.net/api/get',
            params={'artist_name': artist, 'track_name': title},
            timeout=10
        )
        
        if response.ok:
            data = response.json()
            synced = data.get('syncedLyrics') or ''
            plain = data.get('plainLyrics') or ''
            
            if synced or plain:
                return jsonify({
                    'lyrics': synced or plain,
                    'synced': bool(synced),
                    'plain': plain
                })
    except Exception as e:
        print(f"LRCLIB error: {e}")
    
    # Пробуем Genius (русские треки)
    try:
        search_response = requests.get(
            'https://api.genius.com/search',
            params={'q': f'{artist} {title}'},
            headers={'Authorization': 'Bearer ' + os.environ.get('GENIUS_ACCESS_TOKEN', '')},
            timeout=10
        )
        
        if search_response.ok:
            hits = search_response.json().get('response', {}).get('hits', [])
            if hits:
                song_id = hits[0].get('result', {}).get('id')
                
                if song_id:
                    song_response = requests.get(
                        f'https://api.genius.com/songs/{song_id}',
                        headers={'Authorization': 'Bearer ' + os.environ.get('GENIUS_ACCESS_TOKEN', '')},
                        timeout=10
                    )
                    
                    if song_response.ok:
                        path = song_response.json().get('response', {}).get('song', {}).get('path')
                        if path:
                            lyrics_response = requests.get(
                                'https://genius.com' + path,
                                headers={'User-Agent': 'Mozilla/5.0'},
                                timeout=10
                            )
                            
                            if lyrics_response.ok:
                                import re
                                lyrics_text = lyrics_response.text
                                lyrics_match = re.search(r'<div[^>]*data-lyrics-container[^>]*>(.*?)</div>', lyrics_text, re.DOTALL)
                                if lyrics_match:
                                    lyrics_html = lyrics_match.group(1)
                                    lyrics_clean = re.sub(r'<[^>]+>', '\n', lyrics_html)
                                    lyrics_clean = re.sub(r'\n+', '\n', lyrics_clean).strip()
                                    
                                    return jsonify({
                                        'lyrics': lyrics_clean,
                                        'synced': False,
                                        'plain': lyrics_clean
                                    })
    except Exception as e:
        print(f"Genius error: {e}")
    
    return jsonify({'lyrics': None, 'synced': False})

@app.route('/api/search')
@login_required
@limiter.limit("60 per minute")
def search():
    q = request.args.get('q', '')
    services = request.args.getlist('services') or session.get('active_sources', ['yandex', 'vk', 'soundcloud'])
    
    if not q:
        return jsonify({'tracks': []})
    
    result = {'tracks': []}
    user_id = session.get('user_id')
    user = db.session.get(User, user_id) if user_id else None
    
    print(f"[SEARCH] user_id={user_id}, user_exists={user is not None}, yandex_token_set={bool(user and user.yandex_token)}")
    
    if not user:
        print(f"[SEARCH] No user found for session!")
        return jsonify({'tracks': [], 'error': 'Not logged in'})
    
    if 'soundcloud' in services:
        from utils import soundcloud_search
        try:
            sc_tracks = soundcloud_search(q, limit=15)
            result['tracks'].extend(sc_tracks)
        except Exception as e:
            print(f"SoundCloud search error: {e}")
    
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
        try:
            audio = get_vk_audio(user.vk_token)
            if audio:
                search_res = list(audio.search(q=q, count=15))
                for t in search_res:
                    artists_list = [t.get('artist', '')] if t.get('artist') else []
                    covers = t.get('track_covers', [])
                    result['tracks'].append({
                        'id': f"vk_{t['owner_id']}_{t['id']}",
                        'title': t['title'],
                        'artists': artists_list,
                        'duration': t['duration'] * 1000,
                        'cover_uri': covers[0] if covers else None,
                        'service': 'vk'
                    })
        except Exception:
            pass
    
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
                audio = get_vk_audio(user.vk_token)
                if audio:
                    plists = audio.get_albums()
                    for p in plists:
                        result.append({
                            'id': f"vk_{p['owner_id']}_{p['id']}",
                            'title': p['title'],
                            'track_count': 0,
                            'cover_uri': None,
                            'service': 'vk'
                        })
            except Exception:
                pass
    
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
    update_quest_progress(session['user_id'], 'playlists_created')
    
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
                track_ids = []
                for item in liked.tracks:
                    track = item.track if hasattr(item, 'track') and item.track else item
                    if track and hasattr(track, 'id') and track.id:
                        track_ids.append(str(track.id))
                
                random.shuffle(track_ids)
                track_ids = track_ids[:11]
                
                batch_size = 50
                for i in range(0, len(track_ids), batch_size):
                    batch = track_ids[i:i+batch_size]
                    try:
                        full_tracks = client.tracks(batch)
                        for t in full_tracks:
                            if not t:
                                continue
                            
                            artists = []
                            if hasattr(t, 'artists') and t.artists:
                                for a in t.artists:
                                    if hasattr(a, 'name'):
                                        artists.append(a.name)
                                    else:
                                        artists.append(str(a))
                            
                            cover = None
                            if hasattr(t, 'cover_uri') and t.cover_uri:
                                cover = f"https://{t.cover_uri.replace('%%', '300x300')}"
                            
                            tracks.append({
                                'id': f"yandex_{t.id}",
                                'title': t.title if hasattr(t, 'title') else 'Unknown',
                                'artists': artists,
                                'artist': ', '.join(artists) if artists else '',
                                'duration': t.duration_ms if hasattr(t, 'duration_ms') else 0,
                                'cover_uri': cover,
                                'service': 'yandex'
                            })
                    except Exception as te:
                        print(f"Batch error: {te}")
                        continue
            else:
                return jsonify({'tracks': [], 'message': 'Лайкнутые треки пусты'})
        except Exception as e:
            print(f"Liked tracks error: {e}")
            return jsonify({'error': str(e), 'tracks': []})
    
    elif source == 'vk' and user and user.vk_token:
        try:
            audio = get_vk_audio(user.vk_token)
            if audio:
                audio_list = list(audio.get())
                random.shuffle(audio_list)
                for t in audio_list[:11]:
                    vk_artist = t.get('artist', '') or ''
                    covers = t.get('track_covers', [])
                    tracks.append({
                        'id': f"vk_{t['owner_id']}_{t['id']}",
                        'title': t['title'],
                        'artists': [vk_artist] if vk_artist else [],
                        'artist': vk_artist,
                        'duration': t['duration'] * 1000,
                        'cover_uri': covers[0] if covers else None,
                        'service': 'vk'
                    })
        except Exception:
            favorites = db.session.query(LikedTrack).filter_by(user_id=user.id).filter(
                LikedTrack.track_id.like('vk_%')
            ).order_by(LikedTrack.liked_at.desc()).all()
            random.shuffle(favorites)
            for f in favorites[:11]:
                if f.track_data:
                    data = json.loads(f.track_data)
                    data['id'] = f.track_id
                    tracks.append(data)
    
    elif source == 'soundcloud':
        favorites = db.session.query(LikedTrack).filter_by(user_id=user.id).filter(
            LikedTrack.track_id.like('sc_%')
        ).order_by(LikedTrack.liked_at.desc()).all()
        random.shuffle(favorites)
        for f in favorites[:11]:
            if f.track_data:
                data = json.loads(f.track_data)
                data['id'] = f.track_id
                tracks.append(data)
    
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
        update_quest_progress(user_id, 'like_tracks')
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

@app.route('/api/queue/save', methods=['POST'])
@login_required
def save_queue():
    data = request.get_json()
    tracks = data.get('tracks', [])
    name = data.get('name', 'Очередь')
    
    saved_queue = SavedQueue(
        user_id=session['user_id'],
        name=name,
        tracks_data=json.dumps(tracks)
    )
    db.session.add(saved_queue)
    db.session.commit()
    
    return jsonify({'success': True, 'queue_id': saved_queue.id})

@app.route('/api/queue/saved')
@login_required
def get_saved_queues():
    queues = db.session.query(SavedQueue).filter_by(user_id=session['user_id']).order_by(SavedQueue.updated_at.desc()).all()
    result = []
    for q in queues:
        tracks = json.loads(q.tracks_data) if q.tracks_data else []
        result.append({
            'id': q.id,
            'name': q.name,
            'track_count': len(tracks),
            'created_at': q.created_at.isoformat() if q.created_at else None,
            'updated_at': q.updated_at.isoformat() if q.updated_at else None
        })
    return jsonify(result)

@app.route('/api/queue/saved/<int:queue_id>')
@login_required
def get_saved_queue(queue_id):
    queue = db.session.get(SavedQueue, queue_id)
    if not queue or queue.user_id != session['user_id']:
        return jsonify({'error': 'Очередь не найдена'}), 404
    
    tracks = json.loads(queue.tracks_data) if queue.tracks_data else []
    return jsonify({
        'id': queue.id,
        'name': queue.name,
        'tracks': tracks
    })

@app.route('/api/queue/saved/<int:queue_id>', methods=['DELETE'])
@login_required
def delete_saved_queue(queue_id):
    queue = db.session.get(SavedQueue, queue_id)
    if not queue or queue.user_id != session['user_id']:
        return jsonify({'error': 'Очередь не найдена'}), 404
    
    db.session.delete(queue)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/playlists/<playlist_id>/tracks')
@login_required
def playlist_tracks(playlist_id):
    user = db.session.get(User, session['user_id'])
    tracks = []
    
    if playlist_id.startswith('yandex_'):
        if user and user.yandex_token:
            try:
                kind = int(playlist_id.replace('yandex_', ''))
                client = get_yandex_client(user.yandex_token)
                
                if not client:
                    return jsonify([])
                
                try:
                    headers = {'Authorization': f'OAuth {user.yandex_token}'}
                    uid = user.yandex_uid
                    
                    if not uid:
                        resp = requests.get('https://api.music.yandex.net/account/status', headers=headers, timeout=10)
                        if resp.status_code == 200:
                            uid = resp.json().get('result', {}).get('account', {}).get('uid')
                    
                    if not uid:
                        return jsonify([])
                    
                    api_url = f'https://api.music.yandex.net/users/{uid}/playlists/{kind}'
                    resp = requests.get(api_url, headers=headers, timeout=15)
                    
                    if resp.status_code != 200:
                        return jsonify([])
                    
                    playlist_data = resp.json().get('result', {})
                    playlist_tracks = playlist_data.get('tracks', [])
                    
                    if not playlist_tracks:
                        return jsonify([])
                    
                    track_ids = [str(t.get('id', '')) for t in playlist_tracks if t.get('id')]
                    track_ids = [tid for tid in track_ids if tid]
                    
                    batch_size = 50
                    for i in range(0, len(track_ids), batch_size):
                        batch = track_ids[i:i+batch_size]
                        try:
                            full_tracks = client.tracks(batch)
                            
                            for t in full_tracks:
                                if not t:
                                    continue
                                artists = []
                                if hasattr(t, 'artists') and t.artists:
                                    for a in t.artists:
                                        if hasattr(a, 'name'):
                                            artists.append(a.name)
                                        else:
                                            artists.append(str(a))
                                
                                cover = None
                                if hasattr(t, 'cover_uri') and t.cover_uri:
                                    cover = f"https://{t.cover_uri.replace('%%', '300x300')}"
                                
                                tracks.append({
                                    'id': f"yandex_{t.id}",
                                    'title': t.title if hasattr(t, 'title') else 'Unknown',
                                    'artists': artists,
                                    'artist': ', '.join(artists) if artists else '',
                                    'duration': t.duration_ms if hasattr(t, 'duration_ms') else 0,
                                    'cover_uri': cover,
                                    'service': 'yandex'
                                })
                        except Exception as te:
                            print(f"Batch error: {te}")
                            continue
                    
                    return jsonify(tracks)
                    
                except Exception as e:
                    print(f"Error getting playlist tracks: {e}")
                    import traceback
                    traceback.print_exc()
                    return jsonify([])
                
            except Exception as e:
                print(f"Playlist error: {e}")
                return jsonify([])
    
    elif playlist_id.startswith('vk_'):
        if user and user.vk_token:
            try:
                audio = get_vk_audio(user.vk_token)
                if audio:
                    parts = playlist_id.replace('vk_', '').split('_')
                    if len(parts) >= 2:
                        owner_id = int(parts[0])
                        playlist_id_vk = int(parts[1])
                        audio_list = audio.get(owner_id=owner_id, album_id=playlist_id_vk)
                    else:
                        owner_id = int(parts[0])
                        audio_list = audio.get(owner_id=owner_id)
                    
                    for t in audio_list:
                        vk_artist = t.get('artist', '') or ''
                        covers = t.get('track_covers', [])
                        tracks.append({
                            'id': f"vk_{t['owner_id']}_{t['id']}",
                            'title': t['title'],
                            'artists': [vk_artist] if vk_artist else [],
                            'artist': vk_artist,
                            'duration': t['duration'] * 1000,
                            'cover_uri': covers[0] if covers else None,
                            'service': 'vk'
                        })
            except Exception:
                pass
    
    elif playlist_id.startswith('local_'):
        local_id = int(playlist_id.replace('local_', ''))
        pts = db.session.query(PlaylistTrack).filter_by(playlist_id=local_id).all()
        for pt in pts:
            if pt.track_data:
                data = json.loads(pt.track_data)
                data['id'] = pt.track_id
                tracks.append(data)
    
    return jsonify(tracks)

@app.route('/api/playlists/<playlist_id>/delete', methods=['POST'])
@login_required
def delete_playlist(playlist_id):
    if playlist_id.startswith('local_'):
        local_id = int(playlist_id.replace('local_', ''))
        playlist = db.session.get(Playlist, local_id)
        if playlist and playlist.user_id == session['user_id']:
            PlaylistTrack.query.filter_by(playlist_id=local_id).delete()
            db.session.delete(playlist)
            db.session.commit()
            return jsonify({'success': True})
        return jsonify({'success': False, 'error': 'Недостаточно прав'}), 403
    
    return jsonify({'success': False, 'error': 'Удалить можно только локальные плейлисты'}), 400

@app.route('/api/playlists/<playlist_id>/tracks', methods=['POST'])
@login_required
def add_track_to_playlist(playlist_id):
    data = request.get_json()
    track = data.get('track')
    
    if not track:
        return jsonify({'success': False, 'error': 'Трек не указан'}), 400
    
    if playlist_id.startswith('local_'):
        local_id = int(playlist_id.replace('local_', ''))
        playlist = db.session.get(Playlist, local_id)
        if not playlist or playlist.user_id != session['user_id']:
            return jsonify({'success': False, 'error': 'Плейлист не найден'}), 404
        
        existing = db.session.query(PlaylistTrack).filter_by(
            playlist_id=local_id, 
            track_id=track.get('id', track.get('track_id', ''))
        ).first()
        
        if existing:
            return jsonify({'success': True, 'message': 'Трек уже в плейлисте'})
        
        pt = PlaylistTrack(
            playlist_id=local_id,
            track_id=track.get('id', track.get('track_id', '')),
            track_data=json.dumps(track)
        )
        db.session.add(pt)
        db.session.commit()
        return jsonify({'success': True})
    
    if playlist_id.startswith('yandex_'):
        user = db.session.get(User, session['user_id'])
        if not user or not user.yandex_token:
            return jsonify({'success': False, 'error': 'Токен Яндекса не настроен'}), 400
        
        from utils import get_yandex_client
        client = get_yandex_client(user.yandex_token)
        if not client:
            return jsonify({'success': False, 'error': 'Ошибка подключения к Яндексу'}), 500
        
        try:
            kind = int(playlist_id.replace('yandex_', ''))
            track_id = track.get('id', track.get('track_id', '')).replace('yandex_', '')
            client.users_playlists_insert_track(kind=kind, track_id=track_id)
            return jsonify({'success': True, 'message': 'Добавлено в Яндекс.Плейлист'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    return jsonify({'success': False, 'error': 'Неподдерживаемый тип плейлиста'}), 400

@app.route('/api/play_track/<track_id>')
@login_required
@limiter.limit("120 per minute")
def play_track(track_id):
    user = db.session.get(User, session['user_id'])
    
    if not user:
        return jsonify({'error': 'Пользователь не найден'}), 401
    
    if track_id.startswith('yandex_'):
        if user and user.yandex_token:
            result = get_cached_track(track_id, user.yandex_token)
            
            if result.get('error'):
                return jsonify(result), 404 if result.get('code') == 'NOT_FOUND' else 500
            
            return jsonify(result)
        else:
            return jsonify({'error': 'Токен Яндекс.Музыки не настроен', 'code': 'NO_TOKEN'}), 400
    
    elif track_id.startswith('vk_'):
        result = get_cached_track(track_id, user.vk_token if user else None)
        
        if result.get('error'):
            return jsonify(result), 404 if result.get('code') == 'NOT_FOUND' else 500
        
        return jsonify(result)
    
    elif track_id.startswith('sc_'):
        from utils import soundcloud_get_url
        
        track_info = soundcloud_get_url(track_id)
        
        if not track_info:
            return jsonify({'error': 'SoundCloud недоступен. Проверьте Client ID и прокси.'}), 500
        
        stream_url = track_info.get('url', '')
        
        return jsonify({
            'url': f'/api/stream/sc/{track_id}',
            'title': track_info.get('title'),
            'artist': track_info.get('artist'),
            'service': 'soundcloud',
            'stream_url': stream_url
        })
    
    elif track_id.startswith('dz_'):
        dz_id = track_id.replace('dz_', '')
        
        url = f'https://api.deezer.com/track/{dz_id}'
        resp = requests.get(url, timeout=10)
        
        if resp.status_code == 200:
            track = resp.json()
            return jsonify({
                'url': track.get('preview', ''),
                'title': track.get('title', ''),
                'artist': track.get('artist', {}).get('name', ''),
                'cover': track.get('album', {}).get('cover_medium', ''),
                'service': 'deezer',
                'duration': track.get('duration', 0) * 1000
            })
        return jsonify({'error': 'Трек не найден'}), 404
    
    elif track_id.startswith('yt_'):
        video_id = track_id.replace('yt_', '')
        
        try:
            yt_url = f'https://yewtu.be/api/v1/videos/{video_id}'
            resp = requests.get(yt_url, timeout=15)
            
            if resp.status_code == 200:
                data = resp.json()
                return jsonify({
                    'url': data.get('adaptive_formats', [{}])[0].get('url', ''),
                    'title': data.get('title', ''),
                    'artist': data.get('artist', ''),
                    'service': 'youtube'
                })
        except Exception as e:
            print(f"YouTube error: {e}")
        
        return jsonify({'error': 'YouTube недоступен'}), 500
    
    return jsonify({'error': 'Трек не найден', 'code': 'NOT_FOUND'}), 404

_device_auth_store = {}

@app.route('/api/yandex/device-auth/start', methods=['POST'])
@login_required
def yandex_device_auth_start():
    from yandex_music import Client
    client = Client()
    try:
        dc = client.request_device_code()
        device_id = str(uuid.uuid4())
        _device_auth_store[device_id] = {
            'device_code': dc.device_code,
            'expires_at': time.time() + dc.expires_in,
            'poll_interval': dc.interval or 5
        }
        return jsonify({
            'success': True,
            'device_id': device_id,
            'verification_url': dc.verification_url,
            'user_code': dc.user_code,
            'expires_in': dc.expires_in
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/yandex/device-auth/poll', methods=['POST'])
@login_required
def yandex_device_auth_poll():
    data = request.get_json() or {}
    device_id = data.get('device_id')
    if not device_id or device_id not in _device_auth_store:
        return jsonify({'success': False, 'error': 'Invalid device_id'}), 400
    entry = _device_auth_store[device_id]
    if time.time() > entry['expires_at']:
        del _device_auth_store[device_id]
        return jsonify({'success': False, 'error': 'Code expired', 'code': 'EXPIRED'})
    from yandex_music import Client
    from yandex_music import exceptions as ym_exc
    client = Client()
    try:
        token = client.poll_device_token(entry['device_code'])
        del _device_auth_store[device_id]
        user = db.session.get(User, session['user_id'])
        if user:
            user.yandex_token = token.access_token
            db.session.commit()
        return jsonify({'success': True, 'token': token.access_token, 'refresh_token': token.refresh_token, 'expires_in': token.expires_in})
    except ym_exc.UnauthorizedError:
        return jsonify({'success': False, 'error': 'Waiting for authorization', 'code': 'PENDING'})
    except ym_exc.DeviceAuthError:
        return jsonify({'success': False, 'error': 'Waiting for authorization', 'code': 'PENDING'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/soundcloud/discover-client-id', methods=['POST'])
@login_required
def discover_sc_client_id():
    data = request.get_json()
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'success': False, 'message': 'Введите URL профиля SoundCloud'})

    if not url.startswith('https://soundcloud.com/'):
        return jsonify({'success': False, 'message': 'URL должен начинаться с https://soundcloud.com/'})

    try:
        resp = requests.get(url, timeout=15, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        if resp.status_code != 200:
            return jsonify({'success': False, 'message': f'Страница вернула код {resp.status_code}'})

        html = resp.text
        
        patterns = [
            r'client_id["\']?\s*[:=]\s*["\']([a-zA-Z0-9_\-]{10,64})["\']',
            r'"clientId"\s*:\s*"([a-zA-Z0-9_\-]{10,64})"',
            r'client_id=([a-zA-Z0-9_\-]{10,64})',
        ]
        
        found_id = None
        for p in patterns:
            m = re.search(p, html)
            if m:
                found_id = m.group(1)
                break

        if not found_id:
            scripts = re.findall(r'<script[^>]*src=["\']([^"\']+\.js[^"\']*)["\']', html)
            for script_url in scripts[:5]:
                try:
                    js_resp = requests.get(script_url if script_url.startswith('http') else f'https:{script_url}', timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
                    m = re.search(r'client_id["\']?\s*[:=]\s*["\']([a-zA-Z0-9_\-]{10,64})["\']', js_resp.text)
                    if m:
                        found_id = m.group(1)
                        break
                except:
                    continue

        if not found_id:
            return jsonify({'success': False, 'message': 'Не удалось найти client_id на странице. Попробуйте вручную через DevTools.'})

        test = requests.get(
            f'https://api-v2.soundcloud.com/search/tracks?q=test&limit=1&client_id={found_id}',
            timeout=10,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        if test.status_code != 200:
            return jsonify({
                'success': False,
                'message': f'Найден client_id, но API вернул ошибку {test.status_code}. Возможно, ключ устарел.',
                'client_id': found_id
            })

        user = db.session.get(User, session['user_id'])
        if user:
            user.soundcloud_client_id = found_id
            db.session.commit()

        return jsonify({'success': True, 'client_id': found_id, 'message': 'Client ID найден и сохранён!'})

    except requests.exceptions.Timeout:
        return jsonify({'success': False, 'message': 'Таймаут при загрузке страницы SoundCloud'})
    except requests.exceptions.ConnectionError:
        return jsonify({'success': False, 'message': 'Ошибка соединения. Возможно, SoundCloud заблокирован.'})
    except Exception as e:
        return jsonify({'success': False, 'message': f'Ошибка: {str(e)}'})

@app.route('/api/similar', methods=['POST'])
@login_required
def similar_tracks():
    data = request.get_json()
    track_id = (data.get('track_id') or '').strip()
    service = (data.get('service') or '').strip().lower()

    if not track_id or not service:
        return jsonify({'tracks': []})

    user = db.session.get(User, session['user_id'])
    result = []

    try:
        if service == 'yandex' and user and user.yandex_token:
            client = get_yandex_client(user.yandex_token)
            if client:
                yandex_id = track_id.replace('yandex_', '')
                try:
                    similar = client.tracks_similar(int(yandex_id))
                    if similar:
                        for track in (similar.similar_tracks if hasattr(similar, 'similar_tracks') else similar)[:5]:
                            t = track.track if hasattr(track, 'track') else track
                            if t and hasattr(t, 'id'):
                                result.append({
                                    'id': f"yandex_{t.id}",
                                    'title': t.title,
                                    'artist': ', '.join(a.name for a in t.artists) if hasattr(t, 'artists') and t.artists else '',
                                    'artists': [a.name for a in t.artists] if hasattr(t, 'artists') and t.artists else [],
                                    'duration': t.duration_ms,
                                    'cover_uri': f"https://{t.cover_uri.replace('%%', '300x300')}" if hasattr(t, 'cover_uri') and t.cover_uri else '',
                                    'service': 'yandex'
                                })
                except Exception as e:
                    print(f"Yandex similar error: {e}")

        elif service == 'vk' and user and user.vk_token:
            vk_audio = get_vk_audio(user.vk_token)
            if vk_audio:
                parts = track_id.replace('vk_', '').split('_')
                if len(parts) >= 2:
                    try:
                        owner_id, audio_id = int(parts[0]), int(parts[1])
                        similar = vk_audio.get_recommendations(owner_id, audio_id)
                        for track in similar[:5]:
                            if hasattr(track, 'id'):
                                result.append({
                                    'id': f"vk_{track.owner_id}_{track.id}",
                                    'title': track.title,
                                    'artist': track.artist,
                                    'artists': [track.artist],
                                    'duration': track.duration * 1000,
                                    'cover_uri': track.track_covers[0] if hasattr(track, 'track_covers') and track.track_covers else '',
                                    'service': 'vk'
                                })
                    except Exception as e:
                        print(f"VK similar error: {e}")

        elif service == 'soundcloud' and user and user.soundcloud_client_id:
            sc_id = track_id.replace('sc_', '')
            try:
                url = f'https://api-v2.soundcloud.com/tracks/{sc_id}/related?client_id={user.soundcloud_client_id}'
                resp = requests.get(url, timeout=15, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                if resp.status_code == 200:
                    related = resp.json().get('collection', [])
                    for track in related[:5]:
                        if isinstance(track, dict) and track.get('kind') == 'track':
                            result.append({
                                'id': f"sc_{track['id']}",
                                'title': track.get('title', ''),
                                'artist': track.get('user', {}).get('username', ''),
                                'artists': [track.get('user', {}).get('username', '')],
                                'duration': track.get('duration', 0),
                                'cover_uri': (track.get('artwork_url') or '').replace('-large', '-t500x500'),
                                'service': 'soundcloud'
                            })
            except Exception as e:
                print(f"SC similar error: {e}")

    except Exception as e:
        print(f"Similar tracks error: {e}")

    return jsonify({'tracks': result})

@app.route('/api/find-cross-service', methods=['POST'])
@login_required
def find_cross_service():
    data = request.get_json()
    artist = (data.get('artist') or '').strip()
    title = (data.get('title') or '').strip()
    from_service = (data.get('from_service') or '').strip().lower()
    to_service = (data.get('to_service') or 'soundcloud').strip().lower()

    if not title:
        return jsonify({'found': False})

    query = f"{artist} {title}" if artist else title
    query_clean = re.sub(r'[\(\[].*?[\)\]]', '', query).strip()

    user = db.session.get(User, session['user_id'])
    result = None

    if to_service == 'soundcloud' and user and user.soundcloud_client_id:
        try:
            from utils import soundcloud_search
            tracks = soundcloud_search(query_clean, limit=5)
            if tracks and len(tracks) > 0:
                result = tracks[0]
        except Exception as e:
            print(f"Cross-service SC search error: {e}")

    return jsonify({'found': bool(result), 'track': result})

@app.route('/api/artist-tracks', methods=['POST'])
@login_required
def artist_tracks():
    data = request.get_json()
    artist = (data.get('artist') or '').strip()
    if not artist:
        return jsonify({'tracks': []})

    user = db.session.get(User, session['user_id'])
    all_tracks = []

    if user and user.yandex_token:
        try:
            from utils import get_yandex_client
            client = get_yandex_client(user.yandex_token)
            if client:
                search = client.search(artist, type_='track', page=0)
                if search and search.tracks:
                    for t in search.tracks[:5]:
                        all_tracks.append({
                            'id': f"yandex_{t.id}",
                            'title': t.title,
                            'artist': ', '.join(a.name for a in t.artists) if t.artists else artist,
                            'artists': [a.name for a in t.artists] if t.artists else [artist],
                            'duration': t.duration_ms,
                            'cover_uri': f"https://{t.cover_uri.replace('%%', '300x300')}" if t.cover_uri else '',
                            'service': 'yandex'
                        })
        except Exception as e:
            print(f"Yandex artist search error: {e}")

    if user and user.vk_token:
        try:
            from utils import get_vk_audio
            vk_audio = get_vk_audio(user.vk_token)
            if vk_audio:
                vk_tracks = vk_audio.search(q=artist, count=5)
                for track in vk_tracks:
                    if isinstance(track, dict):
                        all_tracks.append({
                            'id': f"vk_{track['owner_id']}_{track['id']}",
                            'title': track.get('title', ''),
                            'artist': track.get('artist', ''),
                            'artists': [track.get('artist', '')],
                            'duration': track.get('duration', 0) * 1000,
                            'cover_uri': (track.get('track_covers') or [''])[0] or '',
                            'service': 'vk'
                        })
        except Exception as e:
            print(f"VK artist search error: {e}")

    if user and user.soundcloud_client_id:
        try:
            from utils import soundcloud_search
            sc_tracks = soundcloud_search(artist, limit=5)
            if sc_tracks:
                for t in sc_tracks:
                    t['artists'] = [t.get('artist', '')]
                    all_tracks.append(t)
        except Exception as e:
            print(f"SC artist search error: {e}")

    return jsonify({'tracks': all_tracks, 'artist': artist})

@app.route('/api/stream/sc/<track_id>')
@login_required
def stream_soundcloud(track_id):
    from utils import soundcloud_get_url
    
    track_info = soundcloud_get_url(track_id)
    if not track_info or not track_info.get('url'):
        return jsonify({'error': 'SoundCloud не настроен. Введите Client ID в профиле.'}), 500
    
    stream_url = track_info['url']
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://soundcloud.com/',
            'Origin': 'http://localhost:5001'
        }
        
        req = requests.get(stream_url, headers=headers, stream=True, timeout=60)
        
        def generate():
            try:
                for chunk in req.iter_content(chunk_size=32768):
                    if chunk:
                        yield chunk
            except Exception as e:
                print(f"Stream generate error: {e}")
        
        return Response(
            stream_with_context(generate()),
            status=req.status_code,
            headers={
                'Content-Type': req.headers.get('Content-Type', 'audio/mpeg'),
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Cache-Control': 'no-cache'
            }
        )
    except Exception as e:
        print(f"Stream error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/friends')
@login_required
def get_friends():
    user_id = session['user_id']
    rows = db.session.query(Friend).filter(
        (Friend.user_id == user_id) | (Friend.friend_id == user_id)
    ).all()
    result = []
    for f in rows:
        is_outgoing = f.user_id == user_id
        friend_id = f.friend_id if is_outgoing else f.user_id
        friend_user = db.session.get(User, friend_id)
        if friend_user:
            result.append({
                'id': f.id,
                'friend_id': friend_id,
                'username': friend_user.username,
                'display_name': friend_user.display_name or friend_user.username,
                'avatar_url': friend_user.avatar_url,
                'status': f.status,
                'direction': 'outgoing' if is_outgoing else 'incoming',
                'taste_match': getattr(f, 'taste_match', 0) or 0
            })
    return jsonify(result)

@app.route('/api/friends/add/<int:user_id>', methods=['POST'])
@login_required
def send_friend_request(user_id):
    current_user = db.session.get(User, session['user_id'])
    target = db.session.get(User, user_id)
    if not target:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    if current_user.id == target.id:
        return jsonify({'success': False, 'message': 'Нельзя добавить себя'}), 400
    existing = db.session.query(Friend).filter(
        ((Friend.user_id == current_user.id) & (Friend.friend_id == target.id)) |
        ((Friend.user_id == target.id) & (Friend.friend_id == current_user.id))
    ).first()
    if existing:
        if existing.status == 'accepted':
            return jsonify({'success': False, 'message': 'Уже в друзьях'}), 400
        return jsonify({'success': False, 'message': 'Запрос уже отправлен'}), 400
    friend = Friend(user_id=current_user.id, friend_id=target.id, status='pending')
    db.session.add(friend)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Запрос отправлен'})

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

@app.route('/api/friends/clear', methods=['POST'])
@login_required
def clear_all_friends():
    user_id = session['user_id']
    db.session.query(Friend).filter(
        (Friend.user_id == user_id) | (Friend.friend_id == user_id)
    ).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Все друзья удалены'})

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
    
    existing_friend_ids = [f.friend_id for f in db.session.query(Friend).filter_by(user_id=user.id, status='accepted').all()]
    existing_friend_ids.extend([f.user_id for f in db.session.query(Friend).filter_by(friend_id=user.id, status='accepted').all()])
    
    pending_sent = [f.friend_id for f in db.session.query(Friend).filter_by(user_id=user.id, status='pending').all()]
    pending_received = [f.user_id for f in db.session.query(Friend).filter_by(friend_id=user.id, status='pending').all()]
    
    result = []
    for u in users:
        status = 'none'
        if u.id in existing_friend_ids:
            status = 'friends'
        elif u.id in pending_sent:
            status = 'pending_sent'
        elif u.id in pending_received:
            status = 'pending_received'
        
        result.append({
            'id': u.id,
            'username': u.username,
            'display_name': u.display_name,
            'avatar_url': u.avatar_url,
            'friend_status': status
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
    current_user_id = session['user_id']
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    existing_friend = db.session.query(Friend).filter(
        ((Friend.user_id == current_user_id) & (Friend.friend_id == user_id)) |
        ((Friend.user_id == user_id) & (Friend.friend_id == current_user_id))
    ).first()
    
    friend_status = 'none'
    if existing_friend:
        if existing_friend.status == 'accepted':
            friend_status = 'friends'
        elif existing_friend.status == 'pending':
            if existing_friend.user_id == current_user_id:
                friend_status = 'pending_sent'
            else:
                friend_status = 'pending_received'
    
    friends_count = db.session.query(Friend).filter(
        ((Friend.user_id == user_id) & (Friend.friend_id == current_user_id) & (Friend.status == 'accepted')) |
        ((Friend.user_id == current_user_id) & (Friend.friend_id == user_id) & (Friend.status == 'accepted'))
    ).count()
    
    from models import Playlist, LikedTrack
    playlists_count = db.session.query(Playlist).filter(Playlist.user_id == user_id).count()
    tracks_count = db.session.query(LikedTrack).filter(LikedTrack.user_id == user_id).count()
    
    return jsonify({
        'id': user.id,
        'username': user.username,
        'display_name': user.display_name,
        'bio': user.bio,
        'avatar_url': user.avatar_url,
        'friend_status': friend_status,
        'friends_count': friends_count,
        'tracks_count': tracks_count,
        'playlists_count': playlists_count,
        'taste_match': existing_friend.taste_match if existing_friend and hasattr(existing_friend, 'taste_match') else 0
    })

BANNERS = {
    'banner_1': {'name': 'Неоновый закат', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/xz.jpg'},
    'banner_2': {'name': 'Космос', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/xz1.jpg'},
    'banner_3': {'name': 'Лесной туман', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/xz2.jpg'},
    'banner_knight': {'name': '⚔️ Рыцарь', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/badge_knight.gif'},
    'banner_demon': {'name': '😈 Демон', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/badge_demon.gif'},
    'banner_skull': {'name': '💀 Череп', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/badge_skull.gif'},
    'banner_dragon': {'name': '🐉 Дракон', 'price': 250, 'rarity': 'epic', 'image': '/static/shop/banners/badge_dragon.gif'},
    'banner_samurai': {'name': '🗡️ Самурай', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/badge_samurai.jpg'},
    'banner_street': {'name': '🏙️ Street Style', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/badge_street.jpg'},
    'banner_graffiti': {'name': '🎨 Graffiti', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/badge_graffiti.jpg'},
    'banner_knight2': {'name': '⚔️ Рыцарь 2', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/banner_knight2.gif'},
    'banner_demon2': {'name': '😈 Демон 2', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/banner_demon2.gif'},
    'banner_skull2': {'name': '💀 Череп 2', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/banner_skull2.gif'},
    'banner_dragon2': {'name': '🐉 Дракон 2', 'price': 250, 'rarity': 'epic', 'image': '/static/shop/banners/banner_dragon2.gif'},
}

BADGES = {
    'badge_vip': {'name': '⭐ VIP', 'price': 500, 'rarity': 'legendary', 'icon': 'fa-crown'},
    'badge_early': {'name': '🚀 Early Bird', 'price': 300, 'rarity': 'rare', 'icon': 'fa-rocket'},
    'badge_meloman': {'name': '🎵 Меломан', 'price': 200, 'rarity': 'epic', 'icon': 'fa-music'},
    'badge_contributor': {'name': '💻 Контрибьютор', 'price': 400, 'rarity': 'legendary', 'icon': 'fa-code'},
    'badge_verified': {'name': '✓ Верифицирован', 'price': 1000, 'rarity': 'legendary', 'icon': 'fa-check-circle'},
    'badge_animemix1': {'name': '🎌 Anime Mix #1', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/banner_8585.gif'},
    'badge_animemix2': {'name': '🎌 Anime Mix #2', 'price': 100, 'rarity': 'common', 'image': '/static/shop/banners/banner_3106.gif'},
    'badge_onepiece': {'name': '🏴‍☠️ One Piece', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/banner_9454.gif'},
    'badge_demonslayer': {'name': '👹 Demon Slayer', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/banner_5912.gif'},
    'badge_aot': {'name': '⚔️ Attack on Titan', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/banner_4868.gif'},
    'badge_bleach': {'name': '⚡ Bleach', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/banner_9862.gif'},
    'badge_tokyo': {'name': '🩸 Tokyo Ghoul', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/banner_5584.gif'},
    'badge_animevibes': {'name': '✨ Anime Vibes', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/banner_4277.gif'},
    'badge_darkanime': {'name': '🌑 Dark Anime', 'price': 250, 'rarity': 'epic', 'image': '/static/shop/banners/banner_5545.gif'},
    'badge_animelegend': {'name': '👑 Anime Legend', 'price': 300, 'rarity': 'legendary', 'image': '/static/shop/banners/banner_9518.gif'},
    'badge_knight': {'name': '⚔️ Рыцарь', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/badge_knight.gif'},
    'badge_demon': {'name': '😈 Демон', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/badge_demon.gif'},
    'badge_skull': {'name': '💀 Череп', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/badge_skull.gif'},
    'badge_dragon': {'name': '🐉 Дракон', 'price': 250, 'rarity': 'epic', 'image': '/static/shop/banners/badge_dragon.gif'},
    'badge_samurai': {'name': '🗡️ Самурай', 'price': 200, 'rarity': 'epic', 'image': '/static/shop/banners/badge_samurai.jpg'},
    'badge_street': {'name': '🏙️ Street Style', 'price': 150, 'rarity': 'rare', 'image': '/static/shop/banners/badge_street.jpg'},
    'badge_graffiti': {'name': '🎨 Graffiti', 'price': 180, 'rarity': 'rare', 'image': '/static/shop/banners/badge_graffiti.jpg'},
}

FRAMES = {
    'frame_gold': {'name': '🟡 Золотая рамка', 'price': 250, 'rarity': 'epic', 'color': '#ffd700'},
    'frame_rainbow': {'name': '🌈 Радужная', 'price': 350, 'rarity': 'legendary', 'color': 'linear-gradient(45deg, red, orange, yellow, green, blue, purple)'},
    'frame_fire': {'name': '🔥 Огненная', 'price': 300, 'rarity': 'epic', 'color': 'linear-gradient(45deg, #ff6b00, #ff0000)'},
    'frame_ice': {'name': '❄️ Ледяная', 'price': 300, 'rarity': 'epic', 'color': 'linear-gradient(45deg, #00bfff, #00ffff)'},
    'frame_neon': {'name': '💜 Неон', 'price': 200, 'rarity': 'rare', 'color': '#bf00ff'},
    'frame_skull': {'name': '💀 Череп', 'price': 350, 'rarity': 'legendary', 'image': '/static/shop/banners/badge_skull.gif'},
    'frame_dragon': {'name': '🐉 Дракон', 'price': 400, 'rarity': 'legendary', 'image': '/static/shop/banners/badge_dragon.gif'},
    'frame_demon': {'name': '😈 Демон', 'price': 400, 'rarity': 'legendary', 'image': '/static/shop/banners/badge_demon.gif'},
    'frame_knight': {'name': '⚔️ Рыцарь', 'price': 350, 'rarity': 'legendary', 'image': '/static/shop/banners/badge_knight.gif'},
    'frame_samurai': {'name': '🗡️ Самурай', 'price': 350, 'rarity': 'legendary', 'image': '/static/shop/banners/badge_samurai.jpg'},
    'frame_street': {'name': '🏙️ Street Style', 'price': 300, 'rarity': 'epic', 'image': '/static/shop/banners/badge_street.jpg'},
    'frame_graffiti': {'name': '🎨 Граффити', 'price': 300, 'rarity': 'epic', 'image': '/static/shop/banners/badge_graffiti.jpg'},
    'frame_anime1': {'name': '🎌 Anime Wave #1', 'price': 350, 'rarity': 'legendary', 'image': '/static/shop/banners/banner_8585.gif'},
    'frame_anime2': {'name': '🎌 Anime Wave #2', 'price': 350, 'rarity': 'legendary', 'image': '/static/shop/banners/banner_3106.gif'},
}

THEMES = {
    'theme_purple': {'name': '💜 Фиолетовая', 'price': 150, 'rarity': 'common', 'accent': '#6366f1'},
    'theme_green': {'name': '💚 Зелёная', 'price': 150, 'rarity': 'common', 'accent': '#22c55e'},
    'theme_orange': {'name': '🧡 Оранжевая', 'price': 150, 'rarity': 'common', 'accent': '#f97316'},
    'theme_red': {'name': '❤️ Красная', 'price': 150, 'rarity': 'common', 'accent': '#ef4444'},
    'theme_gold': {'name': '💛 Золотая', 'price': 250, 'rarity': 'rare', 'accent': '#eab308'},
    'theme_pink': {'name': '💗 Розовая', 'price': 200, 'rarity': 'epic', 'accent': '#ec4899'},
}

def get_item_by_id(item_id):
    all_items = {}
    all_items.update(BANNERS)
    all_items.update(BADGES)
    all_items.update(FRAMES)
    all_items.update(THEMES)
    
    item_type = 'unknown'
    if item_id in BANNERS:
        item_type = 'banner'
        item = BANNERS[item_id]
    elif item_id in BADGES:
        item_type = 'badge'
        item = BADGES[item_id]
    elif item_id in FRAMES:
        item_type = 'frame'
        item = FRAMES[item_id]
    elif item_id in THEMES:
        item_type = 'theme'
        item = THEMES[item_id]
    else:
        return None, None
    
    return item, item_type

@app.route('/api/shop/buy', methods=['POST'])
@login_required
@limiter.limit("10 per minute")
def buy_item():
    data = request.get_json()
    item_id = data.get('item_id')
    
    item, item_type = get_item_by_id(item_id)
    if not item:
        return jsonify({'success': False, 'message': 'Предмет не найден'}), 404
    
    user = db.session.get(User, session['user_id'])
    balance = user.get_balance()
    
    if balance < item['price']:
        return jsonify({'success': False, 'message': 'Недостаточно монет'})
    
    existing = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=item_id).first()
    if existing:
        return jsonify({'success': False, 'message': 'Предмет уже куплен'})
    
    add_currency(user.id, -item['price'], f'Покупка: {item["name"]}')
    
    item_data = {
        'type': item_type, 
        'name': item['name'],
        'rarity': item['rarity']
    }
    if item_type == 'banner':
        item_data['image'] = item.get('image', '')
    elif item_type == 'badge':
        if item.get('image'):
            item_data['image'] = item.get('image', '')
        else:
            item_data['icon'] = item.get('icon', 'fa-star')
            item_data['color'] = item.get('color', '#ffd700')
    elif item_type == 'frame':
        if item.get('image'):
            item_data['image'] = item.get('image', '')
        else:
            item_data['color'] = item.get('color', '#ffd700')
    elif item_type == 'theme':
        item_data['accent'] = item.get('accent', '#6366f1')
    
    inv = UserInventory(user_id=user.id, item_id=item_id, item_type=item_type, data=json.dumps(item_data))
    db.session.add(inv)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Покупка совершена', 'new_balance': user.get_balance()})

@app.route('/api/shop/gift', methods=['POST'])
@login_required
def gift_item():
    data = request.get_json()
    item_id = data.get('item_id')
    friend_id = data.get('friend_id')
    
    item, item_type = get_item_by_id(item_id)
    if not item:
        return jsonify({'success': False, 'message': 'Предмет не найден'}), 404
    
    if not friend_id:
        return jsonify({'success': False, 'message': 'Укажите получателя'})
    
    friend = db.session.get(User, friend_id)
    if not friend:
        return jsonify({'success': False, 'message': 'Пользователь не найден'})
    
    user = db.session.get(User, session['user_id'])
    balance = user.get_balance()
    
    if balance < item['price']:
        return jsonify({'success': False, 'message': 'Недостаточно монет'})
    
    add_currency(user.id, -item['price'], f'Подарок: {item["name"]} для {friend.username}')
    
    item_data = {
        'type': item_type, 
        'name': item['name'],
        'rarity': item['rarity'],
        'from_user': user.username,
        'gifted': True
    }
    if item_type == 'banner':
        item_data['image'] = item.get('image', '')
    elif item_type == 'badge':
        if item.get('image'):
            item_data['image'] = item.get('image', '')
        else:
            item_data['icon'] = item.get('icon', 'fa-star')
            item_data['color'] = item.get('color', '#ffd700')
    elif item_type == 'frame':
        if item.get('image'):
            item_data['image'] = item.get('image', '')
        else:
            item_data['color'] = item.get('color', '#ffd700')
    elif item_type == 'theme':
        item_data['accent'] = item.get('accent', '#6366f1')
    
    inv = UserInventory(user_id=friend_id, item_id=item_id, data=json.dumps(item_data))
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

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        user = db.session.get(User, session['user_id'])
        if not user or not user.is_admin:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

@app.route('/api/admin/stats')
@login_required
@admin_required
def admin_stats():
    total_users = db.session.query(User).count()
    online_users = db.session.query(User).filter(User.last_seen > datetime.utcnow() - timedelta(minutes=5)).count()
    total_balance = db.session.query(UserCurrency).all()
    total_coins = sum(c.balance for c in total_balance)
    
    return jsonify({
        'total_users': total_users,
        'online_users': online_users,
        'total_coins': total_coins
    })

@app.route('/api/admin/users')
@login_required
@admin_required
def admin_users():
    users = db.session.query(User).order_by(User.created_at.desc()).limit(100).all()
    result = []
    for u in users:
        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'display_name': u.display_name,
            'balance': u.get_balance(),
            'is_admin': u.is_admin,
            'created_at': u.created_at.isoformat(),
            'last_seen': u.last_seen.isoformat() if u.last_seen else None,
            'is_online': u.last_seen > datetime.utcnow() - timedelta(minutes=5) if u.last_seen else False
        })
    return jsonify(result)

@app.route('/api/admin/add-coins', methods=['POST'])
@login_required
@admin_required
def admin_add_coins():
    data = request.get_json()
    user_id = data.get('user_id')
    amount = data.get('amount', 0)
    
    if not user_id or not amount:
        return jsonify({'success': False, 'message': 'Укажите пользователя и сумму'})
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'})
    
    add_currency(user.id, amount, f'Админ: начисление {amount} монет')
    
    return jsonify({'success': True, 'message': f'{amount} монет добавлено', 'new_balance': user.get_balance()})

@app.route('/api/admin/remove-coins', methods=['POST'])
@login_required
@admin_required
def admin_remove_coins():
    data = request.get_json()
    user_id = data.get('user_id')
    amount = data.get('amount', 0)
    
    if not user_id or not amount:
        return jsonify({'success': False, 'message': 'Укажите пользователя и сумму'})
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'})
    
    if user.get_balance() < amount:
        return jsonify({'success': False, 'message': 'Недостаточно монет'})
    
    add_currency(user.id, -amount, f'Админ: списание {amount} монет')
    
    return jsonify({'success': True, 'message': f'{amount} монет списано', 'new_balance': user.get_balance()})

@app.route('/api/admin/shop/add', methods=['POST'])
@login_required
@admin_required
def admin_add_shop_item():
    data = request.get_json()
    item_id = data.get('id')
    item_data = data.get('data', {})
    
    if not item_id or not item_data:
        return jsonify({'success': False, 'message': 'Укажите ID и данные предмета'})
    
    category = item_data.get('category', 'banner')
    
    if category == 'banner':
        BANNERS[item_id] = item_data
    elif category == 'badge':
        BADGES[item_id] = item_data
    elif category == 'frame':
        FRAMES[item_id] = item_data
    elif category == 'theme':
        THEMES[item_id] = item_data
    
    return jsonify({'success': True, 'message': 'Предмет добавлен'})

@app.route('/api/admin/shop/remove', methods=['POST'])
@login_required
@admin_required
def admin_remove_shop_item():
    data = request.get_json()
    item_id = data.get('item_id')
    
    if not item_id:
        return jsonify({'success': False, 'message': 'Укажите ID предмета'})
    
    removed = False
    if item_id in BANNERS:
        del BANNERS[item_id]
        removed = True
    elif item_id in BADGES:
        del BADGES[item_id]
        removed = True
    elif item_id in FRAMES:
        del FRAMES[item_id]
        removed = True
    elif item_id in THEMES:
        del THEMES[item_id]
        removed = True
    
    if removed:
        return jsonify({'success': True, 'message': 'Предмет удалён'})
    return jsonify({'success': False, 'message': 'Предмет не найден'})

@app.route('/api/admin/shop/list')
@login_required
@admin_required
def admin_shop_list():
    items = []
    for k, v in BANNERS.items():
        items.append({'id': k, 'type': 'banner', **v})
    for k, v in BADGES.items():
        items.append({'id': k, 'type': 'badge', **v})
    for k, v in FRAMES.items():
        items.append({'id': k, 'type': 'frame', **v})
    for k, v in THEMES.items():
        items.append({'id': k, 'type': 'theme', **v})
    return jsonify(items)

@app.route('/api/upload/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': 'Нет файла'}), 400
    
    file = request.files['avatar']
    if not file.filename:
        return jsonify({'success': False, 'message': 'Нет файла'}), 400
    
    try:
        import os
        from PIL import Image
        from io import BytesIO
        
        allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
        
        if ext not in allowed_extensions:
            return jsonify({'success': False, 'message': 'Неподдерживаемый формат'}), 400
        
        upload_dir = os.path.join(app.root_path, 'static', 'uploads', 'avatars')
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"avatar_{session['user_id']}_{datetime.now().strftime('%Y%m%d%H%M%S')}.png"
        filepath = os.path.join(upload_dir, filename)
        
        img = Image.open(file)
        img = img.convert('RGBA')
        
        size = (256, 256)
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        new_img = Image.new('RGBA', size, (0, 0, 0, 0))
        x = (size[0] - img.size[0]) // 2
        y = (size[1] - img.size[1]) // 2
        new_img.paste(img, (x, y))
        
        buffer = BytesIO()
        new_img.save(buffer, format='PNG')
        buffer.seek(0)
        
        with open(filepath, 'wb') as f:
            f.write(buffer.getvalue())
        
        avatar_url = f'/static/uploads/avatars/{filename}'
        
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
        data = json.loads(inv.data)
        data['inventory_id'] = inv.id
        return jsonify(data)
    return jsonify(None)

@app.route('/api/shop/equip-badge', methods=['POST'])
@login_required
def equip_badge():
    data = request.get_json()
    badge_id = data.get('badge_id')
    user = db.session.get(User, session['user_id'])
    
    if badge_id:
        inv = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=badge_id, item_type='badge').first()
        if not inv:
            return jsonify({'success': False, 'message': 'Значок не куплен'}), 400
    else:
        inv = None
    
    user.equipped_badge = badge_id if badge_id else None
    db.session.commit()
    
    return jsonify({'success': True, 'equipped_badge': user.equipped_badge})

@app.route('/api/shop/equip-frame', methods=['POST'])
@login_required
def equip_frame():
    data = request.get_json()
    frame_id = data.get('frame_id')
    user = db.session.get(User, session['user_id'])
    
    if frame_id:
        inv = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=frame_id, item_type='frame').first()
        if not inv:
            return jsonify({'success': False, 'message': 'Рамка не куплена'}), 400
    
    user.equipped_frame = frame_id if frame_id else None
    db.session.commit()
    
    return jsonify({'success': True, 'equipped_frame': user.equipped_frame})

@app.route('/api/shop/equip-theme', methods=['POST'])
@login_required
def equip_theme():
    data = request.get_json()
    theme_id = data.get('theme_id')
    user = db.session.get(User, session['user_id'])
    
    if theme_id:
        inv = db.session.query(UserInventory).filter_by(user_id=user.id, item_id=theme_id, item_type='theme').first()
        if not inv:
            return jsonify({'success': False, 'message': 'Тема не куплена'}), 400
    
    user.equipped_theme = theme_id if theme_id else None
    db.session.commit()
    
    return jsonify({'success': True, 'equipped_theme': user.equipped_theme})

def _resolve_user():
    user_id = session.get('user_id')
    guest_id = session.get('guest_id')
    if user_id:
        user = db.session.get(User, user_id)
        if user:
            return user_id, user.display_name or user.username, user.avatar_url or ''
    if guest_id and guest_id in guest_users:
        return guest_id, guest_users[guest_id]['name'], ''
    return None, None, None


@app.route('/api/room/current')
def get_current_room():
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return jsonify({'in_room': False})
    room_code = room_codes[uid]
    if room_code in rooms:
        room = rooms[room_code]
        return jsonify({
            'in_room': True,
            'room_code': room_code,
            'is_host': room['host'] == uid,
            'users': [{'id': uid, **u} for uid, u in room['users'].items()],
            'playlist': room.get('playlist', []),
            'current_track': room.get('current_track'),
            'is_playing': room.get('is_playing', False),
            'current_time': room.get('current_time', 0)
        })
    return jsonify({'in_room': False})

@app.route('/api/room/guest-join', methods=['POST'])
def room_guest_join():
    data = request.get_json()
    room_code = data.get('room_code', '').upper()
    guest_name = data.get('guest_name', 'Гость').strip() or 'Гость'
    
    if room_code not in rooms:
        return jsonify({'success': False, 'error': 'Комната не найдена'}), 404
    
    guest_id_counter[0] += 1
    guest_id = -guest_id_counter[0]
    
    guest_users[guest_id] = {
        'name': guest_name,
        'room_code': room_code,
        'sid': None
    }
    
    session['guest_id'] = guest_id
    session['guest_name'] = guest_name
    
    return jsonify({
        'success': True,
        'guest_id': guest_id,
        'guest_name': guest_name,
        'room_code': room_code
    })

@app.route('/api/room/generate-link', methods=['POST'])
def room_generate_link():
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return jsonify({'success': False, 'error': 'Не в комнате'}), 400
    
    room_code = room_codes[uid]
    link = request.host_url + '?room=' + room_code
    
    return jsonify({
        'success': True,
        'link': link,
        'room_code': room_code
    })

@app.route('/api/room/status')
def room_status():
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return jsonify({'in_room': False, 'message': 'Не в комнате'})
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return jsonify({'in_room': False, 'message': 'Комната не найдена'})
    
    room = rooms[room_code]
    return jsonify({
        'in_room': True,
        'room_code': room_code,
        'is_host': room['host'] == uid,
        'users_count': len(room['users']),
        'playlist_length': len(room.get('playlist', [])),
        'current_track': room.get('current_track'),
        'is_playing': room.get('is_playing', False),
        'current_time': room.get('current_time', 0),
        'queue': room.get('playlist', [])
    })

@app.route('/api/room/sync', methods=['POST'])
def sync_room_queue():
    uid, uname, uavatar = _resolve_user()
    if not uid or uid not in room_codes:
        return jsonify({'error': 'Не в комнате'}), 400
    
    room_code = room_codes[uid]
    if room_code not in rooms:
        return jsonify({'error': 'Комната не найдена'}), 404
    
    room = rooms[room_code]
    if room['host'] != uid:
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
    print(f"DEBUG: yandex_match={yandex_match}, vk_match={vk_match}")
    
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
                audio_api = get_vk_audio(user.vk_token)
                if audio_api:
                    if album_id:
                        audios = audio_api.get(owner_id=int(owner_id), album_id=int(album_id))
                    else:
                        audios = audio_api.get(owner_id=int(owner_id))
                    
                    new_playlist = Playlist(
                        user_id=user.id,
                        title=f'VK Плейлист {owner_id}',
                        description='Импортирован из VK',
                        is_public=False
                    )
                    db.session.add(new_playlist)
                    db.session.commit()
                    
                    for t in audios:
                        covers = t.get('track_covers', [])
                        pt = PlaylistTrack(
                            playlist_id=new_playlist.id,
                            track_id=f"vk_{t['owner_id']}_{t['id']}",
                            track_data=json.dumps({
                                'title': t['title'],
                                'artists': [t['artist']],
                                'cover_uri': covers[0] if covers else None,
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
                            'track_count': len(audios),
                            'cover_uri': None,
                            'service': 'local'
                        }
                    })
            except Exception as e:
                print(f"VK playlist import error: {e}")
                return jsonify({'error': f'Ошибка импорта: {str(e)[:100]}'}), 500
        return jsonify({'error': 'Токен VK не настроен'}), 400
    
    return jsonify({'error': 'Неподдерживаемый формат ссылки. Используйте ссылку на плейлист Яндекс.Музыки или VK'}), 400

