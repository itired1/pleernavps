#!/bin/bash

# iTired - VPS Deployment (без screen)
# Использование: ./deploy.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== iTired Deployment ===${NC}"

# Update code
if [ -d ".git" ]; then
    echo -e "${YELLOW}Updating code...${NC}"
    git fetch origin
    git reset --hard origin/master
fi

# Install packages
echo -e "${YELLOW}Installing packages...${NC}"
pip install --no-cache-dir -r requirements.txt

# Kill old process
pkill -f "python3.*app.py" 2>/dev/null || true

# Start app in background
echo -e "${YELLOW}Starting app...${NC}"
nohup python3 app.py > app.log 2>&1 &

echo -e "${GREEN}=== DONE ===${NC}"
echo "App: http://your-server-ip:5000"
echo ""
echo "Check logs: tail -f app.log"
echo "Stop: pkill -f python3 app.py"