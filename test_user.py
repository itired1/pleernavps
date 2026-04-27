import sys
sys.path.insert(0, 'app')
from app import app
from app.models import User, db

with app.app_context():
    users = User.query.all()
    print(f'Total users: {len(users)}')
    for u in users:
        print(f'User: {u.username}, Yandex: {"Yes" if u.yandex_token else "No"}, VK: {"Yes" if u.vk_token else "No"}')
