import time
import threading
import random
import json
from datetime import datetime, timedelta
from flask import current_app
from sqlalchemy import func
from models import db, User, UserCurrency, ListeningHistory, BattlePassSeason, BattlePassLevel, BattlePassQuest
from utils import get_yandex_client, get_vk_audio
from extensions import track_cache

BP_REWARD_IMAGES = [
    ('14aad66b004dd19cf52b7b82f3ef64fe.gif', 'frame'),
    ('157af5146af0795ada2fa71505db8db1.jpg', 'banner'),
    ('25934f82c4e78f171ca27995f3ec9c17.gif', 'badge'),
    ('353e25c360a46d89f53576577ebcd308.gif', 'frame'),
    ('411881d2b4ed7267e5105de190ee6d5d.jpg', 'banner'),
    ('53c7d9bdbd0daf649ec984a82b66060c.jpg', 'badge'),
    ('5a7b19110bc06b7ba8d361b903f738b7.jpg', 'frame'),
    ('5cda98797f969c1595da5c1f6d6179dd.jpg', 'banner'),
    ('5e5c0fc411760a7adc814c3d045af878.gif', 'badge'),
    ('5fe2766bc465290b7b95856832cef409.gif', 'frame'),
    ('671b9fb954b9b4eee6d25664b00f7418.jpg', 'banner'),
    ('75755683fe0b81ab49fa79bddff710c8.jpg', 'badge'),
    ('8153b971a10587234450d65f99117d5c.gif', 'frame'),
    ('a2827b398423507f4f048dcf559e02d3.jpg', 'banner'),
    ('b84af96293b7175fc8afdae280e976fb.jpg', 'badge'),
    ('d7b35bb1d1705a9eaaf926c41f8603d5.jpg', 'frame'),
    ('e73db1d568520988017d853e2e722568.gif', 'banner'),
    ('eab690c70475355327f1a244b504dfd6.gif', 'badge'),
    ('ff015838339ff3f36c8a98522ea3335d.jpg', 'frame'),
]

BP_QUEST_TEMPLATES = [
    {'type': 'daily', 'desc': 'Слушайте 5 треков', 'xp': 50, 'req_type': 'listen_count', 'req_val': 5},
    {'type': 'daily', 'desc': 'Слушайте 15 минут', 'xp': 80, 'req_type': 'listen_minutes', 'req_val': 15},
    {'type': 'daily', 'desc': 'Лайкните 3 трека', 'xp': 60, 'req_type': 'like_tracks', 'req_val': 3},
    {'type': 'daily', 'desc': 'Добавьте 5 треков в очередь', 'xp': 40, 'req_type': 'add_to_queue', 'req_val': 5},
    {'type': 'weekly', 'desc': 'Слушайте 50 треков', 'xp': 300, 'req_type': 'listen_count', 'req_val': 50},
    {'type': 'weekly', 'desc': 'Слушайте 2 часа', 'xp': 500, 'req_type': 'listen_minutes', 'req_val': 120},
    {'type': 'weekly', 'desc': 'Лайкните 15 треков', 'xp': 350, 'req_type': 'like_tracks', 'req_val': 15},
    {'type': 'weekly', 'desc': 'Создайте 2 плейлиста', 'xp': 200, 'req_type': 'playlists_created', 'req_val': 2},
]


MAX_CACHE_SIZE = 500

def _trim_cache():
    if len(track_cache) > MAX_CACHE_SIZE:
        now = time.time()
        expired = [k for k, v in track_cache.items() if v.get('expires', 0) < now]
        for k in expired[:len(track_cache) - MAX_CACHE_SIZE]:
            del track_cache[k]

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
                        info = download_info[0]
                        url = None
                        if hasattr(info, 'direct_link') and info.direct_link:
                            url = info.direct_link
                        elif hasattr(info, 'url') and info.url:
                            url = info.url
                        elif isinstance(info, dict):
                            url = info.get('direct_link') or info.get('url')

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
                            _trim_cache()
                            return result
                        else:
                            print(f"[YANDEX] No download URL for track {track_num}, info={info}")
                            return {'error': 'Трек недоступен', 'code': 'NO_URL'}
                    else:
                        print(f"[YANDEX] No download info for track {track_num}")
                        return {'error': 'Трек недоступен для скачивания', 'code': 'NO_DOWNLOAD'}

            elif track_id.startswith('vk_'):
                vk_full = track_id.replace('vk_', '')
                vk_audio = get_vk_audio(token)
                if vk_audio:
                    parts = vk_full.split('_')
                    if len(parts) >= 2:
                        try:
                            track = vk_audio.get_by_id(int(parts[0]), int(parts[1]))
                            if track and track.get('url'):
                                covers = track.get('track_covers') or []
                                result = {
                                    'url': track['url'],
                                    'title': track['title'],
                                    'artist': track['artist'],
                                    'cover': covers[0] if covers else None,
                                    'duration': track['duration'] * 1000,
                                    'service': 'vk'
                                }
                                track_cache[cache_key] = {**result, 'expires': time.time() + 1800}
                                _trim_cache()
                                return result
                        except Exception:
                            pass

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


clear_expired_cache()
threading.Timer(300, clear_expired_cache).start()


def log_info(msg):
    current_app.logger.info(msg)


def log_error(msg):
    current_app.logger.error(msg)


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


def add_currency(user_id, amount, reason):
    curr = db.session.query(UserCurrency).filter_by(user_id=user_id).first()
    if curr:
        curr.balance += amount
    else:
        curr = UserCurrency(user_id=user_id, balance=amount)
        db.session.add(curr)
    db.session.commit()
    return curr.balance


def generate_captcha():
    from flask import session
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


def init_db(app):
    with app.app_context():
        db.create_all()
        try:
            from sqlalchemy import text
            db.session.execute(text('ALTER TABLE users ADD COLUMN yandex_uid VARCHAR(50)'))
            db.session.commit()
        except:
            pass
        try:
            db.session.execute(text('ALTER TABLE user_battle_pass ADD COLUMN last_daily_bonus DATE'))
            db.session.commit()
        except:
            pass
        from models import BattlePassSeason
        season = db.session.query(BattlePassSeason).filter_by(is_active=True).first()
        if not season:
            now = datetime.utcnow()
            season = BattlePassSeason(name='Сезон 1', start_date=now, end_date=now + timedelta(days=90), max_level=100, is_active=True)
            db.session.add(season)
            db.session.flush()
            for lvl in range(1, 101):
                from models import BattlePassLevel
                bl = BattlePassLevel(season_id=season.id, level=lvl, xp_required=lvl * 100)
                db.session.add(bl)
            populate_battle_pass_rewards(season.id, 100)
            populate_battle_pass_quests(season.id)
            db.session.commit()
            log_info(f"Battle Pass season auto-created: {season.name} (id={season.id})")
        if not db.session.query(User).filter_by(username='admin').first():
            admin = User(username='admin', email='admin@itired.com', is_admin=True, email_verified=True)
            admin.set_password('admin123')
            db.session.add(admin)
            db.session.commit()
            db.session.add(UserCurrency(user_id=admin.id, balance=1000))
            db.session.commit()
            log_info("Admin user created: admin / admin123")


def populate_battle_pass_rewards(season_id, max_level):
    images = list(BP_REWARD_IMAGES)
    random.seed(season_id)
    random.shuffle(images)
    for lvl in range(1, max_level + 1):
        idx = (lvl - 1) % len(images)
        filename, rtype = images[idx]
        img_path = f'/static/battlepass/{filename}'
        reward = {'type': rtype, 'image': img_path, 'name': f'{rtype.capitalize()} {lvl}'}
        bl = db.session.query(BattlePassLevel).filter_by(season_id=season_id, level=lvl).first()
        if bl:
            bl.free_reward_json = json.dumps(reward)
            bl.premium_reward_json = None


def populate_battle_pass_quests(season_id):
    for qt in BP_QUEST_TEMPLATES:
        q = BattlePassQuest(
            season_id=season_id, type=qt['type'],
            description=qt['desc'], xp_reward=qt['xp'],
            requirement_type=qt['req_type'], requirement_value=qt['req_val'],
            is_active=True
        )
        db.session.add(q)
