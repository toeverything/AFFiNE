# Quick Backend URL Setup for Netlify

This guide helps you get a public HTTPS URL for your AFFiNE backend so Netlify can connect to it.

## Option 1: ngrok (Fastest for testing)

### Prerequisites
- Install ngrok: https://ngrok.com/download
- Sign up for a free account and get your auth token

### Steps

1. **Start your AFFiNE backend locally** (in one terminal):
   ```bash
   # Start dev services (Postgres, Redis)
   cp ./.docker/dev/compose.yml.example ./.docker/dev/compose.yml
   cp ./.docker/dev/.env.example ./.docker/dev/.env
   docker compose -f ./.docker/dev/compose.yml up -d
   
   # Build native packages (if not done)
   yarn affine @affine/server-native build
   
   # Start server (runs on port 3010 by default)
   yarn affine server dev
   ```

2. **Start ngrok tunnel** (in another terminal):
   ```bash
   # Authenticate (one-time)
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   
   # Start tunnel pointing to your local backend
   ngrok http 3010
   ```

3. **Copy the HTTPS URL** from ngrok output:
   ```
   Forwarding  https://abc123.ngrok-free.app -> http://localhost:3010
   ```
   Use: `https://abc123.ngrok-free.app`

4. **Set in Netlify**:
   - Go to your Netlify site → Site settings → Environment variables
   - Add: `AFFINE_BACKEND_URL` = `https://abc123.ngrok-free.app`
   - Redeploy

**Note**: Free ngrok URLs change each time you restart. For a stable URL, upgrade to ngrok paid plan or use Option 2/3.

---

## Option 2: Cloudflare Tunnel (Free, stable subdomain)

1. **Install cloudflared**:
   ```bash
   # macOS
   brew install cloudflared
   # Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
   ```

2. **Create tunnel**:
   ```bash
   cloudflared tunnel create affine-backend
   ```

3. **Start tunnel**:
   ```bash
   cloudflared tunnel run affine-backend --url http://localhost:3010
   ```

4. **Get the URL** from the output and set `AFFINE_BACKEND_URL` in Netlify.

---

## Option 3: Deploy Backend to Render/Railway (Production-ready)

### Render (Free tier available)

1. **Create a new Web Service** on Render
2. **Connect your GitHub repo** (your fork: `guychenya/AFFiNE`)
3. **Settings**:
   - Build Command: `yarn --immutable && yarn affine @affine/server-native build && yarn affine server build`
   - Start Command: `yarn affine server start`
   - Environment: Add your `DATABASE_URL`, `REDIS_SERVER_HOST`, etc.
4. **Render will give you a URL** like `https://affine-backend.onrender.com`
5. **Set in Netlify**: `AFFINE_BACKEND_URL` = `https://affine-backend.onrender.com`

### Railway (Free tier available)

1. **Create new project** → Deploy from GitHub
2. **Select your repo**
3. **Railway auto-detects** and gives you a URL
4. **Set environment variables** as needed
5. **Use the Railway-provided HTTPS URL** in Netlify

---

## Option 4: Quick Docker Compose + ngrok (All-in-one)

If you want to run everything locally and tunnel it:

```bash
# 1. Start backend with Docker
cd .docker/dev
cp compose.yml.example compose.yml
cp .env.example .env
docker compose up -d

# 2. In another terminal, tunnel it
ngrok http 3010

# 3. Use the ngrok HTTPS URL in Netlify
```

---

## Testing

After setting `AFFINE_BACKEND_URL` in Netlify:

1. **Redeploy** your Netlify site
2. **Open your Netlify URL**
3. **Try logging in** (default dev user: `dev@affine.pro` / `dev`)
4. **Check Admin → Settings → AI** to verify backend connection

---

## Troubleshooting

- **CORS errors**: Make sure your backend allows requests from your Netlify domain
- **Connection refused**: Backend not running or wrong port
- **ngrok URL expired**: Free ngrok URLs change on restart; upgrade or use Cloudflare Tunnel
- **WebSocket errors**: Ensure `/socket.io/*` redirects are working in `netlify.toml`

