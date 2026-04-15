# 🎧 iTired Music / iTired Музыка

[English](#english) | [Русский](#русский)

---

## English

### About
iTired is a personal music streaming web application with integration of Yandex.Music, VK, and SoundCloud. Features include friends system, chat rooms, profile customization, and a virtual goods shop with badges, banners, frames, and themes.

### Tech Stack
- **Backend:** Python, Flask, Flask-SocketIO, SQLAlchemy
- **Frontend:** HTML, CSS, JavaScript
- **Database:** SQLite (development) / PostgreSQL (production)
- **Deploy:** Docker, Yandex Cloud VPS

### Features
- 🎵 Music streaming from Yandex.Music
- 🔍 Search tracks and playlists
- ❤️ Liked tracks
- 📻 Personal recommendations ("Моя Волна")
- 👥 Friends system
- 💬 Real-time chat rooms
- 🛒 Shop (banners, badges, frames, themes)
- 🎨 Profile customization
- 📱 Mobile adaptive design
- 🌙 Dark/Light themes
- 🔔 Listening notifications

### Dependencies
```
pip install -r requirements.txt
```

### Running (Development)
```bash
cd app
python app.py
# Open http://localhost:5001
```

### Running (Docker)
```bash
# Build
docker build -t itired .

# Run
docker run -d -p 5001:5001 --name itired itired

# Or use docker-compose
docker-compose up -d
```

### Project Structure
```
itiredmp3/
├── app/
│   ├── static/
│   │   ├── css/          # Styles
│   │   └── js/           # JavaScript
│   ├── templates/        # HTML templates
│   ├── app.py            # Main Flask app
│   ├── models.py         # Database models
│   ├── utils.py         # API clients (Yandex, VK, SoundCloud)
│   └── config.py        # Configuration
├── src-tauri/           # Desktop app (Tauri)
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── deploy.sh
└── README.md
```

### Environment Variables
Create `.env` file:
```
SECRET_KEY=your-secret-key
DATABASE_URL=sqlite:///itired.db
YANDEX_CLIENT_ID=your-yandex-client-id
YANDEX_CLIENT_SECRET=your-yandex-client-secret
```

### License
MIT

---

## Русский

### О проекте
iTired - персональное музыкальное стриминговое веб-приложение с интеграцией Яндекс.Музыки, VK и SoundCloud. Возможности включают систему друзей, комнаты чата, кастомизацию профиля и магазин виртуальных товаров с значками, баннерами, рамками и темами.

### Технологии
- **Бэкенд:** Python, Flask, Flask-SocketIO, SQLAlchemy
- **Фронтенд:** HTML, CSS, JavaScript
- **База данных:** SQLite (разработка) / PostgreSQL (продакшен)
- **Деплой:** Docker, Yandex Cloud VPS

### Возможности
- 🎵 Музыка из Яндекс.Музыки
- 🔍 Поиск треков и плейлистов
- ❤️ Лайкнутые треки
- 📻 Персональные рекомендации ("Моя Волна")
- 👥 Система друзей
- 💬 Комнаты реального времени
- 🛒 Магазин (баннеры, значки, рамки, темы)
- 🎨 Кастомизация профиля
- 📱 Адаптивный дизайн для мобильных
- 🌙 Тёмная/Светлая темы
- 🔔 Уведомления о прослушивании

### Установка зависимостей
```
pip install -r requirements.txt
```

### Запуск (Разработка)
```bash
cd app
python app.py
# Откройте http://localhost:5001
```

### Запуск (Docker)
```bash
# Сборка
docker build -t itired .

# Запуск
docker run -d -p 5001:5001 --name itired itired

# Или через docker-compose
docker-compose up -d
```

### Структура проекта
```
itiredmp3/
├── app/
│   ├── static/
│   │   ├── css/          # Стили
│   │   └── js/           # JavaScript
│   ├── templates/        # HTML шаблоны
│   ├── app.py            # Основной Flask файл
│   ├── models.py         # Модели базы данных
│   ├── utils.py         # API клиенты (Яндекс, VK, SoundCloud)
│   └── config.py       # Конфигурация
├── src-tauri/           # Десктопное приложение (Tauri)
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── deploy.sh
└── README.md
```

### Переменные окружения
Создайте файл `.env`:
```
SECRET_KEY=ваш-секретный-ключ
DATABASE_URL=sqlite:///itired.db
YANDEX_CLIENT_ID=ваш-yandex-client-id
YANDEX_CLIENT_SECRET=ваш-yandex-client-secret
```

### VPS Деплой (Yandex Cloud)
```bash
# Установка Docker
curl -fsSL https://get.docker.com | sh

# Клонирование и запуск
git clone https://github.com/your-repo/itiredmp3.git
cd itiredmp3
chmod +x deploy.sh
./deploy.sh
```

### Лицензия
MIT