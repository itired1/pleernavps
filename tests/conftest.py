import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

os.environ['SECRET_KEY'] = 'test-secret-key'
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'

import pytest
from app import app as _app
from models import db as _db
from helpers import init_db

@pytest.fixture
def app():
    _app.config['TESTING'] = True
    _app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    _app.config['WTF_CSRF_ENABLED'] = False
    _app.config['RATELIMIT_ENABLED'] = False

    with _app.app_context():
        _db.create_all()
        from models import User, UserCurrency, UserSetting, BattlePassSeason, BattlePassLevel
        user = User(username='testuser', email='test@test.com', display_name='Test User', email_verified=True)
        user.set_password('testpass123')
        _db.session.add(user)
        _db.session.commit()
        _db.session.add(UserCurrency(user_id=user.id, balance=5000))
        _db.session.add(UserSetting(user_id=user.id))

        from datetime import datetime, timedelta
        season = BattlePassSeason(name='Test Season', start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=90), max_level=10, is_active=True)
        _db.session.add(season)
        _db.session.flush()
        for lvl in range(1, 11):
            _db.session.add(BattlePassLevel(season_id=season.id, level=lvl, xp_required=lvl * 100))
        _db.session.commit()

    yield _app

    with _app.app_context():
        _db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def db(app):
    with app.app_context():
        yield _db

@pytest.fixture
def authed_client(client):
    with client.session_transaction() as sess:
        sess['user_id'] = 1
        sess['active_sources'] = ['yandex']
    yield client

@pytest.fixture
def second_user_id(app, db):
    with app.app_context():
        from models import User, UserCurrency
        user = User(username='friend', email='friend@test.com', display_name='Friend')
        user.set_password('friend123')
        db.session.add(user)
        db.session.commit()
        db.session.add(UserCurrency(user_id=user.id, balance=1000))
        db.session.commit()
        return user.id
