# Starting AFFiNE Backend for ngrok

Follow these steps to start your backend and connect it via ngrok.

## Step 1: Start Dev Services (Postgres, Redis)

Open a terminal and run:

```bash
# Make sure compose file exists
cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml
cp ./.docker/dev/.env.example ./.docker/dev/.env

# Start dev services
docker compose -f ./.docker/dev/compose.yml up -d
```

Wait for services to be healthy (about 10-20 seconds). Check status:
```bash
docker compose -f ./.docker/dev/compose.yml ps
```

You should see Postgres and Redis running.

## Step 2: Build Native Packages (if not done)

```bash
yarn affine @affine/server-native build
```

This may take a few minutes the first time.

## Step 3: Start Backend

In a new terminal window (keep the previous one running):

```bash
yarn affine server dev
```

Wait until you see:
```
AFFiNE Server is running in [development] mode
Listening on http://0.0.0.0:3010
```

**Keep this terminal open** - the backend needs to keep running.

## Step 4: Start ngrok Tunnel

In a **third terminal window**:

```bash
./scripts/fix-ngrok.sh
```

Or manually:
```bash
ngrok http 3010
```

**Copy the HTTPS URL** from ngrok output (e.g., `https://abc123.ngrok-free.app`)

## Step 5: Set in Netlify

1. Go to Netlify → Your site → **Site settings** → **Environment variables**
2. Add: `AFFINE_BACKEND_URL` = `https://abc123.ngrok-free.app` (your ngrok URL)
3. **Redeploy** your Netlify site

## Troubleshooting

### Docker not found
- Install Docker Desktop: https://www.docker.com/products/docker-desktop
- Make sure Docker is running (check system tray)

### Port 3010 already in use
```bash
# Find what's using it
lsof -i :3010

# Kill it if needed
kill -9 <PID>
```

### Backend won't start
- Check dev services are running: `docker compose -f ./.docker/dev/compose.yml ps`
- Check logs: `docker compose -f ./.docker/dev/compose.yml logs`
- Make sure native packages are built: `yarn affine @affine/server-native build`

### ngrok connection refused
- Make sure backend is running first (check Step 3)
- Use port 3010: `ngrok http 3010` (NOT port 80)

## Quick Test

Once everything is running:
1. Backend: Open http://localhost:3010/graphql (should work)
2. ngrok: Open https://your-ngrok-url.ngrok-free.app/graphql (should proxy to backend)
3. Netlify: Open your Netlify site and try logging in

## All-in-One Script (Alternative)

If you prefer, use the automated script:
```bash
./scripts/start-backend-tunnel.sh
```

This starts everything automatically, but you'll need to manually copy the ngrok URL.

