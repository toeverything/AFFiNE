#!/bin/bash
# Production deployment script for AFFiNE to claster.ydns.eu
# Usage: chmod +x scripts/deploy_to_server.sh && ./scripts/deploy_to_server.sh <server-ip>
# Example: ./scripts/deploy_to_server.sh 192.168.1.100

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <server-ip-or-hostname>"
    echo "Example: $0 192.168.1.100"
    exit 1
fi

SERVER="$1"
APP_DIR="/opt/affine"
DOMAIN="claster.ydns.eu"
COMPOSE_FILE="docker-compose.prod.yml"

echo "========================================="
echo "AFFiNE Production Deployment"
echo "Server: $SERVER"
echo "Domain: $DOMAIN"
echo "========================================="

# Check SSH connection
echo "[1/5] Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 root@$SERVER "echo 'SSH OK'" > /dev/null 2>&1; then
    echo "✗ Cannot connect to $SERVER via SSH"
    echo "Make sure:"
    echo "  1. Server IP is correct: $SERVER"
    echo "  2. SSH access is enabled"
    echo "  3. Your SSH key is configured (ssh-copy-id root@$SERVER)"
    exit 1
fi
echo "✓ SSH connection OK"

# Copy docker-compose.prod.yml
echo "[2/5] Uploading deployment files..."
scp docker-compose.prod.yml root@$SERVER:$APP_DIR/
scp docker/server.Dockerfile root@$SERVER:$APP_DIR/Dockerfile
echo "✓ Files uploaded"

# Build and start services
echo "[3/5] Building and starting Docker services..."
ssh root@$SERVER "cd $APP_DIR && docker-compose -f $COMPOSE_FILE build"
ssh root@$SERVER "cd $APP_DIR && docker-compose -f $COMPOSE_FILE up -d"
echo "✓ Services started"

# Run database migrations
echo "[4/5] Running database migrations..."
ssh root@$SERVER "cd $APP_DIR && docker-compose -f $COMPOSE_FILE exec -T affine yarn prisma migrate deploy"
echo "✓ Migrations complete"

# Verify deployment
echo "[5/5] Verifying deployment..."
echo ""
echo "Checking application health..."
HEALTH=$(ssh root@$SERVER "curl -s -o /dev/null -w '%{http_code}' http://localhost:3010/api/health || echo '0'")

if [ "$HEALTH" = "200" ]; then
    echo "✓ Application is running"
else
    echo "⚠ Application returned status: $HEALTH"
    echo "Check logs: ssh root@$SERVER 'docker-compose -f $APP_DIR/$COMPOSE_FILE logs affine'"
fi

echo ""
echo "========================================="
echo "✓ Deployment complete!"
echo "========================================="
echo ""
echo "Your site is now available at:"
echo "  https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  View logs:        ssh root@$SERVER 'docker-compose -f $APP_DIR/$COMPOSE_FILE logs -f affine'"
echo "  Restart:          ssh root@$SERVER 'docker-compose -f $APP_DIR/$COMPOSE_FILE restart'"
echo "  Stop:             ssh root@$SERVER 'docker-compose -f $APP_DIR/$COMPOSE_FILE down'"
echo "  Database shell:   ssh root@$SERVER 'docker-compose -f $APP_DIR/$COMPOSE_FILE exec postgres psql -U affine -d affine'"
echo ""
