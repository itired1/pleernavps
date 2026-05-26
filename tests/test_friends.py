def test_send_friend_request(authed_client, second_user_id, app):
    resp = authed_client.get(f'/api/user/{second_user_id}')
    assert resp.status_code == 200


def test_friend_search(authed_client):
    resp = authed_client.get('/api/friends/search?q=friend')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


def test_friend_search_short_query(authed_client):
    resp = authed_client.get('/api/friends/search?q=a')
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_notifications(authed_client):
    resp = authed_client.get('/api/notifications')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


def test_clear_friends(authed_client):
    resp = authed_client.post('/api/friends/clear')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
