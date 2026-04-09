#!/bin/bash

# iTired Music - VPS Deployment Script

set -e

echo "=== iTired Music Deployment ==="

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker не установлен. Установите Docker:${NC}"
    echo "curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose не установлен${NC}"
    exit 1
fi

# Создание SSL директории
mkdir -p ssl

echo -e "${YELLOW}Останавливаю старые контейнеры...${NC}"
docker-compose down

echo -e "${YELLOW}Обновляю код...${NC}"
git pull origin main

echo -e "${YELLOW}Собираю образы...${NC}"
docker-compose build

echo -e "${YELLOW}Запускаю...${NC}"
docker-compose up -d

echo -e "${GREEN}=== Готово! ===${NC}"
echo "Приложение доступно на http://your-server-ip"
echo ""
echo "Команды управления:"
echo "  docker-compose logs -f    - смотреть логи"
echo "  docker-compose restart    - перезапустить"
echo "  docker-compose down       - остановить"
