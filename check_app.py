import sys
sys.path.insert(0, 'app')
sys.path.insert(0, '.')

# Load .env
from dotenv import load_dotenv
load_dotenv('app/.env')

from config import Config
from models import db, User

# Create app context
from app import app
with app.app_context():
    users = User.query.all()
    print(f'Total users: {len(users)}')
    for u in users[:3]:
        yt = 'Yes' if u.yandex_token else 'No'
        vk = 'Yes' if u.vk_token else 'No'
        print(f' - {u.username}: Yandex={yt}, VK={vk}')
    
    if not users:
        print('No users found! You need to register.')
