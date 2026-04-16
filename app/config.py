import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'sqlite:///itired.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
    
    # Session
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 30 * 24 * 3600  # 30 дней
    
    # Cache - SimpleCache (без Redis)
    CACHE_TYPE = 'SimpleCache'
    CACHE_DEFAULT_TIMEOUT = 300
    
    # Email для верификации (пример для Gmail)
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv('MAIL_USERNAME', 'itiredmp3@gmail.com')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD', 'ozbg ahqs jack lerf')
    MAIL_DEFAULT_SENDER = ('iTired', MAIL_USERNAME)

    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5001/auth/google/callback')

    # SoundCloud Proxy (если заблокирован в России)
    SOUNDCLOUD_CLIENT_ID = os.getenv('SOUNDCLOUD_CLIENT_ID', '')
    SOUNDCLOUD_PROXY = os.getenv('SOUNDCLOUD_PROXY', None)
    
    # Cloudflare WARP
    WARP_ENABLED = os.getenv('WARP_ENABLED', 'false').lower() == 'true'
    WARP_PROXY = os.getenv('WARP_PROXY', 'socks5://127.0.0.1:40000')

    # Discord Rich Presence (Webhook для статуса)
    DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '')

    # Cloud Storage для аватарок (S3-compatible)
    AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID', '')
    AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', '')
    AWS_S3_BUCKET = os.getenv('AWS_S3_BUCKET', '')
    AWS_S3_REGION = os.getenv('AWS_S3_REGION', 'ru-central1')
    AWS_S3_ENDPOINT = os.getenv('AWS_S3_ENDPOINT', '')
    
    # Local upload fallback
    UPLOAD_FOLDER = 'static/uploads/avatars'
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB
    
    # CDN URL (Cloudflare, S3, etc.)
    CDN_URL = os.getenv('CDN_URL', '')