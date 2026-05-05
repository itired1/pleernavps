# iTired Music

Музыкальный стриминг сервис с поддержкой Яндекс.Музыки, VK Music и SoundCloud.

## Возможности

- 🎵 **Мульти-сервисность** — Яндекс.Музыка, VK, SoundCloud
- 👥️ **Друзья и комнаты** — слушайте музыку вместе
- 🛒️ **Магазин** — покупайте темы, рамки, бейджи
- 📊 **Лирика** — поиск текстов песен
- 🔔 **Подтверждение почты** — безопасная регистрация
- 🖥️ **Темная тема** — стильный интерфейс (#050505, #6366f1)

## Установка

### Требования
- Python 3.8+
- SQLite (или PostgreSQL/MySQL)
- Redis (опционально, для кэширования)

### Быстрый старт

```bash
# 1. Клонировать репозиторий
git clone https://github.com/itired1/pleernavps.git
cd pleernavps

# 2. Создать виртуальное окружение
python3 -m venv venv
source venv/bin/activate

# 3. Установить зависимости
pip install -r app/requirements.txt

# 4. Настроить окружение
cp app/.env.example app/.env
nano app/.env  # Укажите свои ключи API

# 5. Инициализировать БД
python -c "from app.app import db; db.create_all()"

# 6. Запустить
python run.py
```

Сервер будет доступен на http://localhost:5001

## Настройка

### Яндекс.Музыка
1. Получите OAuth-токен на https://music.yandex.ru/settings
2. Укажите его в профиле пользователя

### VK Music
1. Создайте приложение на https://vk.com/dev
2. Получите `access_token` с правами `audio`
3. Укажите в профиле

### SoundCloud
1. Зарегистрируйте приложение на https://soundcloud.com/you/apps
2. Получите `Client ID`
3. Укажите в профиле

## Развёртывание на VPS

```bash
# 1. Клонировать на сервер
git clone https://github.com/itired1/pleernavps.git
cd pleernavps

# 2. Настроить systemd
sudo cp app/itired.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable itired
sudo systemctl start itired
```

## Структура проекта

```
pleernavps/
├── app/
│   ├── app.py          # Основной Flask-приложение
│   ├── models.py       # Модели данных (SQLAlchemy)
│   ├── utils.py         # Вспомогательные функции
│   ├── config.py       # Конфигурация
│   ├── requirements.txt # Зависимости
│   ├── static/        # CSS, JS, изображения
│   └── templates/     # HTML-шаблоны
├── src-tauri/         # Десктоп-приложение (Tauri)
└── run.py             # Точка входа
```

## Лицензия

MIT License — свободное использование.

## Контакты

- GitHub: [@itired1](https://github.com/itired1)
- Сайт: http://111.88.155.103:5001
