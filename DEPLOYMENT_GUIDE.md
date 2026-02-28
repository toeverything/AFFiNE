# AFFiNE Production Deployment Guide
### Deploying to claster.ydns.eu

This guide walks through deploying AFFiNE to your production server with:
- ✅ HTTPS/SSL via Let's Encrypt
- ✅ Curriculum upload feature (owner-only, broadcasts to all members)
- ✅ Email notifications via SMTP (Mailgun/SendGrid/custom)
- ✅ PostgreSQL database with Prisma migrations
- ✅ Redis caching layer
- ✅ Nginx reverse proxy

---

## Prerequisites

Before deployment, you need:

### 1. **Server Access**
- Linux server (Ubuntu 20.04+ recommended)
- SSH root or sudo access
- Server IP address (example: `192.168.1.100`)
- Open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)

### 2. **SMTP Provider**
Choose ONE option:

#### Option A: Mailgun (Recommended for testing)
- Free tier: 10,000 emails/month
1. Register at https://mailgun.com
2. Create sending domain (e.g., `mg.claster.ydns.eu`)
3. Add DNS records (SPF, DKIM, DMARC) to your domain provider
4. Get SMTP credentials:
   - Host: `smtp.mailgun.org`
   - Port: `587`
   - Username: `postmaster@mg.claster.ydns.eu`
   - Password: (shown in Mailgun dashboard)

#### Option B: SendGrid
- Free tier: 100 emails/day
1. Register at https://sendgrid.com
2. Create API key in Settings > API Keys
3. SMTP credentials:
   - Host: `smtp.sendgrid.net`
   - Port: `587`
   - Username: `apikey`
   - Password: (your API key)

#### Option C: Custom SMTP (Gmail, Outlook, etc.)
- Gmail: Use App Password (enable 2FA first)
- Outlook: Use your email password directly
- Any SMTP server: Use its credentials

### 3. **DNS Configuration**
You'll point your domain `claster.ydns.eu` to your server:
- Get your server's **public IP address**
- Add DNS A record:
  - Name: `claster.ydns.eu`
  - Type: `A`
  - Value: `YOUR_SERVER_IP`
  - TTL: 300 (or default)

If using Mailgun, also add:
- SPF record: `v=spf1 include:mailgun.org ~all`
- DKIM record: (provided by Mailgun)
- DMARC record: (optional, for extra security)

---

## Deployment Steps

### Step 1: Prepare Your Environment File

On your **local machine**, in the project root:

```bash
# Copy the production template
cp .env.production.example .env.production

# Edit with real values
nano .env.production  # or use your editor
```

**Required values to set:**

```env
# Database password (CHANGE THIS!)
DB_PASSWORD=your-super-secret-password-123

# SMTP Configuration
MAILER_HOST=smtp.mailgun.org              # or smtp.sendgrid.net
MAILER_PORT=587
MAILER_USER=postmaster@mg.claster.ydns.eu # Your SMTP username
MAILER_PASSWORD=your-smtp-password         # Your SMTP password
MAILER_FROM=noreply@claster.ydns.eu       # From address
MAILER_SENDER=AFFiNE <noreply@claster.ydns.eu>

# Keep these as-is for domain
AFFINE_SERVER_EXTERNAL_URL=https://claster.ydns.eu
```

Save this file securely - it contains passwords.

### Step 2: Setup Server Infrastructure

1. **Copy setup script to server:**
   ```bash
   scp scripts/setup_production.sh root@YOUR_SERVER_IP:/root/
   scp nginx/claster.ydns.eu.conf root@YOUR_SERVER_IP:/root/
   scp .env.production root@YOUR_SERVER_IP:/opt/affine/
   ```

2. **Run server setup (one-time):**
   ```bash
   # SSH into your server
   ssh root@YOUR_SERVER_IP
   
   # Make script executable
   chmod +x /root/setup_production.sh
   
   # Run it (installs Docker, Nginx, gets SSL cert)
   /root/setup_production.sh
   
   # Verify .env.production has your real credentials
   cat /opt/affine/.env.production
   ```

3. **Verify Nginx and SSL:**
   ```bash
   # Check Nginx status
   systemctl status nginx
   
   # Check SSL certificate
   certbot certificates
   
   # Test Nginx config
   nginx -t
   ```

### Step 3: Deploy Application

Run deployment script from your local machine:

```bash
# Make script executable
chmod +x scripts/deploy_to_server.sh

# Deploy (replace with your server IP)
./scripts/deploy_to_server.sh 192.168.1.100
```

The script will:
1. ✓ Verify SSH connection
2. ✓ Upload docker-compose.prod.yml and Dockerfile
3. ✓ Build Docker images
4. ✓ Start services (affine, postgres, redis)
5. ✓ Run database migrations
6. ✓ Verify application is running

### Step 4: Verify Deployment

Check that everything is working:

```bash
# SSH into server
ssh root@YOUR_SERVER_IP

# Check container status
docker-compose -f /opt/affine/docker-compose.prod.yml ps

# Check application logs
docker-compose -f /opt/affine/docker-compose.prod.yml logs -f affine

# Test health endpoint
curl http://localhost:3010/api/health

# Verify Nginx proxy works
curl https://claster.ydns.eu  # May need --insecure if SSL cert is self-signed
```

### Step 5: Test Key Features

#### Test User Registration & Login
1. Open https://claster.ydns.eu in browser
2. Click "Sign up"
3. Enter email and create password
4. Create workspace

#### Test Curriculum Upload
1. Invite another user to your workspace (Owner role)
2. Go to workspace settings
3. Look for "Curriculum Documents" section
4. Upload a PDF or document
5. Check that other members received notification email

#### Test Email Notifications
1. After curriculum upload, check email inbox
2. Multiple members should receive email about new curriculum
3. If no email arrives, check SMTP configuration in `.env.production`

---

## Troubleshooting

### Application won't start
```bash
# Check logs
docker-compose -f /opt/affine/docker-compose.prod.yml logs affine

# Common issue: Database not initialized
# Run migrations manually
docker-compose -f /opt/affine/docker-compose.prod.yml exec affine yarn prisma migrate deploy
```

### Emails not sending
```bash
# Check SMTP configuration in .env.production
cat /opt/affine/.env.production | grep MAILER

# Test SMTP connection (from server)
telnet smtp.mailgun.org 587

# Check mail logs
docker-compose -f /opt/affine/docker-compose.prod.yml logs affine | grep -i mail
```

### SSL certificate issues
```bash
# Check certificate status
certbot status

# Renew certificate manually
certbot renew --force-renewal

# View certificate details
openssl s_client -connect claster.ydns.eu:443
```

### Database issues
```bash
# Connect to database
docker-compose -f /opt/affine/docker-compose.prod.yml exec postgres psql -U affine -d affine

# Backup database
docker-compose -f /opt/affine/docker-compose.prod.yml exec postgres pg_dump -U affine affine > backup.sql

# List migrations
docker-compose -f /opt/affine/docker-compose.prod.yml exec affine yarn prisma migrate status
```

---

## Post-Deployment

### Recommended Tasks

1. **Enable automatic SSL renewal:**
   ```bash
   systemctl enable certbot.timer
   systemctl start certbot.timer
   ```

2. **Setup database backups:**
   ```bash
   # Create backup script at /opt/affine/backup.sh
   # Run daily via crontab
   ```

3. **Monitor application:**
   ```bash
   # Check logs regularly
   docker-compose -f /opt/affine/docker-compose.prod.yml logs -f affine --tail=100
   ```

4. **Update application:**
   When you have new code updates:
   ```bash
   git pull origin main
   ./scripts/deploy_to_server.sh YOUR_SERVER_IP
   ```

### Useful Commands

```bash
# View all logs
docker-compose -f /opt/affine/docker-compose.prod.yml logs -f

# Restart services
docker-compose -f /opt/affine/docker-compose.prod.yml restart

# Stop services
docker-compose -f /opt/affine/docker-compose.prod.yml down

# Update Redis data location
ls -la /var/affine/redis

# Check disk usage
df -h /opt/affine
df -h /var/affine
```

---

## Key Features Explained

### Curriculum Upload
- **Who can upload:** Only workspace owners
- **Location in app:** Workspace settings > Curriculum Documents
- **What happens:** File saved with `curriculum-` prefix, all members notified via email
- **File types:** Any (PDF, Word, etc.)
- **Size limit:** 100MB per file (configurable in `.env`)

### Email Notifications
- **When sent:** When curriculum is uploaded by owner
- **Who gets it:** All workspace members (Owner, Admin, Member roles)
- **What's in email:** "New curriculum document uploaded to [Workspace Name]"
- **SMTP provider:** Configured in `.env.production`

### User Roles & Database
- **Owner:** Full control, can upload curriculum, manage users
- **Admin:** Can manage users and documents
- **Member:** Can view documents, create content
- **Database:** PostgreSQL with Prisma ORM, migrations auto-run

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   User Browser                          │
│              https://claster.ydns.eu                    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────v──────────────────────────────────┐
│                  Nginx Reverse Proxy                     │
│              (SSL/TLS termination)                       │
│              :80 (redirect to 443)                       │
│              :443 (HTTPS)                                │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────v──────────────────────────────────┐
│                AFFiNE Backend (Node.js)                  │
│              http://localhost:3010                       │
│              GraphQL API, WebSocket sync                 │
└──────────────────────┬──────────────────────────────────┘
          ┌────────────┴───────────┬──────────────────┐
          │                        │                  │
     ┌────v────┐         ┌────────v────┐      ┌──────v────┐
     │PostgreSQL│        │ Redis Cache │      │Storage    │
     │Database  │        │             │      │/opt/affine│
     └──────────┘        └─────────────┘      └───────────┘

   ┌────────────────────────────────────────────────────┐
   │  SMTP Provider (Mailgun/SendGrid/Custom)           │
   │  Sends notification emails when curriculum upload  │
   └────────────────────────────────────────────────────┘
```

---

## Need Help?

- Check logs: `docker-compose -f /opt/affine/docker-compose.prod.yml logs -f`
- SSH debug: `ssh root@YOUR_SERVER_IP`
- Review environment: `cat /opt/affine/.env.production`
- Test email: Upload curriculum and check inbox

---

**Deployment Date:** $(date)
**Domain:** claster.ydns.eu
**Status:** Ready to deploy
