#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AION Development Setup
#
# This script:
#   1. Starts infrastructure via Docker Compose (postgres, redis, mailpit)
#   2. Installs dependencies
#   3. Builds native packages (requires Rust)
#   4. Runs DB migrations
#   5. Starts the server + web frontend in dev mode
#
# Usage:
#   chmod +x scripts/dev-up.sh
#   ./scripts/dev-up.sh           # full setup
#   ./scripts/dev-up.sh --infra   # only start infrastructure
#   ./scripts/dev-up.sh --app     # only start app (assumes infra is running)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

step() { echo -e "${CYAN}▸ $1${NC}"; }
done_step() { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# ─── Parse args ──────────────────────────────────────────────────────────
MODE="all"
if [[ "${1:-}" == "--infra" ]]; then MODE="infra"; fi
if [[ "${1:-}" == "--app" ]]; then MODE="app"; fi

# ─── Infrastructure ──────────────────────────────────────────────────────
start_infra() {
  step "Starting infrastructure (postgres, redis, mailpit)..."

  # Create dev compose from example if not exists
  if [[ ! -f .docker/dev/compose.yml ]]; then
    cp .docker/dev/compose.yml.example .docker/dev/compose.yml
  fi
  if [[ ! -f .docker/dev/.env ]]; then
    cp .docker/dev/.env.example .docker/dev/.env
  fi

  docker compose -f .docker/dev/compose.yml up -d
  done_step "Infrastructure running"

  # Wait for postgres
  step "Waiting for PostgreSQL..."
  for i in {1..30}; do
    if docker compose -f .docker/dev/compose.yml exec -T postgres pg_isready -U affine -d affine >/dev/null 2>&1; then
      done_step "PostgreSQL ready"
      break
    fi
    sleep 1
    if [[ $i -eq 30 ]]; then
      echo "ERROR: PostgreSQL failed to start"
      exit 1
    fi
  done
}

# ─── Application ─────────────────────────────────────────────────────────
start_app() {
  # Check prereqs
  if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is required. Install from https://nodejs.org/"
    exit 1
  fi
  if ! command -v rustc &>/dev/null; then
    warn "Rust not found. Native builds may fail. Install from https://rustup.rs/"
  fi

  # Install dependencies
  step "Installing dependencies..."
  yarn install
  done_step "Dependencies installed"

  # Build native packages
  step "Building native packages..."
  yarn affine @affine/server-native build || warn "Server native build failed (may work without it in dev)"
  yarn affine @affine/native build || warn "Frontend native build failed (may work without it in dev)"
  done_step "Native packages built"

  # Setup server env
  if [[ ! -f packages/backend/server/.env ]]; then
    step "Creating server .env..."
    cat > packages/backend/server/.env << 'EOF'
DATABASE_URL="postgres://affine:affine@localhost:5432/affine"
REDIS_SERVER_HOST=localhost
MAILER_HOST=127.0.0.1
MAILER_PORT=1025
MAILER_SENDER="noreply@aion.local"
MAILER_USER="noreply@aion.local"
MAILER_PASSWORD="aion"
MAILER_SECURE=false
AFFINE_INDEXER_ENABLED=false
EOF
    done_step "Server .env created"
  fi

  # Run migrations
  step "Running database migrations..."
  yarn affine server init
  done_step "Database migrated"

  # Start dev
  step "Starting AION (server + web)..."
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  AION is starting...${NC}"
  echo -e "${GREEN}  Web:     http://localhost:8080${NC}"
  echo -e "${GREEN}  Server:  http://localhost:3010${NC}"
  echo -e "${GREEN}  Agent:   http://localhost:3010/api/agent/v1/config${NC}"
  echo -e "${GREEN}  Mailpit: http://localhost:8025${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
  echo ""

  # Start server and frontend in parallel
  yarn affine server dev &
  SERVER_PID=$!

  yarn dev &
  WEB_PID=$!

  # Handle shutdown
  trap "kill $SERVER_PID $WEB_PID 2>/dev/null; exit 0" SIGINT SIGTERM
  wait
}

# ─── Main ────────────────────────────────────────────────────────────────
case $MODE in
  infra) start_infra ;;
  app)   start_app ;;
  all)   start_infra; start_app ;;
esac
