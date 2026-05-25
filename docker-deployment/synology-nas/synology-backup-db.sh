#!/bin/sh
# =============================================================================
# Care Diagnostics ERP — Synology NAS Database Backup Script
# =============================================================================
# Creates a timestamped .sql backup in the backups folder.
#
# Usage:
#   cd /volume1/docker/diagnostic-erp/project
#   sh synology-backup-db.sh
#
# Scheduled backup via DSM Task Scheduler:
#   Command: sh /volume1/docker/diagnostic-erp/project/synology-backup-db.sh
#   Schedule: Daily at 02:00
# =============================================================================

set -e

BACKUP_DIR="/volume1/docker/diagnostic-erp/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
BACKUP_FILE="care-diagnostics-backup-${TIMESTAMP}.sql"

echo ""
echo "Care Diagnostics ERP — Database Backup"
echo "====================================="
echo "Backup file: ${BACKUP_DIR}/${BACKUP_FILE}"
echo ""

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

# Run pg_dump inside the postgres container
docker exec care-diagnostics-db pg_dump -U postgres -d HospERP > "${BACKUP_DIR}/${BACKUP_FILE}"

# Verify backup was created
if [ -s "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
    SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
    echo "SUCCESS! Backup saved: ${BACKUP_FILE} (${SIZE})"
    echo "Location: ${BACKUP_DIR}/"
    echo ""
    echo "Tip: Copy this file to external storage for safety."
else
    echo "ERROR: Backup file is empty or was not created."
    echo "Make sure the ERP containers are running."
    exit 1
fi
