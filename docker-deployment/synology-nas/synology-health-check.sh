#!/bin/sh
# =============================================================================
# Care Diagnostics ERP — Synology NAS Health Check Script
# =============================================================================
# Run this in the Synology DSM Terminal or via SSH to verify the system.
#
# Usage:
#   cd /volume1/docker/diagnostic-erp/project
#   sh synology-health-check.sh
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILURES=0

echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════════════════════╗"
echo "║           Care Diagnostics ERP — Synology NAS Health Check         ║"
echo "╚════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
echo ""

# ---[1/8] PostgreSQL container ---
echo "[1/8] Checking PostgreSQL container..."
if docker ps --format "{{.Names}}" | grep -q "care-diagnostics-db"; then
    STATUS=$(docker inspect --format='{{.State.Status}}' care-diagnostics-db 2>/dev/null || echo "unknown")
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' care-diagnostics-db 2>/dev/null || echo "no healthcheck")
    echo -e "  ${GREEN}OK${NC}: care-diagnostics-db is ${STATUS}, health: ${HEALTH}"
else
    echo -e "  ${RED}FAIL${NC}: care-diagnostics-db is not running!"
    FAILURES=$((FAILURES + 1))
fi

# ---[2/8] Backend container ---
echo "[2/8] Checking backend container..."
if docker ps --format "{{.Names}}" | grep -q "care-diagnostics-backend"; then
    STATUS=$(docker inspect --format='{{.State.Status}}' care-diagnostics-backend 2>/dev/null || echo "unknown")
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' care-diagnostics-backend 2>/dev/null || echo "no healthcheck")
    echo -e "  ${GREEN}OK${NC}: care-diagnostics-backend is ${STATUS}, health: ${HEALTH}"
else
    echo -e "  ${RED}FAIL${NC}: care-diagnostics-backend is not running!"
    FAILURES=$((FAILURES + 1))
fi

# ---[3/8] API health endpoint ---
echo "[3/8] Checking API health endpoint..."
if curl -sf http://localhost:8081/api/healthz >/dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:8081/api/healthz 2>/dev/null | head -c 200)
    echo -e "  ${GREEN}OK${NC}: API health check passed (${RESPONSE})"
else
    echo -e "  ${RED}FAIL${NC}: Cannot reach http://localhost:8081/api/healthz"
    FAILURES=$((FAILURES + 1))
fi

# ---[4/8] ERP page reachable ---
echo "[4/8] Checking staff ERP page..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/erp/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "304" ]; then
    echo -e "  ${GREEN}OK${NC}: Staff ERP page returns HTTP ${HTTP_CODE}"
else
    echo -e "  ${YELLOW}WARN${NC}: Staff ERP page returned HTTP ${HTTP_CODE} (expected 200)"
fi

# ---[5/8] Database connection ---
echo "[5/8] Checking database connection inside container..."
if docker exec care-diagnostics-db pg_isready -U postgres -d HospERP >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}: PostgreSQL is accepting connections"
else
    echo -e "  ${RED}FAIL${NC}: PostgreSQL is not accepting connections"
    FAILURES=$((FAILURES + 1))
fi

# ---[6/8] Uploads folder mount ---
echo "[6/8] Checking uploads folder mount..."
if docker exec care-diagnostics-backend ls -la /home/runner/workspace/data/uploads >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}: Uploads folder is mounted inside backend container"
else
    echo -e "  ${YELLOW}WARN${NC}: Could not verify uploads mount"
fi

# ---[7/8] Backups folder mount ---
echo "[7/8] Checking backups folder mount..."
if docker exec care-diagnostics-backend ls -la /home/runner/workspace/backups >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}: Backups folder is mounted inside backend container"
else
    echo -e "  ${YELLOW}WARN${NC}: Could not verify backups mount"
fi

# ---[8/8] Logs folder mount ---
echo "[8/8] Checking logs folder mount..."
if docker exec care-diagnostics-backend ls -la /home/runner/workspace/logs >/dev/null 2>&1; then
    echo -e "  ${GREEN}OK${NC}: Logs folder is mounted inside backend container"
else
    echo -e "  ${YELLOW}WARN${NC}: Could not verify logs mount"
fi

# --- Summary ---
echo ""
echo "╔════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗"
if [ $FAILURES -eq 0 ]; then
    echo -e "║  ${GREEN}ALL HEALTH CHECKS PASSED — System is healthy!${NC}                      ║"
    echo "╚═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Access points:"
    echo "  Clinic website:   http://NAS-IP:8081/"
    echo "  Staff ERP:        http://NAS-IP:8081/erp/"
    echo "  Super Admin:      http://NAS-IP:8081/super-admin-portal/"
    echo "  Health API:       http://NAS-IP:8081/api/healthz"
else
    echo -e "║  ${RED}$FAILURES HEALTH CHECK(S) FAILED — Review errors above.${NC}              ║"
    echo "╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check logs: docker compose logs backend"
    echo "  2. Check logs: docker compose logs postgres"
    echo "  3. Restart containers: docker compose restart"
fi
echo ""
