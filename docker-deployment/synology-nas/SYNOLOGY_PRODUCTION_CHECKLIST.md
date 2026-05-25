# Care Diagnostics ERP — Synology NAS Production Checklist

Use this checklist to keep your ERP running safely and reliably on a Synology NAS in a clinic or hospital.

---

## Before First Launch

### Hardware & Network
- [ ] Synology NAS has at least 4 GB free RAM
- [ ] At least 50 GB free disk space on the volume
- [ ] NAS is connected to a UPS (uninterruptible power supply) if possible
- [ ] NAS is on a stable LAN (wired Ethernet preferred over Wi-Fi)

### DSM Setup
- [ ] DSM 7.0+ installed
- [ ] Container Manager package installed from Package Center
- [ ] SSH access enabled (Control Panel → Terminal & SNMP → Enable SSH)
- [ ] DSM auto-update disabled OR scheduled for low-traffic hours

### Folder Structure Created
Create these folders in DSM File Station before deploying:

```
/volume1/docker/
  diagnostic-erp/
    postgres/        ← database files
    uploads/         ← patient photos, reports, website media
    backups/         ← database .sql backups
    logs/            ← application logs
    dicom-storage/   ← future PACS imaging files
    project/         ← docker-compose.yml and scripts
```

### .env File Configured
- [ ] Created `.env` from `.env.example`
- [ ] `DB_PASSWORD` changed from default `CHANGE_ME_PASSWORD`
- [ ] `SESSION_SECRET` changed from default `change-me-to-a-random-long-string`
- [ ] Password is strong (12+ characters)
- [ ] `.env` file is NOT visible to non-admin users

### Deployment
- [ ] Project created in Container Manager
- [ ] Both containers show green "Running" status
- [ ] `synology-health-check.sh` returns all 8 checks passed
- [ ] ERP page loads at `http://NAS-IP:8081/erp/`

### First Backup
- [ ] Ran `synology-backup-db.sh` — file created in backups/
- [ ] Backup file size is reasonable (> 0 bytes)
- [ ] Copied backup to external USB drive or cloud sync folder

### Security
- [ ] PostgreSQL port 5432 is NOT exposed to WAN/internet
- [ ] Only port 8081 (ERP web) is accessible from LAN
- [ ] Synology Firewall is enabled (Control Panel → Security → Firewall)
- [ ] Default admin password on NAS has been changed
- [ ] 2FA enabled on DSM admin account

---

## Daily Checklist (Each Morning)

- [ ] ERP loads at `http://NAS-IP:8081/erp/` — no error pages
- [ ] Ran `synology-health-check.sh` — all 8 checks passed
- [ ] No critical errors in Container Manager → Container → Logs

---

## Weekly Checklist (Every Monday Morning)

- [ ] Full health check — `synology-health-check.sh` all green
- [ ] Ran `synology-backup-db.sh` manually — file created
- [ ] Copied most recent backup to external USB or cloud sync
- [ ] Checked disk space — at least 20 GB free
- [ ] Checked backups folder — not growing out of control
- [ ] Checked logs folder — not consuming excessive space

---

## Monthly Checklist (First Monday of Each Month)

- [ ] System update check — new ERP code available?
- [ ] Rebuilt backend image via Container Manager if code updated
- [ ] Verified all features work after update (test bill, test print)
- [ ] Security review:
  - [ ] No unauthorized DSM users
  - [ ] `.env` file still secure
  - [ ] DSM security updates applied
- [ ] Backup deep verification:
  - [ ] Most recent `.sql` file contains SQL commands (can grep for "CREATE TABLE")
  - [ ] Oldest backup is no older than 30 days (ran cleanup script)
- [ ] Performance check:
  - [ ] ERP pages load in under 5 seconds
  - [ ] No unusual lag during bill creation
  - [ ] Database size reasonable

---

## Emergency Restore Checklist

**STOP. Follow these steps in order.**

### Step 1: Assess
- [ ] What happened? (power outage, DSM update, accidental delete?)
- [ ] Is database still accessible? Check `synology-health-check.sh`
- [ ] Do you have a recent backup in `/volume1/docker/diagnostic-erp/backups/`?

### Step 2: Preserve
- [ ] **If database is still running:**
  - [ ] Immediately run `synology-backup-db.sh` — save current state
  - [ ] Copy backup to external USB NOW
- [ ] **If database is NOT running:**
  - [ ] Do NOT delete the `postgres` folder
  - [ ] Find most recent `.sql` backup in backups/

### Step 3: Restore
- [ ] Stopped backend container via Container Manager or `docker stop care-diagnostics-backend`
- [ ] Ran `synology-restore-db.sh /volume1/docker/diagnostic-erp/backups/BACKUP-FILE.sql`
- [ ] Verified `synology-health-check.sh` all green after restore
- [ ] Logged into ERP and confirmed yesterday's data is present

### Step 4: After Restore
- [ ] Immediately ran `synology-backup-db.sh` — fresh backup of restored state
- [ ] All staff confirmed they can log in
- [ ] Checked yesterday's bills, appointments, and reports are present

---

## Contact Information

Fill this in for your clinic:

| Role | Name | Phone | Email |
|------|------|-------|-------|
| IT Support | ______ | ______ | ______ |
| System Admin | ______ | ______ | ______ |
| Backup Location | ______ | ______ | ______ |
| Last Backup Date | ______ | ______ | ______ |
