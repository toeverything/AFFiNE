#!/bin/bash
# Quick fix for ngrok connection errors
# This ensures ngrok points to the correct port (3010) where AFFiNE runs

set -e

echo "🔧 Fixing ngrok connection..."

# Kill any existing ngrok processes
echo "🛑 Stopping existing ngrok processes..."
pkill ngrok 2>/dev/null || echo "No ngrok processes found"

# Check if backend is running on port 3010
if ! lsof -Pi :3010 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "❌ Backend is NOT running on port 3010"
    echo ""
    echo "Please start the backend first:"
    echo "  1. Start dev services: docker compose -f ./.docker/dev/compose.yml up -d"
    echo "  2. Start backend: yarn affine server dev"
    echo ""
    echo "Then run this script again, or run: ngrok http 3010"
    exit 1
fi

echo "✅ Backend is running on port 3010"

# Wait a moment
sleep 1

# Start ngrok pointing to port 3010
echo "🌐 Starting ngrok tunnel on port 3010..."
echo ""
echo "📋 ngrok will start in the foreground. Press Ctrl+C to stop."
echo "   Copy the HTTPS URL (e.g., https://abc123.ngrok-free.app) and set it in Netlify as AFFINE_BACKEND_URL"
echo ""

ngrok http 3010

