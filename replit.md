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
- **Patients** — list with search, patient registration, detail view
- **Orders** — test order management with status flow
- **Test Catalog** — diagnostic tests with categories and pricing
- **Billing** — bill generation and management
- **Payments** — payment recording (cash/card/UPI/insurance/cheque)
- **Doctors** — referring doctor management (name, specialization, phone, email, hospital, default commission)
- **Reports** — analytics and reports dashboard
- **Report Generator** — formatted diagnostic report creation with PDF/HTML/text export and voice readout
- **Inventory** — stock management (items, stock in/out/adjust, history, low-stock alerts, consumption rules per test)
- **Referrals** — doctor commission rules (percentage/fixed, per-test/category/all scope, exclusive rules) + payout report
- **Accounting** — chart of accounts, payment/receipt/bank-transfer/journal vouchers, ledger, Tally XML export

### New DB Tables (added)
- `inventory_items`, `inventory_transactions`, `inventory_consumption_rules`
- `commission_rules`
- `accounts`, `vouchers`
- Extended `doctors` with: `email`, `default_commission`, `default_commission_type`

### New API Routes
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

### Notes
- New frontend pages use direct fetch via `src/lib/fetchApi.ts` (not codegen hooks) since new endpoints not added to openapi.yaml
- Currency: Indian Rupee (₹), `en-IN` locale
- Voucher numbering: PV-YYYYMM-XXXX, RV-..., BT-..., JV-...
- Commission rules stored with JSON arrays for `categories` and `testIds` fields
