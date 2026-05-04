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

  # Build
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env build backend

  # Restart
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d --force-recreate backend

  # Reconnect to both networks immediately (force-recreate loses docker_web connection)
  sleep 3
  docker network connect --alias backend docker_web bookscanner-backend 2>/dev/null || true
  docker network connect docker_internal bookscanner-backend 2>/dev/null || true
  docker exec bookscanner-nginx nginx -s reload

  # Run migrations inside the running container (correct network, DB reachable)
  echo "==> Running migrations..."
  sleep 3
  docker exec bookscanner-backend sh -c "cd /app/apps/backend && pnpm migration:run"

  echo "==> Done. Containers:"
  docker compose -f docker/docker-compose.prod.yml --env-file docker/.env ps
  echo ""
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
EOF

echo "==> Deployed successfully!"
