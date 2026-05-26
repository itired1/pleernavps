def test_create_playlist(authed_client):
    resp = authed_client.post('/api/playlists/create', json={
        'name': 'My Test Playlist',
        'description': 'Test description',
        'is_public': True
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['playlist']['title'] == 'My Test Playlist'
    assert data['playlist']['track_count'] == 0
    playlist_id = data['playlist']['id']

    resp = authed_client.get('/api/playlists')
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data['playlists']) >= 1
    ids = [p['id'] for p in data['playlists']]
    assert playlist_id in ids


def test_delete_playlist(authed_client):
    resp = authed_client.post('/api/playlists/create', json={'name': 'To Delete'})
    playlist_id = resp.get_json()['playlist']['id']

    resp = authed_client.post(f'/api/playlists/{playlist_id}/delete')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True


def test_add_track_to_playlist(authed_client):
    resp = authed_client.post('/api/playlists/create', json={'name': 'Track Playlist'})
    playlist_id = resp.get_json()['playlist']['id']

    track = {
        'id': 'yandex_test123',
        'title': 'Test Track',
        'artist': 'Test Artist',
        'duration': 200000
    }
    resp = authed_client.post(f'/api/playlists/{playlist_id}/tracks', json={'track': track})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.get(f'/api/playlists/{playlist_id}/tracks')
    assert resp.status_code == 200
    tracks = resp.get_json()
    assert len(tracks) == 1
    assert tracks[0]['id'] == 'yandex_test123'


def test_get_playlist_tracks_unknown(authed_client):
    resp = authed_client.get('/api/playlists/nonexistent_999/tracks')
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_create_playlist_no_name(authed_client):
    resp = authed_client.post('/api/playlists/create', json={})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['playlist']['title'] == 'Новый плейлист'


def test_add_playlist_by_invalid_link(authed_client):
    resp = authed_client.post('/api/playlist/add', json={
        'url': 'https://example.com/not-a-playlist'
    })
    assert resp.status_code == 400
    data = resp.get_json()
    assert 'error' in data
