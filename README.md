# 🎵 iTired Music

> Музыкальный стриминг нового поколения с поддержкой Яндекс.Музыки, VK Music и SoundCloud.  
> Работает как веб-сервер и как Android-приложение (Tauri).

[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## 🌟 Возможности

- 🎧 **Яндекс.Музыка** — поиск, лайки, плейлисты, моя волна
- 🎶 **VK Music** — поиск, лайки, рекомендации
- 🎵 **SoundCloud** — поиск, лайки, тренды, похожие треки (требуется WARP в РФ)
- 🔁 **Автоплей** — после окончания трека подбирает похожий
- 🎚️ **Кроссфейд** — плавный переход между треками (3 сек)
- 📜 **Тексты песен** — синхронизированные караоке-тексты (LRCLIB + Genius)
- 👤 **Страница артиста** — клик по имени → все треки со всех сервисов
- 🔀 **Поиск на SoundCloud** — замена цензурированных треков Яндекс.Музыки
- 🏠 **Комнаты** — слушайте музыку вместе в реальном времени
- 🛒 **Магазин** — темы, рамки, бейджи за внутреннюю валюту
- 📊 **Статистика** — часы прослушивания, топ артистов
- 🖥️ **Тёмная тема** — (#050505 фон, #6366f1 акцент)
- 📱 **Android** — нативное приложение через Tauri

---

## 🚀 Запуск локально

### Требования
- Python 3.10+
- Git
- (Опционально) Cloudflare WARP — для SoundCloud в России
- (Опционально) Rust + Android SDK — для сборки APK

### Установка

```bash
# 1. Клонировать
git clone https://github.com/itired1/pleernavps.git
cd pleernavps

# 2. Виртуальное окружение
python -m venv venv
# Linux/Mac:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 3. Установить зависимости
pip install -r app/requirements.txt

# 4. Настроить .env
copy app\.env.example app\.env
# Отредактируйте app\.env — укажите SECRET_KEY и при необходимости токены

# 5. Инициализировать БД
python -c "from app.app import app; from app.models import db; app.app_context().push(); db.create_all()"

# 6. Запустить
python run.py
```

Сервер будет доступен на **http://localhost:5001**

---

## ⚙️ Настройка сервисов

### 🎧 Яндекс.Музыка
1. Зайдите в профиль → вставьте OAuth-токен
2. Получить токен: https://music.yandex.ru/settings → скопировать токен из cookies (`yandex_login`)
3. Либо через консоль браузера: `console.log(require('@yandex-int/oauth').getToken())`

### 🎶 VK Music
1. Перейдите на https://vkhost.github.io (выберите Kate Mobile)
2. Разрешите доступ — получите токен
3. Вставьте в профиль

### 🎵 SoundCloud
> **В России SoundCloud заблокирован. Обязательно включите Cloudflare WARP на сервере/компьютере перед использованием.**

1. В профиле нажмите кнопку `🔍` рядом с полем Client ID
2. Или вставьте URL своего профиля SoundCloud и нажмите поиск — client_id найдётся автоматически
3. Либо вручную: F12 → Network → фильтр `client_id` → обновите страницу → скопируйте из запроса к `api-v2.soundcloud.com`

### 💡 Если треки Яндекс.Музыки «запиканы» (цензура в РФ)
В плеере появится кнопка <i class="fab fa-soundcloud"></i> — нажмите, чтобы найти этот же трек на SoundCloud без цензуры.

---

## 📱 Сборка Android APK (Tauri)

### Требования
- Rust `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android`
- Android Studio + SDK (API 34)
- `npm install -g @tauri-apps/cli`

### Сборка
```bash
cd src-tauri
npm install
cargo tauri android init
cargo tauri android build
```

APK будет в `src-tauri/gen/android/app/build/outputs/apk/universal/release/`

> APK нужно подписать перед установкой:
> ```bash
> apksigner sign --ks "%USERPROFILE%\.android\debug.keystore" --ks-pass pass:android --out app-universal-release.apk app-universal-release-unsigned.apk
> ```

---

## 🐳 Развёртывание на VPS

```bash
git clone https://github.com/itired1/pleernavps.git
cd pleernavps
python3 -m venv venv
source venv/bin/activate
pip install -r app/requirements.txt

# Настроить systemd сервис
sudo cp app/itired.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable itired --now
```

Сервер на **http://IP-АДРЕС:5001**

---

## 📁 Структура проекта

```
pleernavps/
├── app/
│   ├── app.py           # Flask-приложение (API + роуты)
│   ├── models.py        # SQLAlchemy модели
│   ├── utils.py         # Хелперы (SoundCloud, VK, рекомендации)
│   ├── config.py        # Конфигурация (.env)
│   ├── requirements.txt # Python-зависимости
│   ├── static/
│   │   ├── css/         # Стили
│   │   └── js/          # Скрипты (player, lyrics, profile, ...)
│   └── templates/       # Jinja2-шаблоны
├── src-tauri/           # Tauri Android/Desktop
├── run.py               # Точка входа
└── README.md
```

---

## 🛠️ Технологии

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO, Flask-Limiter
- **Frontend**: Vanilla JS, CSS Custom Properties, Jinja2
- **Streaming**: SoundCloud API, Yandex Music API (yandex-music-py), VK API (vk_api)
- **Тексты**: LRCLIB API, Genius API
- **Desktop/Android**: Tauri 2, Rust
- **База данных**: SQLite (по умолчанию) / PostgreSQL

---

## 📄 License

MIT — свободно используйте, модифицируйте и распространяйте.
