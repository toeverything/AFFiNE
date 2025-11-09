# Deploying AFFiNE Backend to Railway

This guide helps you deploy the AFFiNE backend to Railway and connect it to Netlify.

## Quick Setup

### 1. Create New Service on Railway

1. Go to your Railway project: https://railway.com/project/f0158c83-bec6-46b5-bb4e-f683cc1cc566
2. Click **"New"** → **"GitHub Repo"** (or **"Empty Service"** if deploying manually)
3. Select your repo: `guychenya/AFFiNE`
4. Railway will auto-detect the service

### 2. Configure Service

**Service Settings**:
- **Root Directory**: Leave empty (or set to repo root)
- **Build Command**: `yarn --immutable && yarn affine @affine/server-native build && yarn affine server build`
- **Start Command**: `yarn affine server start`
- **Port**: Railway auto-detects, but ensure it's set to `3010` if needed

**Environment Variables** (in Railway service settings):

Required:
```bash
# Database (Railway provides PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/affine

# Redis (add Railway Redis service)
REDIS_SERVER_HOST=redis
REDIS_SERVER_PORT=6379

# Server config
AFFINE_SERVER_PORT=3010
AFFINE_SERVER_EXTERNAL_URL=https://your-service.railway.app  # Use Railway's public URL
AFFINE_SERVER_HTTPS=true

# Optional: Enable copilot/AI
AFFINE_COPILOT_ENABLED=true
```

### 3. Add Database & Redis Services

1. **Add PostgreSQL**:
   - Click **"New"** → **"Database"** → **"Add PostgreSQL"**
   - Railway will create a PostgreSQL instance
   - Copy the `DATABASE_URL` from the service settings
   - Add it to your main service's environment variables

2. **Add Redis**:
   - Click **"New"** → **"Database"** → **"Add Redis"**
   - Railway will create a Redis instance
   - Copy the `REDIS_SERVER_HOST` and port
   - Add to your main service's environment variables

### 4. Get Your Railway Public URL

1. In your backend service, go to **Settings** → **Networking**
2. Find **"Public Domain"** or **"Generate Domain"**
3. Copy the HTTPS URL (e.g., `https://affine-backend-production.up.railway.app`)

### 5. Set in Netlify

1. Go to your Netlify site → **Site settings** → **Environment variables**
2. Add:
   ```
   AFFINE_BACKEND_URL = https://your-service.railway.app
   ```
   (Use the exact Railway public URL from step 4)

3. **Redeploy** your Netlify site

### 6. Verify Connection

1. Open your Netlify site URL
2. Try logging in (or create a new account)
3. Check **Admin → Settings → AI** to verify backend connection
4. Test AI features (chat, etc.)

## Troubleshooting

### Service won't start
- Check Railway logs: Click on your service → **"Deployments"** → View logs
- Ensure all environment variables are set correctly
- Verify `DATABASE_URL` and `REDIS_SERVER_HOST` are correct

### CORS errors
- Add your Netlify domain to allowed origins in Railway service env:
  ```
  AFFINE_SERVER_HOSTS=https://your-netlify-site.netlify.app
  ```

### Port issues
- Railway auto-assigns a port, but AFFiNE expects `3010`
- Set `PORT` env var in Railway to `3010`, or update AFFiNE config to use Railway's assigned port

### Database connection failed
- Ensure PostgreSQL service is running
- Verify `DATABASE_URL` format: `postgresql://user:password@host:5432/dbname`
- Check Railway PostgreSQL service is healthy

## Using Railway CLI (Optional)

If you prefer CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Set environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set REDIS_SERVER_HOST="redis"

# Deploy
railway up
```

## Next Steps

Once your Railway backend is running:
1. ✅ Set `AFFINE_BACKEND_URL` in Netlify
2. ✅ Redeploy Netlify site
3. ✅ Test the connection
4. ✅ Configure AI provider keys in Admin panel

Your AFFiNE instance should now be fully functional! 🎉

