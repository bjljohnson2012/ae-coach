# Deploy to Hostinger VPS — `portal.benjohnson.ai`

End-to-end runbook from a fresh VPS to a live SSL'd app.

This deploys to a **brand-new VPS** so it doesn't conflict with your existing share/upload sites.

---

## Phase 0 — What you need before you start

- A domain registrar account where `benjohnson.ai` is managed (DNS access)
- A Hostinger account
- A Grok API key from [console.x.ai](https://console.x.ai/) (paid; pay-as-you-go is fine)
- An SSH client (Terminal on Mac, WSL or PuTTY on Windows)
- About 30–45 minutes

---

## Phase 1 — Buy a new VPS

1. Log into Hostinger → "VPS Hosting" → "Buy VPS"
2. **Recommended plan: KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe). The app + Postgres + Caddy fit comfortably with headroom.
   - KVM 1 (1 vCPU, 4 GB) will work but Postgres will be tight under load. Fine for testing.
3. **OS:** Ubuntu 24.04 LTS (or 22.04 if 24 isn't offered)
4. **Datacenter:** Closest to your audience (US East if East Coast, etc.)
5. **Hostname:** `portal-vps` (or whatever you want)
6. **Root password:** Set a strong one. Save it.
7. Skip "Install application" — we want a clean Ubuntu.
8. Wait ~5 min for provisioning. You'll get an email with the IPv4 address.

---

## Phase 2 — Point DNS at the new VPS

In your DNS provider (where `benjohnson.ai` lives — Hostinger, Cloudflare, Namecheap, wherever):

| Type | Name | Value | TTL |
|---|---|---|---|
| `A` | `portal` | (your new VPS IPv4) | 300 |

Optional (if you have IPv6):

| Type | Name | Value | TTL |
|---|---|---|---|
| `AAAA` | `portal` | (your new VPS IPv6) | 300 |

DNS propagation: usually 1–10 minutes. Verify:

```bash
dig +short portal.benjohnson.ai
# Should return your VPS IP
```

If it doesn't resolve, wait 5 more minutes and re-check.

---

## Phase 3 — SSH in and harden the VPS

From your laptop:

```bash
ssh root@<your-vps-ip>
# Accept fingerprint, enter root password
```

Update + install firewall:

```bash
apt update && apt upgrade -y
apt install -y ufw curl git
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

(Optional but recommended) Create a non-root user:

```bash
adduser ben                    # set a password
usermod -aG sudo ben
mkdir -p /home/ben/.ssh
cp ~/.ssh/authorized_keys /home/ben/.ssh/  # if you SSH'd with key
chown -R ben:ben /home/ben/.ssh
chmod 700 /home/ben/.ssh
chmod 600 /home/ben/.ssh/authorized_keys
```

Then SSH back in as `ben` going forward. Use `sudo` for system commands.

---

## Phase 4 — Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# Let your user run docker without sudo
sudo usermod -aG docker $USER
exit  # log out, log back in for group to take effect
```

Test:

```bash
docker run --rm hello-world
# Should print "Hello from Docker!"
```

---

## Phase 5 — Get the code on the VPS

You have two options:

### Option A: Git clone (preferred if you have a repo)

```bash
sudo mkdir -p /opt/ae-coach
sudo chown $USER:$USER /opt/ae-coach
cd /opt/ae-coach
git clone <your-repo-url> .
```

### Option B: rsync from local

From your laptop, in the project folder:

```bash
# from /sessions/compassionate-kind-heisenberg/mnt/AE _ Director Coach
rsync -avz --exclude=node_modules --exclude=.next --exclude=.env \
    "./" ben@<your-vps-ip>:/opt/ae-coach/
```

Then SSH in and verify:

```bash
ssh ben@<your-vps-ip>
cd /opt/ae-coach
ls -la
# Should see: ARCHITECTURE.md, prisma/, src/, Dockerfile, docker-compose.yml, etc.
```

---

## Phase 6 — Configure environment variables

```bash
cd /opt/ae-coach
cp .env.example .env.production
nano .env.production
```

Fill in:

```ini
DATABASE_URL="postgresql://aecoach:CHANGE_THIS_PASSWORD@postgres:5432/aecoach?schema=public"

NEXTAUTH_URL="https://portal.benjohnson.ai"
NEXTAUTH_SECRET="(run: openssl rand -base64 32)"

GROK_API_KEY="xai-..."
GROK_MODEL="grok-2-latest"
GROK_BASE_URL="https://api.x.ai/v1"

POSTGRES_PASSWORD="CHANGE_THIS_PASSWORD"   # same as in DATABASE_URL above

APP_URL="https://portal.benjohnson.ai"
PROD_HOST="portal.benjohnson.ai"

# v0: SMTP not wired. Leave blank.
SMTP_FROM="AE Coach <noreply@benjohnson.ai>"
```

Generate the secret:

```bash
openssl rand -base64 32
# Copy output, paste as NEXTAUTH_SECRET value
```

Symlink so docker-compose picks it up:

```bash
ln -sf .env.production .env
```

Verify:

```bash
cat .env | grep -v PASSWORD | grep -v SECRET | grep -v API_KEY
# Sanity check the non-secret values
```

---

## Phase 7 — Build and run

```bash
cd /opt/ae-coach
docker compose up -d --build
docker compose logs -f app
```

First boot does:

1. Pulls Postgres + Caddy images
2. Builds the Next.js app (~3-5 minutes)
3. Runs `npx prisma migrate deploy` to create tables
4. Starts on port 3000 inside container
5. Caddy fronts it on 443 with auto-Let's-Encrypt cert

You'll see in logs:

- `Prisma migrations applied`
- `▲ Next.js 14.2.18` startup banner
- Caddy logs about cert acquisition for `portal.benjohnson.ai`

When you see `Ready in Xms`, hit `Ctrl+C` to exit log tail.

Smoke test:

```bash
curl -I https://portal.benjohnson.ai
# Should return HTTP/2 200 (or a redirect to /login, that's fine)
```

If you get a cert error, check `docker compose logs caddy` — usually means DNS hasn't propagated or port 80/443 is blocked.

---

## Phase 8 — Seed initial data

```bash
docker compose exec app sh -c "npx prisma db seed"
```

This creates:

- Org admin: `ben@benjohnson.ai` / `changeme` ← change immediately
- Director: `alex@example.com` / `changeme`
- Demo AE: `ae-demo@example.com` / `changeme`
- 30+ intake questions
- 2 products
- 4 knowledge articles
- Director monthly review questions
- A pending DirectorReview for the demo AE

---

## Phase 9 — Verify the full flow

1. Open `https://portal.benjohnson.ai/login`
2. Log in as `ben@benjohnson.ai` / `changeme`
3. Walk through:
   - Visit `/director/questions` — see the question bank
   - Visit `/director/knowledge` — see the 4 repos
   - Visit `/director/products` — see the 2 products
   - Visit `/director/files` — paste some text and try AI classify
   - Visit `/director/reviews` — see the pending monthly review
   - Visit `/director/intake` — complete your director intake (calls Grok)
   - Visit `/director/profile` — see your synthesized leadership profile
4. Log out, log in as `ae-demo@example.com` / `changeme`
   - Should land in `/ae/intake`
   - Walk a few questions, click "Save & finish later"
   - Log out, log back in — wizard resumes where you left off
5. **Change Ben's password** (post-v0 will have a UI for this; for now: edit in DB or use Prisma Studio):

```bash
docker compose exec app sh -c "npx prisma studio"
# Open the tunneled URL, find the User row, update passwordHash
# Generate a hash with: docker compose exec app sh -c "node -e \"console.log(require('bcryptjs').hashSync('YOUR_NEW_PW', 12))\""
```

---

## Phase 10 — Update workflow (going forward)

```bash
ssh ben@<your-vps-ip>
cd /opt/ae-coach

# pull latest
git pull origin main   # or: rsync from local

# rebuild + redeploy
docker compose up -d --build

# apply any new migrations (only if schema changed)
docker compose exec app sh -c "npx prisma migrate deploy"

# tail logs to watch the boot
docker compose logs -f app
```

A full rebuild takes ~3 minutes. Zero-downtime is not the default; for that you'd add a second app container and rotate. Out of scope for v0.

---

## Phase 11 — Backups (do this before anything important)

Postgres data lives in the `pgdata` Docker volume. Snapshot weekly:

```bash
sudo mkdir -p /opt/backups
sudo chown $USER:$USER /opt/backups

cat > /opt/ae-coach/backup.sh <<'EOF'
#!/bin/bash
cd /opt/ae-coach
DATE=$(date +%F)
docker compose exec -T postgres pg_dump -U aecoach aecoach | gzip > /opt/backups/aecoach-$DATE.sql.gz
# keep 30 days
find /opt/backups -name "aecoach-*.sql.gz" -mtime +30 -delete
EOF

chmod +x /opt/ae-coach/backup.sh

# Cron at 3am daily
( crontab -l 2>/dev/null; echo "0 3 * * * /opt/ae-coach/backup.sh" ) | crontab -
```

Restore (if you ever need to):

```bash
gunzip < /opt/backups/aecoach-YYYY-MM-DD.sql.gz | \
  docker compose exec -T postgres psql -U aecoach aecoach
```

---

## Phase 12 — Monitoring (light-touch)

For v0, the simplest signal is "is the site up":

```bash
# uptime check via cron (alerts if down 3 times in a row)
cat > /opt/ae-coach/uptime-check.sh <<'EOF'
#!/bin/bash
if ! curl -sf -o /dev/null https://portal.benjohnson.ai/login; then
  echo "$(date) DOWN" >> /opt/ae-coach/uptime.log
fi
EOF
chmod +x /opt/ae-coach/uptime-check.sh
( crontab -l 2>/dev/null; echo "*/5 * * * * /opt/ae-coach/uptime-check.sh" ) | crontab -
```

Better: hook up UptimeRobot or BetterStack pointed at `/login` for email alerts when down.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Caddy can't get cert` | DNS hasn't propagated, or ports 80/443 are blocked. Check `dig portal.benjohnson.ai` and `ufw status`. Logs: `docker compose logs caddy`. |
| `Prisma migrate fails on first boot` | Postgres isn't ready yet. `docker compose down && docker compose up -d`. The compose health check usually handles this; if it doesn't, the postgres container may be on a slow disk. |
| `Grok 401 / invalid API key` | Check `GROK_API_KEY` in `.env.production`. Test from inside the container: `docker compose exec app sh -c "curl -s -H 'Authorization: Bearer $GROK_API_KEY' https://api.x.ai/v1/models"`. |
| `Invite link goes to localhost:3000` | `APP_URL` not set or pointing wrong. Check `.env` has `APP_URL=https://portal.benjohnson.ai`. Restart: `docker compose up -d`. |
| `502 from Caddy` | App container isn't responding. `docker compose ps` to see status, `docker compose logs app` for errors. |
| `Container keeps restarting` | Usually missing env var. `docker compose logs app | head -50` shows the crash. |

---

## Optional Phase 13 — Wire SMTP for invite emails

When you want real invite emails (not console logs), pick one:

| Provider | Why |
|---|---|
| Resend | Simplest API. Free tier covers 3000/month. |
| Postmark | Best transactional deliverability. |
| AWS SES | Cheapest at scale. More setup. |

In `src/app/api/invite/route.ts`, replace the `console.log` with the provider's SDK call. Add SMTP envs to `.env.production`. Restart.

---

## You're done

`https://portal.benjohnson.ai` should now serve a working v2 app. From here, your update loop is `git pull && docker compose up -d --build`.

If you want to monitor what Grok is doing, the Hostinger VPS console + `docker compose logs -f app` will show every API call's input/output truncations during dev. Turn that down before sharing access.
