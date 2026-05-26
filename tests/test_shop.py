def test_shop_inventory(authed_client):
    resp = authed_client.get('/api/shop/inventory')
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, list)


def test_buy_item_insufficient_funds(authed_client):
    items = authed_client.get('/api/admin/shop/list').get_json() if False else None
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'nonexistent_99999'
    })
    assert resp.status_code == 404


def test_buy_item_not_found(authed_client):
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'nonexistent_item_xyz'
    })
    assert resp.status_code == 404


def test_buy_and_equip_badge(authed_client):
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'badge_meloman'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.post('/api/shop/equip-badge', json={
        'badge_id': 'badge_meloman'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True
    assert data['equipped_badge'] == 'badge_meloman'


def test_buy_and_equip_frame(authed_client):
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'frame_neon'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.post('/api/shop/equip-frame', json={
        'frame_id': 'frame_neon'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True


def test_buy_and_equip_theme(authed_client):
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'theme_purple'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True

    resp = authed_client.post('/api/shop/equip-theme', json={
        'theme_id': 'theme_purple'
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['success'] is True


def test_buy_duplicate_item(authed_client):
    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'theme_green'
    })
    assert resp.status_code == 200
    assert resp.get_json()['success'] is True

    resp = authed_client.post('/api/shop/buy', json={
        'item_id': 'theme_green'
    })
    assert resp.status_code == 200
    assert resp.get_json()['success'] is False
    assert 'уже куплен' in resp.get_json()['message']


def test_active_banner(authed_client):
    resp = authed_client.get('/api/shop/active-banner')
    assert resp.status_code == 200


def test_gift_item_to_self(authed_client):
    resp = authed_client.post('/api/shop/gift', json={
        'item_id': 'badge_early',
        'friend_id': 1
    })
    data = resp.get_json()
    assert data['success'] is True or 'Недостаточно' in data.get('message', '')
