from flask import Flask
from config import Config
from models import db
from extensions import socketio, limiter, cache
from helpers import init_db
import os
import logging
from logging.handlers import RotatingFileHandler

app = Flask(__name__)
app.config.from_object(Config)
app.config['SECRET_KEY'] = Config.SECRET_KEY if hasattr(Config, 'SECRET_KEY') else 'your-secret-key-change-me'
db.init_app(app)
socketio.init_app(app)
limiter.init_app(app)
cache.init_app(app)

# Logging setup
log_dir = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(log_dir, exist_ok=True)
file_handler = RotatingFileHandler(
    os.path.join(log_dir, 'itired.log'),
    maxBytes=10*1024*1024,
    backupCount=5
)
file_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [%(pathname)s:%(lineno)d]'
))
file_handler.setLevel(logging.INFO)
app.logger.addHandler(file_handler)
app.logger.setLevel(logging.INFO)

# Import routes and socketio handlers (they import `app` from this module)
import routes.routes
import routes.socketio_handlers

if __name__ == '__main__':
    init_db(app)
    import atexit
    from helpers import cleanup_old_history
    atexit.register(cleanup_old_history)
    print("Starting iTired server on http://0.0.0.0:5001")
    socketio.run(app, debug=True, host='0.0.0.0', port=5001)
