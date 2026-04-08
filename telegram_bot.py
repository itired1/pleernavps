"""
Telegram Bot for iTired 2FA Authentication
Run this alongside app.py or separately
"""

import os
import requests
from datetime import datetime, timedelta
import random
import string

TELEGRAM_BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
API_BASE = os.environ.get('API_BASE', 'http://localhost:5001')

class iTiredTelegramBot:
    def __init__(self, bot_token):
        self.token = bot_token
        self.api_url = f"https://api.telegram.org/bot{bot_token}"
        self.pending_codes = {}
        self.link_codes = {}
    
    def send_message(self, chat_id, text, parse_mode='HTML'):
        """Send message to user"""
        url = f"{self.api_url}/sendMessage"
        data = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': parse_mode
        }
        requests.post(url, data=data)
    
    def generate_2fa_code(self, user_id):
        """Generate 2FA code for user"""
        code = ''.join(random.choices(string.digits, k=6))
        expires = datetime.utcnow() + timedelta(minutes=5)
        
        self.pending_codes[user_id] = {
            'code': code,
            'expires': expires,
            'attempts': 0
        }
        return code
    
    def verify_2fa_code(self, user_id, code):
        """Verify 2FA code"""
        if user_id not in self.pending_codes:
            return False, "Код не найден. Запросите новый код."
        
        pending = self.pending_codes[user_id]
        
        if datetime.utcnow() > pending['expires']:
            del self.pending_codes[user_id]
            return False, "Код истёк. Запросите новый код."
        
        if pending['attempts'] >= 3:
            del self.pending_codes[user_id]
            return False, "Слишком много попыток. Запросите новый код."
        
        pending['attempts'] += 1
        
        if pending['code'] == code:
            del self.pending_codes[user_id]
            return True, "Код подтверждён!"
        
        return False, "Неверный код"
    
    def generate_link_code(self, user_id):
        """Generate code to link Telegram to account"""
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        expires = datetime.utcnow() + timedelta(minutes=15)
        
        self.link_codes[code] = {
            'user_id': user_id,
            'expires': expires
        }
        return code
    
    def verify_link_code(self, code):
        """Verify link code and return user_id"""
        if code not in self.link_codes:
            return None, "Код не найден"
        
        link = self.link_codes[code]
        
        if datetime.utcnow() > link['expires']:
            del self.link_codes[code]
            return None, "Код истёк"
        
        user_id = link['user_id']
        del self.link_codes[code]
        return user_id, "OK"
    
    def handle_update(self, update):
        """Handle incoming Telegram update"""
        if 'message' not in update:
            return
        
        message = update['message']
        chat_id = str(message['chat']['id'])
        text = message.get('text', '').strip()
        
        if text.startswith('/start'):
            self.cmd_start(chat_id)
        elif text.startswith('/link '):
            code = text[6:].strip()
            self.cmd_link(chat_id, code)
        elif text.startswith('/unlink'):
            self.cmd_unlink(chat_id)
        elif text.startswith('/help'):
            self.cmd_help(chat_id)
        else:
            self.cmd_unknown(chat_id)
    
    def cmd_start(self, chat_id):
        """Handle /start command"""
        text = """
👋 <b>Добро пожаловать в iTired Music!</b>

Используйте эти команды:

/link &lt;код&gt; - Привязать аккаунт
/unlink - Отвязать аккаунт
/help - Помощь

📌 Чтобы привязать Telegram:
1. Зайдите в настройки iTired
2. Нажмите "Привязать Telegram"
3. Введите полученный код сюда

Например: /link ABC123XY
"""
        self.send_message(chat_id, text)
    
    def cmd_link(self, chat_id, code):
        """Handle /link command"""
        user_id, status = self.verify_link_code(code)
        
        if user_id:
            # Save telegram_chat_id to user via API
            try:
                requests.post(f'{API_BASE}/api/telegram/link', json={
                    'user_id': user_id,
                    'chat_id': chat_id
                }, timeout=10)
                text = f"""
✅ <b>Аккаунт привязан!</b>

Теперь вы можете использовать Telegram для 2FA.
"""
            except Exception as e:
                text = f"❌ Ошибка: {e}"
        else:
            text = f"❌ {status}\n\nПроверьте код и попробуйте снова."
        
        self.send_message(chat_id, text)
    
    def cmd_unlink(self, chat_id):
        """Handle /unlink command"""
        try:
            requests.post(f'{API_BASE}/api/telegram/unlink', json={
                'chat_id': chat_id
            }, timeout=10)
            text = "✅ Telegram отвязан от аккаунта."
        except Exception as e:
            text = f"❌ Ошибка: {e}"
        
        self.send_message(chat_id, text)
    
    def cmd_help(self, chat_id):
        """Handle /help command"""
        text = """
📖 <b>Справка по командам:</b>

/start - Начать
/link &lt;код&gt; - Привязать аккаунт
/unlink - Отвязать аккаунт
/help - Эта справка

💡 <b>Что даёт привязка:</b>
• 2FA через Telegram
• Уведомления о новых треках
• Быстрый вход
"""
        self.send_message(chat_id, text)
    
    def cmd_unknown(self, chat_id):
        """Handle unknown commands"""
        text = """
❓ Неизвестная команда.

Используйте /help для списка команд.
"""
        self.send_message(chat_id, text)
    
    def send_2fa_code(self, chat_id, code):
        """Send 2FA code to user"""
        text = f"""
🔐 <b>Код подтверждения iTired</b>

Ваш код: <code>{code}</code>

⏰ Действует 5 минут
🔒 Никому не сообщайте этот код
"""
        self.send_message(chat_id, text)
    
    def notify_track_changed(self, chat_id, track_title, artist):
        """Notify user when track changes"""
        text = f"""
🎵 <b>Сейчас играет:</b>

{track_title}
{artist}
"""
        self.send_message(chat_id, text)
    
    def poll_updates(self):
        """Poll for updates using long polling"""
        offset = None
        
        while True:
            try:
                url = f"{self.api_url}/getUpdates"
                params = {'timeout': 30, 'allowed_updates': 'message'}
                if offset:
                    params['offset'] = offset
                
                response = requests.get(url, params=params, timeout=35)
                data = response.json()
                
                if not data.get('ok'):
                    continue
                
                updates = data.get('result', [])
                
                for update in updates:
                    self.handle_update(update)
                    offset = update['update_id'] + 1
                    
            except requests.exceptions.RequestException as e:
                print(f"Polling error: {e}")
            except Exception as e:
                print(f"Update handling error: {e}")
            
            import time
            time.sleep(1)


def main():
    bot_token = TELEGRAM_BOT_TOKEN
    
    if not bot_token:
        print("❌ TELEGRAM_BOT_TOKEN not set!")
        print("Get a bot token from @BotFather on Telegram")
        return
    
    print(f"🤖 iTired Telegram Bot starting...")
    print(f"📡 API Base: {API_BASE}")
    
    bot = iTiredTelegramBot(bot_token)
    
    try:
        bot.poll_updates()
    except KeyboardInterrupt:
        print("\n👋 Bot stopped")


if __name__ == '__main__':
    main()
