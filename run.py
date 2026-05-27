import sys
sys.path.insert(0, 'app')

from app import app, socketio
from helpers import init_db

if __name__ == '__main__':
    init_db(app)
    import atexit
    from helpers import cleanup_old_history
    atexit.register(cleanup_old_history)
    print("Starting iTired server...")
    socketio.run(app, host='0.0.0.0', port=5001)
