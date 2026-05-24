# DICOM Pull Agent (Reference Implementation)

This is a Node.js reference implementation for the DICOM auto-pull agent.
It runs on the Conquest/PACS server machine and:

1. Fetches configuration from the ERP (`GET /api/internal/dicom-agent/config`)
2. Polls for pull jobs (`GET /api/internal/dicom/pull-jobs/pending`)
3. Executes `findscu` / `movescu` against imaging modalities
4. Reports results back via heartbeat and log endpoints

## Startup Verification Logging

On every startup, the agent writes to `logs/puller-startup.log`:
- Timestamp
- Machine name
- IP address
- AE title
- Listening port
- Status (starting / ready / failed)

Heartbeats are logged every 5 minutes. All modality connections,
failed polling attempts, and DICOM transfer errors are also written
to the log file with rotation after 30 days.

## Environment Variables

- `ERP_BASE_URL` — ERP API base URL (e.g. `https://your-app.replit.app`)
- `INTERNAL_API_KEY` — Bearer token for internal endpoints
- `AGENT_NAME` — Unique agent identifier (default: hostname)
- `AGENT_AE_TITLE` — DICOM AE title for this agent (default: `DIAGNO_AGENT`)
- `LOG_DIR` — Directory for local log files (default: `./logs`)
