# Cloudflare WARP Setup for SoundCloud

## На VPS сервере (Linux)

### 1. Установка WARP клиента
```bash
# Ubuntu/Debian
curl -L https://pkg.cloudflareclient.com/ | bash
apt install -y cloudflare-warp
```

### 2. Подключение WARP
```bash
# Регистрация
warp-cli register

# Подключение
warp-cli connect

# Проверка
warp-cli status
```

### 3. Настройка проксирования
```bash
# Включить WARP как прокси
warp-cli enable-always-on

# Или использовать WARP с socks5
# WARP слушает на localhost:40000
```

### 4. Добавить в .env
```
WARP_ENABLED=true
WARP_PROXY=socks5://127.0.0.1:40000
```

## На Windows (для разработки)

### 1. Скачать WARP клиент
https://1.1.1.1/

### 2. Подключиться к WARP

### 3. Добавить в .env
```
SOUNDCLOUD_PROXY= # оставить пустым если WARP уже подключен
```

## Альтернатива - WARP через Docker

```yaml
# docker-compose.yml
services:
  warp-proxy:
    image: ghcr.io/nicholasaldoleone/warp-proxy:latest
    ports:
      - "8080:8080"
    environment:
      - WARP_MODE=proxy
```

## Проверка

```bash
curl -I --proxy http://127.0.0.1:40000 https://api.soundcloud.com
```
