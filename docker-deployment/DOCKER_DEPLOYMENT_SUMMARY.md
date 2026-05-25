# Care Diagnostics ERP — Docker Deployment Summary

This document summarizes the complete Docker deployment setup for the Care Diagnostics ERP system.

## Files Created

```
docker-deployment/
├── DOCKER_DEPLOYMENT_SUMMARY.md        (this file)
├── windows-desktop/
│   ├── docker-compose.yml              (Docker services — production hardened)
│   ├── Dockerfile.backend              (multi-stage Node 20 Alpine build)
│   ├── .env.example                    (template for all environment variables)
│   ├── README.md                       (step-by-step guide for doctors)
│   ├── PRODUCTION_CHECKLIST.md         (daily/weekly/monthly/emergency checklists)
│   ├── TROUBLESHOOTING.md              (common problems and fixes)
│   ├── validate-deployment.bat         (pre-flight validation before start)
│   ├── start.bat                       (one-click start with health check)
│   ├── stop.bat                        (one-click stop, preserves data)
│   ├── health-check.bat                (8-point system health verification)
│   ├── rebuild-clean.bat               (safe rebuild without losing data)
│   ├── view-logs.bat                   (show recent backend + DB logs)
│   ├── live-logs.bat                   (stream logs in real-time)
│   ├── backup-db.bat                   (create timestamped .sql backup)
│   ├── restore-db.bat                  (interactive restore with YES confirmation)
│   └── cleanup-old-backups.bat         (delete backups older than 30 days)
├── synology-nas/
│   ├── docker-compose.yml              (NAS-optimized services)
│   ├── Dockerfile.backend              (same multi-stage build)
│   ├── .env.example                      (NAS environment template)
│   ├── synology-readme.md              (Container Manager guide)
│   ├── SYNOLOGY_PRODUCTION_CHECKLIST.md (daily/weekly/monthly checklists for NAS)
│   ├── synology-health-check.sh        (8-point health verification script)
│   ├── synology-backup-db.sh           (timestamped .sql backup)
│   ├── synology-restore-db.sh          (interactive restore)
│   └── synology-cleanup-old-backups.sh (delete backups older than 30 days)
└── reverse-proxy/
    ├── docker-compose.nginx.yml          (optional Nginx container — DISABLED by default)
    ├── nginx.conf                        (HTTP reverse proxy config)
    ├── nginx-ssl-template.conf           (HTTPS template for custom domains)
    ├── README-REVERSE-PROXY.md         (when and how to use Nginx)
    ├── start-nginx.bat                 (start reverse proxy)
    └── stop-nginx.bat                  (stop reverse proxy)
```

## Architecture

The Care Diagnostics ERP is a **pnpm monorepo** with:
- **Backend:** Express 5 API server (`artifacts/api-server/`)
- **Frontends:** 3 React/Vite SPAs served statically by the backend
  - `clinic-site/` — public patient-facing website (`/`)
  - `diagnostic-erp/` — staff billing & operations ERP (`/erp/`)
  - `super-admin-portal/` — compliance & admin (`/super-admin-portal/`)

### Why Only 2 Containers?

The backend's `build-deploy.mjs` script bundles all 3 frontend SPAs into `dist/web/` and the Express server serves them as static files. This means:
- **One port** (8081) serves everything
- **Simpler firewall rules** for doctor's offices
- **No reverse proxy needed** for basic deployment
- **Faster startup** — no container orchestration complexity
- **Lower RAM usage** — no separate frontend process

### Container Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host (Windows PC or Synology NAS)          │
│                                                                      │
│  ┌──────────────────────────────┐   ┌──────────────────────────────────┐ │
│  │  PostgreSQL 16          │   │  Backend (Express + SPAs)       │ │
│  │  Port: 5432 (internal)    │   │  Port: 8080 → 8081             │ │
│  │  Volume: postgres_data    │   │  Volumes:                       │ │
│  │  Memory: 2GB max          │   │    uploads/ (photos, reports)   │ │
│  │                          │   │    backups/ (.sql dumps)        │ │
│  │  └──────────────────────────────┘   │    logs/ (troubleshooting)       │ │
│  │                               │    dicom-storage/ (future PACS)   │ │
│  │                               │  Memory: 4GB max                │ │
│  │                               │  Schedulers: enabled            │ │
│  └──────────────────────────────────────────────┘   └──────────────────────────────────────────────┘ │
│                                                                      │
│  Access URLs:                                                        │
│    http://localhost:8081/           ← Clinic website (patients)        │
│    http://localhost:8081/erp/       ← Staff ERP                        │
│    http://localhost:8081/super-admin-portal/ ← Super Admin             │
│    http://localhost:8081/api/healthz ← Health check                   │
└─────────────────────────────────────────────────────────────┘
```

## Windows Desktop Deployment

### Quick Start
```cmd
cd docker-deployment\windows-desktop
copy .env.example .env
:: Edit .env — set DB_PASSWORD and SESSION_SECRET
validate-deployment.bat   ← check everything is ready
start.bat               ← build and start the ERP
```

### Validation Before Start
```cmd
validate-deployment.bat
```
Checks:
- Docker installed and running
- Docker Compose available
- `.env` file exists and required variables set
- Port 8081 is free
- Required folders exist (uploads, backups, logs, dicom-storage)
- docker-compose.yml and Dockerfile.backend exist
- Sufficient RAM available (4GB+ free)

### Data Locations (Windows)
| Data | Location |
|------|----------|
| Database | Docker volume `postgres_data` (managed by Docker) |
| Uploads | `uploads/` folder in windows-desktop/ |
| Backups | `backups/` folder in windows-desktop/ |
| Logs | `logs/` folder in windows-desktop/ |
| DICOM (future) | `dicom-storage/` folder in windows-desktop/ |

### Commands
| Command | Purpose |
|---------|---------|
| `validate-deployment.bat` | Pre-flight check before starting |
| `start.bat` | Start the ERP with health check loop |
| `stop.bat` | Stop all containers (data preserved) |
| `health-check.bat` | Verify all 8 health checks pass |
| `rebuild-clean.bat` | Rebuild backend without losing data |
| `view-logs.bat` | Show recent backend + DB logs |
| `live-logs.bat` | Stream logs in real-time |
| `backup-db.bat` | Create timestamped .sql backup |
| `restore-db.bat` | Restore from .sql backup (requires YES confirmation) |
| `cleanup-old-backups.bat` | Delete backups older than 30 days |

## Synology NAS Deployment

### Quick Start
1. Create folders on NAS:
   ```
   /volume1/docker/diagnostic-erp/postgres/
   /volume1/docker/diagnostic-erp/uploads/
   /volume1/docker/diagnostic-erp/backups/
   /volume1/docker/diagnostic-erp/logs/
   /volume1/docker/diagnostic-erp/dicom-storage/
   /volume1/docker/diagnostic-erp/init-scripts/
   /volume1/docker/diagnostic-erp/project/
   ```
2. Upload `docker-compose.yml`, `Dockerfile.backend`, `.env`, and shell scripts to `project/`
3. Container Manager → Project → Create → Build from docker-compose.yml
4. Access at `http://NAS-IP:8081/erp/`

### Shell Commands
```bash
cd /volume1/docker/diagnostic-erp/project
sh synology-health-check.sh        # 8-point health check
sh synology-backup-db.sh           # Create backup
sh synology-restore-db.sh          # Restore from backup
sh synology-cleanup-old-backups.sh # Delete old backups
```

### Scheduled Tasks (DSM Task Scheduler)
| Task | Schedule | Command |
|------|----------|---------|
| Daily backup | Daily at 2:00 AM | `cd /volume1/docker/diagnostic-erp/project && sh synology-backup-db.sh` |
| Weekly cleanup | Mondays at 3:00 AM | `cd /volume1/docker/diagnostic-erp/project && sh synology-cleanup-old-backups.sh` |

### Data Locations (Synology)
| Data | Location |
|------|----------|
| Database | `/volume1/docker/diagnostic-erp/postgres/` |
| Uploads | `/volume1/docker/diagnostic-erp/uploads/` |
| Backups | `/volume1/docker/diagnostic-erp/backups/` |
| Logs | `/volume1/docker/diagnostic-erp/logs/` |
| DICOM (future) | `/volume1/docker/diagnostic-erp/dicom-storage/` |

## Optional Nginx Reverse Proxy

The reverse proxy is **disabled by default**. You do NOT need it for local use.

### When to Use
- Custom domain name (e.g. `erp.hopehospital.in`)
- HTTPS/SSL certificates
- Remote access from outside the LAN
- Future PACS routing through same entry point

### When NOT to Use
- Running inside a doctor's office on local network
- Only staff inside the clinic access the ERP
- No custom domain name

### Quick Test (Local Only)
```cmd
cd docker-deployment\reverse-proxy
docker compose -f docker-compose.nginx.yml up -d
:: Access at http://localhost/ instead of http://localhost:8081/
```

### For Production Domain + HTTPS
1. See `reverse-proxy/README-REVERSE-PROXY.md`
2. Get SSL certificates (Let's Encrypt — free)
3. Copy `nginx-ssl-template.conf` to `nginx.conf`
4. Update domain name and certificate paths
5. Start with SSL enabled

### Alternative: Cloudflare Tunnel (Recommended for Clinics)
Safer than exposing ports — no open firewall rules, built-in DDoS protection, free SSL.
See `reverse-proxy/README-REVERSE-PROXY.md` section "Cloudflare Tunnel".

## Ports Used

| External Port | Maps To | Purpose | Notes |
|---------------|---------|---------|-------|
| `8081` | Backend `8080` | Main ERP access (website + API + admin) | Required |
| `5432` (127.0.0.1 only) | PostgreSQL `5432` | Database access for backup/restore | Loopback only — not on LAN |
| `80` (optional Nginx) | Nginx `80` | HTTP reverse proxy entry | Only if using Nginx |
| `443` (optional Nginx) | Nginx `443` | HTTPS reverse proxy entry | Only if using SSL |

## Environment Variables

### Required
| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PASSWORD` | `CHANGE_ME_PASSWORD` | PostgreSQL password — **MUST change** |
| `SESSION_SECRET` | random placeholder | Cookie signing key — **MUST change** |

### Optional (Feature-Dependent)
| Variable | Used For |
|----------|----------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | AI clinical notes, billing insights |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | Email notifications to patients |
| `SUPER_ADMIN_USB_KEY` | Physical USB gate for compliance access |
| `CONQUEST_HOST`, `CONQUEST_PORT` | PACS/DICOM imaging integration |

## Backup & Restore

### Automatic Backups
- **Windows:** Cron scheduler inside backend container runs daily at 2:00 AM
- **Synology:** DSM Task Scheduler runs `synology-backup-db.sh` daily

### Manual Backup
- **Windows:** Double-click `backup-db.bat`
- **Synology:** `sh synology-backup-db.sh`

### Restore
- **Windows:** Double-click `restore-db.bat`, select backup, type `YES`
- **Synology:** `sh synology-restore-db.sh /path/to/backup.sql`

### Cleanup
- **Windows:** Double-click `cleanup-old-backups.bat` — deletes backups older than 30 days, always keeps the most recent
- **Synology:** `sh synology-cleanup-old-backups.sh`

## Emergency Recovery Steps

1. **Preserve current state** — run backup if database is still running
2. **Find most recent good backup** in `backups/` folder
3. **Decide:** rebuild containers (`rebuild-clean.bat`) vs restore database (`restore-db.bat`)
4. **Execute** — follow the script prompts
5. **Verify** — run health-check, confirm data is present
6. **Create fresh backup** of restored state immediately

See `PRODUCTION_CHECKLIST.md` (Windows) or `SYNOLOGY_PRODUCTION_CHECKLIST.md` (NAS) for detailed emergency procedures.

## Health Checks

All services have automatic health checks:
- **PostgreSQL:** `pg_isready` every 10 seconds, 5 retries
- **Backend:** `wget http://localhost:8080/api/healthz` every 15 seconds, 5 retries
- **Nginx (optional):** `nginx-health` endpoint for load balancer probes

If a service fails 5 health checks, Docker marks it unhealthy and `restart: unless-stopped` attempts to restart it.

## Future PACS/DICOM Notes

- DICOM storage folder (`dicom-storage/`) is pre-mounted but empty
- DICOM files must **NEVER** be stored inside PostgreSQL — always use the file system
- Future Orthanc or Conquest PACS container can mount the same folder
- Nginx config has `/pacs/` route placeholder ready
- Backend already supports `ENABLE_DICOM_PULL_AGENT=1` and `CONQUEST_HOST` settings

## Future HTTPS/Domain Notes

- Nginx reverse proxy config is ready with SSL template (`nginx-ssl-template.conf`)
- SSL certificate paths are documented: `/etc/nginx/certs/fullchain.pem` and `privkey.pem`
- Let's Encrypt instructions included in `README-REVERSE-PROXY.md`
- Cloudflare Tunnel recommended as safer alternative for clinics
- Synology DSM built-in reverse proxy is also documented for NAS users

## Security Notes

1. **Database port 5432 is bound to 127.0.0.1 only** — not accessible from other devices
2. **.env file contains secrets** — never share it or commit it to version control
3. **Session secret should be 64+ random characters** — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. **Memory limits prevent runaway containers** — backend 4GB, PostgreSQL 2GB
5. **Restart policy ensures auto-recovery** after host reboot or container crash
6. **Upload limits defined** — 5MB JSON, 25MB documents, 512MB+ future DICOM via streaming

## Rebuilding After Code Updates

### Windows
```cmd
cd docker-deployment\windows-desktop
rebuild-clean.bat
```

### Synology NAS
1. Container Manager → Project → `care-diagnostics` → **Action** → **Rebuild**

Database, uploads, and backups are preserved during rebuilds.

## Support

- Check `view-logs.bat` / `live-logs.bat` (Windows) or `docker compose logs` (Synology) for errors
- Health endpoint: `http://localhost:8081/api/healthz`
- Run `health-check.bat` (Windows) or `synology-health-check.sh` (Synology) for full diagnostics
- See `TROUBLESHOOTING.md` for common problems and solutions
