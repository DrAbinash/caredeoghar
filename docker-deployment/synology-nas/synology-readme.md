# Care Diagnostics ERP — Synology NAS Deployment Guide

This guide walks you through deploying the Care Diagnostics ERP on a **Synology NAS** using **Container Manager** (Docker).

## Prerequisites

- Synology NAS with **DSM 7.0+**
- **Container Manager** package installed (from Package Center)
- At least **6 GB RAM** available (4 GB for backend + 2 GB for PostgreSQL)
- **SSH access enabled** (Control Panel → Terminal & SNMP → Enable SSH service)
- At least **50 GB free disk space**

## Step 1: Create NAS Folders

Before deploying, create the persistent storage folders on your NAS.

1. Open **DSM File Station**
2. Navigate to `docker/` (create it if it doesn't exist)
3. Create the folder: `diagnostic-erp/`
4. Inside `diagnostic-erp/`, create these subfolders:
   - `postgres/` — database files
   - `uploads/` — reports, patient photos, website media
   - `backups/` — database backups
   - `logs/` — application logs
   - `dicom-storage/` — future PACS imaging files
   - `init-scripts/` — future database initialization scripts
   - `project/` — docker-compose.yml and other project files

Full paths:
```
/volume1/docker/diagnostic-erp/postgres/
/volume1/docker/diagnostic-erp/uploads/
/volume1/docker/diagnostic-erp/backups/
/volume1/docker/diagnostic-erp/logs/
/volume1/docker/diagnostic-erp/dicom-storage/
/volume1/docker/diagnostic-erp/init-scripts/
/volume1/docker/diagnostic-erp/project/
```

> **Note:** If your volume is not `volume1`, change the path in `docker-compose.yml` accordingly.

## Step 2: Upload Project Files

1. In File Station, open `docker/diagnostic-erp/project/`
2. Upload these files into that folder:
   - `docker-compose.yml`
   - `Dockerfile.backend`
   - `.env` (copy from `.env.example` and edit — see Step 3)
   - `synology-health-check.sh`
   - `synology-backup-db.sh`
   - `synology-restore-db.sh`
   - `synology-cleanup-old-backups.sh`

Or use SSH to copy files:
```bash
ssh admin@your-nas-ip
cd /volume1/docker/diagnostic-erp/project/
# Copy files here (scp, rsync, or upload via File Station)
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

> **Never share the .env file.** It contains passwords and secrets.

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

4. SSH into your NAS and run the health check script:
   ```bash
   cd /volume1/docker/diagnostic-erp/project
   sh synology-health-check.sh
   ```

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
   cd /volume1/docker/diagnostic-erp/project && sh synology-backup-db.sh
   ```
5. Click **OK** and confirm

Backups will appear in `/volume1/docker/diagnostic-erp/backups/` and are accessible via File Station.

## Weekly Maintenance

Set up a weekly cleanup task to delete old backups (keeps last 30 days, always keeps the most recent):

1. Control Panel → Task Scheduler
2. Create → Scheduled Task → User-defined script
3. **Task name:** `CareDiagnostics-CleanupBackups`
4. **Schedule:** Weekly — Monday at 3:00 AM
5. Run command:
   ```bash
   cd /volume1/docker/diagnostic-erp/project && sh synology-cleanup-old-backups.sh
   ```

## Manual Backup

SSH into your NAS and run:
```bash
cd /volume1/docker/diagnostic-erp/project
sh synology-backup-db.sh
```

## Restore From Backup

```bash
cd /volume1/docker/diagnostic-erp/project
sh synology-restore-db.sh
# → It will list available backups and prompt for the filename
```

Or specify the backup directly:
```bash
sh synology-restore-db.sh /volume1/docker/diagnostic-erp/backups/care-diagnostics-backup-YYYY-MM-DD_HHMMSS.sql
```

## Update to a Newer Version

1. Download the updated project files to `/volume1/docker/diagnostic-erp/project/`
2. In Container Manager → Project → `care-diagnostics` → **Action** → **Rebuild**
3. This rebuilds the backend image with the latest code while keeping your database

## Optional: Reverse Proxy (For Custom Domain)

When you want a custom domain like `erp.yourclinic.in` with HTTPS:

1. Use **DSM Control Panel** → **Login Portal** → **Reverse Proxy**
2. Create a new rule:
   - **Source:** HTTPS, `erp.yourclinic.in`, port 443
   - **Destination:** HTTP, `localhost`, port 8081
3. Enable HSTS and add a Let's Encrypt certificate
4. **Important:** Do NOT expose PostgreSQL port 5432 through the reverse proxy

### Alternative: Cloudflare Tunnel (Recommended)

For remote access without opening router ports:
1. Create a free Cloudflare account
2. Set up a Cloudflare Tunnel on the NAS
3. Route `erp.yourclinic.in` → `localhost:8081`
4. No port forwarding needed — safer for clinics

See `docker-deployment/reverse-proxy/README-REVERSE-PROXY.md` for details.

## Security Notes

| Rule | Why |
|------|-----|
| Do NOT expose PostgreSQL port 5432 to LAN or internet | Database should only be accessible inside Docker |
| Only expose ERP web port 8081 | Patients and staff connect here |
| Use Synology Firewall | Restrict port 8081 to trusted IP ranges if possible |
| Keep backups copied externally | NAS failure won't lose your data |
| Change DSM default admin password | Protect the NAS itself |
| Enable 2FA on DSM admin account | Extra security for the NAS |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build takes too long | First build is slow (compiling). Subsequent rebuilds are faster. |
| Port 8081 already in use | Change `"8081:8080"` to `"8082:8080"` in docker-compose.yml |
| Can't access from outside LAN | Check your router's port forwarding for port 8081 → NAS-IP:8081 |
| Database won't start | Check folder permissions: `chmod 777 /volume1/docker/diagnostic-erp/postgres` |
| Health check fails | Wait 2 minutes after first start — the server needs time to initialize |
| Health check script fails | Make scripts executable: `chmod +x synology-*.sh` |

## Architecture Notes

- **Single port (8081)** serves everything: public website, staff ERP, API, super admin
- **No separate frontend container** — the backend bundles and serves all frontend SPAs statically
- **Database runs on the same NAS** — no external cloud dependency
- **All data stays on your NAS** — fully self-hosted and private
- **Memory limits** — backend capped at 4GB, PostgreSQL at 2GB to prevent resource exhaustion
