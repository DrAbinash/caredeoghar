#!/bin/sh
# =============================================================================
# Care Diagnostics ERP — Synology NAS Database Restore Script
# =============================================================================
# Restores the database from a .sql backup file.
#
# WARNING: This REPLACES all current data in the database.
#          Make a fresh backup before restoring.
#
# Usage:
#   cd /volume1/docker/diagnostic-erp/project
#   sh synology-restore-db.sh /volume1/docker/diagnostic-erp/backups/BACKUP-FILE.sql
# =============================================================================

set -e

BACKUP_DIR="/volume1/docker/diagnostic-erp/backups"

# If no argument provided, list available backups
if [ -z "$1" ]; then
    echo ""
    echo "Care Diagnostics ERP — Database Restore"
    echo "========================================"
    echo ""
    echo "Available backups in ${BACKUP_DIR}:"
    echo ""
    ls -lh "${BACKUP_DIR}"/*.sql 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}' || echo "  No .sql backups found."
    echo ""
    echo "Usage:"
    echo "  sh synology-restore-db.sh ${BACKUP_DIR}/care-diagnostics-backup-YYYY-MM-DD_HHMMSS.sql"
    echo ""
    exit 0
fi

BACKUP_FILE="$1"

# Validate backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Get file size
SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗"
echo "║              DATABASE RESTORE — WARNING!                           ║"
echo "║  This will REPLACE all current data with the backup file.          ║"
echo "║  Make sure you have a fresh backup first!                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Backup file: ${BACKUP_FILE}"
echo "Size: ${SIZE}"
echo ""

# Ask for confirmation
printf "Type YES to proceed: "
read CONFIRM

if [ "${CONFIRM}" != "YES" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Stop backend to prevent data corruption during restore
echo ""
echo "Stopping backend container..."
docker stop care-diagnostics-backend

# Restore the database
echo "Restoring database... This may take a few minutes."
docker exec -i care-diagnostics-db psql -U postgres -d HospERP < "${BACKUP_FILE}"

# Restart backend
echo "Restarting backend container..."
docker start care-diagnostics-backend

# Verify
echo ""
echo "Restore complete. Verifying..."
if curl -sf http://localhost:8081/api/healthz >/dev/null 2>&1; then
    echo "SUCCESS! Database restored. ERP is accessible again."
else
    echo "WARNING: ERP is not responding yet. It may need a few more seconds to start."
    echo "Check: docker compose ps"
fi

echo ""
