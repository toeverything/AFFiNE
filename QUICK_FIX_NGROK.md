# Quick Fix: ngrok Connection Error

## Problem
You're getting: `ERR_NGROK_8012 - connection refused on port 80`

This means:
1. ngrok is trying to connect to port 80 (wrong port)
2. OR the backend isn't running yet

## Solution

### Step 1: Make sure backend is running

**Option A: Use the automated script** (easiest):
```bash
./scripts/start-backend-tunnel.sh
```
This starts both backend and ngrok automatically.

**Option B: Manual start**:

1. **Start backend first** (in one terminal):
   ```bash
   # Start dev services
   docker compose -f ./.docker/dev/compose.yml up -d
   
   # Start backend (runs on port 3010)
   yarn affine server dev
   ```

2. **Wait for backend to start** - you should see:
   ```
   AFFiNE Server is running
   Listening on http://0.0.0.0:3010
   ```

3. **Start ngrok pointing to port 3010** (in another terminal):
   ```bash
   ngrok http 3010
   ```
   **NOT** `ngrok http 80` ❌

### Step 2: Verify

1. **Check backend is running**:
   ```bash
   curl http://localhost:3010/api/health
   # or
   lsof -i :3010
   ```
   Should show port 3010 is in use.

2. **Check ngrok**:
   - Open http://localhost:4040 in your browser (ngrok dashboard)
   - Or check the ngrok terminal output
   - Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)

3. **Set in Netlify**:
   - `AFFINE_BACKEND_URL` = `https://abc123.ngrok-free.app`

## Common Issues

### Backend not starting
- Check if port 3010 is already in use:
  ```bash
  lsof -i :3010
  ```
- Make sure dev services (Postgres, Redis) are running:
  ```bash
  docker compose -f ./.docker/dev/compose.yml ps
  ```

### ngrok still connecting to wrong port
- Make sure you're using: `ngrok http 3010` (not port 80)
- Check if you have an ngrok config file overriding it:
  ```bash
  cat ~/.ngrok2/ngrok.yml
  ```
- Kill any existing ngrok processes:
  ```bash
  pkill ngrok
  ```

### Port conflict
If port 3010 is already in use:
```bash
# Find what's using it
lsof -i :3010

# Kill it if needed
kill -9 <PID>
```

## Quick Test

Once both are running:
1. Backend: http://localhost:3010/graphql (should work)
2. ngrok: https://your-ngrok-url.ngrok-free.app/graphql (should proxy to backend)

