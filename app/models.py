from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import bcrypt

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    display_name = db.Column(db.String(80))
    avatar_url = db.Column(db.String(200))
    bio = db.Column(db.Text)
    yandex_token = db.Column(db.String(500))
    yandex_uid = db.Column(db.String(50))
    vk_token = db.Column(db.String(500))
    soundcloud_token = db.Column(db.String(500))
    soundcloud_client_id = db.Column(db.String(200))
    soundcloud_proxy = db.Column(db.String(500))
    current_source = db.Column(db.String(20), default='yandex')
    discord_webhook = db.Column(db.String(500))
    discord_client_id = db.Column(db.String(100))
    discord_enabled = db.Column(db.Boolean, default=False)
    is_admin = db.Column(db.Boolean, default=False)
    email_verified = db.Column(db.Boolean, default=False)
    verification_code = db.Column(db.String(6))
    verification_code_expires = db.Column(db.DateTime)
    equipped_badge = db.Column(db.String(50))
    equipped_frame = db.Column(db.String(50))
    equipped_theme = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)

    currency = db.relationship('UserCurrency', backref='user', uselist=False)
    inventory = db.relationship('UserInventory', backref='user')
    transactions = db.relationship('CurrencyTransaction', backref='user')
    settings = db.relationship('UserSetting', backref='user', uselist=False)
    themes = db.relationship('UserTheme', backref='user')
    sent_friend_requests = db.relationship('Friend', foreign_keys='Friend.user_id', backref='from_user')
    received_friend_requests = db.relationship('Friend', foreign_keys='Friend.friend_id', backref='to_user')
    activities = db.relationship('UserActivity', backref='user')
    listening_history = db.relationship('ListeningHistory', backref='user')

    def set_password(self, password):
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    def check_password(self, password):
        return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))

    def get_balance(self):
        return self.currency.balance if self.currency else 0

    @classmethod
    def get_current(cls):
        from flask import session
        if 'user_id' in session:
            return cls.query.get(session['user_id'])
        return None

class UserCurrency(db.Model):
    __tablename__ = 'user_currency'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    balance = db.Column(db.Integer, default=0)

class ShopCategory(db.Model):
    __tablename__ = 'shop_categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.String(200))
    icon = db.Column(db.String(50))

class ShopItem(db.Model):
    __tablename__ = 'shop_items'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # theme, avatar, profile_banner, badge, effect
    category_id = db.Column(db.Integer, db.ForeignKey('shop_categories.id'))
    price = db.Column(db.Integer, nullable=False)
    data = db.Column(db.Text)  # JSON с параметрами предмета
    rarity = db.Column(db.String(20), default='common')
    is_active = db.Column(db.Boolean, default=True)

    def get_data_dict(self):
        import json
        return json.loads(self.data) if self.data else {}

class UserInventory(db.Model):
    __tablename__ = 'user_inventory'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    item_id = db.Column(db.String(100), nullable=False)
    item_type = db.Column(db.String(50))  # banner, badge, frame, theme
    data = db.Column(db.Text)
    purchased_at = db.Column(db.DateTime, default=datetime.utcnow)
    equipped = db.Column(db.Boolean, default=False)

class CurrencyTransaction(db.Model):
    __tablename__ = 'currency_transactions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class UserSetting(db.Model):
    __tablename__ = 'user_settings'
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    theme = db.Column(db.String(20), default='dark')
    language = db.Column(db.String(5), default='ru')
    auto_play = db.Column(db.Boolean, default=True)
    show_explicit = db.Column(db.Boolean, default=True)
    music_service = db.Column(db.String(20), default='yandex')

class UserTheme(db.Model):
    __tablename__ = 'user_themes'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    colors = db.Column(db.Text, nullable=False)  # JSON
    background_url = db.Column(db.String(200))
    is_default = db.Column(db.Boolean, default=False)

class Friend(db.Model):
    __tablename__ = 'friends'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    friend_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    status = db.Column(db.String(20), default='pending', index=True)  # pending, accepted, rejected
    taste_match = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class UserActivity(db.Model):
    __tablename__ = 'user_activity'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    activity_type = db.Column(db.String(50), nullable=False, index=True)
    activity_data = db.Column(db.Text)  # JSON
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class ListeningHistory(db.Model):
    __tablename__ = 'listening_history'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    track_id = db.Column(db.String(100))
    track_data = db.Column(db.Text)
    artist_name = db.Column(db.String(200))
    duration_seconds = db.Column(db.Integer, default=0)
    played_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

class Playlist(db.Model):
    __tablename__ = 'playlists'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    cover_url = db.Column(db.String(200))
    is_public = db.Column(db.Boolean, default=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    tracks = db.relationship('PlaylistTrack', backref='playlist', lazy='dynamic', cascade='all, delete-orphan')
    user = db.relationship('User', backref='user_playlists')

class PlaylistTrack(db.Model):
    __tablename__ = 'playlist_tracks'
    id = db.Column(db.Integer, primary_key=True)
    playlist_id = db.Column(db.Integer, db.ForeignKey('playlists.id'), nullable=False, index=True)
    track_id = db.Column(db.String(100), nullable=False, index=True)
    track_data = db.Column(db.Text)  # JSON with track info
    position = db.Column(db.Integer, default=0)
    added_at = db.Column(db.DateTime, default=datetime.utcnow)

class LikedTrack(db.Model):
    __tablename__ = 'liked_tracks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    track_id = db.Column(db.String(100), nullable=False, index=True)
    track_data = db.Column(db.Text)
    liked_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user = db.relationship('User', backref='liked_tracks')

class SavedQueue(db.Model):
    __tablename__ = 'saved_queues'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(100), default='Очередь')
    tracks_data = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BattlePassSeason(db.Model):
    __tablename__ = 'battle_pass_seasons'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    start_date = db.Column(db.DateTime, nullable=False)
    end_date = db.Column(db.DateTime, nullable=False)
    max_level = db.Column(db.Integer, default=100)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    levels = db.relationship('BattlePassLevel', backref='season', lazy='dynamic', cascade='all, delete-orphan')
    user_progress = db.relationship('UserBattlePass', backref='season', lazy='dynamic', cascade='all, delete-orphan')

class BattlePassLevel(db.Model):
    __tablename__ = 'battle_pass_levels'
    id = db.Column(db.Integer, primary_key=True)
    season_id = db.Column(db.Integer, db.ForeignKey('battle_pass_seasons.id'), nullable=False, index=True)
    level = db.Column(db.Integer, nullable=False)
    xp_required = db.Column(db.Integer, nullable=False)
    free_reward_json = db.Column(db.Text)
    premium_reward_json = db.Column(db.Text)

class UserBattlePass(db.Model):
    __tablename__ = 'user_battle_pass'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    season_id = db.Column(db.Integer, db.ForeignKey('battle_pass_seasons.id'), nullable=False, index=True)
    level = db.Column(db.Integer, default=1)
    xp = db.Column(db.Integer, default=0)
    has_premium = db.Column(db.Boolean, default=False)
    claimed_free = db.Column(db.Text, default='[]')
    claimed_premium = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='battle_pass')

class BattlePassQuest(db.Model):
    __tablename__ = 'battle_pass_quests'
    id = db.Column(db.Integer, primary_key=True)
    season_id = db.Column(db.Integer, db.ForeignKey('battle_pass_seasons.id'), nullable=False, index=True)
    type = db.Column(db.String(10), nullable=False)  # daily, weekly
    description = db.Column(db.String(200), nullable=False)
    xp_reward = db.Column(db.Integer, nullable=False)
    requirement_type = db.Column(db.String(50), nullable=False)  # listen_count, listen_minutes, like_tracks, add_to_queue, playlists_created
    requirement_value = db.Column(db.Integer, nullable=False, default=1)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    season = db.relationship('BattlePassSeason', backref='quests')

class UserQuest(db.Model):
    __tablename__ = 'user_quests'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    quest_id = db.Column(db.Integer, db.ForeignKey('battle_pass_quests.id'), nullable=False)
    progress = db.Column(db.Integer, default=0)
    completed = db.Column(db.Boolean, default=False)
    claimed = db.Column(db.Boolean, default=False)
    assigned_date = db.Column(db.Date, default=lambda: datetime.utcnow().date())

    user = db.relationship('User', backref='quests')
    quest = db.relationship('BattlePassQuest', backref='user_progress')