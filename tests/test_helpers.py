def test_captcha_generation():
    from helpers import generate_captcha
    from flask import Flask, session

    app = Flask(__name__)
    app.secret_key = 'test'
    app.config['SESSION_TYPE'] = 'filesystem'

    with app.test_request_context():
        app.preprocess_request()
        num1, op, num2 = generate_captcha()
        answer = session.get('captcha_answer')

        assert num1 >= 1 and num1 <= 20
        assert num2 >= 1 and num2 <= 20
        assert op in ('+', '-', '*')
        assert answer is not None

        if op == '+':
            assert answer == num1 + num2
        elif op == '-':
            assert answer == abs(num1 - num2)
        elif op == '*':
            assert answer == num1 * num2


def test_captcha_values_stored_in_session():
    from helpers import generate_captcha
    from flask import Flask, session

    app = Flask(__name__)
    app.secret_key = 'test'

    with app.test_request_context():
        generate_captcha()
        assert 'captcha_answer' in session
        assert 'captcha_num1' in session
        assert 'captcha_num2' in session
        assert 'captcha_operator' in session


def test_add_currency(app, db):
    from helpers import add_currency
    from models import UserCurrency

    with app.app_context():
        user = UserCurrency.query.first()
        if user:
            old_balance = user.balance
            add_currency(user.user_id, 500, 'test')
            assert user.balance == old_balance + 500


def test_trim_cache():
    from helpers import _trim_cache, track_cache, MAX_CACHE_SIZE

    import time
    for i in range(MAX_CACHE_SIZE + 100):
        track_cache[f'track:test_{i}'] = {
            'url': f'http://example.com/{i}',
            'expires': time.time() - 1
        }

    assert len(track_cache) > MAX_CACHE_SIZE
    _trim_cache()
    assert len(track_cache) <= MAX_CACHE_SIZE
    track_cache.clear()


def test_clear_expired_cache():
    from helpers import clear_expired_cache, track_cache
    import time

    now = time.time()
    track_cache['fresh'] = {'url': 'ok', 'expires': now + 3600}
    track_cache['stale'] = {'url': 'old', 'expires': now - 10}

    clear_expired_cache()
    assert 'fresh' in track_cache
    assert 'stale' not in track_cache
    track_cache.clear()
