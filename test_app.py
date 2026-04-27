import sys
sys.path.insert(0, 'app')
import config
from app import app

with app.test_client() as client:
    # Test health endpoint
    resp = client.get('/api/health')
    print('Health:', resp.status_code, resp.data[:100])
    
    # Test login page
    resp = client.get('/login')
    print('Login page:', resp.status_code)
    
    # Test main page (should redirect to login)
    resp = client.get('/')
    print('Main page:', resp.status_code, 'Location:', resp.headers.get('Location', 'N/A'))

