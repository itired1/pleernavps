from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_caching import Cache

socketio = SocketIO(cors_allowed_origins="*")
limiter = Limiter(get_remote_address, default_limits=["200 per day", "50 per hour"])
cache = Cache(config={'CACHE_TYPE': 'SimpleCache'})

track_cache = {}
rooms = {}
room_codes = {}
guest_users = {}
guest_id_counter = [0]
