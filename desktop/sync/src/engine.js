// =============================================================================
// desktop/sync/src/engine.js
// Offline-first sync engine for DiagnoCenter ERP
//
// Runs inside the Windows/Electron build. Manages the sync lifecycle:
//   1. Detect internet connectivity (via HEAD to cloud API)
//   2. When offline: queue mutations locally, serve reads from local PG
//   3. When online: push queued changes, pull cloud changes, resolve conflicts
//
// Usage (from Electron main process or launcher):
//   const { SyncEngine } = require("./desktop/sync/src/engine.js");
//   const engine = new SyncEngine({
//     cloudBaseUrl: "https://your-app.replit.app",
//     localDbUrl:   "postgres://localhost:55432/diagnostic_erp",
//     clinicId:     "clinic-001",
//     authToken:    staff_session_token,
//   });
//   engine.start();
// =============================================================================

const EventEmitter = require("events");

class SyncEngine extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} opts.cloudBaseUrl  - Hosted ERP URL (e.g. https://your-app.replit.app)
   * @param {string} opts.localDbUrl    - Local PostgreSQL connection string
   * @param {string} opts.clinicId      - Unique clinic identifier for multi-tenant sync
   * @param {string} opts.authToken     - Bearer token for cloud API calls
   * @param {number} [opts.pollIntervalMs=30000] - How often to check connectivity
   * @param {number} [opts.syncBatchSize=50] - Max records per push/pull batch
   */
  constructor(opts) {
    super();
    this.cloudBaseUrl = opts.cloudBaseUrl.replace(/\/$/, "");
    this.localDbUrl   = opts.localDbUrl;
    this.clinicId     = opts.clinicId;
    this.authToken    = opts.authToken;
    this.pollIntervalMs = opts.pollIntervalMs ?? 30000;
    this.syncBatchSize  = opts.syncBatchSize  ?? 50;

    this.online       = false;
    this.syncing      = false;
    this.lastError    = null;
    this.timer        = null;
  }

  // Start the engine: immediately probe, then schedule periodic probes
  async start() {
    this.emit("status", { state: "starting" });
    await this.probe();
    this.timer = setInterval(() => this.probe(), this.pollIntervalMs);
    this.emit("status", { state: this.online ? "online" : "offline" });
  }

  // Stop the engine cleanly
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.emit("status", { state: "stopped" });
  }

  // Force a manual sync cycle (e.g. user clicks "Sync Now")
  async syncNow() {
    if (this.syncing) return { ok: false, message: "Already syncing" };
    if (!this.online)  return { ok: false, message: "No internet connection" };
    return this.runSyncCycle();
  }

  // ─── Connectivity probe ─────────────────────────────────────────────────────
  async probe() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${this.cloudBaseUrl}/api/healthz`, {
        method: "HEAD", signal: ctrl.signal,
        headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      });
      clearTimeout(t);
      const wasOnline = this.online;
      this.online = res.ok;
      if (!wasOnline && this.online) {
        this.emit("online");
        this.emit("status", { state: "online" });
        // Auto-sync when connectivity returns
        this.runSyncCycle().catch(() => {});
      } else if (wasOnline && !this.online) {
        this.emit("offline");
        this.emit("status", { state: "offline" });
      }
    } catch {
      const wasOnline = this.online;
      this.online = false;
      if (wasOnline) { this.emit("offline"); this.emit("status", { state: "offline" }); }
    }
  }

  // ─── Full sync cycle: push then pull ────────────────────────────────────────
  async runSyncCycle() {
    if (this.syncing) return;
    this.syncing = true;
    this.emit("status", { state: "syncing" });
    let pushed = 0, pulled = 0, conflicts = 0;
    try {
      pushed = await this.pushChanges();
      pulled = await this.pullChanges();
      conflicts = await this.resolveConflicts();
      this.lastError = null;
      this.emit("synced", { pushed, pulled, conflicts });
    } catch (err) {
      this.lastError = String(err?.message ?? err);
      this.emit("error", err);
    } finally {
      this.syncing = false;
      this.emit("status", { state: this.online ? "online" : "offline" });
    }
    return { ok: true, pushed, pulled, conflicts };
  }

  // ─── PUSH: queued local mutations → cloud ──────────────────────────────────
  async pushChanges() {
    // This is a stub — real implementation needs Drizzle/PostgreSQL client
    // to read from sync_queue WHERE is_synced = false ORDER BY created_at ASC
    // and POST each batch to /api/sync/push on the cloud.
    //
    // For now, emit a structured event so the Electron main process can wire
    // the actual DB client (which has access to the bundled drizzle-orm).
    this.emit("pushNeeded", { batchSize: this.syncBatchSize });
    return 0;
  }

  // ─── PULL: cloud changes since last checkpoint → local ──────────────────────
  async pullChanges() {
    // This is a stub — real implementation needs Drizzle/PostgreSQL client
    // to read sync_checkpoints, then POST to /api/sync/pull with checkpoint,
    // and apply returned rows to the local DB.
    this.emit("pullNeeded", { batchSize: this.syncBatchSize });
    return 0;
  }

  // ─── CONFLICTS: handle rows changed on both sides ──────────────────────────
  async resolveConflicts() {
    // Stubs for now; real logic compares server timestamp vs local timestamp
    // and applies conflict_strategy (server_wins | local_wins | merge).
    return 0;
  }

  // ─── Utility: health / diagnostics ────────────────────────────────────────
  getDiagnostics() {
    return {
      online: this.online,
      syncing: this.syncing,
      lastError: this.lastError,
      cloudBaseUrl: this.cloudBaseUrl,
      clinicId: this.clinicId,
    };
  }
}

module.exports = { SyncEngine };
