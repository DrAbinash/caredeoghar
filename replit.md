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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Diagnostic ERP — Modules

### Implemented Pages (artifacts/diagnostic-erp)
- **Dashboard** — KPI cards, recent transactions, quick actions, alerts
- **Quick Register** (`/register`) — 3-step patient registration + test selection + billing/payment workflow
- **Patients** — list with search, patient registration, detail view
- **Orders** — test order management with status flow
- **Test Catalog** — diagnostic tests with categories and pricing
- **Billing** — bill generation and management; bill edit with audit trail; audit history viewer
- **Payments** — payment recording (cash/card/UPI/insurance/cheque)
- **Doctors** — referring doctor management (name, specialization, phone, email, hospital, default commission)
- **Reports** — analytics with 4 tabs: Overview, Test Analysis, Commission Report, **AI Insights** (Gemini-powered billing trend analysis)
- **Report Generator** — formatted diagnostic report creation with PDF/HTML/text export and voice readout
- **Inventory** — stock management (items, stock in/out/adjust, history, low-stock alerts, consumption rules per test)
- **Referrals** — doctor commission rules (percentage/fixed, per-test/category/all scope, exclusive rules) + payout report
- **Accounting** — chart of accounts, payment/receipt/bank-transfer/journal vouchers, ledger, Tally XML export
- **Discounts** (`/discounts`) — discount rules: percentage/fixed, scope (all/category/test), expiry date, active/inactive toggle
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
- `accounts`, `vouchers`
- `users` — name, email, role, permissions (JSON), PIN, isActive, maxDiscount (numeric)
- `bill_audits` — audit trail for bill edits (who changed what, when, why)
- `discount_rules` — name, type (percentage/fixed), value, scope, categories (JSON), testIds (JSON), expiresAt, isActive
- Extended `doctors` with: `email`, `default_commission`, `default_commission_type`

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
- `GET /api/accounting/ledger` — running ledger per account
- `GET /api/accounting/export/tally` — Tally XML download
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
- Voucher numbering: PV-YYYYMM-XXXX, RV-..., BT-..., JV-...
- Commission rules stored with JSON arrays for `categories` and `testIds` fields
- Bill edits require editedBy + reason; stored in bill_audits table
- Email settings include setup tips for Gmail, Outlook, Zoho
