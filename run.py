import sys
sys.path.insert(0, 'app')

from app import app, socketio

if __name__ == '__main__':
    print("Starting iTired server with gevent...")
    socketio.run(app, host='0.0.0.0', port=5001, async_mode='gevent')
