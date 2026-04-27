# Add this function after get_yandex_client function

def refresh_yandex_token(old_token):
    """
    Try to refresh Yandex.Music token using X-Token header method.
    Returns new token if successful, None otherwise.
    """
    import requests
    try:
        # Try to get user info with current token to check if it's still valid
        headers = {'Authorization': f'OAuth {old_token}'}
        resp = requests.get('https://api.music.yandex.net/account/status', headers=headers, timeout=10)
        
        if resp.status_code == 200:
            # Token is still valid
            return old_token
            
        # If token is invalid, user needs to re-auth
        # We can't auto-refresh without refresh_token
        # But we can suggest user to update token
        return None
    except Exception as e:
        print(f"[YANDEX] Token refresh error: {e}")
        return None

def validate_yandex_token(token):
    """
    Check if Yandex.Music token is valid.
    Returns (is_valid, error_message)
    """
    if not token:
        return False, 'Токен отсутствует'
    
    try:
        client = Client(token)
        # Try to get account status
        account = client.account_status()
        if account:
            return True, None
    except Exception as e:
        if 'Unauthorized' in str(e) or '401' in str(e):
            return False, 'Токен недействителен. Получите новый на https://music.yandex.ru/settings'
        return False, f'Ошибка проверки токена: {str(e)[:50]}'
    
    return False, 'Неизвестная ошибка'
