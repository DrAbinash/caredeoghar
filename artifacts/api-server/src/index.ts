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
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS commission_discount_mode TEXT NOT NULL DEFAULT 'none';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS lan_only_login BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS lan_allowed_ips TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS fido2_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS barcode_enabled TEXT NOT NULL DEFAULT 'true';
      ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS token_enabled TEXT NOT NULL DEFAULT 'true';
      -- ── Ensure clinic_settings always has exactly one default row ────
      -- The settings UI relies on this row existing so PUT updates succeed.
      INSERT INTO clinic_settings (id, name, tagline, address, email, phone, website, gstin, logo_data_url, footer_note, form_f_test_ids, quick_test_ids, patient_photo_enabled, show_tat_on_bill, bill_print_copies, qr_on_bill_enabled, portal_enabled, portal_heading, portal_welcome_message, portal_allow_appointment_booking, portal_allow_profile_edit, online_booking_enabled, razorpay_key_id, online_booking_ledger_id, vip_queue_enabled, payu_enabled, payu_merchant_key, phonepe_enabled, phonepe_merchant_id, bharatpe_enabled, bharatpe_merchant_id, cashfree_enabled, cashfree_app_id, kiosk_enabled, kiosk_upi_vpa, kiosk_upi_name, kiosk_welcome_message, kiosk_allowed_test_ids, online_booking_allowed_test_ids, sidebar_theme, bill_default_paper_size, bill_show_code, bill_show_category, day_close_auto_print, commission_discount_mode, lan_only_login, lan_allowed_ips, fido2_enabled, updated_at)
      SELECT 1, 'Care Diagnostics', 'Diagnostic & Pathology Services', '', '', '', '', '', null, 'Thank you for choosing our diagnostic services.', '[]', '[null,null,null,null,null,null]', false, false, 1, true, false, '', '', true, true, false, '', 1, false, false, '', false, '', false, '', false, '', false, '', '', '', '[]', '[]', 'navy', 'A5', true, true, true, 'none', false, '[]', false, NOW()
      WHERE NOT EXISTS (SELECT 1 FROM clinic_settings LIMIT 1);
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
      -- Voluson USG / expanded DICOM import columns
      ALTER TABLE dicom_modalities ADD COLUMN IF NOT EXISTS watch_folder_path TEXT;
      ALTER TABLE dicom_modalities ADD COLUMN IF NOT EXISTS c_store_port INTEGER;
      ALTER TABLE dicom_modalities ADD COLUMN IF NOT EXISTS usb_auto_import_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE dicom_modalities ADD COLUMN IF NOT EXISTS non_dicom_import_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE dicom_nodes ADD COLUMN IF NOT EXISTS preferred_retrieve_method TEXT NOT NULL DEFAULT 'C_MOVE';

      -- Default Voluson USG entry (idempotent)
      INSERT INTO dicom_modalities (machine_name, modality, ae_title, ip_address, port, location, manufacturer, auto_send_enabled, is_active, query_enabled, retrieve_enabled, retrieve_method, destination_pacs, watch_folder_path, c_store_port, usb_auto_import_enabled, non_dicom_import_enabled, notes)
      SELECT 'Voluson USG', 'US', 'Voluson', '172.16.1.46', 104, 'Radiology Wing - USG', 'GE Healthcare Voluson', true, true, true, true, 'C_STORE_OR_WATCH_FOLDER', 'CONQUEST', '/var/dicom/incoming/voluson', 11112, true, true, 'GE Voluson ultrasound machine with C-STORE receive, watch folder, USB/DICOMDIR and non-DICOM JPG/PNG fallback support'
      WHERE NOT EXISTS (SELECT 1 FROM dicom_modalities WHERE ae_title = 'Voluson');

      -- Default Voluson node for pull agent (idempotent)
      INSERT INTO dicom_nodes (ae_title, host, port, modality, description, location, is_active, auto_pull, pull_interval_minutes, pull_query_days, conquest_ae_title, conquest_host, conquest_port, preferred_retrieve_method)
      SELECT 'Voluson', '172.16.1.46', 104, 'US', 'GE Voluson USG machine', 'Radiology Wing - USG', true, true, 15, 1, '', '', 5678, 'C_STORE_OR_WATCH_FOLDER'
      WHERE NOT EXISTS (SELECT 1 FROM dicom_nodes WHERE ae_title = 'Voluson');

      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS dicom_patient_id TEXT;
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS patient_match_status TEXT NOT NULL DEFAULT 'UNMATCHED';
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS source_pacs TEXT;
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS source_ae_title TEXT;
      ALTER TABLE radiology_worklist ADD COLUMN IF NOT EXISTS dicom_metadata TEXT;
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

      -- ── Hospital-Grade Safety Phase 1 (May 2026) ─────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS session_idle_timeout_minutes INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS default_max_concurrent_sessions INTEGER NOT NULL DEFAULT 3;
      ALTER TABLE portal_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
      ALTER TABLE portal_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
      ALTER TABLE portal_sessions ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      -- ── Hospital-Grade Safety Phase 2: Account Lockout (May 2026) ───────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS max_failed_login_attempts INTEGER NOT NULL DEFAULT 5;
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS account_lockout_duration_minutes INTEGER NOT NULL DEFAULT 30;

      -- ── Hospital-Grade Safety Phase 3: Tamper-evident audit chain (May 2026) ─
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS chain_hash TEXT NOT NULL DEFAULT '';

      -- Backfill legacy rows: compute chain hashes chronologically so the
      -- chain is consistent.  We process in batches of 1000 to avoid memory
      -- pressure on large tables.
      DO $$
      DECLARE
        r RECORD;
        prev_hash TEXT := '';
        payload TEXT;
        h TEXT;
      BEGIN
        FOR r IN SELECT id, user_id, user_name, role, action, module,
                        entity_type, entity_id, old_value, new_value,
                        reason, ip_address, user_agent, created_at
                   FROM audit_logs
                  WHERE chain_hash = ''
                  ORDER BY id ASC
        LOOP
          payload := jsonb_build_object(
            'userId',       r.user_id,
            'userName',     r.user_name,
            'role',         r.role,
            'action',       r.action,
            'module',       r.module,
            'entityType',   r.entity_type,
            'entityId',     r.entity_id,
            'oldValue',     r.old_value,
            'newValue',     r.new_value,
            'reason',       r.reason,
            'ipAddress',    r.ip_address,
            'userAgent',    r.user_agent,
            'createdAt',    r.created_at,
            'previousHash', prev_hash
          )::text;
          h := encode(digest(payload, 'sha256'), 'hex');
          UPDATE audit_logs
             SET previous_hash = prev_hash,
                 chain_hash = h
           WHERE id = r.id;
          prev_hash := h;
        END LOOP;
      END $$;

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
      -- ── Online booking test whitelist ────────────────────────────────────
      ALTER TABLE clinic_settings ADD COLUMN IF NOT EXISTS online_booking_allowed_test_ids TEXT NOT NULL DEFAULT '[]';

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

      CREATE TABLE IF NOT EXISTS structured_report_templates (
        id SERIAL PRIMARY KEY,
        template_name TEXT NOT NULL,
        modality TEXT NOT NULL,
        body_part TEXT NOT NULL,
        study_type TEXT,
        sections_json TEXT NOT NULL DEFAULT '{}',
        default_findings TEXT,
        default_impression TEXT,
        macros_json TEXT NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_preset BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS srt_modality_idx ON structured_report_templates(modality);
      CREATE INDEX IF NOT EXISTS srt_body_part_idx ON structured_report_templates(body_part);
      CREATE INDEX IF NOT EXISTS srt_preset_idx ON structured_report_templates(is_preset);

      CREATE TABLE IF NOT EXISTS radiology_image_references (
        id SERIAL PRIMARY KEY,
        draft_id INTEGER NOT NULL,
        study_id INTEGER,
        series_number TEXT,
        image_number TEXT,
        description TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rad_img_refs_draft_idx ON radiology_image_references(draft_id);
      CREATE INDEX IF NOT EXISTS rad_img_refs_study_idx ON radiology_image_references(study_id);

      -- ── USG enterprise additions (Phase 5+) ───────────────────────────────
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS verified_by      TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS amended_by       TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS amended_at       TIMESTAMPTZ;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS prior_version_id INTEGER;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS critical_alert_id INTEGER;

      CREATE TABLE IF NOT EXISTS usg_audit_log (
        id                  SERIAL PRIMARY KEY,
        entity_type         TEXT NOT NULL,
        entity_id           INTEGER,
        action              TEXT NOT NULL,
        performed_by        TEXT NOT NULL,
        performed_by_id     INTEGER,
        performed_by_role   TEXT,
        study_instance_uid  TEXT,
        patient_id          INTEGER,
        details             TEXT NOT NULL DEFAULT '{}',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_audit_entity_idx  ON usg_audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS usg_audit_study_idx   ON usg_audit_log(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_audit_patient_idx ON usg_audit_log(patient_id);
      CREATE INDEX IF NOT EXISTS usg_audit_user_idx    ON usg_audit_log(performed_by_id);
      CREATE INDEX IF NOT EXISTS usg_audit_created_idx ON usg_audit_log(created_at);

      CREATE TABLE IF NOT EXISTS radiology_normal_snippets (
        id SERIAL PRIMARY KEY,
        shortcut TEXT NOT NULL,
        label TEXT NOT NULL,
        modality TEXT,
        body_part TEXT,
        text TEXT NOT NULL,
        impression TEXT,
        recommendation TEXT,
        is_global BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rad_snippets_shortcut_idx ON radiology_normal_snippets(shortcut);
      CREATE INDEX IF NOT EXISTS rad_snippets_modality_idx ON radiology_normal_snippets(modality);

      CREATE TABLE IF NOT EXISTS radiologist_style_preferences (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        impression_style TEXT NOT NULL DEFAULT 'concise',
        terminology_level TEXT NOT NULL DEFAULT 'standard',
        auto_number_impressions BOOLEAN NOT NULL DEFAULT TRUE,
        include_differential BOOLEAN NOT NULL DEFAULT FALSE,
        include_measurements BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS radiology_report_lifecycle_log (
        id SERIAL PRIMARY KEY,
        study_id INTEGER NOT NULL,
        draft_id INTEGER,
        action TEXT NOT NULL,
        actor_id INTEGER,
        actor_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rad_lifecycle_study_idx ON radiology_report_lifecycle_log(study_id);
      CREATE INDEX IF NOT EXISTS rad_lifecycle_action_idx ON radiology_report_lifecycle_log(action);

      -- Enterprise Banking Upgrade (May 2026)
      CREATE TABLE IF NOT EXISTS reconciliation_logs (
        id SERIAL PRIMARY KEY,
        bank_transaction_id INTEGER NOT NULL,
        bill_id INTEGER,
        payment_id INTEGER,
        voucher_id INTEGER,
        confidence_score INTEGER NOT NULL DEFAULT 0,
        match_strategy TEXT NOT NULL DEFAULT 'none',
        status TEXT NOT NULL DEFAULT 'pending',
        review_reason TEXT,
        auto_closed BOOLEAN NOT NULL DEFAULT FALSE,
        auto_closed_amount NUMERIC(14,2),
        resolved_by TEXT,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        match_metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS rec_log_bank_txn_idx ON reconciliation_logs(bank_transaction_id);
      CREATE INDEX IF NOT EXISTS rec_log_status_idx ON reconciliation_logs(status);
      CREATE INDEX IF NOT EXISTS rec_log_bill_idx ON reconciliation_logs(bill_id);

      CREATE TABLE IF NOT EXISTS fraud_alerts (
        id SERIAL PRIMARY KEY,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        bill_id INTEGER,
        payment_id INTEGER,
        bank_transaction_id INTEGER,
        user_id INTEGER,
        user_name TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_amount NUMERIC(14,2),
        evidence JSONB,
        resolved_by TEXT,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        resolution_action TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS fraud_status_idx ON fraud_alerts(status);
      CREATE INDEX IF NOT EXISTS fraud_type_idx ON fraud_alerts(alert_type);
      CREATE INDEX IF NOT EXISTS fraud_severity_idx ON fraud_alerts(severity);

      CREATE TABLE IF NOT EXISTS shift_closures (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        shift_label TEXT NOT NULL DEFAULT 'Morning',
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        expected_cash NUMERIC(12,2) NOT NULL DEFAULT '0',
        expected_upi NUMERIC(12,2) NOT NULL DEFAULT '0',
        expected_card NUMERIC(12,2) NOT NULL DEFAULT '0',
        expected_cheque NUMERIC(12,2) NOT NULL DEFAULT '0',
        expected_other NUMERIC(12,2) NOT NULL DEFAULT '0',
        expected_total NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_cash NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_upi NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_card NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_cheque NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_other NUMERIC(12,2) NOT NULL DEFAULT '0',
        actual_total NUMERIC(12,2) NOT NULL DEFAULT '0',
        variance NUMERIC(12,2) NOT NULL DEFAULT '0',
        variance_note TEXT NOT NULL DEFAULT '',
        denominations JSONB,
        denomination_total NUMERIC(12,2),
        bank_deposit_amount NUMERIC(12,2),
        bank_deposit_ref TEXT,
        supervisor_id INTEGER,
        supervisor_name TEXT,
        approved_at TIMESTAMPTZ,
        approval_note TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        user_day_closure_id INTEGER,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS shift_user_idx ON shift_closures(user_id);
      CREATE INDEX IF NOT EXISTS shift_status_idx ON shift_closures(status);
      CREATE INDEX IF NOT EXISTS shift_date_idx ON shift_closures(started_at);

      CREATE TABLE IF NOT EXISTS gateway_transactions (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        external_transaction_id TEXT,
        external_order_id TEXT,
        amount NUMERIC(14,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        gateway_fee NUMERIC(14,2),
        tax_on_fee NUMERIC(14,2),
        net_settled NUMERIC(14,2),
        settlement_utr TEXT,
        settlement_date TIMESTAMPTZ,
        settlement_status TEXT NOT NULL DEFAULT 'pending',
        method TEXT,
        method_detail TEXT,
        payer_vpa TEXT,
        payer_phone TEXT,
        bill_id INTEGER,
        payment_id INTEGER,
        status TEXT NOT NULL DEFAULT 'initiated',
        failure_reason TEXT,
        raw_payload JSONB,
        reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled',
        bank_transaction_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS gw_txn_provider_idx ON gateway_transactions(provider);
      CREATE INDEX IF NOT EXISTS gw_txn_status_idx ON gateway_transactions(status);
      CREATE INDEX IF NOT EXISTS gw_txn_bill_idx ON gateway_transactions(bill_id);
      CREATE INDEX IF NOT EXISTS gw_txn_ext_id_idx ON gateway_transactions(external_transaction_id);

      CREATE TABLE IF NOT EXISTS refund_requests (
        id SERIAL PRIMARY KEY,
        bill_id INTEGER NOT NULL,
        payment_id INTEGER NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        reason TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_by_id INTEGER,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status TEXT NOT NULL DEFAULT 'requested',
        approved_by TEXT,
        approved_by_id INTEGER,
        approved_at TIMESTAMPTZ,
        approval_note TEXT,
        rejected_by TEXT,
        rejected_at TIMESTAMPTZ,
        rejection_reason TEXT,
        gateway_refund_id TEXT,
        gateway_refund_status TEXT,
        gateway_refund_raw JSONB,
        completed_at TIMESTAMPTZ,
        completed_by TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS refund_bill_idx ON refund_requests(bill_id);
      CREATE INDEX IF NOT EXISTS refund_status_idx ON refund_requests(status);

      -- ── Enterprise Radiology / PACS ──
      CREATE TABLE IF NOT EXISTS radiologist_performance_stats (
        id SERIAL PRIMARY KEY,
        radiologist_id INTEGER NOT NULL,
        radiologist_name TEXT NOT NULL,
        period_type TEXT NOT NULL DEFAULT 'daily',
        period_date TEXT NOT NULL,
        total_studies INTEGER NOT NULL DEFAULT 0,
        reported_studies INTEGER NOT NULL DEFAULT 0,
        preliminary_reports INTEGER NOT NULL DEFAULT 0,
        final_reports INTEGER NOT NULL DEFAULT 0,
        avg_tat_minutes INTEGER,
        stat_studies INTEGER NOT NULL DEFAULT 0,
        emergency_studies INTEGER NOT NULL DEFAULT 0,
        routine_studies INTEGER NOT NULL DEFAULT 0,
        ai_drafts_used INTEGER NOT NULL DEFAULT 0,
        ai_drafts_accepted INTEGER NOT NULL DEFAULT 0,
        critical_findings_flagged INTEGER NOT NULL DEFAULT 0,
        modality_breakdown TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS perf_stats_rad_period_idx ON radiologist_performance_stats(radiologist_id, period_type, period_date);
      CREATE INDEX IF NOT EXISTS perf_stats_date_idx ON radiologist_performance_stats(period_date);

      CREATE TABLE IF NOT EXISTS critical_findings_alerts (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_id INTEGER,
        accession_number TEXT NOT NULL,
        patient_id INTEGER,
        patient_name TEXT NOT NULL,
        modality TEXT NOT NULL DEFAULT 'OT',
        study_description TEXT,
        severity TEXT NOT NULL DEFAULT 'high',
        finding_type TEXT NOT NULL,
        description TEXT NOT NULL,
        flagged_by TEXT NOT NULL,
        flagged_by_id INTEGER,
        ai_confidence NUMERIC(3,2),
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        acknowledged_by TEXT,
        acknowledged_at TIMESTAMPTZ,
        escalated_to TEXT,
        escalation_sent BOOLEAN NOT NULL DEFAULT FALSE,
        notification_channels TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'active'
      );
      CREATE INDEX IF NOT EXISTS cf_alert_worklist_idx ON critical_findings_alerts(worklist_id);
      CREATE INDEX IF NOT EXISTS cf_alert_status_idx ON critical_findings_alerts(status);
      CREATE INDEX IF NOT EXISTS cf_alert_severity_idx ON critical_findings_alerts(severity);
      CREATE INDEX IF NOT EXISTS cf_alert_created_idx ON critical_findings_alerts(created_at);

      CREATE TABLE IF NOT EXISTS ai_server_health_log (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT,
        endpoint TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        latency_ms INTEGER,
        success BOOLEAN NOT NULL DEFAULT TRUE,
        error_message TEXT,
        http_status INTEGER,
        tokens_used INTEGER,
        quota_remaining INTEGER,
        check_type TEXT NOT NULL DEFAULT 'actual_call',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ai_health_provider_idx ON ai_server_health_log(provider);
      CREATE INDEX IF NOT EXISTS ai_health_status_idx ON ai_server_health_log(status);
      CREATE INDEX IF NOT EXISTS ai_health_created_idx ON ai_server_health_log(created_at);

      CREATE TABLE IF NOT EXISTS pacs_archive_lifecycle (
        id SERIAL PRIMARY KEY,
        study_instance_uid TEXT NOT NULL UNIQUE,
        accession_number TEXT,
        modality TEXT,
        patient_id INTEGER,
        original_size_bytes NUMERIC(20,0),
        compressed_size_bytes NUMERIC(20,0),
        compression_ratio NUMERIC(5,2),
        compression_method TEXT,
        tier TEXT NOT NULL DEFAULT 'hot',
        last_accessed_at TIMESTAMPTZ,
        moved_to_tier_at TIMESTAMPTZ,
        scheduled_for_archive_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        restored_at TIMESTAMPTZ,
        restore_count INTEGER NOT NULL DEFAULT 0,
        auto_compressed BOOLEAN NOT NULL DEFAULT FALSE,
        retention_days INTEGER,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS archive_uid_idx ON pacs_archive_lifecycle(study_instance_uid);
      CREATE INDEX IF NOT EXISTS archive_tier_idx ON pacs_archive_lifecycle(tier);
      CREATE INDEX IF NOT EXISTS archive_patient_idx ON pacs_archive_lifecycle(patient_id);

      CREATE TABLE IF NOT EXISTS watchdog_status (
        id SERIAL PRIMARY KEY,
        service_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown',
        last_heartbeat TIMESTAMPTZ,
        last_error TEXT,
        restart_count INTEGER NOT NULL DEFAULT 0,
        max_restarts INTEGER NOT NULL DEFAULT 5,
        auto_restart_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        check_interval_seconds INTEGER NOT NULL DEFAULT 60,
        next_check_at TIMESTAMPTZ,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS watchdog_status_idx ON watchdog_status(status);
      CREATE INDEX IF NOT EXISTS watchdog_heartbeat_idx ON watchdog_status(last_heartbeat);

      CREATE TABLE IF NOT EXISTS ris_sync_status (
        id SERIAL PRIMARY KEY,
        sync_type TEXT NOT NULL,
        source_system TEXT NOT NULL,
        target_system TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        last_sync_at TIMESTAMPTZ,
        next_sync_at TIMESTAMPTZ,
        items_pending INTEGER NOT NULL DEFAULT 0,
        items_synced INTEGER NOT NULL DEFAULT 0,
        items_failed INTEGER NOT NULL DEFAULT 0,
        avg_sync_time_ms INTEGER,
        error_message TEXT,
        error_count INTEGER NOT NULL DEFAULT 0,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ris_sync_type_idx ON ris_sync_status(sync_type);
      CREATE INDEX IF NOT EXISTS ris_sync_status_idx ON ris_sync_status(status);

      -- ── USG Auto-Measurement Extraction ──
      CREATE TABLE IF NOT EXISTS usg_measurements (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_id INTEGER,
        study_instance_uid TEXT,
        accession_number TEXT,
        patient_id INTEGER,
        extraction_run_id INTEGER,
        source TEXT NOT NULL DEFAULT 'ocr',
        overall_confidence TEXT NOT NULL DEFAULT 'low',
        bpd TEXT, bpd_confidence TEXT,
        hc TEXT, hc_confidence TEXT,
        ac TEXT, ac_confidence TEXT,
        fl TEXT, fl_confidence TEXT,
        crl TEXT, crl_confidence TEXT,
        efw TEXT, efw_confidence TEXT,
        ga TEXT, ga_confidence TEXT,
        edd TEXT, edd_confidence TEXT,
        fhr TEXT, fhr_confidence TEXT,
        placenta_position TEXT,
        liquor_afi TEXT,
        fetal_presentation TEXT,
        uterus_size TEXT, uterus_size_confidence TEXT,
        endometrium TEXT, endometrium_confidence TEXT,
        right_ovary TEXT, right_ovary_confidence TEXT,
        left_ovary TEXT, left_ovary_confidence TEXT,
        follicles TEXT,
        adnexal_lesion TEXT,
        liver_size TEXT, liver_size_confidence TEXT,
        spleen_size TEXT, spleen_size_confidence TEXT,
        right_kidney TEXT, right_kidney_confidence TEXT,
        left_kidney TEXT, left_kidney_confidence TEXT,
        cbd TEXT, cbd_confidence TEXT,
        gb_wall TEXT, gb_wall_confidence TEXT,
        prostate_volume TEXT, prostate_volume_confidence TEXT,
        extra_measurements_json TEXT NOT NULL DEFAULT '{}',
        manufacturer TEXT,
        manufacturer_model TEXT,
        institution_name TEXT,
        study_description TEXT,
        study_date TEXT,
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        review_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_meas_study_uid_idx ON usg_measurements(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_meas_worklist_idx ON usg_measurements(worklist_id);
      CREATE INDEX IF NOT EXISTS usg_meas_status_idx ON usg_measurements(status);
      CREATE INDEX IF NOT EXISTS usg_meas_patient_idx ON usg_measurements(patient_id);

      CREATE TABLE IF NOT EXISTS usg_extraction_logs (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_instance_uid TEXT,
        accession_number TEXT,
        extraction_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        frames_processed INTEGER NOT NULL DEFAULT 0,
        frames_failed INTEGER NOT NULL DEFAULT 0,
        sr_found BOOLEAN NOT NULL DEFAULT FALSE,
        ai_normalized BOOLEAN NOT NULL DEFAULT FALSE,
        error_message TEXT,
        duration_ms INTEGER,
        triggered_by TEXT NOT NULL DEFAULT 'auto',
        triggered_by_user_id INTEGER,
        raw_ocr_text_json TEXT,
        raw_sr_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS usg_log_study_idx ON usg_extraction_logs(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_log_worklist_idx ON usg_extraction_logs(worklist_id);
      CREATE INDEX IF NOT EXISTS usg_log_status_idx ON usg_extraction_logs(status);

      CREATE TABLE IF NOT EXISTS usg_key_images (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_instance_uid TEXT,
        accession_number TEXT,
        patient_id INTEGER,
        series_instance_uid TEXT,
        sop_instance_uid TEXT,
        series_number TEXT,
        image_number TEXT,
        frame_number INTEGER NOT NULL DEFAULT 1,
        label TEXT NOT NULL DEFAULT '',
        wado_url TEXT,
        thumbnail_base64 TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_by TEXT,
        added_by_user_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_key_img_study_idx ON usg_key_images(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_key_img_worklist_idx ON usg_key_images(worklist_id);

      -- ── USG Doppler / Doppler Module ──
      CREATE TABLE IF NOT EXISTS usg_doppler_measurements (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_instance_uid TEXT,
        accession_number TEXT,
        patient_id INTEGER,
        extraction_run_id INTEGER,
        vessel_name TEXT NOT NULL DEFAULT '',
        side TEXT NOT NULL DEFAULT 'unknown',
        psv TEXT,
        edv TEXT,
        ri TEXT,
        pi TEXT,
        sd_ratio TEXT,
        waveform_label TEXT,
        waveform_description TEXT,
        confidence TEXT NOT NULL DEFAULT 'low',
        source TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'pending_review',
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        review_notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_dop_study_idx    ON usg_doppler_measurements(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_dop_worklist_idx ON usg_doppler_measurements(worklist_id);
      CREATE INDEX IF NOT EXISTS usg_dop_status_idx   ON usg_doppler_measurements(status);
      CREATE INDEX IF NOT EXISTS usg_dop_patient_idx  ON usg_doppler_measurements(patient_id);

      -- ── USG Extraction Settings (singleton, id=1) ──
      CREATE TABLE IF NOT EXISTS usg_extraction_settings (
        id SERIAL PRIMARY KEY,
        ocr_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ai_normalize_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sr_priority_mode BOOLEAN NOT NULL DEFAULT TRUE,
        auto_reject_low_confidence BOOLEAN NOT NULL DEFAULT TRUE,
        human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
        auto_finalize BOOLEAN NOT NULL DEFAULT FALSE,
        confidence_threshold REAL NOT NULL DEFAULT 0.80,
        low_confidence_cutoff REAL NOT NULL DEFAULT 0.60,
        max_frames_to_ocr INTEGER NOT NULL DEFAULT 20,
        ge_ae_title TEXT NOT NULL DEFAULT 'GE_USG',
        ge_ip TEXT NOT NULL DEFAULT '',
        ge_port TEXT NOT NULL DEFAULT '11112',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO usg_extraction_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      -- ── USG Machine Profiles ──
      CREATE TABLE IF NOT EXISTS usg_machine_profiles (
        id SERIAL PRIMARY KEY,
        machine_name TEXT NOT NULL,
        manufacturer TEXT NOT NULL DEFAULT 'GE',
        model_name TEXT,
        ae_title TEXT,
        ip_address TEXT,
        port TEXT NOT NULL DEFAULT '11112',
        modality TEXT NOT NULL DEFAULT 'USG',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        capabilities TEXT NOT NULL DEFAULT '[]',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_machine_active_idx ON usg_machine_profiles(active);

      -- ── USG Report Drafts ──
      CREATE TABLE IF NOT EXISTS usg_report_drafts (
        id SERIAL PRIMARY KEY,
        worklist_id INTEGER,
        study_instance_uid TEXT,
        patient_id INTEGER,
        accession_number TEXT,
        template_type TEXT NOT NULL DEFAULT 'WHOLE_ABDOMEN',
        draft_content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draft',
        auto_filled_from_measurement_id INTEGER,
        auto_filled_from_doppler_id INTEGER,
        created_by TEXT,
        finalized_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finalized_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS usg_draft_study_idx    ON usg_report_drafts(study_instance_uid);
      CREATE INDEX IF NOT EXISTS usg_draft_worklist_idx ON usg_report_drafts(worklist_id);
      CREATE INDEX IF NOT EXISTS usg_draft_status_idx   ON usg_report_drafts(status);
      CREATE INDEX IF NOT EXISTS usg_draft_patient_idx  ON usg_report_drafts(patient_id);

      -- Phase 9: medico-legal safety columns
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS verified_by      TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS amended_by       TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS amended_at       TIMESTAMPTZ;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS prior_version_id INTEGER;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS critical_alert_id INTEGER;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS finalized_report_hash   TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS finalized_pdf_version_id TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS amendment_reason       TEXT;
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS sync_status           TEXT NOT NULL DEFAULT 'synced';
      ALTER TABLE usg_report_drafts ADD COLUMN IF NOT EXISTS locked_by              TEXT;

      -- Structured measurement numeric fields (Phase 9)
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_kidney_length_mm        REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_kidney_width_mm         REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_kidney_thickness_mm    REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_kidney_length_mm         REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_kidney_width_mm          REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_kidney_thickness_mm     REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_cortical_thickness_mm  REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_cortical_thickness_mm   REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS prostate_length_mm            REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS prostate_width_mm             REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS prostate_height_mm            REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_right_lobe_length_mm  REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_right_lobe_width_mm   REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_right_lobe_thickness_mm REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_left_lobe_length_mm   REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_left_lobe_width_mm    REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_left_lobe_thickness_mm REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_isthmus_mm            REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_nodule_size_mm        REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS thyroid_tirads_score          TEXT;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS liver_span_mm                 REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS cbd_mm                        REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS gb_wall_mm                    REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS uterus_length_mm              REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS uterus_width_mm               REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS uterus_height_mm               REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_ovary_length_mm         REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_ovary_width_mm          REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS right_ovary_height_mm          REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_ovary_length_mm          REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_ovary_width_mm           REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS left_ovary_height_mm          REAL;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS follicle_count                INTEGER;
      ALTER TABLE usg_measurements ADD COLUMN IF NOT EXISTS largest_follicle_mm           REAL;

      CREATE TABLE IF NOT EXISTS usg_report_amendments (
        id SERIAL PRIMARY KEY,
        draft_id INTEGER NOT NULL,
        prior_version_id INTEGER NOT NULL,
        amendment_reason TEXT NOT NULL DEFAULT '',
        amended_by TEXT NOT NULL,
        amended_by_id INTEGER,
        prior_content TEXT NOT NULL DEFAULT '',
        new_content TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_amend_draft_idx ON usg_report_amendments(draft_id);
      CREATE INDEX IF NOT EXISTS usg_amend_prior_idx ON usg_report_amendments(prior_version_id);

      CREATE TABLE IF NOT EXISTS usg_finding_image_links (
        id SERIAL PRIMARY KEY,
        draft_id INTEGER NOT NULL,
        finding_index INTEGER NOT NULL DEFAULT 0,
        image_id INTEGER NOT NULL,
        frame_number INTEGER,
        annotation_label TEXT,
        measurement_reference TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS usg_fimg_draft_idx ON usg_finding_image_links(draft_id);
      CREATE INDEX IF NOT EXISTS usg_fimg_image_idx ON usg_finding_image_links(image_id);
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

// ─── Graceful shutdown ─────────────────────────────────────────────
// SIGINT  = Ctrl+C from terminal
// SIGTERM = Docker stop / platform shutdown signal

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully...");

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Force exit after 10 seconds if connections are stuck
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
