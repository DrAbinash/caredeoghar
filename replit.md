# Overview

This is a pnpm workspace monorepo using TypeScript, designed to build a comprehensive Diagnostic ERP system. The project aims to provide a robust, scalable, and user-friendly platform for managing various aspects of a diagnostic center, including patient management, billing, lab operations, inventory, accounting, and advanced AI-powered insights. It supports both web-based and self-contained Windows desktop applications, offering flexibility in deployment and usage.

**Key Capabilities:**
- Integrated billing and patient registration workflows.
- Comprehensive management of diagnostic tests, orders, and reports.
- Advanced accounting features with TallyPrime XML export.
- Inventory and staff management, including biometric attendance.
- DICOM PACS integration for medical imaging.
- AI-powered clinical note generation, billing insights, and patient communication.
- Multi-platform deployment, including self-contained Windows executables.
- Patient and staff portals for enhanced accessibility.

The business vision is to modernize diagnostic center operations, improve efficiency, and provide better patient care through intelligent automation and integrated workflows.

# User Preferences

I prefer iterative development. I want to be asked before you make any major changes to the codebase. I prefer clear and concise explanations.

# System Architecture

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Monorepo Structure

The project is structured as a pnpm monorepo, with each package managing its own dependencies. This allows for modular development and clear separation of concerns.

## UI/UX Decisions

The Diagnostic ERP system features a unified single-page billing workflow, customizable quick test slots, and a modern dashboard. Key UI/UX elements include:
- **Patient Photo Capture**: Optional patient photo upload with base64 storage.
- **Report Generator**: Per-test template library, auto-flagging of results based on reference ranges, and PDF/HTML/text export with voice readout.
- **PACS Viewer**: Integration with Orthanc DICOM server, study/series browser, and links to external viewers (Weasis, OHIF).
- **Appointments**: Day-view scheduler with status flow and date navigator.
- **Staff Management**: WebAuthn-powered Fingerprint Kiosk for attendance.
- **Patient Portal**: Mobile-friendly public portal with patient login and appointment booking.

## Technical Implementations

- **API Server**: Express 5 server, capable of serving static frontends (ERP and Super Admin) in `SERVE_STATIC_DIR` mode, eliminating the need for a separate web server like Nginx in certain deployments (e.g., Windows executables).
- **Database Schema**: Managed with Drizzle ORM, including tables for inventory, commissions, accounting, users, bills, discount rules, appointments, packages, and expenses.
- **AI Integration**: Direct fetch to Gemini REST API for clinical note generation, billing insights, and patient message drafting.
- **Email Notifications**: Powered by Nodemailer (SMTP) and `node-cron` for bill edit notifications and daily summaries, configurable via the database.
- **Cross-Platform Compatibility**: Designed to run outside Replit on Windows, macOS, and Linux, with adjustments for environment variables and script execution.
- **Dockerization**: Multi-stage `Dockerfile` and `docker-compose.yml` for containerized deployment, orchestrating `db` (PostgreSQL), `api`, `web` (Nginx serving SPAs and reverse-proxying API), and `migrate` services.
- **Security**: SSRF-guarded `tcpProbe` for DICOM nodes, and bearer token authentication for portal sessions.

## Feature Specifications

- **Billing Desk**: Unified workflow for patient search, registration, test catalog, package quick-add, discount application, payment collection, and bill generation.
- **Diagnostic ERP Modules**: Includes Dashboard, Quick Register, Patients, Orders, Test Catalog, Billing, Payments, Doctors, Reports (with AI Insights), Inventory, Referrals, Accounting (with TallyPrime XML export), PACS Viewer, DICOM Nodes, Discounts, Appointments, Test Packages, Expenses, Staff Management, and Settings (user roles, permissions, max discount).
- **Per-Test Queue Tokens**: Every billed test gets its own queue number scoped to (ledger, date, department), backed by `test_tokens` table with a UNIQUE index that protects against concurrent allocation; the allocator retries on collision. Bills auto-fan-out tokens via `generateTestTokensForOrder` when posted. The Queue page (`/queue`) supports search, department filter, VIP priority toggle (priority 0↔5, ordered DESC then by tokenNo), and live status counters.
- **Public LCD/TV Display**: A full-screen, sidebar-less route `/display` (registered outside the app Layout) polls `/api/display/queue` every 4s, announces "Now serving" via the browser's SpeechSynthesis API, and shows privacy-trimmed patient labels (first name + last initial only). Optional `?department=USG` query param scopes the display to a single counter.
- **Tests with Department + Room**: The test catalog form exposes a Department dropdown (Pathology, X-Ray, USG, MRI, CT, ECG, Endoscopy, Mammography, Cardiology, Dental, Other) and a Room Number text input; values flow into per-test tokens for routing.
- **Configurable TAT on Bill**: `clinic_settings.showTatOnBill` toggle (Settings → Clinic Info) controls whether the printed bill shows a Turn-Around-Time column for each test.
- **Dashboard Custom Date Range**: Income / Expense / Net KPIs and a daily bar chart driven by `/api/reports/income-expense?from=&to=` (`{rows: [{date, income:{total,...}, expense:{amount,...}, net}], totals}`), with Today / 7 / 30 / 90-day presets.
- **Doctor Due / Payment Ledger** (`/doctor-ledger`): A two-sided account for every referring/ordering doctor — *commission earned* (computed on-the-fly from orders + tests + the existing `commission_rules` engine, mirrors `/api/commission/report`) on the credit side and *payouts recorded* on the debit side. Backed by a new `doctor_payouts` table (amount, paymentDate, paymentMethod ∈ cash/bank/upi/cheque/card/other, reference, periodFrom/To, notes, optional voucherId). Routes under `/api/doctor-ledger`: `GET /` returns a window-filtered summary per doctor (`earnedWindow`, `paidWindow`, `dueWindow`) plus `outstanding` (lifetime earned − lifetime paid) so the user always sees the true backlog regardless of date filter; `GET /:doctorId` returns a chronologically-sorted ledger with running balance, intra-day ordering of earned-before-paid, plus tile summaries; `POST /:doctorId/payouts` (server-side validation: amount > 0, date `YYYY-MM-DD`, method whitelist), `PATCH /payouts/:id`, `DELETE /payouts/:id`, and `GET /:doctorId/export` for a CSV bank-reconciliation file. UI: 5-card KPI strip (Doctors / Earned-window / Paid-window / Due-window / Outstanding-lifetime, color-coded), date-range filter with This-Month / 30d / 90d / All-time presets, doctor list table sorted by outstanding DESC, and a wide ledger dialog per doctor with credit/debit/balance ledger, "Record Payment" form (with a "Full due" auto-fill), inline payout delete, and CSV export.
- **Report Generation Hub** (`/report-hub`): One-stop center for the full report lifecycle covering pathology + radiology. Backed by `patient_reports` (lifecycle `draft → pending_verification → verified → delivered`, JSONB `parameters`, `RPT-YYYYMMDD-NNN` number with retry-on-collision), `report_shares` (one row per print/pdf/whatsapp/email send), and `signatures` (PNG/JPEG base64 data URLs only — SVG and non-base64 schemes rejected to block stored XSS in printed reports). (1) **Pathology entry** with an inline parameters table (name/result/unit/refRange/flag — abnormal rows highlighted on the printout). (2) **Radiology typing templates** auto-loaded per test from the existing `report_templates` table. (3) **Doctor / radiologist signature manager** for uploading signatures with name/role/qualification/registrationNo + soft-delete. (4) **Critical alert marking** with a separate acknowledgement step that silences the dashboard pulse counter (`criticalAcknowledgedAt`). (5) **Two-person verification**: server enforces signer ≠ verifier by signature ID *and* case-insensitive name (no name-based bypass). (6) **A4 letterhead print** built from `clinic_settings` with VERIFIED / PRELIMINARY / DRAFT stamps, critical banner, parameters table, and signature blocks. (7) **Sharing**: `/share` returns 409 unless status is `verified` or `delivered`; supports WhatsApp (templated via `sendReportWhatsapp`, plain-text fallback), Email (`sendReportEmail` via Nodemailer with the printed HTML attached), PDF (browser save-as) and Print. First successful share/print on a verified report auto-flips status to `delivered` and stamps `deliveredAt`. List endpoint paginated as `{items, total, limit, offset}`; body/parameters/impression/title patches return 409 once status reaches `verified`.
- **Radiology Workflow** (`/radiology`): End-to-end imaging workflow with three tabs (Worklist / Reporting Queue / Films & CDs) backed by `radiology_studies` and `radiology_film_issues` tables. (1) **Modality worklist** filterable by date, modality (CR/US/MR/CT/MG/BMD), status, and free-text search. (2) **Auto study fan-out** — `generateStudiesForOrder` runs after `generateTestTokensForOrder` in `bills.ts` and creates one study per radiology-department test on a posted bill (idempotent via UNIQUE on `order_test_id`). (3) **Technician assignment** via inline staff dropdown (radiology staff bubble to the top). (4) **Image / status tracking** via `numImages`, `studyInstanceUid`, and the lifecycle scheduled → in_progress → acquired → reported_preliminary → reported_final → delivered. (5) **Reporting queue with test-wise formats** — the report modal pulls templates from the existing `report_templates` table via `/api/radiology/templates/:testId` and inserts the chosen template into the body. (6) **Preliminary / final report stages** with a no-downgrade guard (saving prelim after final keeps status untouched). (7) **Film / CD / Print issuance** logged in `radiology_film_issues`; recording an issuance after a final report auto-moves the study to `delivered`. Accession numbers are `ACC-YYYYMMDD-MOD-NNN` per modality per day, allocated by SELECT-MAX + retry on `radiology_studies_accession_uq` collision.
- **AI Features**: Clinical note generation, billing insights analysis, and patient communication drafting.
- **Patient Portal**: Public-facing portal for patient login, viewing bills, visits, reports, and booking appointments.
- **Staff Portal**: Staff login with email and PIN, redirecting to the main ERP.

# External Dependencies

- **PostgreSQL**: Primary database for all application data.
- **Drizzle ORM**: Object-relational mapper for database interactions.
- **Orval**: API codegen tool for generating hooks and Zod schemas from OpenAPI specifications.
- **Zod**: Schema declaration and validation library.
- **Gemini API (via Replit AI Integrations)**: For AI-powered features like clinical note generation, billing insights, and patient message drafting.
- **Nodemailer**: For sending email notifications.
- **node-cron**: For scheduling recurring tasks like daily summary emails.
- **Orthanc DICOM server**: For PACS integration and DICOM study management.
- **Conquest DICOM server**: Alternative PACS provider.
- **Weasis / OHIF**: External viewers for DICOM studies.
- **@simplewebauthn/server**: For server-side verification of WebAuthn credentials in the Fingerprint Kiosk feature.
- **concurrently**: Used for running multiple services in parallel during local development.
- **cross-env**: For setting environment variables in a cross-platform manner.
- **dotenv**: For loading environment variables from `.env` files.