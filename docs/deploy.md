# Deploying AION on DigitalOcean

Guide to deploy AION (AFFiNE + Agent Platform) on a DigitalOcean Droplet with HTTPS and Google OAuth.

Images are built locally and pushed to DigitalOcean Container Registry (`registry.digitalocean.com/everestsk`), then pulled on the server. No building on the Droplet.

## Prerequisites

- A domain name (e.g. `aion.example.com`)
- A DigitalOcean account with Container Registry enabled
- An Anthropic API key
- A Google Cloud project for OAuth
- Docker installed locally (for building the image)

## 1. Create the Droplet

In the DigitalOcean dashboard:

- **Image**: Ubuntu 24.04 LTS
- **Plan**: Regular, 4GB RAM / 2 vCPU / 80GB SSD ($24/mo)
- **Region**: SFO3 (San Francisco) or the closest to your team
- **Authentication**: SSH key (recommended)

## 2. Point your domain

Create an **A record** in your DNS provider:

```
aion.example.com → <DROPLET_IP>
```

Allow a few minutes for DNS propagation.

## 3. Configure Google OAuth

1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** → Web application
3. Add **Authorized redirect URI**: `https://aion.example.com/oauth/callback`
4. Copy the **Client ID** and **Client Secret**

## 4. Build and push the image

On your local machine:

```bash
# Authenticate with DigitalOcean Container Registry
doctl auth init
doctl registry login

# Build and push
./scripts/build-and-push.sh
# Or with a specific tag:
./scripts/build-and-push.sh v1.0.0
```

This builds the Docker image locally and pushes it to `registry.digitalocean.com/everestsk/aion`.

## 5. Run the setup script on the Droplet

```bash
# From your local machine
ssh root@<DROPLET_IP> 'bash -s' < scripts/setup-droplet.sh
```

Or SSH in and run manually:

```bash
ssh root@<DROPLET_IP>
curl -fsSL https://raw.githubusercontent.com/luis-cerv/aion/canary/scripts/setup-droplet.sh | bash
```

Then authenticate Docker with the registry:

```bash
doctl auth init        # paste your DO API token
doctl registry login
```

## 6. Configure environment

```bash
ssh root@<DROPLET_IP>
cd /opt/aion
nano .env
```

Fill in the required values:

| Variable                     | Description                           |
| ---------------------------- | ------------------------------------- |
| `DOMAIN`                     | Your domain (e.g. `aion.example.com`) |
| `DB_PASSWORD`                | Strong database password              |
| `ANTHROPIC_API_KEY`          | Your Anthropic API key (`sk-ant-...`) |
| `OAUTH_GOOGLE_CLIENT_ID`     | From step 3                           |
| `OAUTH_GOOGLE_CLIENT_SECRET` | From step 3                           |

## 7. Start AION

```bash
cd /opt/aion
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Watch the logs:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## 8. Verify

1. Open `https://aion.example.com` — should load the AION UI
2. Click **Sign in with Google** — OAuth flow should work
3. Test Agent Platform:
   ```bash
   curl https://aion.example.com/api/agent/v1/config
   # Should return: {"claudeCodeAvailable": true, ...}
   ```
4. Create a workspace and test the agent chat

## Updating

To deploy a new version:

```bash
# On your local machine — build and push
git pull origin canary
./scripts/build-and-push.sh

# On the Droplet — pull and restart
ssh root@<DROPLET_IP> 'cd /opt/aion && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d'
```

## Troubleshooting

### Caddy not getting HTTPS certificate

- Verify your domain's A record points to the Droplet IP: `dig aion.example.com`
- Check Caddy logs: `docker compose -f docker-compose.prod.yml logs caddy`
- Ensure ports 80 and 443 are open: `ufw status`

### OAuth callback error

- Verify the redirect URI in Google Cloud Console matches exactly: `https://aion.example.com/oauth/callback`
- Check that `OAUTH_GOOGLE_CLIENT_ID` and `OAUTH_GOOGLE_CLIENT_SECRET` are set correctly

### Agent Platform not available

- Check `ANTHROPIC_API_KEY` is set in `.env`
- Verify Claude Code is installed in the container: `docker exec aion_server claude --version`
- Check server logs: `docker compose -f docker-compose.prod.yml logs aion`

### Can't pull image from registry

- Re-authenticate: `doctl registry login`
- Verify image exists: `doctl registry repository list-tags aion`

### Build fails locally

- Ensure you have enough disk space and RAM
- The build compiles Rust native bindings and the full frontend, it needs ~8GB RAM
