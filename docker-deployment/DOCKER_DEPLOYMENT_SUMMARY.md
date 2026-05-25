# Care Diagnostics ERP — Docker Deployment Summary

This document summarizes the Docker deployment setup for the Care Diagnostics ERP system.

## Files Created

```
docker-deployment/
├── DOCKER_DEPLOYMENT_SUMMARY.md        (this file)
├── windows-desktop/
│   ├── docker-compose.yml              (Docker services definition)
│   ├── Dockerfile.backend              (multi-stage build for backend)
│   ├── .env.example                    (template for environment secrets)
│   ├── README.md                       (step-by-step guide for doctors)
│   ├── start.bat                       (one-click start)
│   ├── stop.bat                        (one-click stop)
│   ├── backup-db.bat                   (manual database backup)
│   └── restore-db.bat                  (database restore from backup)
└── synology-nas/
    ├── docker-compose.yml              (NAS-optimized services)
    ├── Dockerfile.backend              (same multi-stage build)
    ├── .env.example                      (NAS environment template)
    └── synology-readme.md              (Synology Container Manager guide)
```

## Architecture

The Care Diagnostics ERP is a **pnpm monorepo** with:
- **Backend:** Express 5 API server (`artifacts/api-server/`)
- **Frontends:** 3 React/Vite SPAs served statically by the backend
  - `clinic-site/` — public patient-facing website (`/`)
  - `diagnostic-erp/` — staff billing & operations ERP (`/erp/`)
  - `super-admin-portal/` — compliance & admin (`/super-admin-portal/`)

### Why Only One Container?

The backend's `build-deploy.mjs` script bundles all 3 frontend SPAs into `dist/web/` and the Express server serves them as static files. This means:
- **One port** (8081) serves everything
- **Simpler firewall rules** for doctor's offices
- **No reverse proxy needed** for basic deployment
- **Faster startup** — no container orchestration complexity

### Container Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host (Windows PC or Synology NAS)  │
│                                                              │
│  ┌─────────────────────────┐   ┌──────────────────────────┐ │
│  │  PostgreSQL 16          │   │  Backend (Express + SPAs)│ │
│  │  Port: 5432 (internal)    │   │  Port: 8080 → 8081       │ │
│  │  Volume: postgres_data    │   │  Volume: uploads         │ │
│  │  Folder: backups/         │   │                          │ │
│  └─────────────────────────┘   └──────────────────────────┘ │
│                                                              │
│  Access URLs:                                                │
│    http://localhost:8081/           ← Clinic website        │
│    http://localhost:8081/erp/       ← Staff ERP              │
│    http://localhost:8081/super-admin-portal/ ← Super Admin   │
│    http://localhost:8081/api/healthz ← Health check          │
└─────────────────────────────────────────────────────────────┘
```

## Windows Desktop Deployment

### How It Works
1. **Docker Desktop** runs on the doctor's Windows PC
2. `start.bat` builds and starts both containers
3. Containers auto-restart after PC reboot
4. Staff access the ERP via browser on the local network

### Quick Start
```cmd
copy .env.example .env
:: Edit .env — set DB_PASSWORD and SESSION_SECRET
start.bat
:: Open http://localhost:8081/erp/
```

### Data Locations
| Data | Location |
|------|----------|
| Database | Docker volume `postgres_data` |
| Uploads | Docker volume `uploads` |
| Backups | `backups/` folder (visible in File Explorer) |

### Backup & Restore
- **Automatic:** Daily backup at 2:00 AM via cron scheduler inside backend
- **Manual:** Double-click `backup-db.bat`
- **Restore:** Double-click `restore-db.bat`, select backup file

## Synology NAS Deployment

### How It Works
1. **Synology Container Manager** imports the `docker-compose.yml`
2. Builds the backend image on the NAS
3. Stores data on NAS folders (`/volume1/docker/diagnostic-erp/`)
4. Accessible from any device on the network

### Quick Start
1. Create folders on NAS:
   ```
   /volume1/docker/diagnostic-erp/postgres/
   /volume1/docker/diagnostic-erp/uploads/
   /volume1/docker/diagnostic-erp/backups/
   ```
2. Upload `docker-compose.yml`, `Dockerfile.backend`, `.env`
3. Container Manager → Project → Create → Build from docker-compose.yml
4. Access at `http://NAS-IP:8081/erp/`

### Data Locations
| Data | Location |
|------|----------|
| Database | `/volume1/docker/diagnostic-erp/postgres/` |
| Uploads | `/volume1/docker/diagnostic-erp/uploads/` |
| Backups | `/volume1/docker/diagnostic-erp/backups/` |

### Backup & Restore
- **Automatic:** DSM Task Scheduler runs `docker exec ... pg_dump ...` daily
- **Manual:** SSH into NAS and run pg_dump
- **Restore:** SSH into NAS, stop backend, run psql restore, start backend

## Ports Used

| External Port | Maps To | Purpose |
|---------------|---------|---------|
| `8081` | Backend `8080` | Main ERP access (website + API + admin) |
| `5432` (localhost only) | PostgreSQL `5432` | Database access for backup/restore |

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

## Health Checks

All services have automatic health checks:
- **PostgreSQL:** `pg_isready` every 10 seconds
- **Backend:** `wget http://localhost:8080/api/healthz` every 15 seconds

If a service fails 5 health checks in a row, Docker marks it unhealthy and (with `restart: unless-stopped`) will attempt to restart it.

## Rebuilding After Code Updates

### Windows
```cmd
cd docker-deployment\windows-desktop
docker compose down
docker compose up -d --build
```

### Synology NAS
1. Container Manager → Project → `care-diagnostics` → **Action** → **Rebuild**

Database and uploads are preserved during rebuilds.

## Security Notes

1. **Database port 5432 is bound to 127.0.0.1 only** — not accessible from other devices
2. **.env file contains secrets** — never share it or commit it to version control
3. **Session secret should be 64+ random characters** — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. **For internet exposure:** Use a reverse proxy (nginx, Traefik) with HTTPS — an example nginx config is not included but can be added later

## Support

- Check `docker compose logs backend` for backend errors
- Check `docker compose logs postgres` for database errors
- Health endpoint: `http://localhost:8081/api/healthz`
