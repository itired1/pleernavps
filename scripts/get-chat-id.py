import urllib.request, json

TOKEN = "8442704022:AAFCUHvJnDPf9lexLvK54vSqatEHKRuYiow"

url = f"https://api.telegram.org/bot{TOKEN}/getUpdates"
try:
    req = urllib.request.urlopen(url, timeout=15)
    data = json.loads(req.read())

    if not data.get("result"):
        print("Нет сообщений. Напиши что-нибудь в канал и запусти снова.")
    else:
        for update in data["result"]:
            msg = update.get("channel_post") or update.get("message")
            if msg:
                chat_id = msg["chat"]["id"]
                title = msg["chat"].get("title", "без названия")
                print(f"Канал: {title}")
                print(f"CHAT_ID: {chat_id}")
                print(f"Вставь CHAT_ID в .git/hooks/post-commit")
                break
except Exception as e:
    print(f"Ошибка: {e}")
    print("\n1. Убедись что бот добавлен в канал как администратор")
    print("2. Напиши любое сообщение в канал")
    print("3. Запусти этот скрипт снова")
