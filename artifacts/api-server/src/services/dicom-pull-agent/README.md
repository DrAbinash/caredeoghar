# DICOM Pull Agent

## Two Modes of Operation

### 1. In-Process DIMSE Agent (Recommended — No External PC)

Runs **inside the API server** using `dcmjs-dimse` (pure Node.js DICOM DIMSE library).

**Enable it:**
```bash
ENABLE_DICOM_PULL_AGENT=1
# or, it also auto-starts when ENABLE_SCHEDULERS=1
```

**What it does:**
- Polls the database every 30s for `dicom_pull_jobs` with `status='pending'`
- Executes **C-ECHO** connectivity probe against each modality
- Executes **C-FIND** (Study Root) to discover studies by date range
- Executes **C-MOVE** to transfer studies into your Conquest PACS
- Writes results directly back to `dicom_pull_jobs`, `dicom_pull_agent_logs`, and `dicom_pull_agent_status`

**Benefits:**
- No Windows PC or external service needed
- Debug via server logs — search for `[dimse-agent]`
- Runs in the cloud / Replit VM natively
- Auto-claims jobs so multiple server instances don't double-process

**Environment variables:**
| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_NAME` | `hostname()` | Unique agent identifier |
| `AGENT_AE_TITLE` | `DIAGNO_AGENT` | DICOM AE title for this agent |
| `DIMSE_POLL_INTERVAL_MS` | `30000` | How often to check for jobs |
| `DIMSE_MAX_CONCURRENT_JOBS` | `3` | Parallel job limit |
| `DIMSE_TIMEOUT_MS` | `60000` | Per-DIMSE-operation timeout |
| `CONQUEST_AE_TITLE` | `CONQUEST` | Fallback destination AE |
| `CONQUEST_HOST` | `127.0.0.1` | Fallback destination host |
| `CONQUEST_PORT` | `5678` | Fallback destination port |

### 2. External Reference Agent (Legacy — Windows/Linux PC)

A standalone Node.js service that runs on the Conquest/PACS server machine.
It polls the ERP REST API and spawns `findscu` / `movescu` via child process.

Use this if you:
- Need DCMTK-specific features not in `dcmjs-dimse`
- Want the agent on a separate machine near the modalities
- Have firewall rules that require the agent to be on-prem

See `puller.ts` (reference implementation) for the external agent code.
