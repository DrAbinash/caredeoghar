# Care Diagnostics ERP — Production Checklist

Use this checklist to ensure your ERP is running safely in a real clinic or hospital.

---

## Before First Launch

- [ ] **Windows PC / NAS meets requirements:**
  - [ ] At least 6 GB free RAM (4 GB for backend + 2 GB for PostgreSQL)
  - [ ] At least 20 GB free disk space
  - [ ] Windows 10/11 Pro, Enterprise, or Home with WSL2 (or Synology DSM 7.0+)

- [ ] **Docker Desktop installed and running**
  - [ ] Whale icon shows green in system tray
  - [ ] `docker --version` works in Command Prompt

- [ ] **.env file created and configured**
  - [ ] Copied from `.env.example`
  - [ ] `DB_PASSWORD` changed from default `CHANGE_ME_PASSWORD`
  - [ ] `SESSION_SECRET` changed from default `change-me-to-a-random-long-string`
  - [ ] Password is strong (12+ characters, mixed case, numbers, symbols)
  - [ ] `.env` file is NOT shared with anyone

- [ ] **Deployment validated**
  - [ ] Ran `validate-deployment.bat` — all checks passed
  - [ ] Ran `start.bat` — build completed without errors
  - [ ] Ran `health-check.bat` — all 8 checks passed
  - [ ] Opened `http://localhost:8081/erp/` in browser — login page loads

- [ ] **First admin user created**
  - [ ] Logged into Staff ERP
  - [ ] Created first staff user with admin permissions
  - [ ] Tested login/logout

- [ ] **Backup verified**
  - [ ] Ran `backup-db.bat` — `.sql` file created in `backups/` folder
  - [ ] File size is reasonable (not 0 bytes)
  - [ ] Copied backup to external USB drive or cloud storage

- [ ] **Printer tested** (if using bill/receipt printing)
  - [ ] Created a test bill
  - [ ] Printed receipt — layout looks correct
  - [ ] Paper size set correctly in Settings

---

## Daily Checklist (Each Morning)

- [ ] **ERP is running**
  - [ ] Opened `http://localhost:8081/erp/` — loads without errors
  - [ ] Or ran `health-check.bat` — all checks passed

- [ ] **No critical errors**
  - [ ] Checked `view-logs.bat` — no red error messages
  - [ ] Or checked `logs/` folder — no sudden spike in error count

- [ ] **Yesterday's backup exists**
  - [ ] Checked `backups/` folder — at least one `.sql` file from today/yesterday
  - [ ] File size looks reasonable

---

## Weekly Checklist (Every Monday Morning)

- [ ] **Full health check**
  - [ ] Ran `health-check.bat` — all 8 checks passed
  - [ ] All containers show green status

- [ ] **Backup verification**
  - [ ] Ran `backup-db.bat` manually — file created successfully
  - [ ] Copied most recent backup to external USB or cloud
  - [ ] Deleted very old backups (run `cleanup-old-backups.bat`)

- [ ] **Disk space check**
  - [ ] At least 10 GB free on the drive
  - [ ] `backups/` folder not growing uncontrollably
  - [ ] `logs/` folder not growing uncontrollably

- [ ] **Review printer settings**
  - [ ] Paper size still set correctly in Settings
  - [ ] Test print works

---

## Monthly Checklist (First Monday of Each Month)

- [ ] **System update**
  - [ ] Checked for new ERP version / code updates
  - [ ] Ran `rebuild-clean.bat` to apply updates
  - [ ] Verified all features still work after update
  - [ ] Ran `health-check.bat` after update

- [ ] **Security review**
  - [ ] `.env` file password still strong (not shared, not default)
  - [ ] No unauthorized staff users created
  - [ ] Windows / NAS security updates applied

- [ ] **Backup deep verification**
  - [ ] Restored backup to a test environment (if possible)
  - [ ] Or at minimum: opened the `.sql` file in a text editor — contains SQL commands
  - [ ] Confirmed oldest backup is no older than 30 days

- [ ] **Performance check**
  - [ ] ERP pages load in under 3 seconds
  - [ ] No unusual lag during bill creation
  - [ ] Database size reasonable (not unexpectedly huge)

---

## Emergency Restore Checklist (When Something Goes Wrong)

**STOP. Do not panic. Follow these steps in order.**

### Step 1: Assess the Damage
- [ ] What happened? (power outage, Windows update, accidental delete, error message?)
- [ ] Is the database still accessible? Try `health-check.bat`
- [ ] Do you have a recent backup in `backups/`?

### Step 2: Preserve What You Can
- [ ] **If the database is still running:**
  - [ ] Immediately run `backup-db.bat` — save the current state
  - [ ] Copy the backup file to a USB drive NOW

- [ ] **If the database is NOT running:**
  - [ ] Do NOT touch the `postgres_data` Docker volume
  - [ ] Find the most recent `.sql` backup in `backups/`

### Step 3: Decide Restore vs. Rebuild

| Situation | Action |
|-----------|--------|
| Containers won't start, data might be fine | Run `rebuild-clean.bat` |
| Database corrupted but backups exist | Run `restore-db.bat` with latest backup |
| Both containers and database broken | `rebuild-clean.bat`, then `restore-db.bat` |
| Complete system failure, no backups | Contact IT support immediately |

### Step 4: Restore Procedure
1. [ ] Find the most recent good `.sql` backup in `backups/`
2. [ ] Run `restore-db.bat`
3. [ ] Select the backup file when prompted
4. [ ] Type `YES` to confirm
5. [ ] Wait for restore to complete (may take 5-30 minutes for large databases)
6. [ ] Run `health-check.bat` to verify
7. [ ] Log into the ERP and check yesterday's data is present

### Step 5: After Restore
- [ ] Immediately run `backup-db.bat` to create a fresh backup of the restored state
- [ ] Check all staff can log in
- [ ] Check yesterday's bills, appointments, and reports are present
- [ ] If anything is missing, check if a newer backup exists and repeat

---

## Contact Information

Fill this in for your clinic:

| Role | Name | Phone | Email |
|------|------|-------|-------|
| IT Support | ______ | ______ | ______ |
| System Admin | ______ | ______ | ______ |
| Backup Location | ______ | ______ | ______ |
| Last Backup Date | ______ | ______ | ______ |
