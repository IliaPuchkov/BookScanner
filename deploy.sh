#!/bin/bash
set -e

# BookScanner — deploy script for Hetzner
# Usage: ./deploy.sh <server-ip> [domain]

SERVER_IP=$1
DOMAIN=$2
SSH_USER=${SSH_USER:-root}
REMOTE_DIR=/opt/bookscanner

if [ -z "$SERVER_IP" ]; then
  echo "Usage: ./deploy.sh <server-ip> [domain]"
  exit 1
fi

echo "==> Syncing code to $SERVER_IP..."
rsync -avz --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/backend/dist' \
  --exclude='apps/mobile' \
  --exclude='*.env' \
  --exclude='docker/.env' \
  . "$SSH_USER@$SERVER_IP:$REMOTE_DIR"

echo "==> Deploying on server..."
ssh "$SSH_USER@$SERVER_IP" bash << EOF
  set -e
  cd $REMOTE_DIR

  # Build and restart
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env build --no-cache backend
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --force-recreate backend
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d

  echo "==> Done. Containers:"
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env ps
EOF

echo "==> Deployed successfully!"
