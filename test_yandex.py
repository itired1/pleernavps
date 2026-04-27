import sys
sys.path.insert(0, 'app')
sys.path.insert(0, '.')

from dotenv import load_dotenv
load_dotenv('app/.env')

from config import Config
from models import db, User
from utils import get_yandex_client
from app import app

with app.app_context():
    user = User.query.filter_by(username='itired').first()
    if not user:
        print('User not found')
        sys.exit(1)
    
    print(f'User: {user.username}')
    print(f'Yandex token exists: {bool(user.yandex_token)}')
    print(f'Yandex token (first 10): {user.yandex_token[:10] if user.yandex_token else "None"}...')
    
    if user.yandex_token:
        client = get_yandex_client(user.yandex_token)
        if client:
            print('Yandex client created successfully')
            try:
                # Try to get a track
                tracks = client.tracks(['10971167'])
                if tracks:
                    track = tracks[0]
                    print(f'Track: {track.title if hasattr(track, "title") else "Unknown"}')
                    print(f'Artists: {[a.name if hasattr(a, "name") else str(a) for a in track.artists] if hasattr(track, "artists") else "Unknown"}')
                    
                    # Try to get download info
                    dl = client.tracks_download_info('10971167', get_direct_links=True)
                    if dl and len(dl) > 0:
                        print(f'Download info received: {len(dl)} items')
                        print(f'First item has direct_link: {hasattr(dl[0], "direct_link")}')
                        if hasattr(dl[0], 'direct_link') and dl[0].direct_link:
                            print(f'Direct link (first 50): {dl[0].direct_link[:50]}...')
                        else:
                            print('No direct link available')
                            print(f'Available attrs: {[a for a in dir(dl[0]) if not a.startswith("_")][:10]}')
                    else:
                        print('No download info')
                else:
                    print('No tracks returned')
            except Exception as e:
                print(f'Error: {type(e).__name__}: {e}')
        else:
            print('Failed to create Yandex client')
    else:
        print('No Yandex token')
