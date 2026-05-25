#!/bin/sh
# =============================================================================
# Care Diagnostics ERP — Synology NAS Backup Cleanup Script
# =============================================================================
# Deletes backup files older than 30 days, but always keeps the most recent
# backup regardless of age.
#
# Usage:
#   cd /volume1/docker/diagnostic-erp/project
#   sh synology-cleanup-old-backups.sh
#
# Run this weekly via DSM Task Scheduler to manage disk space.
# =============================================================================

set -e

BACKUP_DIR="/volume1/docker/diagnostic-erp/backups"
DAYS_OLD=30

echo ""
echo "Care Diagnostics ERP — Backup Cleanup"
echo "====================================="
echo "Policy: Delete backups older than ${DAYS_OLD} days"
echo "Exception: The most recent backup is ALWAYS kept"
echo ""

# Ensure directory exists
if [ ! -d "${BACKUP_DIR}" ]; then
    echo "No backups directory found. Nothing to clean."
    exit 0
fi

# Count total backups
TOTAL=$(find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql" -type f 2>/dev/null | wc -l)
echo "Total backups found: ${TOTAL}"

if [ "$TOTAL" -eq 0 ]; then
    echo "No .sql backup files found. Nothing to clean."
    exit 0
fi

# Find the most recent backup (sort by modification time, newest first)
MOST_RECENT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n -r | head -1 | cut -d' ' -f2-)

# Find backups older than DAYS_OLD, excluding the most recent
OLD_BACKUPS=$(find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql" -type f -mtime +${DAYS_OLD} 2>/dev/null | grep -v "^${MOST_RECENT}$" || true)
OLD_COUNT=$(echo "${OLD_BACKUPS}" | grep -c "\.sql$" || echo 0)

if [ "$OLD_COUNT" -eq 0 ]; then
    echo "No backups older than ${DAYS_OLD} days to delete."
    echo "Most recent backup kept: $(basename "${MOST_RECENT}")"
    exit 0
fi

echo ""
echo "Backups to KEEP:"
echo "  ✓ $(basename "${MOST_RECENT}")  [MOST RECENT — protected]"
KEEP_COUNT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql" -type f ! -mtime +${DAYS_OLD} 2>/dev/null | grep -v "^${MOST_RECENT}$" | wc -l)
if [ "$KEEP_COUNT" -gt 0 ]; then
    find "${BACKUP_DIR}" -maxdepth 1 -name "*.sql" -type f ! -mtime +${DAYS_OLD} 2>/dev/null | grep -v "^${MOST_RECENT}$" | while read -r f; do
        echo "  ✓ $(basename "$f")"
    done
fi

echo ""
echo "Backups to DELETE (${OLD_COUNT} file(s)) older than ${DAYS_OLD} days:"
echo "${OLD_BACKUPS}" | while read -r f; do
    if [ -n "$f" ]; then
        echo "  ✗ $(basename "$f")"
    fi
done

echo ""
printf "Type DELETE to permanently remove these files: "
read CONFIRM

if [ "${CONFIRM}" != "DELETE" ]; then
    echo "Cleanup cancelled. No files were deleted."
    exit 0
fi

echo ""
echo "Deleting old backups..."
echo "${OLD_BACKUPS}" | while read -r f; do
    if [ -n "$f" ] && [ -f "$f" ]; then
        rm -f "$f"
        echo "  Deleted: $(basename "$f")"
    fi
done

echo ""
echo "Cleanup complete. ${OLD_COUNT} old backup(s) removed."
echo "Most recent backup remains: $(basename "${MOST_RECENT}")"
echo ""
