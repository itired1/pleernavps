import smtplib
from email.mime.text import MIMEText
import random
import json
import re
import requests
from collections import Counter
from flask import current_app
from yandex_music import Client
from yandex_music.exceptions import UnauthorizedError
import vk_api

def get_soundcloud_client():
    from flask import current_app
    client_id = current_app.config.get('SOUNDCLOUD_CLIENT_ID')
    
    if not client_id or client_id == 'your_soundcloud_client_id_here' or client_id == '':
        print("SoundCloud: client_id empty or placeholder")
        return None
    
    session = requests.Session()
    
    return {'client_id': client_id, 'session': session}

def soundcloud_search(query, limit=20):
    from flask import session, current_app
    import requests
    import re
    
    client_id = None
    
    if 'user_id' in session:
        try:
            from app import db, User
            user = db.session.get(User, session['user_id'])
            if user:
                client_id = user.soundcloud_client_id
        except Exception as e:
            print(f"Error getting user SC settings: {e}")
    
    try:
        session_req = requests.Session()
        session_req.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        
        if client_id:
            url = f'https://api-v2.soundcloud.com/search/tracks?q={requests.utils.quote(query)}&limit={limit}&client_id={client_id}'
            resp = session_req.get(url, timeout=20)
            
            if resp.status_code == 200:
                data = resp.json()
                results = []
                tracks = data.get('collection', []) or data.get('hits', [])
                
                for track in tracks[:limit]:
                    if isinstance(track, dict):
                        if 'kind' in track and track['kind'] != 'track':
                            continue
                        results.append({
                            'id': f"sc_{track.get('id', 0)}",
                            'title': track.get('title', 'Unknown'),
                            'artists': [track.get('user', {}).get('username', 'Unknown')],
                            'artist': track.get('user', {}).get('username', 'Unknown'),
                            'duration': track.get('duration', 0),
                            'cover_uri': (track.get('artwork_url') or '').replace('-large', '-t500x500'),
                            'service': 'soundcloud',
                            'sc_id': track.get('id', 0)
                        })
                
                if results:
                    return results
            else:
                print(f"SoundCloud API status: {resp.status_code}")
        
        print("Trying direct scrape...")
        resp = session_req.get(f'https://soundcloud.com/search?q={requests.utils.quote(query)}', timeout=20)
        
        if resp.status_code == 200:
            html = resp.text
            pattern = r'"id":(\d+).*?"title":"([^"]+)".*?"username":"([^"]+)".*?"duration":(\d+)'
            matches = re.findall(pattern, html, re.DOTALL)
            
            results = []
            for match in matches[:limit]:
                track_id, title, username, duration = match
                title = title.replace('\\/', '/').replace('\\"', '"').replace('\\n', ' ')
                results.append({
                    'id': f"sc_{track_id}",
                    'title': title,
                    'artists': [username],
                    'artist': username,
                    'duration': int(duration) if duration else 0,
                    'cover_uri': '',
                    'service': 'soundcloud',
                    'sc_id': int(track_id)
                })
            
            if results:
                return results
                
    except Exception as e:
        print(f"SoundCloud error: {e}")
    
    try:
        url = f'https://music.youtube.com/youtubei/v1/search?key=AIzaSyA8IX1nV9RyD7qW4W9S7a5vJnD3YJlT7o'
        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
        data = {
            "context": {"client": {"clientName": "WEB", "clientVersion": "1.20240101"}},
            "query": query
        }
        resp = requests.post(url, json=data, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            result = resp.json()
            results = []
            
            sections = result.get('contents', {}).get('tabbedSearchResultsRenderer', {}).get('tabs', [{}])
            for tab in sections:
                tab_content = tab.get('tabRenderer', {}).get('content', {})
                section_list = tab_content.get('sectionListRenderer', {}).get('contents', [])
                for section in section_list:
                    music_items = section.get('musicShelfRenderer', {}).get('contents', [])
                    for item in music_items:
                        track_data = item.get('musicResponsiveListItemRenderer', {})
                        title_data = track_data.get('flexColumns', [{}])[0].get('musicResponsiveListItemFlexColumnRenderer', {}).get('text', {}).get('runs', [{}])[0]
                        
                        runs = track_data.get('flexColumns', [{}])
                        artist = ''
                        if len(runs) > 1:
                            artist_runs = runs[1].get('musicResponsiveListItemFlexColumnRenderer', {}).get('text', {}).get('runs', [])
                            artist = ' '.join([r.get('text', '') for r in artist_runs])
                        
                        results.append({
                            'id': f"yt_{title_data.get('navigationEndpoint', {}).get('watchEndpoint', {}).get('videoId', '')}",
                            'title': title_data.get('text', 'Unknown'),
                            'artists': [artist] if artist else ['Unknown'],
                            'artist': artist or 'Unknown',
                            'duration': 0,
                            'cover_uri': '',
                            'service': 'youtube',
                            'videoId': title_data.get('navigationEndpoint', {}).get('watchEndpoint', {}).get('videoId', '')
                        })
                        
            print(f"YouTube Music fallback: {len(results)} tracks")
            return results[:limit]
    except Exception as e:
        print(f"YouTube Music fallback error: {e}")
    
    return []

def soundcloud_get_url(track_id, sc_client_id=None, proxy=None):
    from flask import session as flask_session
    
    if 'user_id' in flask_session:
        try:
            from app import db, User
            user = db.session.get(User, flask_session['user_id'])
            if user and user.soundcloud_client_id:
                sc_client_id = user.soundcloud_client_id
        except:
            pass
    
    if not sc_client_id:
        print("SoundCloud: no client_id - пользователь не настроил SoundCloud в профиле")
        return None
    
    track_num = track_id.replace('sc_', '')
    
    try:
        session_req = requests.Session()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://soundcloud.com/'
        }
        
        url = f'https://api-v2.soundcloud.com/tracks/{track_num}?client_id={sc_client_id}'
        resp = session_req.get(url, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            
            media = data.get('media', {})
            transcodings = media.get('transcodings', [])
            
            for t in transcodings:
                preset = t.get('preset', '')
                stream_url = t.get('url', '')
                if stream_url and preset == 'mp3_1_0':
                    download_url = stream_url.replace('{client_id}', sc_client_id) + f'&client_id={sc_client_id}'
                    stream_resp = session_req.get(download_url, headers=headers, timeout=15, allow_redirects=True)
                    if stream_resp.status_code == 200:
                        try:
                            body = stream_resp.json()
                            actual_url = body.get('url') or download_url
                        except:
                            actual_url = stream_resp.url or download_url
                        return {
                            'url': actual_url,
                            'title': data.get('title'),
                            'artist': data.get('user', {}).get('username')
                        }
            
            for t in transcodings:
                stream_url = t.get('url', '')
                if stream_url and t.get('preset') != 'hls':
                    download_url = stream_url.replace('{client_id}', sc_client_id) + f'&client_id={sc_client_id}'
                    stream_resp = session_req.get(download_url, headers=headers, timeout=15, allow_redirects=True)
                    if stream_resp.status_code == 200:
                        try:
                            body = stream_resp.json()
                            actual_url = body.get('url') or download_url
                        except:
                            actual_url = stream_resp.url or download_url
                        return {
                            'url': actual_url,
                            'title': data.get('title'),
                            'artist': data.get('user', {}).get('username')
                        }
            
            print("No direct stream URL found, only HLS")
        else:
            print(f"SoundCloud track error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"SoundCloud get URL error: {e}")
    return None

def soundcloud_resolve_url(url, sc_client_id=None, proxy=None):
    if not sc_client_id:
        return None
    
    try:
        resolve_url = 'https://api-v2.soundcloud.com/resolve'
        params = {'url': url, 'client_id': sc_client_id}
        resp = requests.get(resolve_url, params=params, timeout=15)
        if resp.status_code in [200, 302]:
            return resp.json()
    except Exception as e:
        print(f"SoundCloud resolve error: {e}")
    return None

def get_yandex_client(token):
    if not token:
        return None
    try:
        print("[YANDEX] Creating client...")
        client = Client(token)
        print(f"[YANDEX] Client init OK")
        return client
    except UnauthorizedError:
        print(f"[YANDEX] Token invalid/expired")
        return None
    except Exception as e:
        print(f"[YANDEX] Client creation FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return None

def get_vk_api(token):
    if not token:
        return None
    try:
        vk_session = vk_api.VkApi(token=token)
        vk = vk_session.get_api()
        return vk
    except Exception as e:
        print(f"VK API error: {e}")
        return None

def get_vk_audio(token):
    if not token:
        return None
    try:
        vk_session = vk_api.VkApi(token=token)
        vk_session.http.headers['Accept-Encoding'] = 'gzip, deflate'
        from vk_api.audio import VkAudio
        return VkAudio(vk_session)
    except Exception:
        return None

def send_verification_email(email, username, token):
    try:
        from flask import current_app
        msg = MIMEText(f"""
Привет, {username}!

Для подтверждения email перейди по ссылке:
{current_app.config.get('BASE_URL', 'http://localhost:5001')}/verify/{token}

Если ты не регистрировался - просто игнорируй это письмо.
        """)
        msg['Subject'] = 'Подтверждение email - iTired'
        msg['From'] = current_app.config.get('MAIL_DEFAULT_SENDER', 'noreply@itired.com')
        msg['To'] = email
        
        with smtplib.SMTP(current_app.config['MAIL_SERVER'], current_app.config['MAIL_PORT']) as server:
            server.starttls()
            server.login(current_app.config['MAIL_USERNAME'], current_app.config['MAIL_PASSWORD'])
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False

class Recommender:
    @staticmethod
    def get_recommendations(user_id, services=None):
        recommendations = []
        if not services:
            services = ['yandex', 'vk']
        
        from models import db, User, LikedTrack
        user = db.session.get(User, user_id) if user_id else None
        
        liked_tracks = db.session.query(LikedTrack).filter_by(user_id=user_id).order_by(LikedTrack.liked_at.desc()).limit(20).all() if user_id else []
        liked_service = None
        if liked_tracks:
            first_track = liked_tracks[0].track_id
            if first_track.startswith('yandex_'):
                liked_service = 'yandex'
            elif first_track.startswith('vk_'):
                liked_service = 'vk'
        
        if 'yandex' in services and user and user.yandex_token:
            client = get_yandex_client(user.yandex_token)
            if client:
                try:
                    if liked_service == 'yandex' and liked_tracks:
                        track_ids = [int(t.track_id.replace('yandex_', '')) for t in liked_tracks[:10] if t.track_id.startswith('yandex_')]
                        if track_ids:
                            tracks_data = client.tracks(track_ids)
                            for track in tracks_data:
                                if track:
                                    recommendations.append({
                                        'id': f"yandex_{track.id}",
                                        'title': track.title,
                                        'type': 'track',
                                        'artists': [a.name for a in track.artists] if track.artists else [],
                                        'cover_uri': f"https://{track.cover_uri.replace('%%', '300x300')}" if track.cover_uri else None,
                                        'duration': track.duration_ms,
                                        'service': 'yandex'
                                    })
                    else:
                        chart = client.chart()
                        if chart and chart.chart.tracks:
                            for track in chart.chart.tracks[:10]:
                                t = track.track
                                recommendations.append({
                                    'id': f"yandex_{t.id}",
                                    'title': t.title,
                                    'type': 'track',
                                    'artists': [a.name for a in t.artists] if t.artists else [],
                                    'cover_uri': f"https://{t.cover_uri.replace('%%', '300x300')}" if t.cover_uri else None,
                                    'duration': t.duration_ms,
                                    'service': 'yandex'
                                })
                except Exception as e:
                    print(f"Yandex recommendations error: {e}")
                
                try:
                    mixes = client.playlists_for_day() if hasattr(client, 'playlists_for_day') else []
                    if not mixes:
                        mixes = []
                    for mix in (mixes[:5] if isinstance(mixes, list) else []):
                        recommendations.append({
                            'id': f"yandex_{mix.kind}",
                            'title': mix.title,
                            'type': 'playlist',
                            'track_count': mix.track_count,
                            'cover_uri': f"https://{mix.cover.uri.replace('%%', '300x300')}" if mix.cover and mix.cover.uri else None,
                            'service': 'yandex'
                        })
                except: pass
        
        if 'vk' in services and user and user.vk_token:
            vk_audio = get_vk_audio(user.vk_token)
            if vk_audio:
                try:
                    if liked_service == 'vk' and liked_tracks:
                        for lt in liked_tracks[:10]:
                            if lt.track_id.startswith('vk_'):
                                parts = lt.track_id.replace('vk_', '').split('_')
                                if len(parts) >= 2:
                                    try:
                                        track = vk_audio.get_by_id(int(parts[0]), int(parts[1]))
                                        if track:
                                            vk_artist = track.get('artist', '') or ''
                                            covers = track.get('track_covers') or []
                                            recommendations.append({
                                                'id': f"vk_{track['owner_id']}_{track['id']}",
                                                'title': track['title'],
                                                'type': 'track',
                                                'artists': [vk_artist] if vk_artist else [],
                                                'artist': vk_artist,
                                                'cover_uri': covers[0] if covers else None,
                                                'duration': track['duration'] * 1000,
                                                'service': 'vk'
                                            })
                                    except:
                                        pass
                    else:
                        recs = list(vk_audio.get_recommendations(count=10))
                        for track in recs:
                            vk_artist = track.get('artist', '') or ''
                            covers = track.get('track_covers') or []
                            recommendations.append({
                                'id': f"vk_{track['owner_id']}_{track['id']}",
                                'title': track['title'],
                                'type': 'track',
                                'artists': [vk_artist] if vk_artist else [],
                                'artist': vk_artist,
                                'cover_uri': covers[0] if covers else None,
                                'duration': track['duration'] * 1000,
                                'service': 'vk'
                            })
                except:
                    pass
        
        if 'soundcloud' in services and user and user.soundcloud_client_id:
            try:
                import requests
                resp = requests.get(
                    f'https://api-v2.soundcloud.com/charts?kind=trending&limit=10&client_id={user.soundcloud_client_id}',
                    timeout=15,
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                )
                if resp.status_code == 200:
                    for item in resp.json().get('collection', []):
                        track = item.get('track', {})
                        if track and track.get('kind') == 'track':
                            recommendations.append({
                                'id': f"sc_{track['id']}",
                                'title': track.get('title', ''),
                                'type': 'track',
                                'artists': [track.get('user', {}).get('username', '')],
                                'artist': track.get('user', {}).get('username', ''),
                                'cover_uri': (track.get('artwork_url') or '').replace('-large', '-t500x500'),
                                'duration': track.get('duration', 0),
                                'service': 'soundcloud'
                            })
            except Exception as e:
                print(f"SoundCloud recommendations error: {e}")
        
        if not recommendations and user and user.yandex_token:
            try:
                client = get_yandex_client(user.yandex_token)
                if client:
                    chart = client.chart()
                    if chart and chart.chart.tracks:
                        for track in chart.chart.tracks[:15]:
                            t = track.track
                            recommendations.append({
                                'id': f"yandex_{t.id}",
                                'title': t.title,
                                'type': 'track',
                                'artists': [a.name for a in t.artists] if t.artists else [],
                                'cover_uri': f"https://{t.cover_uri.replace('%%', '300x300')}" if t.cover_uri else None,
                                'duration': t.duration_ms,
                                'service': 'yandex'
                            })
            except Exception as e:
                print(f"Fallback error: {e}")
        
        random.shuffle(recommendations)
        return recommendations[:15]

# === S3 Storage (Cloud/Cloudflare R2 / Yandex Cloud) ===
def upload_to_s3(file_data, filename, content_type='image/png'):
    """Upload file to S3-compatible storage"""
    from flask import current_app
    import base64
    import hmac
    import hashlib
    from datetime import datetime
    
    config = current_app.config
    access_key = config.get('AWS_ACCESS_KEY_ID')
    secret_key = config.get('AWS_SECRET_ACCESS_KEY')
    bucket = config.get('AWS_S3_BUCKET')
    region = config.get('AWS_S3_REGION', 'ru-central1')
    endpoint = config.get('AWS_S3_ENDPOINT')
    cdn_url = config.get('CDN_URL')
    
    if not all([access_key, secret_key, bucket]):
        return None
    
    try:
        import boto3
        from botocore.config import Config
        
        s3_config = Config(region_name=region)
        s3_kwargs = {'endpoint_url': endpoint} if endpoint else {}
        s3_client = boto3.client('s3', aws_access_key_id=access_key, aws_secret_access_key=secret_key, config=s3_config, **s3_kwargs)
        
        s3_client.put_object(
            Bucket=bucket,
            Key=f'avatars/{filename}',
            Body=file_data,
            ContentType=content_type
        )
        
        if cdn_url:
            return f'{cdn_url}/avatars/{filename}'
        elif endpoint:
            return f'{endpoint}/avatars/{filename}'
        else:
            return f'https://{bucket}.s3.{region}.amazonaws.com/avatars/{filename}'
    
    except Exception as e:
        print(f'S3 upload error: {e}')
        return None

def get_cdn_url(path):
    """Get CDN URL for static files"""
    from flask import current_app
    cdn = current_app.config.get('CDN_URL')
    if cdn:
        return f'{cdn}{path}'
    return path
