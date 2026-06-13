# Care Diagnostics — Synology Deployment Guide

## Prerequisites

- Synology NAS with Docker & Container Manager installed
- Docker Compose v2+ (comes with DSM 7.2+)
- At least 4GB RAM free for build

## Files in this folder

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (API + web frontends) |
| `docker-compose.yml` | Service orchestration (db, api, web, migrate) |
| `.env` | Environment variables (secrets, DB, ports) |
| `nginx.conf` | Reverse proxy + static SPA serving config |

## Deploy Steps

1. **Copy this folder** to your Synology (e.g., `/volume1/docker/care-diagnostics`)

2. **Update `.env`** — change the secrets:
   ```
   JWT_SECRET=your-very-long-random-string-here
   SESSION_SECRET=your-other-long-random-string-here
   ```

3. **Build and start** (via SSH or Synology Container Manager):
   ```bash
   cd /volume1/docker/care-diagnostics
   docker compose up -d --build
   ```

4. **Initialize database** (one-time):
   ```bash
   docker compose run --rm migrate
   ```

5. **Open** `http://<your-nas-ip>:8889`

## Synology Container Manager (GUI) Alternative

1. Open Container Manager → Project → Create
2. Choose "Build from Dockerfile" or "docker-compose.yml"
3. Point to this folder
4. Set environment variables from `.env`
5. Click "Build and Run"

## Troubleshooting

### Build fails with OOM (Out of Memory)
- The Dockerfile has a `COPY --from=api-build` line to serialize web-build after api-build
- If still OOM, increase DSM memory limit: Control Panel → Hardware & Power → General → Memory Limit
- Or build on a stronger machine and copy the images

### Database not found
- Run the migrate step: `docker compose run --rm migrate`
- Check db health: `docker compose logs db`

### Payment gateway domain error
- Ensure `BASE_URL` in `.env` matches exactly what you whitelisted with ICICI
- If using a different domain, update `BASE_URL` and rebuild

## URLs

| Path | Service |
|------|---------|
| `/` | Public clinic website |
| `/erp/` | Staff ERP portal |
| `/super-admin-portal/` | Super admin portal |
| `/api/` | REST API |

## Updating

To update with new code:
```bash
docker compose down
docker compose up -d --build
docker compose run --rm migrate
```
