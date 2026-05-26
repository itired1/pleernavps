def test_battle_pass_status(authed_client):
    resp = authed_client.get('/api/battle-pass/status')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'active' in data
    assert 'season' in data
    assert 'user' in data
    assert 'daily_bonus_claimed' in data['user']


def test_battle_pass_quests(authed_client):
    resp = authed_client.get('/api/battle-pass/quests')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'quests' in data


def test_battle_pass_daily_bonus(authed_client):
    resp = authed_client.post('/api/battle-pass/daily-bonus')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['xp_given'] > 0
    assert data['new_level'] >= 1


def test_battle_pass_daily_bonus_already_claimed(authed_client):
    authed_client.post('/api/battle-pass/daily-bonus')
    resp = authed_client.post('/api/battle-pass/daily-bonus')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is False
    assert 'уже получен' in data['message']


def test_listen_track(authed_client):
    resp = authed_client.post('/api/listen', json={
        'track_id': 'yandex_test123',
        'title': 'Test Song',
        'artist': 'Test Artist',
        'duration': 180
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True


def test_listening_history(authed_client):
    authed_client.post('/api/listen', json={
        'track_id': 'yandex_test456',
        'title': 'Another Song',
        'artist': 'Another Artist',
        'duration': 240
    })

    resp = authed_client.get('/api/listening_history')
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) >= 1
    assert data[0]['id'] == 'yandex_test456'


def test_clear_listening_history(authed_client):
    authed_client.post('/api/listen', json={
        'track_id': 'yandex_clear',
        'title': 'Clear Me',
        'artist': 'Test',
        'duration': 60
    })

    resp = authed_client.post('/api/listening_history/clear')
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True

    resp = authed_client.get('/api/listening_history')
    assert resp.get_json() == []


def test_get_stats(authed_client):
    resp = authed_client.get('/api/stats')
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'total_listening_hours' in data
    assert 'total_listening_formatted' in data
