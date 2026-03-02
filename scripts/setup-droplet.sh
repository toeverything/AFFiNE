#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AION — Droplet Setup Script
# Run on a fresh Ubuntu 24.04 DigitalOcean Droplet
#
# Usage:
#   ssh root@<DROPLET_IP> 'bash -s' < scripts/setup-droplet.sh
#   # or copy to server and run:
#   chmod +x setup-droplet.sh && ./setup-droplet.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "==> Updating system packages..."
apt-get update && apt-get upgrade -y

echo "==> Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Enabling Docker service..."
systemctl enable docker
systemctl start docker

echo "==> Configuring firewall (UFW)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Adding swap (needed for building the image)..."
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    4GB swap created"
else
  echo "    Swap already exists, skipping"
fi

echo "==> Creating project directory..."
mkdir -p /opt/aion
cd /opt/aion

echo "==> Cloning AION repository..."
if [ ! -d ".git" ]; then
  git clone https://github.com/luis-cerv/aion.git .
  git checkout canary
else
  echo "    Repository already cloned, pulling latest..."
  git pull origin canary
fi

echo "==> Creating repos directory for Agent Platform..."
mkdir -p repos

echo "==> Copying environment template..."
cp -n .env.prod.example .env 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Edit /opt/aion/.env with your values:"
echo "     nano /opt/aion/.env"
echo ""
echo "  2. Set at minimum:"
echo "     - DOMAIN            (your domain, e.g. aion.example.com)"
echo "     - DB_PASSWORD       (a strong password)"
echo "     - ANTHROPIC_API_KEY (your Anthropic API key)"
echo ""
echo "  3. Configure Google OAuth in config/config.json:"
echo "     nano /opt/aion/config/config.json"
echo ""
echo "  4. Make sure your domain's A record points to this server's IP"
echo ""
echo "  5. Build and start AION (first build takes ~15-20 min):"
echo "     cd /opt/aion"
echo "     docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "  6. Watch the logs:"
echo "     docker compose -f docker-compose.prod.yml logs -f"
echo "═══════════════════════════════════════════════════════════════════════"
