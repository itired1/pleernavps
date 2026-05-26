def test_health_check(client):
    resp = client.get('/api/health')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['status'] == 'online'
    assert 'version' in data


def test_index_redirect_when_not_logged_in(client):
    resp = client.get('/')
    assert resp.status_code == 302


def test_login_page(client):
    resp = client.get('/login')
    assert resp.status_code == 200


def test_login_success(client):
    resp = client.post('/login', data={
        'username': 'testuser',
        'password': 'testpass123'
    }, follow_redirects=False)
    assert resp.status_code == 302


def test_login_fail(client):
    resp = client.post('/login', data={
        'username': 'testuser',
        'password': 'wrongpass'
    })
    assert resp.status_code == 200
    assert b'\xd0\x9d\xd0\xb5\xd0\xb2\xd0\xb5\xd1\x80\xd0\xbd\xd1\x8b\xd0\xb5 \xd0\xb4\xd0\xb0\xd0\xbd\xd0\xbd\xd1\x8b\xd0\xb5' in resp.data


def test_register_page(client):
    resp = client.get('/register')
    assert resp.status_code == 200


def test_logout(client, authed_client):
    resp = authed_client.get('/logout', follow_redirects=False)
    assert resp.status_code == 302


def test_api_needs_auth(client):
    protected_routes = [
        '/api/profile',
        '/api/stats',
        '/api/settings',
        '/api/playlists',
        '/api/liked-tracks',
        '/api/friends',
        '/api/shop/inventory',
        '/api/battle-pass/status',
        '/api/listening_history',
        '/api/favorites',
    ]
    for route in protected_routes:
        resp = client.get(route)
        assert resp.status_code == 401, f'{route} should return 401, got {resp.status_code}'
