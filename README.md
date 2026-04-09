# 🎧 iTired Music

Музыкальный стриминг с Яндекс.Музыкой, VK и SoundCloud интеграцией.

## Быстрый старт

### 1. Установка зависимостей
```bash
pip install -r requirements.txt
```

### 2. Запуск сервера
```bash
python app.py
```

### 3. Откройте http://localhost:5001

## VPS Deployment

### Быстрая установка:
```bash
# Установка Docker
curl -fsSL https://get.docker.com | sh

# Клонирование и запуск
git clone https://github.com/your-repo/itiredmp3.git
cd itiredmp3
chmod +x deploy.sh
./deploy.sh
```

### Ручная установка:
```bash
# Сборка образа
docker build -t itired .

# Запуск
docker run -d -p 5001:5001 --name itired itired
```

## Структура проекта

```
itiredmp3/
├── app/
│   ├── static/          # CSS, JS, изображения
│   ├── templates/       # HTML шаблоны
│   ├── app.py          # Основной файл
│   ├── models.py       # Модели БД
│   ├── utils.py        # API клиенты
│   └── config.py       # Конфигурация
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
└── deploy.sh
```

## Возможности

- 🎵 Поиск музыки из Яндекс.Музыки
- 👥 Друзья и комнаты
- 🛒 Магазин (баннеры, значки, рамки, темы)
- 🎨 Кастомизация профиля

## Лицензия

MIT
