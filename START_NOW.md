# Quick Start Guide - Get Your Backend Running

Your ngrok URL is: `https://repellingly-identifiable-freeda.ngrok-free.dev/`

But the backend isn't running on port 3010. Here's how to fix it:

## Step-by-Step Fix

### 1. Make sure Docker Desktop is running
- Open Docker Desktop application
- Wait until it shows "Docker Desktop is running" in the menu bar

### 2. Start Dev Services (Postgres, Redis)

Open a terminal and run:

```bash
cd /Users/guychenya/Documents/GitHub-Repos/AFFiNE

# Make sure compose files exist
cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml
cp ./.docker/dev/.env.example ./.docker/dev/.env

# Start dev services
docker compose -f ./.docker/dev/compose.yml up -d
```

Wait ~10-20 seconds for services to start. Check status:
```bash
docker compose -f ./.docker/dev/compose.yml ps
```

You should see Postgres and Redis running.

### 3. Build Native Packages (if needed)

```bash
yarn affine @affine/server-native build
```

This may take a few minutes the first time.

### 4. Start Backend Server

**Open a NEW terminal window** (keep the previous one running) and run:

```bash
cd /Users/guychenya/Documents/GitHub-Repos/AFFiNE

yarn affine server dev
```

Wait until you see:
```
✅ AFFiNE Server is running in [development] mode
✅ Listening on http://0.0.0.0:3010
```

**Keep this terminal open** - the backend must keep running.

### 5. Verify ngrok Connection

Once backend is running, test the connection:

```bash
# Test local backend
curl http://localhost:3010/graphql

# Test via ngrok (should work now)
curl https://repellingly-identifiable-freeda.ngrok-free.dev/graphql
```

### 6. Set in Netlify

1. Go to Netlify → Your site → **Site settings** → **Environment variables**
2. Add: `AFFINE_BACKEND_URL` = `https://repellingly-identifiable-freeda.ngrok-free.dev`
3. **Redeploy** your Netlify site

## Troubleshooting

### Docker not found
- Install Docker Desktop: https://www.docker.com/products/docker-desktop
- Make sure it's running before starting services

### Port 3010 already in use
```bash
# Find what's using it
lsof -i :3010

# Kill it if needed
kill -9 <PID>
```

### Backend won't start
- Check dev services: `docker compose -f ./.docker/dev/compose.yml ps`
- Check logs: `docker compose -f ./.docker/dev/compose.yml logs`
- Make sure native packages are built

### ngrok still offline
- Make sure backend is running: `lsof -i :3010`
- Restart ngrok: `pkill ngrok && ngrok http 3010`
- Wait a few seconds after backend starts before testing

## Quick Test

Once backend is running:
1. **Local**: http://localhost:3010/graphql (should work)
2. **ngrok**: https://repellingly-identifiable-freeda.ngrok-free.dev/graphql (should work)
3. **Netlify**: Open your Netlify site and try logging in

## All-in-One Script (Alternative)

If you prefer, use the automated script:
```bash
./scripts/start-backend-tunnel.sh
```

But you'll still need to manually copy the ngrok URL and set it in Netlify.





