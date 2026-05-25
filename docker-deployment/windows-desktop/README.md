# Care Diagnostics ERP — Windows Desktop Docker Deployment

This folder contains everything you need to run the Care Diagnostics ERP on a Windows PC using **Docker Desktop**.

## What This Runs

A complete diagnostic center ERP system with:
- **Public website** for patients (appointments, reports, bills)
- **Staff ERP** for billing, tests, reports, inventory, accounting
- **Super Admin portal** for compliance and system settings
- **PostgreSQL database** for all your data
- **Automatic daily backups** of your database

## Prerequisites

1. **Windows 10/11** (Pro, Enterprise, or Home with WSL2)
2. **Docker Desktop** installed — [Download here](https://www.docker.com/products/docker-desktop)
3. At least **4 GB RAM** free for Docker

## Step-by-Step Setup

### 1. Install Docker Desktop
- Download and install Docker Desktop from the link above
- Start Docker Desktop and wait until the whale icon shows "Docker is running"
- On first run, Docker may ask you to enable WSL2 — click **Yes**

### 2. Copy This Folder
- Copy the entire `docker-deployment/windows-desktop/` folder to your PC
- Example: `C:\CareDiagnostics\docker-deployment\`

### 3. Create Your .env File
- Open this folder in File Explorer
- Copy `.env.example` and rename it to `.env`
- Right-click `.env` → Open with Notepad
- **Change the database password** on the line:
  ```
  DB_PASSWORD=CHANGE_ME_PASSWORD
  ```
  Replace `CHANGE_ME_PASSWORD` with a strong password you will remember.
- **Change the session secret** on the line:
  ```
  SESSION_SECRET=change-me-to-a-random-long-string-at-least-64-characters
  ```
  Replace it with a random string of letters and numbers.
- Save and close Notepad

### 4. Start the System
- Double-click `start.bat`
- A black window will open and show the build progress
- First startup takes **5–10 minutes** (Docker downloads PostgreSQL and builds the app)
- When you see `Server listening` and `healthcheck passed`, the system is ready
- **Do not close the window** — the server runs inside Docker, not this window

### 5. Open the ERP
- **Clinic website (patients):** http://localhost:8081/
- **Staff ERP (billing, tests, reports):** http://localhost:8081/erp/
- **Super Admin (compliance):** http://localhost:8081/super-admin-portal/

### 6. What Happens After Reboot
- Docker Desktop starts automatically (if you enabled "Start Docker Desktop when you log in")
- The ERP containers start automatically because of `restart: unless-stopped`
- **You do NOT need to run start.bat again** — just open the browser URLs above

## Stop the System
- Double-click `stop.bat`
- This safely stops all containers but **keeps your data**

## Backup Your Database

### Automatic Daily Backup
The system creates a backup every day at 2:00 AM inside the `backups/` folder.

### Manual Backup Now
- Double-click `backup-db.bat`
- A file like `care-diagnostics-backup-2026-05-25_143022.sql` appears in `backups/`
- Copy this file to a USB drive or cloud storage for safety

### Restore From Backup
- Copy your backup `.sql` file into the `backups/` folder
- Double-click `restore-db.bat`
- Enter the backup filename when prompted
- **Warning:** This replaces all current data. Make a backup first!

## Where Is My Data Stored?

| Data | Location |
|------|----------|
| Database | Inside Docker volume `postgres_data` (persistent) |
| Uploads (reports, photos) | Inside Docker volume `uploads` (persistent) |
| Backups | `backups/` folder in this directory |

Even if you delete the containers, your data survives because it lives in Docker volumes and the `backups/` folder.

## Need Help?

- Check Docker Desktop → Containers to see if all 3 containers are green (running)
- Open a browser to http://localhost:8081/api/healthz — if you see `{"ok":true}` the server is healthy
- Check the `logs/` folder for error messages
