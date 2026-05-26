def test_api_profile(authed_client):
    resp = authed_client.get('/api/profile')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['local']['username'] == 'testuser'
    assert data['local']['email'] == 'test@test.com'


def test_update_profile(authed_client):
    resp = authed_client.post('/profile', json={
        'display_name': 'New Name',
        'bio': 'Test bio'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.get('/api/profile')
    data = resp.get_json()
    assert data['local']['display_name'] == 'New Name'
    assert data['local']['bio'] == 'Test bio'


def test_update_settings(authed_client):
    resp = authed_client.post('/api/settings', json={
        'theme': 'green',
        'music_service': 'yandex',
        'active_sources': ['yandex'],
        'bypass_censorship': False
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.get('/api/settings')
    data = resp.get_json()
    assert data['theme'] == 'green'


def test_currency_balance(authed_client):
    resp = authed_client.get('/api/currency/balance')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['balance'] == 5000
