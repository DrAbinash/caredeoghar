import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// Force Node/V8 and any downstream libraries to treat IST as the local
// timezone.  This fixes getFullYear()/getMonth()/getDate() and any
// toLocaleDateString() call that omits an explicit timeZone.
process.env.TZ = "Asia/Kolkata";

// Load a workspace-root .env file (if present) before anything reads
// process.env. By default dotenv does NOT override variables that are
// already set, so the values injected by Replit's runtime always win.
const rootEnv = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);
dotenv.config({ path: rootEnv });

import app from "./app";
import { logger } from "./lib/logger";
import { startCronScheduler } from "./cron";
import { ensureDefaultLedger } from "./routes/ledgers";
import { backfillExpirePublicTokens } from "./routes/patient-reports";
import { db, usersTable } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Bootstrap admin account for fresh production databases.
//
// Default behaviour: only seeds when the `users` table is completely
// empty (typical right after the first publish to a brand-new prod DB).
// Once any user exists this is a no-op forever, so it's safe to leave in.
//
// Force mode: set BOOTSTRAP_ADMIN_FORCE=1 in deployment secrets to
// upsert the bootstrap account even when the table already has rows.
// Use this once when you need to reset the role/PIN on an existing
// bootstrap row (e.g. you seeded a super_admin but want a regular admin
// because you don't have the USB pen-drive yet). Remove the env var
// after the next publish so subsequent restarts don't keep overwriting
// PIN changes made through the UI.
//
// Defaults: role=super_admin, PIN=1234. Override via BOOTSTRAP_ADMIN_EMAIL /
// BOOTSTRAP_ADMIN_NAME / BOOTSTRAP_ADMIN_PIN / BOOTSTRAP_ADMIN_ROLE.
// "super_admin" is the initial privileged account used to bootstrap the
// super-admin portal; it can then create or manage additional accounts.
async function seedBootstrapAdminIfNeeded(): Promise<void> {
  try {
    const force =
      process.env["BOOTSTRAP_ADMIN_FORCE"] === "1" ||
      process.env["BOOTSTRAP_ADMIN_FORCE"] === "true";

    const anyUser = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (anyUser.length > 0 && !force) return; // already populated, no force flag

    const email = (process.env["BOOTSTRAP_ADMIN_EMAIL"] || "abinashsingh@gmail.com").toLowerCase();
    const name = process.env["BOOTSTRAP_ADMIN_NAME"] || "Dr Abinash Kumar";
    const plainPin = process.env["BOOTSTRAP_ADMIN_PIN"] || "1234";
    const role = process.env["BOOTSTRAP_ADMIN_ROLE"] || "super_admin";
    const hash = await bcrypt.hash(plainPin, 12);

    const allModulePermissions = [
      "/", "/patients", "/orders", "/register", "/billing", "/doctors",
      "/report-generator", "/referrals", "/discounts", "/tests", "/payments",
      "/reports", "/inventory", "/accounting", "/settings",
    ];
    const permissionsJson = JSON.stringify(allModulePermissions);

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(usersTable)
        .set({
          name,
          role,
          permissions: permissionsJson,
          pin: hash,
          isActive: true,
          mustChangePin: false,
        })
        .where(eq(usersTable.email, email));
      logger.warn(
        { email, role, force },
        "Bootstrap admin updated (existing row reset to bootstrap defaults). " +
          "Sign in and change the PIN, then unset BOOTSTRAP_ADMIN_FORCE.",
      );
    } else {
      await db.insert(usersTable).values({
        name,
        email,
        role,
        permissions: permissionsJson,
        pin: hash,
        isActive: true,
        mustChangePin: false,
      });
      logger.warn(
        { email, role },
        "Seeded bootstrap admin user. Sign in and change the PIN immediately.",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to seed/update bootstrap admin");
  }
}

// ── Startup schema migrations ──────────────────────────────────────────────────
// Idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS statements that extend
// the schema without requiring a full Drizzle migration pipeline. Safe to run
// on every startup because every clause uses IF NOT EXISTS / ADD COLUMN IF.
async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancelled_by_name TEXT;
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE order_tests ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

      -- ── Backfill: close commission leak on historical cancelled bills ────
      -- Any bill cancelled before the cascade-fix (May 2026) left its
      -- order_tests rows in 'active' state, so commission reports kept
      -- accruing for the referring doctor. This idempotent UPDATE marks
      -- those tests as cancelled with a clear audit-friendly reason.
      UPDATE order_tests ot
         SET status = 'cancelled',
             cancellation_reason = COALESCE(ot.cancellation_reason,
               'Backfill: parent bill ' || b.bill_number || ' was cancelled'),
             cancelled_at = COALESCE(ot.cancelled_at, b.cancelled_at, NOW()),
             cancelled_by_name = COALESCE(ot.cancelled_by_name, b.cancelled_by_name, 'system-backfill')
        FROM bills b
       WHERE ot.order_id = b.order_id
         AND b.status = 'cancelled'
         AND ot.status <> 'cancelled';
      -- ── Permanently ensure bootstrap owner is always super_admin ────────
      -- Runs unconditionally on every startup so the owner account can
      -- never be accidentally demoted or locked out.
      UPDATE users
         SET role = 'super_admin'
       WHERE email = 'abinashsingh@gmail.com'
         AND role <> 'super_admin';

      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'Pathology';
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS room_number TEXT NOT NULL DEFAULT '';
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS test_type TEXT NOT NULL DEFAULT 'inhouse';
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS outsourced_lab_id INTEGER;
      CREATE TABLE IF NOT EXISTS outsourced_labs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS kiosk_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS kiosk_upi_vpa TEXT NOT NULL DEFAULT '';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS kiosk_upi_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS kiosk_welcome_message TEXT NOT NULL DEFAULT '';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS kiosk_allowed_test_ids TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS sidebar_theme TEXT NOT NULL DEFAULT 'navy';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS bill_default_paper_size TEXT NOT NULL DEFAULT 'A5';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS bill_show_code BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS bill_show_category BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS day_close_auto_print BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS barcode_enabled TEXT NOT NULL DEFAULT 'true';
      ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS token_enabled TEXT NOT NULL DEFAULT 'true';
      CREATE TABLE IF NOT EXISTS day_closures (
        id SERIAL PRIMARY KEY,
        closure_date TEXT NOT NULL,
        closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_by_user_id INTEGER,
        closed_by_name TEXT NOT NULL DEFAULT '',
        covered_from_ts TIMESTAMPTZ,
        covered_to_ts TIMESTAMPTZ NOT NULL,
        expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
        expected_upi NUMERIC(12,2) NOT NULL DEFAULT 0,
        expected_card NUMERIC(12,2) NOT NULL DEFAULT 0,
        expected_cheque NUMERIC(12,2) NOT NULL DEFAULT 0,
        expected_other NUMERIC(12,2) NOT NULL DEFAULT 0,
        actual_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
        actual_upi NUMERIC(12,2) NOT NULL DEFAULT 0,
        actual_card NUMERIC(12,2) NOT NULL DEFAULT 0,
        actual_cheque NUMERIC(12,2) NOT NULL DEFAULT 0,
        actual_other NUMERIC(12,2) NOT NULL DEFAULT 0,
        variance NUMERIC(12,2) NOT NULL DEFAULT 0,
        variance_note TEXT NOT NULL DEFAULT '',
        bills_count INTEGER NOT NULL DEFAULT 0,
        payments_count INTEGER NOT NULL DEFAULT 0,
        total_expected NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_actual NUMERIC(12,2) NOT NULL DEFAULT 0,
        staff_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'closed',
        reopened_at TIMESTAMPTZ,
        reopened_by_user_id INTEGER,
        reopened_by_name TEXT NOT NULL DEFAULT '',
        reopen_reason TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS day_closures_covered_to_idx ON day_closures(covered_to_ts);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS sidebar_theme TEXT;
      CREATE TABLE IF NOT EXISTS kiosk_payment_sessions (
        id SERIAL PRIMARY KEY,
        payment_link_id TEXT NOT NULL UNIQUE,
        session_ref TEXT NOT NULL,
        test_ids TEXT NOT NULL,
        amount_paise INTEGER NOT NULL,
        patient_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        razorpay_payment_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
      );
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS dicom_patient_id TEXT;
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS patient_match_status TEXT NOT NULL DEFAULT 'UNMATCHED';
      CREATE TABLE IF NOT EXISTS pacs_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        is_secret BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(key, category)
      );
      CREATE TABLE IF NOT EXISTS dicom_modalities (
        id SERIAL PRIMARY KEY,
        machine_name TEXT NOT NULL,
        modality TEXT,
        ae_title TEXT,
        ip_address TEXT,
        port INTEGER,
        location TEXT,
        auto_send_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_connection_status TEXT,
        last_seen_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS pacs_logs (
        id SERIAL PRIMARY KEY,
        log_type TEXT,
        severity TEXT NOT NULL DEFAULT 'info',
        source TEXT,
        event_type TEXT,
        message TEXT NOT NULL,
        study_instance_uid TEXT,
        accession_number TEXT,
        patient_id TEXT,
        modality TEXT,
        payload TEXT,
        error_stack TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_runs (
        id SERIAL PRIMARY KEY,
        period_from TEXT NOT NULL,
        period_to TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        completed_by TEXT,
        source TEXT NOT NULL DEFAULT 'manual',
        notes TEXT,
        anomaly_count INTEGER NOT NULL DEFAULT 0,
        high_count INTEGER NOT NULL DEFAULT 0,
        total_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
        snapshot JSONB NOT NULL,
        email_sent_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS audit_runs_generated_at_idx ON audit_runs(generated_at DESC);
      -- Belt-and-suspenders dedupe: even if two cron processes (or a process
      -- restart loop) both try to fire the same monthly audit, the DB itself
      -- guarantees only one cron-source row per (period_from, period_to).
      -- Manual audits intentionally can repeat for the same period.
      CREATE UNIQUE INDEX IF NOT EXISTS audit_runs_cron_unique_idx
        ON audit_runs(period_from, period_to) WHERE source = 'cron';

      -- ── Floors / Rooms / Modalities (Location master) ───────────────────
      CREATE TABLE IF NOT EXISTS floors (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL DEFAULT '',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL DEFAULT '',
        floor_id INTEGER REFERENCES floors(id) ON DELETE SET NULL,
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS modalities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        code TEXT NOT NULL DEFAULT '',
        description TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS room_id INTEGER;
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS modality_id INTEGER;
      ALTER TABLE diagnostic_tests ADD COLUMN IF NOT EXISTS floor_label TEXT NOT NULL DEFAULT '';

      -- ── LAN-only login gate ──────────────────────────────────────────────
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS lan_only_login BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS lan_allowed_ips TEXT NOT NULL DEFAULT '[]';

      -- ── FIDO2 / WebAuthn optional toggle ───────────────────────────────
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS fido2_enabled BOOLEAN NOT NULL DEFAULT FALSE;

      -- ── Remote super-admin login bypass ────────────────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS remote_login_enabled BOOLEAN NOT NULL DEFAULT FALSE;

      -- ── Online bookings time slot ────────────────────────────────────────
      ALTER TABLE online_bookings ADD COLUMN IF NOT EXISTS time_slot TEXT NOT NULL DEFAULT '';

      -- ── Online booking payment gateway columns ───────────────────────────
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS online_booking_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS online_booking_ledger_id INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS vip_queue_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS payu_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS payu_merchant_key TEXT NOT NULL DEFAULT '';

      -- ── Walk-in ledger designation ────────────────────────────────────────
      ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT false;
      -- Auto-detect existing book by name pattern if none is marked yet
      UPDATE ledgers SET is_walk_in = true
      WHERE id = (
        SELECT id FROM ledgers
        WHERE (LOWER(name) LIKE '%walk%' OR LOWER(name) LIKE '%self%referral%')
          AND is_default = false
        ORDER BY id DESC
        LIMIT 1
      )
      AND NOT EXISTS (SELECT 1 FROM ledgers WHERE is_walk_in = true);

      -- Backfill historical walk-in records: move bills, orders, patients,
      -- and appointments with no referring doctor into the Walk-in ledger.
      -- All idempotent — moved rows are no longer on ledger_id=1.
      UPDATE bills b
         SET ledger_id = wl.id
        FROM orders o, ledgers wl
       WHERE o.id = b.order_id
         AND b.ledger_id = 1
         AND o.doctor_id IS NULL
         AND wl.is_walk_in = true;

      UPDATE orders o
         SET ledger_id = wl.id
        FROM ledgers wl
       WHERE o.ledger_id = 1
         AND o.doctor_id IS NULL
         AND wl.is_walk_in = true;

      UPDATE patients p
         SET ledger_id = wl.id
        FROM orders o, ledgers wl
       WHERE p.id = o.patient_id
         AND p.ledger_id = 1
         AND o.doctor_id IS NULL
         AND wl.is_walk_in = true;

      -- Walk-in appointment ledger backfill: skip if orders.appointment_id does not exist yet
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'appointment_id') THEN
          UPDATE appointments a
             SET ledger_id = wl.id
            FROM orders o, ledgers wl
           WHERE a.id = o.appointment_id
             AND a.ledger_id = 1
             AND o.doctor_id IS NULL
             AND wl.is_walk_in = true;
        END IF;
      END $$;

      -- ── Enterprise Radiology Phase 1 ──
      ALTER TABLE radiology_studies ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'routine';
      ALTER TABLE radiology_studies ADD COLUMN IF NOT EXISTS priority_reason TEXT;
      ALTER TABLE radiology_studies ADD COLUMN IF NOT EXISTS priority_overridden_at TIMESTAMPTZ;
      ALTER TABLE radiology_studies ADD COLUMN IF NOT EXISTS priority_overridden_by TEXT;
      CREATE INDEX IF NOT EXISTS radiology_studies_priority_idx ON radiology_studies(priority);

      CREATE TABLE IF NOT EXISTS radiology_priority_rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        priority TEXT NOT NULL,
        body_part_pattern TEXT,
        study_desc_pattern TEXT,
        modality_list TEXT,
        referring_doctor_pattern TEXT,
        keywords TEXT,
        location_pattern TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS radiologist_assignment_rules (
        id SERIAL PRIMARY KEY,
        modality TEXT NOT NULL,
        body_part TEXT,
        subspecialty TEXT,
        shift_start TEXT,
        shift_end TEXT,
        primary_radiologist_id INTEGER NOT NULL,
        backup_radiologist_id INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS radiologist_subspecialties (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        subspecialty TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS radiologist_workloads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        assigned_count INTEGER NOT NULL DEFAULT 0,
        in_progress_count INTEGER NOT NULL DEFAULT 0,
        pending_count INTEGER NOT NULL DEFAULT 0,
        today_reported_count INTEGER NOT NULL DEFAULT 0,
        last_assigned_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Phase 2: Report verification + peer review + critical findings + TAT ──
      CREATE TABLE IF NOT EXISTS radiology_report_verifications (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending_prelim',
        prelim_by INTEGER,
        prelim_at TIMESTAMPTZ,
        peer_reviewer_id INTEGER,
        peer_reviewed_at TIMESTAMPTZ,
        peer_review_notes TEXT,
        verified_by INTEGER,
        verified_at TIMESTAMPTZ,
        final_by INTEGER,
        final_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_critical_findings (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL,
        finding TEXT NOT NULL,
        severity TEXT NOT NULL,
        category TEXT,
        notified_clinician TEXT,
        notified_at TIMESTAMPTZ,
        notification_method TEXT,
        acknowledged_by TEXT,
        acknowledged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_tat_tracking (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL UNIQUE,
        priority TEXT NOT NULL DEFAULT 'routine',
        study_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        prelim_completed_at TIMESTAMPTZ,
        final_completed_at TIMESTAMPTZ,
        prelim_minutes INTEGER,
        final_minutes INTEGER,
        sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
        sla_minutes INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Phase 3: Structured templates + AI enhancement + measurements ──
      CREATE TABLE IF NOT EXISTS radiology_structured_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        modality TEXT NOT NULL,
        body_part TEXT,
        description TEXT,
        template TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_ai_enhancements (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL,
        findings_json TEXT,
        impression_draft TEXT,
        measurement_extracts_json TEXT,
        ai_model TEXT,
        ai_version TEXT,
        reviewed_by INTEGER,
        reviewed_at TIMESTAMPTZ,
        accepted BOOLEAN,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_dicom_measurements (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL,
        measurement_type TEXT NOT NULL,
        value TEXT NOT NULL,
        unit TEXT,
        reference_range TEXT,
        dicom_tag TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Phase 4: Multi-site + teleradiology + DICOM routing ──
      CREATE TABLE IF NOT EXISTS teleradiology_sites (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        pacs_url TEXT,
        ae_title TEXT,
        modality_list TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        timezone_offset INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_multi_site_worklist (
        id SERIAL PRIMARY KEY,
        site_id INTEGER NOT NULL,
        study_id INTEGER NOT NULL,
        external_accession_number TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_sync_at TIMESTAMPTZ,
        last_sync_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dicom_routing_optimization_log (
        id SERIAL PRIMARY KEY,
        study_instance_uid TEXT,
        source_ae_title TEXT,
        target_ae_title TEXT,
        routing_decision TEXT NOT NULL,
        reason TEXT,
        load_factor INTEGER,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── FIDO2 / WebAuthn staff credentials ──
      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        device_name TEXT,
        transports TEXT,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Sync queue + checkpoints (offline-first desktop sync) ──
      CREATE TABLE IF NOT EXISTS sync_queue (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        local_id INTEGER,
        cloud_id INTEGER,
        payload JSONB,
        conflict_strategy TEXT NOT NULL DEFAULT 'server_wins',
        is_synced BOOLEAN NOT NULL DEFAULT FALSE,
        synced_at TIMESTAMPTZ,
        sync_result TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sync_checkpoints (
        id SERIAL PRIMARY KEY,
        table_name TEXT NOT NULL UNIQUE,
        last_pulled_at TIMESTAMPTZ,
        last_pushed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS radiology_text_macros (
        id SERIAL PRIMARY KEY,
        created_by TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        expansion TEXT NOT NULL,
        modality TEXT,
        is_global BOOLEAN NOT NULL DEFAULT FALSE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rad_macros_creator_idx ON radiology_text_macros(created_by);
      CREATE INDEX IF NOT EXISTS rad_macros_shortcut_idx ON radiology_text_macros(shortcut);
      CREATE INDEX IF NOT EXISTS rad_macros_modality_idx ON radiology_text_macros(modality);
      CREATE TABLE IF NOT EXISTS radiology_report_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        heading_case TEXT NOT NULL DEFAULT 'all_caps',
        section_spacing TEXT NOT NULL DEFAULT 'spaced',
        impression_style TEXT NOT NULL DEFAULT 'bulleted',
        show_end_of_report_footer BOOLEAN NOT NULL DEFAULT TRUE,
        footer_text TEXT,
        header_line_1 TEXT,
        header_line_2_source TEXT NOT NULL DEFAULT 'template_name',
        header_line_2_custom TEXT,
        workspace_layout TEXT NOT NULL DEFAULT '3_panel',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rad_prefs_user_idx ON radiology_report_preferences(user_id);
    `);
    logger.info("Startup migrations applied");
  } catch (err) {
    logger.error({ err }, "Startup migration failed — partial-cancel / outsourced-labs features may not work");
  } finally {
    client.release();
  }
}

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — continuing");
  // Do NOT exit: crashing on every unhandled rejection prevents the server
  // from ever passing its startup health check if a background operation
  // (cron job, startup backfill, etc.) rejects in the production environment.
  // Log the rejection so it is visible in deployment logs and investigate.
});

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen({ port, exclusive: true }, () => {
  logger.info({ port }, "Server listening");

  // Cron schedulers must NOT run on autoscale deployments: containers can
  // scale to zero and miss firing windows, and every cold start would
  // re-init the scheduler. Enable them only on always-on hosts (Reserved VM,
  // local dev, or the Windows desktop bundle) by setting ENABLE_SCHEDULERS=1.
  if (process.env["ENABLE_SCHEDULERS"] === "1" || process.env["ENABLE_SCHEDULERS"] === "true") {
    startCronScheduler();
    logger.info("Cron schedulers enabled (ENABLE_SCHEDULERS set)");
  } else {
    logger.info("Cron schedulers disabled (set ENABLE_SCHEDULERS=1 to enable)");
  }

  runStartupMigrations().catch((e) => logger.error({ err: e }, "Failed to run startup migrations"));
  ensureDefaultLedger().catch((e) => logger.error({ err: e }, "Failed to seed default ledger"));
  backfillExpirePublicTokens().catch((e) => logger.error({ err: e }, "Failed to backfill public token expiry"));
  seedBootstrapAdminIfNeeded().catch((e) => logger.error({ err: e }, "Failed to seed/update bootstrap admin"));
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to bind — exiting");
  process.exit(1);
});
