# Overview

This pnpm workspace monorepo, built with TypeScript, provides a comprehensive Diagnostic ERP system. Its purpose is to streamline operations for diagnostic centers, covering patient management, billing, lab operations, inventory, accounting, and AI-driven insights. The system supports both web and self-contained Windows desktop applications, enhancing deployment flexibility.

Key capabilities include integrated billing, diagnostic test management, advanced accounting with TallyPrime XML export, inventory and staff management, DICOM PACS integration, AI-powered clinical note generation, and multi-platform deployment. The business vision is to modernize diagnostic center workflows, improve efficiency, and elevate patient care through intelligent automation.

# User Preferences

I prefer iterative development. I want to be asked before you make any major changes to the codebase. I prefer clear and concise explanations.

# System Architecture

## Stack

-   **Monorepo tool**: pnpm workspaces
-   **Node.js version**: 24
-   **Package manager**: pnpm
-   **TypeScript version**: 5.9
-   **API framework**: Express 5
-   **Database**: PostgreSQL + Drizzle ORM
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API codegen**: Orval (from OpenAPI spec)
-   **Build**: esbuild (CJS bundle)

## UI/UX Decisions

The system features a unified single-page billing workflow, customizable quick test slots, and a modern dashboard. UI/UX elements include patient photo capture, a comprehensive report generator with auto-flagging and voice readout, a PACS viewer, a day-view appointment scheduler, WebAuthn-powered fingerprint kiosk for staff, and mobile-friendly patient and staff portals.

## Technical Implementations

The API server uses Express 5, capable of serving static frontends. The database schema is managed with Drizzle ORM. AI integration leverages the Gemini REST API for clinical note generation, billing insights, and patient communication. Email notifications are powered by Nodemailer and `node-cron`. The in-process schedulers (daily summary, month-end commission) are gated behind `ENABLE_SCHEDULERS=1` so they only run on always-on hosts (Windows desktop bundle, Reserved VM, local dev). On the autoscale cloud deployment they stay off, and the same logic is reachable via `POST /api/internal/cron/{daily-summary,month-end-commission}` (Bearer-auth via `CRON_SECRET`) so a Replit Scheduled deployment can fire them on a calendar — see `scripts/src/trigger-cron.ts`. The system is designed for cross-platform compatibility (Windows, macOS, Linux) and supports Dockerized deployment using `Dockerfile` and `docker-compose.yml`. Security features include SSRF-guarded `tcpProbe` and bearer token authentication.

## Feature Specifications

-   **Billing Desk**: Unified workflow for patient search, registration, test catalog, package quick-add, discounts, payments, and bill generation.
-   **Diagnostic ERP Modules**: Includes Dashboard, Patient Management, Orders, Test Catalog, Billing, Payments, Doctors, Reports (with AI Insights), Inventory, Referrals, Accounting (TallyPrime export), PACS Viewer, Appointments, Staff Management, and Settings.
-   **Per-Test Queue Tokens**: Manages unique queue numbers per billed test, preventing concurrent allocation and supporting VIP priority.
-   **Public LCD/TV Display**: A dedicated display route (`/display`) polls for queue updates, announces "Now serving," and shows privacy-trimmed patient labels.
-   **Tests with Department + Room**: Allows specification of department and room for tests, flowing into per-test tokens for routing.
-   **Configurable TAT on Bill**: Toggle to show Turn-Around-Time on printed bills.
-   **Dashboard Custom Date Range**: Provides income/expense KPIs and daily bar charts with configurable date ranges.
-   **Doctor Due / Payment Ledger** *(Super Admin Portal only — compliance gated)*: Manages commissions earned and payouts for referring doctors with detailed ledger views and CSV export. Lives at `/super-admin-portal/` and requires a super-admin session.
-   **Referral Commission (Compliance)**: Per Indian medical-practice regulations, all referral-commission features (Commission Rules, Commission Report, Doctor Due / Payment Ledger) are exclusively visible to super-admins. The regular ERP staff UI exposes neither commission data nor commission settings. The `/api/commission/*` and `/api/doctor-ledger/*` routes are gated by the `requireSuperAdmin` middleware (validates an `X-SA-Token` header against an active, non-expired session in `super_admin_sessions`). Default-commission and commission-type fields are hidden from the staff Doctors page.
-   **Super Admin Portal — Generated API Hooks**: All four super-admin pages (Books.tsx, CommissionReport.tsx, CommissionRules.tsx, DoctorLedger.tsx) use generated React Query hooks from `@workspace/api-client-react` instead of direct `fetch()` calls. `saApi.ts` now only exports `setSaToken` (which calls `setCustomHeadersGetter` so all generated hooks auto-inject `X-SA-Token`) and `saAuthHeaders()` (used only for binary CSV export). Super-admin endpoints and schemas (`CommissionRule`, `DetailedCommissionReport`, `DoctorLedgerSummary`, `DoctorLedgerDetail`, `DoctorPayout`, `Book`, etc.) are defined in `lib/api-spec/openapi.yaml` and generated via Orval.
-   **Clinic Branding Centralization**: All user-visible clinic / lab name strings are read from `/api/clinic-settings` (sidebar header, Form F centre, Report Generator letterhead/exports, BillDetail). Hard-coded "DiagnoCenter" defaults remain only as fallbacks if settings haven't loaded yet.
-   **Pending Dues KPI**: Dashboard top tile shows outstanding patient balance and pulses red (animate-pulse + ring) whenever the value > 0, ensuring front-desk staff cannot miss collections. Replaces the prior "Referral Payouts" tile (which was also moved out of the staff UI for compliance).
-   **Bill Date Filter**: The Billing list defaults to the current calendar month (`dateFrom`/`dateTo` query params on `GET /bills`) and exposes From/To/Clear date inputs so clinics with high bill volume don't load every record on first paint.
-   **Doctor Registration Number**: `doctors.registration_number` (text, nullable) holds the state medical-council number for each referring/conducting doctor. Captured in the staff Doctors form, persisted via `POST/PATCH /doctors`, and auto-filled on PCPNDT Form F via a `<datalist>` doctor picker (the conducting-doctor signature line prints "Dr. X (Reg. NNN)").
-   **Report Generation Hub**: Centralized system for pathology and radiology reports, including inline parameter entry, radiology typing templates, doctor/radiologist signature management, critical alert marking, two-person verification, A4 letterhead printing, and multiple sharing options (WhatsApp, Email, PDF, Print).
-   **Machine / Maintenance Module**: Manages the full lifecycle of diagnostic equipment, including AMC/CMC contracts, breakdowns, service/calibration records, calibration reminders, and downtime reports.
-   **Master Settings**: Includes management for Departments, Branches, Report Templates, and a master-data backup facility.
-   **Vendor Management (Inventory)**: Suppliers tab inside the Inventory module. Vendor records carry contact, address, GSTIN, payment terms, category, opening balance, and active status. Each inventory item can declare a preferred vendor; each Stock-In transaction records vendor, invoice number/date, and unit cost. The vendor detail view shows KPI summaries, supplied items, and full purchase history with line totals. Deletion is refused (HTTP 409) when items or purchases reference the vendor — operators are prompted to deactivate instead. Stock-In runs inside a DB transaction so quantity and audit row commit atomically.
-   **Radiology Workflow**: End-to-end imaging workflow with worklist, reporting queue, and film/CD issuance, including modality worklist filtering, auto study fan-out, technician assignment, image/status tracking, and preliminary/final report stages.
-   **AI Features**: Clinical note generation, billing insights, and patient communication drafting.
-   **Patient Portal**: Public-facing portal for patients to view bills, visits, reports, and book appointments.
-   **Staff Portal**: Staff login for accessing the main ERP.
-   **API Security — Patient Data Sanitization**: All API endpoints that return patient data strip `portalPinHash` and replace it with a `hasPortalAccess` boolean via the shared `sanitizePatient()` helper in `patients.ts`. This covers patients, orders, bills, portal, and teleradiology routes.
-   **API Security — Billing Amount Validation**: Server-side validation on billing endpoints rejects negative discounts, caps discounts at the order subtotal, enforces per-staff `maxDiscount` percentage limits (admin/super_admin bypass), rejects non-positive payment amounts, and caps payments at the outstanding bill balance.
-   **API Security — DICOM SSRF Hardening**: `isBlockedHost()` in `providers.ts` blocks IPv4-mapped IPv6 addresses in all valid forms (compressed `::ffff:`, expanded `0:0:0:0:0:ffff:`, dotted-quad, and hex-pair notation). Uses full IPv6 expansion via `expandIPv6()` before matching the `ffff` mapped prefix, preventing bypass of private/loopback address blocklists.
-   **API Security — Biometric Bridge Capture Token Flow**: The bridge `/capture` endpoint requires a single-use `captureToken` issued by `POST /api/bridge/capture-challenge` (staff session required). `POST /api/bridge/validate-capture-token` (bridge-secret authenticated) validates and consumes the token before the bridge returns raw template data.
-   **API Security — Biometric Enrollment Authorization**: `POST /api/bridge/enroll-challenge` restricts enrollment token issuance: admin/super_admin roles can enroll any subject, staff with `/settings` permission can enroll others, and all staff can self-enroll (scope=user, scopeId=own id). Prevents low-privilege staff from enrolling fingerprints for other accounts.
-   **API Security — WhatsApp Settings Write Gating**: `PUT /api/whatsapp/settings` and `POST /api/whatsapp/test` require `requireStaffPermission("/settings")`. GET endpoint remains accessible to all authenticated staff for status visibility.
-   **Website Builder**: ERP module at `/website` for designing, configuring and publishing the clinic's public website. Backed by `site_settings` (singleton row), `site_pages`, `site_popups`, `site_faqs`, `site_photos` tables; CRUD via `/api/website/*`. Uploads land in `data/uploads/site/` and are served from `/uploads/`. Fourteen-tab admin UI covers Site Profile, Theme picker (6 presets), Colors & Fonts, Buttons, Pages (CRUD + draft/publish), Sections editor (12 section types: hero, services, about, gallery, testimonials, contact, cta, faq, stats, team, html, text), Domain (CNAME/TXT verification), SEO, Analytics & Tracking (GA4/GTM/AdSense/Meta Pixel/FB+Pinterest verify/custom &lt;head&gt; HTML), Popups (time_delay/exit_intent/scroll/manual triggers), FAQ, Photo Library, WhatsApp floating chat, Preview & Publish.
-   **Public Clinic Site** *(`artifacts/clinic-site`, served at `/site/`)*: React + Vite + Wouter runtime that renders the website-builder content. Loads `/api/website/{settings,pages,popups}` and renders configured sections with the chosen theme/fonts/colors via CSS variables. `HeadManager` injects title/SEO/OG/favicon, GA4, GTM, Meta Pixel, AdSense, FB/Pinterest verification tags, and `customHeadHtml` (with `<script>` re-injection so async tags actually execute). `WhatsAppButton` floating CTA + `PopupHost` engine handle the marketing widgets. `?preview=1` shows draft pages with an amber preview banner; without it, only `published` pages render and unknown slugs show a 404. When `settings.isPublished` is false the entire site shows a "Coming soon" gate.
-   **Website Security**: Public GET endpoints (`/api/website/{settings,pages,faqs,popups,photos}`) enforce server-side publish-state gating: unauthenticated visitors only see published content from published sites; draft content requires a valid preview token or authenticated staff Bearer session. `customHeadHtml` writes are restricted to admin/super_admin roles. `custom_html` page sections are stripped from non-admin saves (existing admin-placed ones are preserved on PATCH). Server-side `serverSanitizeHtml()` strips `<script>`, `<iframe>`, `<object>`, `<embed>`, event-handler attributes, and `javascript:` URLs from `custom_html` sections in public GET responses (defense-in-depth). Client-side DOMPurify sanitization on `custom_html` sections provides an additional layer. The website router is mounted once in the public routes section of `routes/index.ts` (above the pathless storage middleware) to avoid unintended auth interception.

# Known Fragile Patterns

-   **Never run `pnpm install --prod` inside the workspace.** It prunes devDependencies from the shared pnpm virtual store, breaking `.bin` symlinks (e.g. `vite`) that other workspace packages depend on. For production-only `node_modules`, use `pnpm deploy --prod <target-dir>` which creates an isolated copy without corrupting the workspace. The Vite-based artifacts (clinic-site, diagnostic-erp, super-admin-portal, mockup-sandbox) each have a `predev` self-healing guard that runs `pnpm install` if the `vite` binary is missing. The `prebuild` equivalent uses `CI=true pnpm install` to avoid `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` in deployment CI.
-   **API server path resolution uses `import.meta.url`, not `process.cwd()`.** The production run command executes from the workspace root, so `process.cwd()` would resolve paths incorrectly. Use `path.dirname(fileURLToPath(import.meta.url))` to compute paths relative to the bundle file (`dist/`) or source file (`src/`). The artifact.toml production run command uses the workspace-root-relative path `artifacts/api-server/dist/index.mjs`.

# External Dependencies

-   **PostgreSQL**: Primary database.
-   **Drizzle ORM**: For database interactions.
-   **Orval**: API codegen.
-   **Zod**: Schema validation.
-   **Gemini API (via Replit AI Integrations)**: For AI-powered features.
-   **Nodemailer**: For email notifications.
-   **node-cron**: For scheduling tasks.
-   **Orthanc DICOM server**: For PACS integration.
-   **Conquest DICOM server**: Alternative PACS provider.
-   **Weasis / OHIF**: External DICOM viewers.
-   **@simplewebauthn/server**: For WebAuthn credentials in Fingerprint Kiosk.