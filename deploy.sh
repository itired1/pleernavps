#!/bin/bash

# iTired - Simple VPS Deployment v2.1
# Использование: ./deploy.sh [screen|docker]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== iTired Deployment ===${NC}"

MODE=${1:-screen}

if [ "$MODE" = "screen" ]; then
    echo -e "${YELLOW}Mode: Screen (ручной запуск)${NC}"
    
    # Install screen if needed
    if ! command -v screen &> /dev/null; then
        echo -e "${YELLOW}Installing screen...${NC}"
        sudo apt update && sudo apt install -y screen
    fi
    
    # Check if running in screen
    if screen -list | grep -q "\.itired "; then
        echo -e "${YELLOW}iTired already running in screen${NC}"
        screen -r itired
        exit 0
    fi
    
    # Update code
    if [ -d ".git" ]; then
        echo -e "${YELLOW}Updating code...${NC}"
        git fetch origin
        git reset --hard origin/main
    fi
    
    # Create screen session and run
    echo -e "${YELLOW}Starting in screen session 'itired'...${NC}"
    screen -dmS itired
    screen -S itired -X stuff "cd ~/itiredmp3-main\n"
    
    # Check for virtual environment
    if [ -d "venv" ]; then
        screen -S itired -X stuff "source venv/bin/activate\n"
    fi
    
    screen -S itired -X stuff "python app.py\n"
    
    echo -e "${GREEN}=== DONE ===${NC}"
    echo "Приложение запущено в screen сессии 'itired'"
    echo ""
    echo "Команды:"
    echo "  screen -r itired      - вернуться в сессию"
    echo "  screen -ls           - список сессий"
    echo "  screen -S itired -X quit - остановить"
    echo ""

elif [ "$MODE" = "docker" ]; then
    echo -e "${YELLOW}Mode: Docker${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not found. Install:${NC}"
        echo "curl -fsSL https://get.docker.com | sh"
        exit 1
    fi
    
    # Create SSL folder
    mkdir -p ssl
    
    # Kill old containers
    echo -e "${YELLOW}Stopping old containers...${NC}"
    docker-compose down || true
    
    # Update code
    if [ -d ".git" ]; then
        echo -e "${YELLOW}Updating code...${NC}"
        git pull origin main || echo "Not a git repo, skipping update"
    fi
    
    # Build and start
    echo -e "${YELLOW}Building...${NC}"
    docker-compose build
    
    echo -e "${YELLOW}Starting services...${NC}"
    docker-compose up -d
    
    echo -e "${GREEN}=== DONE ===${NC}"
    echo "App: http://your-server-ip"
    echo ""
    echo "Commands:"
    echo "  docker-compose logs -f   - view logs"
    echo "  docker-compose restart  - restart"
    echo "  docker-compose down    - stop"

else
    echo "Использование: ./deploy.sh [screen|docker]"
    echo "  screen - запуск через screen (рекомендуется)"
    echo "  docker - запуск через Docker"
    exit 1
fi