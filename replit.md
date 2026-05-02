# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm dev` — run all 3 services (API + ERP web + Super Admin) in parallel via `concurrently` (used outside Replit; on Replit each artifact is run by its own workflow)
- `pnpm db:push` — alias for `pnpm --filter @workspace/db run push`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Cross-Platform / Local (Windows / macOS / Linux) Setup

The project also runs outside Replit. See `README-WINDOWS.md` for the no-Docker
setup and `DEPLOY.md` for the Docker setup (Windows, Linux, macOS, Synology NAS).
Key changes that make local dev work:

- Root `preinstall` is a Node script (`scripts/preinstall-check.cjs`) instead of a Unix `sh -c …` line, so `pnpm install` succeeds on Windows.
- API server `dev` script uses `cross-env` instead of `export NODE_ENV=…`.
- API server `src/index.ts` loads a workspace-root `.env` via `dotenv` (no override of existing env vars, so Replit's runtime always wins) and falls back to `PORT=8080` when unset.
- `lib/db/drizzle.config.ts` is ESM-safe (`fileURLToPath` instead of `__dirname`) and also loads the root `.env` so `pnpm db:push` works locally.
- Both web Vite configs default `PORT` (5173 for ERP, 5174 for Super Admin) and `BASE_PATH` ("/" and "/super-admin-portal/") when not provided.
- `.env.example` documents `DATABASE_URL` plus all optional integration vars; `.env` files are gitignored.
- Root `pnpm dev` orchestrates the 3 services with `concurrently`.

### Docker / docker-compose

- Multi-stage `Dockerfile` with targets `api`, `web`, `migrate` (also a shared `base` and `api-build`/`web-build` stages).
- `docker-compose.yml` orchestrates `db` (postgres:16-alpine), `api`, `web` (nginx serving both SPAs + reverse-proxying `/api`), and a `migrate` service under the `tools` profile.
- `docker/nginx.conf` routes `/super-admin-portal/` to that build, `/api/` to the api container, and everything else to the diagnostic-erp build.
- `.env.docker.example` documents `HOST_PORT`, `DB_USER/DB_PASSWORD/DB_NAME`, `LOG_LEVEL` plus the optional integration vars.
- API runtime uses `pnpm --filter @workspace/api-server --prod --legacy deploy` to produce a self-contained node_modules tree (validated locally; the bundled server starts and resolves `pg`/`nodemailer`/`drizzle-orm` correctly from the deploy folder).
- Frontends are built with `BASE_PATH=/` (diagnostic-erp) and `BASE_PATH=/super-admin-portal/` (super-admin-portal) baked into the Vite build, so nginx can serve both side-by-side.

## Diagnostic ERP — Modules

### Implemented Pages (artifacts/diagnostic-erp)
- **Billing Desk** (`/`) — **Home page on login**; unified single-page billing workflow: live patient search + inline new patient registration, referral doctor, test catalog with category filter + package quick-add, **6 customizable Quick Test slot tabs** (one-click add for the user's most-used individual tests; hover the slot for ✏️ to assign/clear; persisted in `clinic_settings.quickTestIds`), running bill summary, ₹/% discount toggle, payment collection, auto date + auto bill number preview, "Generate Bill" creates order + bill + payment in one click
- **Dashboard** (`/dashboard`) — KPI cards, recent transactions, quick actions, alerts
- **Quick Register** (`/register`) — 3-step patient registration + test selection + billing/payment workflow
- **Patients** — list with search, patient registration, detail view
- **Orders** — test order management with status flow
- **Test Catalog** — diagnostic tests with categories and pricing
- **Billing** — bill generation and management; bill edit with audit trail; audit history viewer
- **Payments** — payment recording (cash/card/UPI/insurance/cheque)
- **Doctors** — referring doctor management (name, specialization, phone, email, hospital, default commission)
- **Reports** — analytics with 4 tabs: Overview, Test Analysis, Commission Report, **AI Insights** (Gemini-powered billing trend analysis)
- **Report Generator** — formatted diagnostic report creation with PDF/HTML/text export and voice readout. **Per-test template library** (`report_templates` table) lets you upload formats tagged to specific tests (e.g. USG WHOLE ABDOMEN, X-RAY CHEST PA, MRI BRAIN); the default template auto-loads when an order is opened. **Auto-flag** (Normal/Low/High/Critical) is computed from the reference range and entered value (handles `a–b` ranges, `<X` / `>X` / `≥X` limits, gendered ranges, multi-tier HbA1c-style ranges, and qualitative `Negative` / `Nil` ranges); manual override still available.
- **Inventory** — stock management (items, stock in/out/adjust, history, low-stock alerts, consumption rules per test)
- **Referrals** — doctor commission rules (percentage/fixed, per-test/category/all scope, exclusive rules) + payout report
- **Accounting** — chart of accounts with Tally groups + opening balances + GST/PAN; vouchers (Payment/Receipt/Contra/Journal/Sales/Purchase); ledger; Trial Balance; Profit & Loss; Balance Sheet; TallyPrime XML export
- **PACS Viewer** (`/pacs`) — Orthanc DICOM server integration; study/series browser with instance thumbnails; Weasis desktop launcher; OHIF web viewer link; WADO proxy
- **Discounts** (`/discounts`) — discount rules: percentage/fixed, scope (all/category/test), expiry date, active/inactive toggle
- **Appointments** (`/appointments`) — day-view appointment scheduler; status flow (scheduled/confirmed/completed/cancelled/no-show); stats row; date navigator; patient/doctor assignment; type (walk-in/scheduled/emergency/follow-up)
- **Test Packages** (`/packages`) — bundle multiple tests into priced packages; MRP + discount%; effective price preview; card grid with test list; create/edit/delete
- **Expenses** (`/expenses`) — operational expense tracking; 9 categories; list + Category Summary tabs; date-range + payment-mode filters; auto-generated EXP-YYMM-XXXX IDs
- **Staff Management** (`/staff`) — employees (EMP-XXXX), salary, advances with FIFO recovery (capped to outstanding, transactional), attendance with `(staff_id, date)` unique constraint, manual punch-in/out, Fingerprint Kiosk powered by WebAuthn (full server-side verification via `@simplewebauthn/server`, requires platform authenticator + user verification)
- **Settings** (`/settings`) — User management with roles (admin/manager/accountant/billing/lab/receptionist), per-module permissions, per-user max discount % cap
- **PatientDetail** — AI Clinical Note generation + AI patient message drafting (follow-up/results/payment) via Gemini

### AI Features (Gemini via Replit AI Integrations)
- Clinical note generation for patients (POST /api/ai/clinical-note)
- Billing insights analysis (POST /api/ai/billing-insights)
- Patient communication drafting (POST /api/ai/patient-message)
- Uses direct fetch to Gemini REST API with AI_INTEGRATIONS_GEMINI_BASE_URL + AI_INTEGRATIONS_GEMINI_API_KEY

### Quick Register — Discount Integration
- When proceeding to billing step, auto-fetches applicable discount rules
- Shows suggestion card with "Apply" button if a matching rule is found
- Shows discount reason field when a discount is applied

### DB Tables
- `inventory_items`, `inventory_transactions`, `inventory_consumption_rules`
- `commission_rules`
- `accounts`, `vouchers`, `voucher_audits`
- `users` — name, email, role, permissions (JSON), PIN, isActive, maxDiscount (numeric)
- `bill_audits` — audit trail for bill edits (who changed what, when, why)
- `discount_rules` — name, type (percentage/fixed), value, scope, categories (JSON), testIds (JSON), expiresAt, isActive
- Extended `doctors` with: `email`, `default_commission`, `default_commission_type`
- `appointments`, `appointment_counter` — APT-YYMM-XXXX IDs, status, timeSlot, type, patientId/doctorId FKs
- `packages`, `package_tests`, `package_counter` — PKG-XXXX codes; junction table links packages to tests
- `expenses`, `expense_counter` — EXP-YYMM-XXXX IDs; category, paymentMode, paidTo, approvedBy

### API Routes
- `GET/POST /api/inventory` — inventory items
- `POST /api/inventory/:id/stock-in|stock-out|adjust` — stock operations
- `GET /api/inventory/:id/history` — transaction history
- `GET /api/inventory/low-stock` — items below threshold
- `GET/POST/DELETE /api/inventory/consumption-rules` — per-test consumption rules
- `GET/POST/DELETE /api/commission/rules` — commission rules
- `GET /api/commission/report` — payout report with date/doctor filters
- `GET/POST /api/accounting/accounts` — accounts
- `GET/POST/DELETE /api/accounting/vouchers` — vouchers with filters
- `GET /api/accounting/ledger` — running ledger per account with opening balances
- `GET /api/accounting/trial-balance` — trial balance with Dr/Cr totals
- `GET /api/accounting/profit-loss` — income vs expenses P&L summary
- `GET /api/accounting/balance-sheet` — assets vs liabilities balance sheet
- `GET /api/accounting/export/tally` — TallyPrime XML with ledger masters + vouchers (date range optional)
- `GET /api/pacs/config` — PACS server config info
- `GET /api/pacs/health` — Orthanc connection health check
- `GET /api/pacs/studies` — list all DICOM studies (expanded)
- `GET /api/pacs/studies/:id/series` — series in a study
- `GET /api/pacs/instances/:id/preview` — DICOM instance thumbnail (proxied)
- `GET /api/pacs/wado` — WADO-URI proxy
- `GET /api/pacs/search?q=` — patient name/ID search across studies
- `GET /api/pacs/studies/:id/weasis-url` — Weasis/OHIF viewer URLs
- `GET/POST/PATCH/DELETE /api/users` — user management
- `GET /api/users/default-permissions` — default permissions per role
- `GET /api/bills/:id/audits` — bill edit audit trail
- `PUT /api/bills/:id` — supports editedBy + reason for audit logging + email notification
- `GET/POST /api/email-settings` — email notification settings (SMTP, recipients, triggers)
- `POST /api/email-settings/test` — send test email
- `POST /api/email-settings/send-summary` — trigger daily summary manually

### Email Notifications (artifacts/api-server/src/email.ts + cron.ts)
- Powered by nodemailer (SMTP) + node-cron
- **Bill edit notifications**: fires email immediately on every bill edit (async, non-blocking)
- **Daily summary**: cron checks every minute; fires at configured time (default 17:00) with today's stats
- Settings stored in `email_settings` DB table (SMTP credentials, from, recipients, toggles, time)
- Recipients: admin email + extra recipients list (managed from Settings → Email Notifications tab)

### Notes
- New frontend pages use direct fetch via `src/lib/fetchApi.ts` (put/patch/post/delete helpers)
- Currency: Indian Rupee (₹), `en-IN` locale
- Voucher numbering: PV (payment), RV (receipt), BT (contra), JV (journal), SV (sales), PUR (purchase) — all YYYYMM-XXXX
- PACS uses env vars: ORTHANC_URL, ORTHANC_USERNAME, ORTHANC_PASSWORD, PACS_VIEWER_TYPE, OHIF_URL, WADO_URL
- Accounting accounts have: tallyGroup (TALLY_GROUPS list), openingBalance/openingBalanceType, gstNumber, pan
- Tally export maps account types to groups: cash→Cash-in-Hand, bank→Bank Accounts, income→Direct Income, etc.
- Commission rules stored with JSON arrays for `categories` and `testIds` fields
- Bill edits require editedBy + reason; stored in bill_audits table
- Email settings include setup tips for Gmail, Outlook, Zoho
