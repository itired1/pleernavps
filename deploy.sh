#!/bin/bash

# iTired - Simple VPS Deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== iTired Deployment ===${NC}"

# Check Docker
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
echo "  docker-compose logs -f     - view logs"
echo "  docker-compose restart - restart"
echo "  docker-compose down   - stop"