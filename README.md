# 🎵 iTired Music

> Музыкaльный стриминг нового поколения с поддержкой Яндекс.Музыки, VK Music и SoundCloud.

[![Deploy on Yandex Cloud](https://img.shields.io/badge/🌩_Deploy_on-Яндекс.Облако-blue?style=for-the-badge)](https://console.cloud.yandex.ru/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/itired1/pleernavps?style=for-the-badge)](https://github.com/itired1/pleernavps)

---

## 🌟 О проекте

**iTired** — это современный музыкальный сервис, объединяющий лучшие треки из:
- 🎧 **Яндекс.Музыки** (официальная интеграция через OAuth)
- 🎶 **VK Music** (доступ к миллионам треков)
- 🎵 **SoundCloud** (инди-музыка и ремиксы)

### ✨ Особенности
- 🏠 **Комнаты и друзья** — слушайте музыку вместе в реальном времени
- 🛒 **Магазин** — покупайте темы, рамки, бейджи за внутреннюю валюту
- 📊 **Тексты песен** — поиск по тексту через LRCLIB
- 🔔 **Подтверждение почты** — безопасная регистрация
- 🖥️ **Тёмная тема** — стильный интерфейс (#050505 фон, #6366f1 акцент)
- 🖥 **Web Audio API** — нормализация громкости (ReplayGain)
- 📱 **Десктоп-приложение** — Tauri 2 с системным треем

---

## 🚀 Быстрый старт

### Требования
- Python 3.8+
- SQLite (или PostgreSQL/MySQL)
- Redis (опционально, для кэширования)

### Установка и запуск

```bash
# 1. Клонировать репозиторий
git clone https://github.com/itired1/pleernavps.git
cd pleernavps

# 2. Создать виртуальное окружение
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

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

Сервер будет доступен на **http://localhost:5001**

---

## ⚙️ Настройка сервисов

### 🎧 Яндекс.Музыка
1. Получите OAuth-токен на https://music.yandex.ru/settings
2. Укажите его в профиле пользователя
3. Токен проверяется автоматически (статус `yandex_token_valid`)

### 🎶 VK Music
1. Создайте приложение на https://vk.com/dev
2. Получите `access_token` с правами `audio`
3. Укажите в профиле

### 🎵 SoundCloud
1. Зарегистрируйте приложение на https://soundcloud.com/you/apps
2. Получите `Client ID`
3. Укажите в профиле (прокси опционально)

---

## 🌐 Развёртывание на VPS

```bash
# 1. Клонировать на сервер
git clone https://github.com/itired1/pleernavps.git
cd pleernavps

# 2. Установить зависимости
python3 -m venv venv
source venv/bin/activate
pip install -r app/requirements.txt

# 3. Настроить systemd
sudo cp app/itired.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable itired
sudo systemctl start itired
```

Проверить статус:
```bash
sudo systemctl status itired --no-pager
```

Сайт будет доступен на **http://IP-АДРЕС:5001**

---

## 📁 Структура проекта

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
├── run.py             # Точка входа
└── README.md          # Этот файл
```

---

## 🎯 Roadmap

- [x] Автообновление токена Яндекс.Музыки
- [x] Нормализация громкости (ReplayGain)
- [x] Поиск по тексту песен (LRCLIB)
- [x] Подтверждение почты при регистрации
- [ ] Миграция с eventlet на asyncio (gevent)
- [ ] Кэширование через Redis
- [ ] Мобильное приложение (React Native)

---

## 🤝 Contributing

1. Форкните репозиторий
2. Создайте ветку для фичи (`git checkout -b feature/AmazingFeature`)
3. Закоммитьте изменения (`git commit -m 'Add some AmazingFeature'`)
4. Запушьте ветку (`git push origin feature/AmazingFeature`)
5. Откройте Pull Request

---

## 📞 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📧 Contact

- GitHub: [@itired1](https://github.com/itired1)
- Website: http://111.88.155.103:5001
- Email: itired@itired.com

---

<p align="center">
  <img src="https://img.shields.io/badge/❤️_Made_with_love-red?style=for-the-badge" alt="Made with love">
</p>

---

# 🎵 iTired Music (English)

> Next-generation music streaming service with Yandex.Music, VK Music, and SoundCloud support.

## 🌟 About

**iTired** is a modern music service that unites the best tracks from:
- 🎧 **Yandex.Music** (official OAuth integration)
- 🎶 **VK Music** (access to millions of tracks)
- 🎵 **SoundCloud** (indie music and remixes)

### ✨ Features
- 🏠 **Rooms & Friends** — listen together in real-time
- 🛒 **Shop** — buy themes, frames, badges with internal currency
- 📊 **Lyrics Search** — search by lyrics via LRCLIB
- 🔔 **Email Verification** — secure registration
- 🖥️ **Dark Theme** — stylish interface (#050505 background, #6366f1 accent)
- 🖥 **Web Audio API** — volume normalization (ReplayGain)
- 📱 **Desktop App** — Tauri 2 with system tray

## 🚀 Quick Start

```bash
git clone https://github.com/itired1/pleernavps.git
cd pleernavps
python3 -m venv venv
source venv/bin/activate
pip install -r app/requirements.txt
python run.py
```

Available at **http://localhost:5001**

## 📞 License

MIT License — free to use, modify, and distribute.

---

<p align="center">
  <img src="https://img.shields.io/badge/❤️_Made_with_love-red?style=for-the-badge" alt="Made with love">
</p>
