#!/bin/bash
# Production server setup script for AFFiNE deployment on claster.ydns.eu
# Usage: chmod +x scripts/setup_production.sh && ./scripts/setup_production.sh
# Run this ONCE on the production server as root or with sudo

set -e

DOMAIN="claster.ydns.eu"
APP_DIR="/opt/affine"
DATA_DIR="/var/affine"

echo "========================================="
echo "AFFiNE Production Server Setup"
echo "Domain: $DOMAIN"
echo "========================================="

# 1. Update system packages
echo "[1/8] Updating system packages..."
apt-get update && apt-get upgrade -y

# 2. Install Docker
echo "[2/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    usermod -aG docker $SUDO_USER || true
else
    echo "Docker already installed"
fi

# 3. Install Docker Compose
echo "[3/8] Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
else
    echo "Docker Compose already installed"
fi

# 4. Install Nginx
echo "[4/8] Installing Nginx and certbot..."
apt-get install -y nginx certbot python3-certbot-nginx

# 5. Create application directories
echo "[5/8] Creating application directories..."
mkdir -p $APP_DIR
mkdir -p $DATA_DIR/postgres/pgdata
mkdir -p $DATA_DIR/redis
mkdir -p /var/www/certbot
chown -R 1000:1000 $DATA_DIR

# 6. Copy nginx configuration
echo "[6/8] Setting up Nginx..."
if [ -f "nginx/$DOMAIN.conf" ]; then
    cp "nginx/$DOMAIN.conf" /etc/nginx/sites-available/$DOMAIN
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
    echo "✓ Nginx configured"
else
    echo "⚠ nginx/$DOMAIN.conf not found, skipping"
fi

# 7. Provision SSL certificate
echo "[7/8] Provisioning SSL certificate with Let's Encrypt..."
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    # Temporary HTTP server for ACME challenge
    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email admin@$DOMAIN \
        -d $DOMAIN
    
    # Reload nginx with SSL
    systemctl reload nginx
    echo "✓ SSL certificate provisioned"
else
    echo "SSL certificate already exists"
fi

# 8. Copy environment template
echo "[8/8] Preparing environment..."
if [ ! -f "$APP_DIR/.env.production" ]; then
    if [ -f ".env.production.example" ]; then
        cp .env.production.example $APP_DIR/.env.production
        echo ""
        echo "⚠️  IMPORTANT: Edit the following file and set real values:"
        echo "   $APP_DIR/.env.production"
        echo ""
        echo "   Required fields to update:"
        echo "   - DB_PASSWORD: Strong database password"
        echo "   - MAILER_KEY: Mailgun/SendGrid API key"
        echo "   - MAILER_USER: SMTP username"
        echo "   - MAILER_PASSWORD: SMTP password"
        echo "   - Other fields as needed"
    fi
fi

echo ""
echo "========================================="
echo "✓ Server setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit: $APP_DIR/.env.production"
echo "2. Copy docker-compose.prod.yml to $APP_DIR/"
echo "3. Copy Dockerfile to $APP_DIR/"
echo "4. Run: cd $APP_DIR && docker-compose -f docker-compose.prod.yml up -d"
echo "5. Run migrations: docker-compose -f docker-compose.prod.yml exec affine yarn prisma migrate deploy"
echo ""
