import fs from "node:fs";

const md = `# CARE DIAGNOSTICS ERP
## Comprehensive System Documentation

**Version:** 2026.05 | **Classification:** Confidential & Proprietary

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture & Technology Stack](#2-system-architecture--technology-stack)
3. [Complete Module Overview](#3-complete-module-overview)
4. [The Money Trail: Bill to Bank](#4-the-money-trail-bill-to-bank)
5. [DICOM / PACS & Radiology Workflow](#5-dicom--pacs--radiology-workflow)
6. [Staff Role-Based Access Control](#6-staff-role-based-access-control)
7. [Radiology Reporting Engine](#7-radiology-reporting-engine)
8. [Security, Audit & Compliance](#8-security-audit--compliance)
9. [Installation & Deployment](#9-installation--deployment)
10. [Future Roadmap & Recommendations](#10-future-roadmap--recommendations)

---

## 1. Executive Summary

Care Diagnostics ERP is a hospital-grade, all-in-one management platform designed for pathology and radiology centers. It unifies patient registration, test ordering, billing, accounting, inventory, radiology workflow, PACS integration, AI-assisted reporting, staff management, and a public-facing clinic website into a single cohesive system.

Built on a TypeScript pnpm monorepo with an Express 5 API server, PostgreSQL database via Drizzle ORM, and multiple React/Vite frontend artifacts, the system is designed for cross-platform deployment on Windows, Linux, Docker, and Synology NAS environments.

### Key Highlights

- Unified single-page billing workflow with per-test queue tokens
- Immutable append-only audit trail for every sensitive action
- Granular role-based permissions: 8 roles x 13 modules x 10 permission bits
- AI-powered clinical note generation, billing insights, and report drafting
- Full DICOM/PACS integration with Orthanc, Weasis, and OHIF viewers
- Teleradiology with tokenized share links and multi-site worklists
- Automated bank reconciliation with fraud detection
- Biometric fingerprint kiosk for staff attendance and login
- USB pen-drive gate for super-admin access (physical security layer)
- WhatsApp and email notifications for bills, reports, and appointments

---

## 2. System Architecture & Technology Stack

### 2.1 Monorepo Structure

| Layer | Technology | Purpose |
|---|---|---|
| Monorepo Tool | pnpm workspaces | Package discovery, catalog pins, overrides |
| Runtime | Node.js 24 | Server-side JavaScript execution |
| Language | TypeScript 5.9 | Type-safe development across all packages |
| API Framework | Express 5 | RESTful HTTP API server |
| Database | PostgreSQL + Drizzle ORM | Relational data with schema-first migrations |
| Validation | Zod + drizzle-zod | Runtime input/output validation |
| API Codegen | Orval (OpenAPI) | Auto-generate client hooks and schemas |
| Frontend | React 19 + Vite 7 | SPA web applications |
| UI Library | shadcn/ui + Tailwind | Component design system |
| AI Integration | Gemini API (Replit AI) | Clinical notes, insights, report drafting |
| Email | Nodemailer | SMTP-based notifications |
| Scheduling | node-cron | In-process background tasks |
| PACS | Orthanc DICOM | DICOM storage and REST proxy |
| Build | esbuild (CJS bundle) | Fast server bundling |
| Auth | Bearer tokens + WebAuthn | Staff sessions + biometric login |

### 2.2 Deployable Artifacts

| Artifact | Path | Purpose |
|---|---|---|
| api-server | /api | Express API + database + static file serving |
| diagnostic-erp | /erp | Staff ERP dashboard (billing, orders, reports, inventory) |
| clinic-site | / | Public clinic website with dynamic content builder |
| super-admin-portal | /super-admin-portal | Super admin dashboard (backups, audit, permissions, health) |
| diagno-booking-mobile | Mobile app | Expo React Native patient booking app |
| bridge-service | Localhost | Workstation-local fingerprint/DICOM bridge |

### 2.3 Database Schema Overview

The PostgreSQL database contains 80+ tables organized into the following domains:

- **Patient Management:** patients, patient_relatives, patient_documents
- **Test Catalog:** tests, test_categories, test_groups, packages, package_tests
- **Orders & Billing:** orders, order_tests, bills, payments, bill_audits, test_tokens
- **Lab Workflow:** samples, sample_test_assignments, sample_status_logs
- **Radiology:** radiology_studies, radiology_worklist, mwl_entries, dicom_incoming_studies, radiology_report_drafts
- **PACS:** pacs_settings, dicom_nodes, dicom_pull_jobs, dicom_pulled_studies, dicom_routing_rules
- **Reporting:** patient_reports, report_templates, signatures, report_delivery_logs
- **Accounting:** accounts, vouchers, voucher_audits, ledgers, day_closures
- **Inventory:** inventory_items, inventory_transactions, inventory_consumption_rules, vendors
- **Commission:** commission_rules, doctor_payouts, commission_reports
- **Banking:** bank_accounts, bank_transactions, payment_requests, refund_requests, reconciliation_logs, fraud_alerts
- **Staff & HR:** users, staff, staff_advances, staff_salary_payments, staff_attendance, staff_biometric_credentials, hr_rejoining_forms
- **Appointments:** appointments, appointment_slots, online_bookings
- **Website Builder:** site_settings, site_pages, site_popups
- **Security & Audit:** audit_logs, role_permissions, upload_files, backup_logs, backup_jobs, backup_job_logs
- **AI & Automation:** ai_provider_settings, ai_reporting_audit_logs, ai_reporting_drafts, ai_job_queue
- **Teleradiology:** teleradiology_users, teleradiology_sessions, teleradiology_assignments
- **HL7 Integration:** hl7_integration_settings, hl7_messages
- **Machines & Maintenance:** machines, machine_maintenance_logs, machine_calibration_logs
- **Locations:** floors, rooms, modalities, departments, branches

---

## 3. Complete Module Overview

The ERP system comprises 30+ functional modules. Each module has dedicated API routes, database tables, and frontend pages.

| # | Module | Description | Key Tables |
|---|---|---|---|
| 1 | Patient Management | Registration, demographics, relatives, documents, UHID generation | patients, patient_relatives, patient_documents |
| 2 | Test Catalog | Tests, categories, groups, packages, pricing, reference ranges | tests, test_categories, test_groups, packages |
| 3 | Orders | Test ordering, status tracking, sample linking | orders, order_tests |
| 4 | Billing Desk | Unified billing: search, register, add tests, discounts, payments, receipts | bills, payments, bill_audits, ledgers |
| 5 | Payments | Cash, UPI, Card, split payments, refunds, auto-vouchers | payments, voucher_audits, day_closures |
| 6 | Lab Reports | Result entry, auto-flagging, verification, signatures, PDF generation | patient_reports, signatures, report_templates |
| 7 | Sample Management | Barcode generation, collection, routing, status tracking | samples, sample_test_assignments |
| 8 | Test Tokens | Per-test queue tokens for lab and radiology departments | test_tokens |
| 9 | Radiology Studies | Study scheduling, accession numbers, modality worklist | radiology_studies, mwl_entries |
| 10 | PACS Viewer | Orthanc proxy, DICOM studies, WADO-URI, Weasis/OHIF launch | pacs_settings, dicom_nodes |
| 11 | Radiology Reporting | Template library, voice dictation, AI cleanup, draft save, key images | radiology_report_drafts, radiology_key_images |
| 12 | Structured Reports | Predefined templates for USG, CT, MRI with auto-fill fields | structured_report_templates |
| 13 | Teleradiology | Remote reporting, share links, multi-site worklists | teleradiology_users, teleradiology_assignments |
| 14 | AI Reporting | Gemini-powered report drafting, enhancement, measurement extraction | ai_reporting_drafts, ai_reporting_audit_logs |
| 15 | Inventory | Stock management, reagent tracking, vendor orders, consumption rules | inventory_items, inventory_transactions, vendors |
| 16 | Vendors | Supplier management with GSTIN, payment terms, purchase history | vendors, vendor_transactions |
| 17 | Accounting | Double-entry vouchers, ledger groups, trial balance, TallyPrime export | accounts, vouchers, voucher_audits, ledgers |
| 18 | Commission | Referral doctor commission rules, payout reports, discount deduction | commission_rules, doctor_payouts |
| 19 | Banking | Bank accounts, transaction sync, reconciliation, fraud detection | bank_accounts, bank_transactions, reconciliation_logs |
| 20 | Doctors | Referral doctor directory, specializations, ledger assignment | doctors, doctor_payouts |
| 21 | Appointments | Day-view scheduler, slot management, online bookings | appointments, appointment_slots, online_bookings |
| 22 | Staff Management | Users, roles, attendance, salary, advances, biometric credentials | users, staff, staff_attendance, staff_biometric_credentials |
| 23 | HR Forms | Joining, rejoining, exit, document checklists, salary structures | hr_rejoining_forms, staff |
| 24 | Machines | Equipment registry, maintenance schedules, calibration logs | machines, machine_maintenance_logs |
| 25 | Website Builder | Public clinic site design, pages, popups, analytics, HTML snippets | site_settings, site_pages, site_popups |
| 26 | WhatsApp | WhatsApp Business API integration, chatbot, notifications | whatsapp_settings, whatsapp_conversations |
| 27 | Email | SMTP configuration, bill emails, report emails, broadcast | email_settings |
| 28 | Reports & Analytics | Business reports, revenue analytics, AI insights | reports |
| 29 | Display Board | TV display for token numbers and patient queue | display_board |
| 30 | Kiosk | Self-service patient registration and appointment kiosk | kiosk_sessions |
| 31 | Patient Portal | Public portal for patients to view bills, reports, book appointments | portal_sessions, patient_reports |
| 32 | Super Admin | Backups, audit trail, role permissions, system health, USB gate | audit_logs, role_permissions, backup_logs |

---

## 4. The Money Trail: From Bill Creation to Bank Reconciliation

The financial workflow is designed for complete auditability. Every step creates an immutable record.

### 4.1 Step 1: Patient Registration & Order Creation

When a patient arrives, reception staff registers them, generating a unique UHID (Unique Hospital Identification Number). Tests are ordered from the Test Catalog, supporting individual tests, packages, and quick-add slots.

- Each order creates a row in the `orders` table with status = pending
- Order tests are linked in `order_tests` table with individual statuses
- The referring doctor is captured for later commission calculation

### 4.2 Step 2: Bill Generation

The Billing Desk converts an order into a bill. The bill number format is `YYYYMM####` (e.g., 2026050001).

- **Subtotal** = sum of all test prices
- **Discount** = role-gated percentage or fixed amount (maxDiscount enforced per staff role)
- **Net amount** = subtotal - discount
- Bill status starts as `unpaid`, moves to `partial` or `paid` as payments are recorded
- Each bill is assigned to a ledger (default walk-in ledger or doctor-specific ledger)
- Per-test queue tokens are auto-generated for lab and radiology departments

### 4.3 Step 3: Payment Recording

Payments support multiple methods simultaneously (split payments):

- **Cash:** Recorded with drawer/operator tracking
- **UPI:** QR code generation and reconciliation via UTR
- **Card:** POS terminal integration ready
- **Bank Transfer:** Direct bank account payments
- **Wallet:** Digital wallet payments

Each payment creates a row in the `payments` table linked to the bill. The bill's `paid_amount` and `balance_amount` are updated atomically. When balance reaches zero, the bill status changes to `paid`.

An auto-voucher is generated for every payment: a **Receipt Voucher (RV)** that debits the payment method account (e.g., "Cash-in-Hand") and credits "Diagnostic Services Revenue".

### 4.4 Step 4: Commission Calculation

Commission is calculated for the referring doctor based on a rule hierarchy:

1. **EXCLUSIVE RULE (Test-specific):** Highest priority. Matches exact test ID.
2. **CATEGORY RULE:** Matches test category (e.g., all biochemistry tests).
3. **GENERAL RULE:** Catch-all rules for the doctor.
4. **DOCTOR DEFAULT:** Fallback percentage if no rules match.

Commission can be calculated in two discount deduction modes:

- **DEDUCT:** Bill discount is subtracted from commission before payout
- **DEDUCT_ROLLOVER:** Discount is tracked but rolled over to next billing cycle

Commission reports are generated monthly. The `doctor_payouts` table tracks actual payments made to doctors.

### 4.5 Step 5: Accounting & Vouchers

The accounting module follows double-entry bookkeeping with Tally-compatible ledger groups:

- **Receipt Voucher (RV):** Records money received (payments, advances)
- **Payment Voucher (PV):** Records money paid out (refunds, expenses, doctor payouts)
- **Contra Voucher (CV):** Records transfers between accounts (cash to bank)
- **Journal Voucher (JV):** Records non-cash adjustments (write-offs, corrections)

Every voucher edit creates an audit record in `voucher_audits_table`. The trial balance report shows all account balances. Day closures reconcile cash drawer amounts with system totals.

### 4.6 Step 6: Banking Integration

The banking module connects to major Indian banks (ICICI, Axis, HDFC) and Razorpay:

- **Bank Account Management:** Multiple accounts per provider with sandbox/production environments
- **Transaction Sync:** Automatic import of bank statements via API
- **Reconciliation Engine:** Matches bank transactions (by UTR) with ERP vouchers/bills using fuzzy matching
- **Fraud Detection:** Flags duplicate payments, large unlinked transfers, and anomalous patterns
- **Payment Requests:** Initiate payouts to vendors, doctors, or staff
- **Refund Processing:** Handle patient refunds with bank tracking

The reconciliation workflow: bank transactions are imported, the system attempts auto-match by UTR, amount, and date. Unmatched items are presented for manual review. Matched items create audit logs for CA verification.

---

## 5. DICOM / PACS & Radiology Architecture

Care Diagnostics implements a complete RIS-PACS ecosystem with DICOM modality worklist, image acquisition gateway, structured reporting, and multi-viewer support.

### 5.1 DICOM Data Flow

The DICOM workflow connects imaging modalities to the ERP through a secure pipeline:

1. **ORDER:** Doctor orders a radiology test. The system captures DICOM fields (Body Part, Station AE Title, Modality).
2. **SCHEDULE:** Study is scheduled with auto-generated accession number (`ACC-YYYYMMDD-MODALITY-NNNN`).
3. **MWL:** Modality Worklist entry is created. The modality queries the ERP for scheduled patients, eliminating manual entry errors.
4. **ACQUISITION:** Patient is scanned. Images are pushed to the PACS server (Orthanc or Conquest) via DICOM C-STORE.
5. **INCOMING GATEWAY:** The Acquisition Gateway monitors `dicom_incoming_studies`, validates AE Titles, and quarantines corrupted studies.
6. **WORKLIST UPDATE:** Study status moves from scheduled to acquired.
7. **REPORTING:** Radiologist opens the study in the reporting workspace, uses templates, voice dictation, or AI assistance.
8. **VERIFICATION:** Senior radiologist verifies the report (preliminary vs final).
9. **DELIVERY:** Report is shared via WhatsApp/Email/Patient Portal with PDF and key images.

### 5.2 PACS Integration Components

| Component | Technology | Function |
|---|---|---|
| DICOM Server | Orthanc | Primary DICOM storage, REST API, WADO-URI, DICOMweb |
| Alt DICOM Server | Conquest DICOM | Fallback/secondary PACS provider |
| Web Viewer | Weasis / OHIF | Browser-based DICOM image viewing |
| Bridge Service | Node.js (localhost) | Workstation-local proxy for scanner/biometric integration |
| PACS API Route | Express proxy | Secure authenticated proxy to Orthanc REST API |
| DICOM Router | Express + node-dicom | Route studies between modalities and storage tiers |
| Study Monitor | RIS Monitoring | Health monitoring for RIS/PACS sync, queue depths |

### 5.3 Teleradiology

The teleradiology module enables remote radiologists to report on studies from anywhere:

- Tokenized share links with expiration (1-30 days configurable)
- Multi-site worklist: Radiologists can see studies from multiple diagnostic centers
- Radiologist assignment engine: Auto-assigns studies based on subspecialty, workload, and availability
- Peer review workflow: Preliminary reports can be sent for second opinion
- Critical findings alert: STAT/Emergency studies trigger instant notifications
- AI enhancement: Remote radiologists can request AI-powered report suggestions

### 5.4 DICOM Security

DICOM endpoints are protected by multiple security layers:

- All PACS API routes require staff authentication (`requireStaffAuth`)
- Orthanc ID validation: Only 36-char hex UUIDs with dashes are accepted
- SSRF hardening: `tcpProbe` validates PACS URLs before connecting
- DICOM node credentials are stored encrypted in the database
- Study access is logged in `audit_logs` for compliance

---

## 6. Staff Role-Based Access Control (RBAC)

The ERP implements granular, server-enforced role-based permissions. There are 8 staff roles and 13 functional modules, each with 10 permission bits.

### 6.1 Staff Roles

| Role | Description | Typical Access |
|---|---|---|
| super_admin | System owner with full access to all modules and destructive operations | All modules + super-admin pages (backups, audit, permissions) |
| admin | Center manager with broad operational access except super-admin features | Billing, reports, inventory, staff, settings |
| reception | Front desk staff handling registration, appointments, and basic billing | Patients, appointments, orders, basic billing view |
| billing | Dedicated billing operator handling invoices, payments, and refunds | Full billing module, payments, receipts, day closure |
| radiology_typist | Data entry staff who type radiology reports from dictation | Radiology reporting workspace, templates, drafts |
| radiologist | Medical doctor who interprets imaging studies and signs reports | Radiology worklist, reporting, verification, AI tools |
| lab_technician | Lab staff who collect samples, run tests, and enter results | Sample management, test tokens, lab worklist, result entry |
| accountant | Finance staff handling vouchers, ledgers, commissions, and banking | Accounting, commission reports, banking, day closure |

### 6.2 Permission Matrix (13 Modules x 10 Bits)

Each module has 10 granular permission bits stored in the `role_permissions` table:

1. **VIEW:** Read access to the module
2. **CREATE:** Create new records
3. **EDIT:** Modify existing records
4. **DELETE:** Remove records (soft-delete)
5. **PRINT:** Generate printouts/receipts
6. **REPRINT:** Re-print previously printed documents
7. **REFUND:** Process refunds and returns
8. **EXPORT:** Export data to CSV/Excel/PDF
9. **APPROVE:** Approve pending items (reports, expenses)
10. **FINALIZE:** Lock records permanently (final reports, closed bills)

The 13 modules are: patients, tests, orders, billing, reports, radiology, inventory, accounting, commission, appointments, staff, machines, and website.

Permission checks are enforced server-side in `requireStaffPermission` middleware. The frontend reflects these permissions dynamically.

### 6.3 USB Pen-Drive Gate (Super Admin)

The super-admin surface has an additional physical security layer:

- A USB pen drive must contain a file named `superadmin.key` with content matching the `SUPER_ADMIN_USB_KEY` environment secret
- The ERP auto-detects the drive every 4 seconds using the File System Access API
- The Super Admin link appears only when the drive is plugged in
- Firefox/Safari fall back to a manual file picker dialog
- `Ctrl+Alt+U` opens the pairing dialog on first setup
- The key is cached in `sessionStorage` (dies with the tab)
- When `SUPER_ADMIN_USB_KEY` is unset, the gate is bypassed with a startup warning

---

## 7. Radiology Reporting Engine

The radiology reporting module supports voice dictation, AI assistance, structured templates, key images, and multi-level verification.

### 7.1 Reporting Workflow

1. **STUDY SELECTION:** Radiologist picks a study from the smart worklist (filtered by priority, modality, or subspecialty).
2. **TEMPLATE CHOICE:** Select from 100+ structured templates (USG, CT, MRI, X-Ray, Mammography) or start free-text.
3. **VOICE DICTATION:** Use browser microphone to dictate findings. Gemini AI cleans up grammar and medical terminology.
4. **AI ENHANCEMENT:** Request AI suggestions for differential diagnosis, measurements, or normal variant descriptions.
5. **KEY IMAGES:** Upload up to 10 key images per report (JPG/PNG/WebP, max 10MB each) with annotations.
6. **DRAFT SAVE:** Auto-save drafts every 30 seconds. Drafts persist across sessions.
7. **PRELIMINARY REPORT:** Junior radiologist submits preliminary report for senior review.
8. **PEER REVIEW:** Senior radiologist reviews, edits, and either approves or returns with comments.
9. **FINAL REPORT:** Verified report is locked. No further edits allowed (immutable).
10. **DELIVERY:** Report is automatically shared via WhatsApp/Email and appears in the Patient Portal.

### 7.2 Structured Templates

Structured templates provide fill-in-the-blank fields for common study types:

- **USG Abdomen:** Liver, GB, CBD, Spleen, Pancreas, Kidneys, Bladder, Prostate/Uterus
- **USG Obstetrics:** Gestation age, BPD, HC, AC, FL, amniotic fluid, placenta
- **CT Brain:** Brain parenchyma, ventricles, basal cisterns, skull bones, paranasal sinuses
- **MRI Knee:** Ligaments, menisci, cartilage, bone marrow, effusion
- **X-Ray Chest:** Heart size, lung fields, hila, costophrenic angles, bony thorax
- **Mammography:** Breast density, masses, calcifications, lymph nodes, BIRADS category

### 7.3 AI Reporting Features

The AI reporting module uses Gemini API for intelligent assistance:

- **Voice-to-text cleanup:** Converts raw dictation into polished medical prose
- **Auto-measurement extraction:** Reads measurements from USG images and populates template fields
- **Normal snippet insertion:** One-click insertion of normal variant descriptions
- **Differential diagnosis suggestions:** AI suggests possible diagnoses based on findings
- **Critical finding detection:** AI scans reports for critical language and flags for immediate attention
- **Report quality scoring:** AI evaluates completeness, clarity, and medical accuracy

---

## 8. Security, Audit & Compliance

The system implements defense-in-depth security with multiple layers of protection.

### 8.1 Authentication & Authorization

- Bearer token sessions: All staff and patient portal sessions use JWT-like bearer tokens
- WebAuthn biometric login: Fingerprint authentication via @simplewebauthn/server
- PIN-based login: Staff enter 4-6 digit PINs for quick workstation access
- Portal PIN hash sanitization: API responses replace portalPinHash with hasPortalAccess boolean
- Role-based permissions: Server-enforced, not UI-only
- Super-admin USB gate: Physical pen-drive required for super-admin access

### 8.2 Immutable Audit Trail

Every sensitive action is recorded in the `audit_logs` table:

- **Action type:** create, edit, delete, print, reprint, refund, export, approve, finalize, login, logout
- **Actor details:** userId, userName, role, IP address, user agent
- **Entity details:** module, entityType, entityId, oldValue, newValue
- **Reason:** Free-text reason for the action (required for destructive operations)
- **Timestamp:** Created at server time (no client-supplied timestamps)
- **Append-only:** Records are never updated or deleted

### 8.3 Rate Limiting

| Limiter | Window | Max Requests | Applies To |
|---|---|---|---|
| loginLimiter | 15 minutes | 10 | Login and brute-force endpoints |
| portalLimiter | 15 minutes | 60 | Public portal endpoints |
| backupLimiter | 1 hour | 5 | Backup generation |
| exportLimiter | 5 minutes | 10 | CSV/Excel exports |
| adminMutationLimiter | 15 minutes | 30 | Super admin mutations |
| standardUploadLimiter | 5 minutes | 20 | Standard document/image uploads |
| dicomUploadLimiter | 10 minutes | 10 | DICOM/imaging streaming uploads |
| generalLimiter | 1 minute | 300 | All general API routes |

### 8.4 Security Headers

- **Helmet:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **CORS:** Configured for the Replit proxy environment
- **Trust proxy:** Set to 1 so rate limiting uses real client IPs
- **No stack traces in production:** errorHandler middleware strips stack traces when NODE_ENV=production

### 8.5 File Upload Security

The uploads module enforces strict validation:

- **MIME type whitelist:** Only approved types (PDF, images, docs, spreadsheets, videos, audio)
- **DICOM whitelist:** Separate whitelist for DICOM files (DICOM Part 10, JPEG-LS, JPEG 2000, RLE)
- **Size limits:** 25 MB for general files, 512 MB for DICOM studies
- **Path traversal protection:** Module names are sanitized, no `../` allowed
- **SHA-256 checksums:** Every upload is checksummed for integrity verification
- **Metadata tracking:** uploadedBy, uploadedById, patientId, module, timestamp stored in database
- **Soft delete only:** Files are marked isDeleted=true, never physically removed (compliance)
- **RAM protection:** DICOM uploads use streaming multipart with diskStorage — never memoryStorage

---

## 9. Installation & Deployment

### 9.1 Prerequisites

- Node.js 24 (LTS)
- pnpm 10+ (package manager)
- PostgreSQL 15+ (database)
- Git (for cloning)

### 9.2 Docker Deployment (Recommended for Production)

Create a `docker-compose.yml`:

\`\`\`yaml
version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: care_diagnostics
      POSTGRES_USER: care_user
      POSTGRES_PASSWORD: CHANGE_ME
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  api-server:
    build:
      context: .
      dockerfile: artifacts/api-server/Dockerfile
    environment:
      DATABASE_URL: postgres://care_user:CHANGE_ME@postgres:5432/care_diagnostics
      SESSION_SECRET: CHANGE_ME_32_CHARS
      SUPER_ADMIN_USB_KEY: CHANGE_ME
      ENABLE_SCHEDULERS: "1"
      NODE_ENV: production
      SERVE_STATIC_DIR: artifacts/api-server/dist/web
    ports:
      - "8080:8080"
    depends_on:
      - postgres

  orthanc:
    image: jodogne/orthanc:1.12.4
    ports:
      - "8042:8042"
      - "4242:4242"
    volumes:
      - orthanc-data:/var/lib/orthanc/db

volumes:
  pgdata:
  orthanc-data:
\`\`\`

Run: `docker-compose up -d`

### 9.3 Synology NAS Deployment

For small-to-medium diagnostic centers running on Synology NAS:

1. Install **Container Manager** from Synology Package Center
2. Create a shared folder named `care-diagnostics` for persistent data
3. In Container Manager > Project, create a new project with the docker-compose.yml above
4. Map volumes: `care-diagnostics/pgdata` → `/var/lib/postgresql/data`
5. Set environment variables in the Container Manager UI
6. Expose port 8080 via Synology's reverse proxy (Control Panel > Application Portal > Reverse Proxy)
7. Enable HTTPS with Let's Encrypt certificate (Control Panel > Security > Certificate)
8. Set up scheduled backups of the `care-diagnostics` shared folder via Hyper Backup

**Note:** Synology DS920+ or higher recommended for PostgreSQL + Orthanc. For smaller units, consider running only the ERP without Orthanc (external PACS).

### 9.4 Windows Deployment

For Windows-based diagnostic centers:

1. Install Node.js 24 LTS from nodejs.org (select 'Automatically install necessary tools')
2. Install pnpm: `npm install -g pnpm`
3. Install PostgreSQL 16 from postgresql.org (remember the superuser password)
4. Clone the repository: `git clone <repo-url> && cd care-diagnostics`
5. Install dependencies: `pnpm install`
6. Create `.env` file in `artifacts/api-server/` with `DATABASE_URL`, `SESSION_SECRET`, etc.
7. Run database migrations: `pnpm --filter @workspace/api-server run migrate`
8. Build all artifacts: `pnpm --filter @workspace/api-server run build-deploy`
9. Start the server: `pnpm --filter @workspace/api-server run start`
10. Install Orthanc for Windows from orthanc-server.com (optional, for PACS)
11. Configure Orthanc URL in environment variables: `ORTHANC_URL=http://localhost:8042`
12. Access ERP at `http://localhost:8080/erp`

For production Windows deployment, use pm2 or NSSM to run the API server as a Windows service.

### 9.5 Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | 32+ character secret for session tokens |
| SUPER_ADMIN_USB_KEY | Yes* | USB gate key content (*bypassed if unset) |
| AI_INTEGRATIONS_GEMINI_API_KEY | No | Gemini API key for AI features |
| AI_INTEGRATIONS_GEMINI_BASE_URL | No | Gemini API base URL |
| ENABLE_SCHEDULERS | No | Set to 1 to enable cron jobs |
| NODE_ENV | Yes | production or development |
| SERVE_STATIC_DIR | Yes | Path to built frontend static files |
| ORTHANC_URL | No | Orthanc DICOM server URL |
| ORTHANC_USERNAME | No | Orthanc REST API username |
| ORTHANC_PASSWORD | No | Orthanc REST API password |
| SMTP_HOST, SMTP_PORT, etc. | No | Email server configuration |

---

## 10. Future Roadmap & Recommendations

### 10.1 Short-Term (Next 3 Months)

- **Mobile ERP App:** Native mobile app for staff to view worklists, enter results, and approve reports on-the-go
- **HL7 FHIR Integration:** Support for FHIR R4 to integrate with hospital EMR/EHR systems
- **LIS Integration:** Connect with external laboratory information systems via ASTM or HL7
- **Barcode & QR Integration:** Generate QR codes for bills and reports that patients can scan for instant access
- **Advanced Analytics Dashboard:** Real-time revenue charts, test volume trends, doctor referral analytics
- **Patient Feedback System:** Post-visit survey via SMS/WhatsApp with NPS scoring

### 10.2 Medium-Term (Next 6-12 Months)

- **Multi-Center Cloud:** Central dashboard for chain diagnostic centers with consolidated reporting
- **AI-Powered Quality Control:** Automated QC for lab results using historical data patterns
- **Predictive Maintenance:** ML-based prediction for equipment maintenance based on usage and error logs
- **Insurance Integration:** Direct claim submission to TPA/insurance companies
- **Online Payment Gateway:** Razorpay/Stripe integration for patient online bill payment
- **Voice Assistant:** Hands-free navigation for radiologists using voice commands
- **Blockchain Audit Trail:** Cryptographically tamper-proof audit logs using blockchain hashing
- **Dark Mode:** Full dark theme support across all frontend artifacts

### 10.3 Long-Term (Next 1-2 Years)

- **AI Diagnostic Engine:** Deep learning models for automated pathology slide analysis and radiology detection
- **Telemedicine Integration:** Video consultation module for remote doctor-patient interactions
- **Genomics Integration:** Support for genetic test ordering, reporting, and counseling workflows
- **IoT Device Integration:** Real-time monitoring of lab equipment (temperature, reagent levels) via sensors
- **Digital Pathology:** Whole slide imaging (WSI) support with digital pathology viewers
- **International Standards:** CAP, ISO 15189, NABL accreditation compliance modules
- **Patient Health Records:** Longitudinal PHR with integration to national health exchanges (ABDM in India)

### 10.4 Architecture Recommendations

- **Microservices:** Split the monolithic API into domain-specific microservices (billing-service, radiology-service, etc.)
- **Event-Driven Architecture:** Use Redis Streams or Kafka for async event processing (report ready, bill paid, etc.)
- **GraphQL API:** Add a GraphQL layer for flexible client queries alongside REST
- **Edge Caching:** Implement Redis caching for frequently accessed data (test catalog, doctor list)
- **CDN Integration:** Use a CDN for static assets and DICOM image previews
- **Kubernetes:** Container orchestration for scalable multi-center deployments

---

*Care Diagnostics ERP | Confidential & Proprietary*
`;

const outPath = "./exports/Care_Diagnostics_ERP_Documentation.md";
fs.mkdirSync("./exports", { recursive: true });
fs.writeFileSync(outPath, md);

console.log(`Markdown documentation written to ${outPath} (${(md.length / 1024).toFixed(1)} KB)`);
