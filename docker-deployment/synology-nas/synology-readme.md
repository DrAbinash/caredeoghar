# Care Diagnostics ERP — Synology NAS Deployment Guide

This guide walks you through deploying the Care Diagnostics ERP on a **Synology NAS** using **Container Manager** (Docker).

## Prerequisites

- Synology NAS with **DSM 7.0+**
- **Container Manager** package installed (from Package Center)
- At least **4 GB RAM** available
- **SSH access enabled** (Control Panel → Terminal & SNMP → Enable SSH service) — needed only for first-time folder setup

## Step 1: Create NAS Folders

Before deploying, create the persistent storage folders on your NAS.

1. Open **DSM File Station**
2. Navigate to `docker/` (create it if it doesn't exist)
3. Create the folder: `diagnostic-erp/`
4. Inside `diagnostic-erp/`, create three subfolders:
   - `postgres/` — database files
   - `uploads/` — reports, patient photos, website media
   - `backups/` — database backups

Full paths:
```
/volume1/docker/diagnostic-erp/postgres/
/volume1/docker/diagnostic-erp/uploads/
/volume1/docker/diagnostic-erp/backups/
```

> **Note:** If your volume is not `volume1`, change the path in `docker-compose.yml` accordingly.

## Step 2: Upload Project Files

1. In File Station, create the folder: `docker/diagnostic-erp/project/`
2. Upload these files into that folder:
   - `docker-compose.yml`
   - `Dockerfile.backend`
   - `.env` (copy from `.env.example` and edit — see Step 3)

Or use SSH to copy files:
```bash
ssh admin@your-nas-ip
cd /volume1/docker/diagnostic-erp/project/
# Copy files here
```

## Step 3: Create .env File

Create a file named `.env` in the same folder as `docker-compose.yml`.

Required values:
```
DB_PASSWORD=YourStrongPasswordHere
SESSION_SECRET=YourRandomLongStringHere
```

Optional (only if you use these features):
```
AI_INTEGRATIONS_GEMINI_API_KEY=your-gemini-key
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## Step 4: Deploy via Container Manager

1. Open **Container Manager** in DSM
2. Click **Project** in the left sidebar
3. Click **Create**
4. Choose **Build from Dockerfile / docker-compose.yml**
5. Set:
   - **Project name:** `care-diagnostics`
   - **Path:** `/volume1/docker/diagnostic-erp/project`
   - **docker-compose.yml:** Select the file you uploaded
6. Click **Next**
7. Review the services (postgres + backend)
8. Click **Build and Up** — this will:
   - Download the PostgreSQL image
   - Build the ERP backend image (takes 5–10 minutes on first run)
   - Start both containers

## Step 5: Verify Deployment

1. In Container Manager → **Container**, check both containers are **Running** (green)
2. Open a browser and go to:
   - **Clinic Website:** `http://YOUR-NAS-IP:8081/`
   - **Staff ERP:** `http://YOUR-NAS-IP:8081/erp/`
   - **Super Admin:** `http://YOUR-NAS-IP:8081/super-admin-portal/`

3. Health check: `http://YOUR-NAS-IP:8081/api/healthz` should show `{"ok":true}`

## Step 6: Daily Backup (Recommended)

Set up a scheduled task in DSM to backup your database daily.

1. Open **Control Panel** → **Task Scheduler**
2. Click **Create** → **Scheduled Task** → **User-defined script**
3. Set:
   - **Task name:** `CareDiagnostics-Backup`
   - **User:** `root`
   - **Schedule:** Daily at 2:00 AM
4. In the **Run command** box, paste:
   ```bash
   docker exec care-diagnostics-db pg_dump -U postgres -d HospERP > /volume1/docker/diagnostic-erp/backups/care-diagnostics-backup-$(date +%Y-%m-%d_%H%M%S).sql
   ```
5. Click **OK** and confirm

Backups will appear in `/volume1/docker/diagnostic-erp/backups/` and are accessible via File Station.

## Manual Backup

SSH into your NAS and run:
```bash
docker exec care-diagnostics-db pg_dump -U postgres -d HospERP > /volume1/docker/diagnostic-erp/backups/manual-backup-$(date +%Y-%m-%d_%H%M%S).sql
```

## Restore From Backup

1. Stop the backend container:
   ```bash
   docker stop care-diagnostics-backend
   ```
2. Restore the database:
   ```bash
   docker exec -i care-diagnostics-db psql -U postgres -d HospERP < /volume1/docker/diagnostic-erp/backups/YOUR-BACKUP-FILE.sql
   ```
3. Start the backend:
   ```bash
   docker start care-diagnostics-backend
   ```

## Update to a Newer Version

1. Download the updated project files to `/volume1/docker/diagnostic-erp/project/`
2. In Container Manager → Project → `care-diagnostics` → **Action** → **Rebuild**
3. This rebuilds the backend image with the latest code while keeping your database

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build takes too long | First build is slow (compiling). Subsequent rebuilds are faster. |
| Port 8081 already in use | Change `"8081:8080"` to `"8082:8080"` in docker-compose.yml |
| Can't access from outside LAN | Check your router's port forwarding for port 8081 → NAS-IP:8081 |
| Database won't start | Check folder permissions: `chmod 777 /volume1/docker/diagnostic-erp/postgres` |
| Health check fails | Wait 2 minutes after first start — the server needs time to initialize |

## Architecture Notes

- **Single port (8081)** serves everything: public website, staff ERP, API, super admin
- **No separate frontend container** — the backend bundles and serves all frontend SPAs statically
- **Database runs on the same NAS** — no external cloud dependency
- **All data stays on your NAS** — fully self-hosted and private
