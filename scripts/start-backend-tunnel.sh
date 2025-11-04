#!/bin/bash
# Quick script to start AFFiNE backend locally and expose via ngrok
# Usage: ./scripts/start-backend-tunnel.sh

set -e

echo "🚀 Starting AFFiNE backend with ngrok tunnel..."

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not found. Install from: https://ngrok.com/download"
    exit 1
fi

# Check if backend is already running
if lsof -Pi :3010 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3010 is already in use. Is backend already running?"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Start dev services if not running
if ! docker ps | grep -q affine_postgres; then
    echo "📦 Starting dev services (Postgres, Redis)..."
    cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml 2>/dev/null || true
    cp ./.docker/dev/.env.example ./.docker/dev/.env 2>/dev/null || true
    docker compose -f ./.docker/dev/compose.yml up -d
    echo "✅ Dev services started"
fi

# Build native packages if needed
if [ ! -f "packages/backend/server/node_modules/@affine/server-native/index.node" ]; then
    echo "🔨 Building native packages..."
    yarn affine @affine/server-native build
fi

# Start backend in background
echo "🔧 Starting AFFiNE backend..."
yarn affine server dev &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to start on port 3010..."
sleep 5

# Check if backend started successfully
if ! lsof -Pi :3010 -sTCP:LISTEN -t >/dev/null ; then
    echo "❌ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Backend is running on port 3010"
echo "🌐 Starting ngrok tunnel..."

# Start ngrok
ngrok http 3010 &
NGROK_PID=$!

# Wait for ngrok to start and get URL
sleep 3

# Get ngrok URL (try API first, fallback to parsing)
NGROK_URL=""
if command -v curl &> /dev/null; then
    NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o 'https://[^"]*\.ngrok-free\.app\|https://[^"]*\.ngrok\.io' | head -1)
fi

if [ -z "$NGROK_URL" ]; then
    echo ""
    echo "📋 Please copy the HTTPS URL from the ngrok output above"
    echo "   It should look like: https://abc123.ngrok-free.app"
    echo ""
    echo "🔧 Set this in Netlify:"
    echo "   Environment variable: AFFINE_BACKEND_URL = [the ngrok URL]"
    echo ""
    read -p "Press Enter when you've copied the URL..."
else
    echo ""
    echo "✅ Your backend is available at:"
    echo "   $NGROK_URL"
    echo ""
    echo "🔧 Set this in Netlify:"
    echo "   Environment variable: AFFINE_BACKEND_URL = $NGROK_URL"
    echo ""
fi

echo ""
echo "🛑 Press Ctrl+C to stop both backend and ngrok"
echo ""

# Wait for user interrupt
trap "echo ''; echo '🛑 Stopping...'; kill $BACKEND_PID $NGROK_PID 2>/dev/null || true; exit" INT TERM

wait

