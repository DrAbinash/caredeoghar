# Care Diagnostics ERP — Troubleshooting Guide

This guide helps you fix common problems when running the ERP with Docker.

> **Before doing anything else:** run `validate-deployment.bat` to check your setup.

---

## Docker Engine Stopped

**Symptom:** `ERROR: Docker Desktop is not running.`

**Solution:**
1. Open Docker Desktop from the Start Menu
2. Wait for the whale icon in the system tray to show "Docker Desktop is running"
3. Try `start.bat` again

---

## Port 8081 Already in Use

**Symptom:** `Port 8081 is already in use. Another program may be running.`

**Solution:**
1. Find which program is using port 8081:
   ```cmd
   netstat -ano | findstr :8081
   ```
2. Close that program, or change the ERP port:
   - Open `docker-compose.yml`
   - Find `"8081:8080"` and change to `"8082:8080"`
   - Access the ERP at `http://localhost:8082/erp/`

---

## Backend Not Starting

**Symptom:** `care-diagnostics-backend` container shows `Exited` or `Restarting`

**Solution:**
1. Run `view-logs.bat` to see the error
2. Common causes:

   | Error | Fix |
   |-------|-----|
   | `DATABASE_URL` invalid | Check `.env` file — make sure DB_PASSWORD matches |
   | Port conflict | Change port in docker-compose.yml |
   | Out of memory | Close other programs; need 4GB+ free RAM |
   | Build failure | Run `rebuild-clean.bat` to rebuild the image |

3. If migrations failed, the database may be in a bad state:
   - Run `backup-db.bat` first
   - Run `rebuild-clean.bat`
   - If still failing, restore from a known-good backup

---

## Database Not Starting

**Symptom:** `care-diagnostics-db` container shows `Exited`

**Solution:**
1. Run `view-logs.bat` and check the postgres logs
2. Common causes:

   | Error | Fix |
   |-------|-----|
   | `Permission denied` | The postgres_data Docker volume may have wrong permissions. Try: `docker compose down -v` then `start.bat` (this deletes the database — backup first!) |
   | `Address already in use` | Another PostgreSQL is running on port 5432. Stop it first. |
   | `Out of memory` | Need at least 512MB free for PostgreSQL |

---

## Volume Permission Problem

**Symptom:** Database or uploads cannot write to disk

**Solution:**
1. On Windows with Docker Desktop, volumes are managed by Docker — permissions are usually correct
2. If using WSL2 backend, ensure the `docker-deployment` folder is on a local drive (not a network share)
3. Try restarting Docker Desktop

---

## Synology NAS Path Issue

**Symptom:** Containers fail to start on Synology with `Bind mount failed`

**Solution:**
1. Make sure the NAS folders exist before deploying:
   ```
   /volume1/docker/diagnostic-erp/postgres/
   /volume1/docker/diagnostic-erp/uploads/
   /volume1/docker/diagnostic-erp/backups/
   /volume1/docker/diagnostic-erp/logs/
   /volume1/docker/diagnostic-erp/dicom-storage/
   ```
2. Check folder permissions in DSM File Station — should be readable/writable
3. If your volume is not `volume1`, edit `docker-compose.yml` paths

---

## .env File Missing

**Symptom:** `ERROR: .env file is missing!`

**Solution:**
1. Copy the template: `copy .env.example .env`
2. Edit `.env` in Notepad
3. Change `DB_PASSWORD` and `SESSION_SECRET` from their default values
4. Save and run `start.bat` again

---

## Database Migration Failed

**Symptom:** Backend logs show `migration failed` or `column does not exist`

**Solution:**
1. The ERP runs migrations automatically on startup — usually this fixes itself on restart
2. If not:
   - Run `backup-db.bat` first
   - Run `rebuild-clean.bat`
   - If the problem started after a code update, the new code may require a migration that wasn't applied — check the backend logs for the exact error
3. In rare cases, you may need to restore from the most recent good backup

---

## Browser Cannot Open the ERP

**Symptom:** `This site can’t be reached` when opening http://localhost:8081/

**Solution:**
1. Check containers are running: run `health-check.bat`
2. If containers are running but browser fails:
   - Try `http://127.0.0.1:8081/` instead of `localhost`
   - Check Windows Firewall is not blocking port 8081
   - Try a different browser
3. If health-check.bat shows `API health check passed` but browser still fails:
   - The backend may be serving API but not the static SPA — run `view-logs.bat`

---

## Corrupted Container

**Symptom:** Container keeps restarting, logs show strange errors

**Solution:**
1. **Do NOT delete the database volume** unless you have a backup
2. Run `rebuild-clean.bat` — this rebuilds the backend image without touching data
3. If that fails, try:
   ```cmd
   docker compose down
   docker system prune -f
   start.bat
   ```
4. Last resort (data loss risk — only if you have a backup):
   ```cmd
   docker compose down -v
   start.bat
   ```

---

## How to Safely Rebuild Without Deleting Data

**Always use `rebuild-clean.bat`** — it does exactly this:
1. Stops containers
2. Removes only the old backend image
3. Rebuilds the backend from the latest code
4. Starts everything again
5. Keeps `postgres_data`, `uploads`, `backups` untouched

**Never run** `docker compose down -v` unless you want to wipe the database.

---

## Still Stuck?

1. Run `validate-deployment.bat` — it checks everything
2. Run `view-logs.bat` — the error message is usually there
3. Check `health-check.bat` — it shows which part is failing
4. Save the logs and contact your system administrator with:
   - The output of `view-logs.bat`
   - The output of `health-check.bat`
   - Your Windows version and Docker Desktop version
