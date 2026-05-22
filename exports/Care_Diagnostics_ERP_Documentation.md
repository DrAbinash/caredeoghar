# CARE DIAGNOSTICS ERP
## Comprehensive System Documentation

**Version:** 2026.05 | **Classification:** Confidential & Proprietary

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Complete Module Overview](#3-complete-module-overview)
4. [The Money Trail](#4-the-money-trail)
5. [DICOM / PACS & Radiology](#5-dicom--pacs--radiology)
6. [Staff Role-Based Access Control](#6-staff-role-based-access-control)
7. [Radiology Reporting Engine](#7-radiology-reporting-engine)
8. [Security, Audit & Compliance](#8-security-audit--compliance)
9. [Installation & Deployment](#9-installation--deployment)
10. [Future Roadmap](#10-future-roadmap)

---

## 1. Executive Summary

Care Diagnostics ERP is a hospital-grade, all-in-one management platform designed for pathology and radiology centers. It unifies patient registration, test ordering, billing, accounting, inventory, radiology workflow, PACS integration, AI-assisted reporting, staff management, and a public-facing clinic website into a single cohesive system.

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

## 2. System Architecture

### 2.1 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Monorepo | pnpm workspaces | Package management |
| Runtime | Node.js 24 | Server execution |
| Language | TypeScript 5.9 | Type-safe development |
| API | Express 5 | RESTful HTTP server |
| Database | PostgreSQL + Drizzle ORM | Relational data |
| Validation | Zod + drizzle-zod | Input/output validation |
| Frontend | React 19 + Vite 7 | SPA web apps |
| UI | shadcn/ui + Tailwind | Component system |
| AI | Gemini API | Clinical notes, insights |
| Email | Nodemailer | SMTP notifications |
| PACS | Orthanc DICOM | DICOM storage |
| Build | esbuild | Fast bundling |
| Auth | Bearer tokens + WebAuthn | Sessions + biometrics |

### 2.2 Deployable Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| api-server | /api | Express API + database |
| diagnostic-erp | /erp | Staff ERP dashboard |
| clinic-site | / | Public clinic website |
| super-admin-portal | /super-admin-portal | Super admin dashboard |
| diagno-booking-mobile | Mobile app | Patient booking app |
| bridge-service | Localhost | Fingerprint/DICOM bridge |

### 2.3 Database Domains (80+ tables)

- Patient Management, Test Catalog, Orders & Billing, Lab Workflow, Radiology, PACS, Reporting, Accounting, Inventory, Commission, Banking, Staff & HR, Appointments, Website Builder, Security & Audit, AI & Automation, Teleradiology, HL7 Integration, Machines & Maintenance, Locations

---

## 3. Complete Module Overview

| # | Module | Description |
|---|--------|-------------|
| 1 | Patient Management | Registration, UHID, demographics, relatives, documents |
| 2 | Test Catalog | Tests, categories, groups, packages, pricing |
| 3 | Orders | Test ordering, status tracking, sample linking |
| 4 | Billing Desk | Unified billing: search, register, tests, discounts, payments |
| 5 | Payments | Cash, UPI, Card, split payments, refunds, auto-vouchers |
| 6 | Lab Reports | Result entry, verification, signatures, PDF generation |
| 7 | Sample Management | Barcode generation, collection, routing, status tracking |
| 8 | Test Tokens | Per-test queue tokens for lab and radiology |
| 9 | Radiology Studies | Study scheduling, accession numbers, modality worklist |
| 10 | PACS Viewer | Orthanc proxy, DICOM studies, WADO-URI, Weasis/OHIF |
| 11 | Radiology Reporting | Templates, voice dictation, AI cleanup, key images |
| 12 | Structured Reports | USG, CT, MRI templates with auto-fill fields |
| 13 | Teleradiology | Remote reporting, share links, multi-site worklists |
| 14 | AI Reporting | Gemini-powered drafting, measurement extraction |
| 15 | Inventory | Stock management, reagent tracking, vendor orders |
| 16 | Vendors | Supplier management with GSTIN, payment terms |
| 17 | Accounting | Double-entry vouchers, TallyPrime export, trial balance |
| 18 | Commission | Referral doctor rules, payouts, discount deduction |
| 19 | Banking | Bank sync, reconciliation, fraud detection |
| 20 | Doctors | Referral directory, specializations, ledger assignment |
| 21 | Appointments | Day-view scheduler, online bookings |
| 22 | Staff Management | Users, roles, attendance, salary, biometric credentials |
| 23 | HR Forms | Joining, rejoining, exit, document checklists |
| 24 | Machines | Equipment registry, maintenance, calibration |
| 25 | Website Builder | Public site design, pages, popups, analytics |
| 26 | WhatsApp | Business API, chatbot, notifications |
| 27 | Email | SMTP, bill emails, report emails, broadcast |
| 28 | Reports & Analytics | Revenue analytics, AI insights |
| 29 | Display Board | TV display for token numbers |
| 30 | Kiosk | Self-service registration and booking |
| 31 | Patient Portal | Bills, reports, appointments for patients |
| 32 | Super Admin | Backups, audit, permissions, health monitoring |

---

## 4. The Money Trail

### 4.1 Patient Registration & Order Creation

Patient arrives, reception registers them (UHID generated). Tests are ordered from the Test Catalog (individual, packages, quick-add slots). Order creates a row in `orders` table with status = pending.

### 4.2 Bill Generation

Bill number format: `YYYYMM####` (e.g., 2026050001).

- Subtotal = sum of all test prices
- Discount = role-gated percentage or fixed amount
- Net amount = subtotal - discount
- Bill assigned to a ledger (walk-in or doctor-specific)
- Per-test queue tokens auto-generated

### 4.3 Payment Recording

Split payments supported: Cash, UPI, Card, Bank Transfer, Wallet.

Each payment creates a row in `payments` table linked to the bill. Auto-voucher generated: Receipt Voucher (RV) debiting payment method account and crediting "Diagnostic Services Revenue".

### 4.4 Commission Calculation

Rule hierarchy (highest to lowest priority):

1. **Exclusive Rule** - Test-specific match
2. **Category Rule** - Test category match
3. **General Rule** - Catch-all for doctor
4. **Doctor Default** - Fallback percentage

Discount deduction modes:
- **DEDUCT** - Bill discount subtracted from commission
- **DEDUCT_ROLLOVER** - Discount tracked, rolled to next cycle

### 4.5 Accounting & Vouchers

Double-entry bookkeeping with Tally-compatible groups:

- **Receipt Voucher (RV)** - Money received
- **Payment Voucher (PV)** - Money paid out
- **Contra Voucher (CV)** - Transfers between accounts
- **Journal Voucher (JV)** - Non-cash adjustments

Every edit creates audit record in `voucher_audits_table`. Day closures reconcile cash drawer with system totals.

### 4.6 Banking Integration

Connects to ICICI, Axis, HDFC, Razorpay:

- Bank Account Management (sandbox/production)
- Transaction Sync (automatic import via API)
- Reconciliation Engine (UTR fuzzy matching)
- Fraud Detection (duplicates, anomalies)
- Payment Requests and Refund Processing

---

## 5. DICOM / PACS & Radiology

### 5.1 DICOM Data Flow

1. **ORDER** - Doctor orders radiology test (Body Part, AE Title, Modality captured)
2. **SCHEDULE** - Auto-generated accession number: `ACC-YYYYMMDD-MODALITY-NNNN`
3. **MWL** - Modality Worklist entry created (modality queries scheduled patients)
4. **ACQUISITION** - Images pushed to PACS (Orthanc/Conquest) via DICOM C-STORE
5. **INCOMING GATEWAY** - Monitors `dicom_incoming_studies`, validates AE Titles
6. **REPORTING** - Templates, voice dictation, AI assistance
7. **VERIFICATION** - Senior radiologist verifies (preliminary vs final)
8. **DELIVERY** - Shared via WhatsApp/Email/Patient Portal

### 5.2 PACS Components

| Component | Technology | Function |
|-----------|-----------|----------|
| DICOM Server | Orthanc | Primary storage, REST API, WADO-URI |
| Alt Server | Conquest | Fallback PACS |
| Web Viewer | Weasis / OHIF | Browser-based viewing |
| Bridge Service | Node.js localhost | Scanner/biometric proxy |
| PACS API | Express proxy | Secure authenticated proxy |

### 5.3 Teleradiology

- Tokenized share links with expiration (1-30 days)
- Multi-site worklist across centers
- Auto-assignment by subspecialty and workload
- Peer review workflow
- Critical findings alert (STAT/Emergency)
- AI enhancement for remote radiologists

### 5.4 DICOM Security

- All PACS routes require `requireStaffAuth`
- Orthanc ID validation (36-char hex UUIDs only)
- SSRF hardening via `tcpProbe`
- Encrypted DICOM node credentials
- Study access logged in `audit_logs`

---

## 6. Staff Role-Based Access Control

### 6.1 Staff Roles (8 roles)

| Role | Description | Typical Access |
|------|-------------|---------------|
| super_admin | System owner, full access | All modules + super-admin pages |
| admin | Center manager | Billing, reports, inventory, staff |
| reception | Front desk | Patients, appointments, basic billing |
| billing | Billing operator | Full billing, payments, day closure |
| radiology_typist | Data entry | Reporting workspace, templates |
| radiologist | Medical doctor | Worklist, reporting, verification, AI |
| lab_technician | Lab staff | Samples, tokens, result entry |
| accountant | Finance staff | Accounting, commissions, banking |

### 6.2 Permission Bits (10 per module)

1. VIEW, 2. CREATE, 3. EDIT, 4. DELETE, 5. PRINT, 6. REPRINT, 7. REFUND, 8. EXPORT, 9. APPROVE, 10. FINALIZE

13 modules: patients, tests, orders, billing, reports, radiology, inventory, accounting, commission, appointments, staff, machines, website.

### 6.3 USB Pen-Drive Gate

- USB drive must contain `superadmin.key` matching `SUPER_ADMIN_USB_KEY` env secret
- Auto-detected every 4 seconds via File System Access API
- Super Admin link appears only when drive is plugged in
- `Ctrl+Alt+U` opens pairing dialog
- Key cached in `sessionStorage` (dies with tab)
- Bypassed with warning if env secret is unset

---

## 7. Radiology Reporting Engine

### 7.1 Reporting Workflow

1. Study selection from smart worklist
2. Template choice (100+ structured templates)
3. Voice dictation with Gemini AI cleanup
4. AI enhancement (differentials, measurements)
5. Key images upload (up to 10, max 10MB each)
6. Auto-save drafts every 30 seconds
7. Preliminary report submission
8. Peer review by senior radiologist
9. Final report (immutable, locked)
10. Automatic delivery via WhatsApp/Email/Portal

### 7.2 Structured Templates

- **USG Abdomen:** Liver, GB, CBD, Spleen, Pancreas, Kidneys, Bladder
- **USG Obstetrics:** Gestation age, BPD, HC, AC, FL, fluid, placenta
- **CT Brain:** Parenchyma, ventricles, cisterns, bones, sinuses
- **MRI Knee:** Ligaments, menisci, cartilage, marrow, effusion
- **X-Ray Chest:** Heart, lungs, hila, angles, bony thorax
- **Mammography:** Density, masses, calcifications, BIRADS

### 7.3 AI Reporting Features

- Voice-to-text cleanup
- Auto-measurement extraction from USG images
- Normal snippet insertion
- Differential diagnosis suggestions
- Critical finding detection
- Report quality scoring

---

## 8. Security, Audit & Compliance

### 8.1 Authentication

- Bearer token sessions (JWT-like)
- WebAuthn biometric login (fingerprint)
- PIN-based quick workstation access
- Portal PIN hash sanitized in API responses
- Server-enforced role permissions
- USB pen-drive gate for super-admin

### 8.2 Immutable Audit Trail

Every sensitive action recorded in `audit_logs`:

- Action type: create, edit, delete, print, reprint, refund, export, approve, finalize, login, logout
- Actor: userId, userName, role, IP, user agent
- Entity: module, entityType, entityId, oldValue, newValue
- Reason (required for destructive operations)
- Server timestamp (no client times)
- Append-only (never updated or deleted)

### 8.3 Rate Limiting

| Limiter | Window | Max | Applies To |
|---------|--------|-----|-----------|
| loginLimiter | 15 min | 10 | Login endpoints |
| portalLimiter | 15 min | 60 | Public portal |
| backupLimiter | 1 hr | 5 | Backup generation |
| exportLimiter | 5 min | 10 | CSV/Excel exports |
| adminMutationLimiter | 15 min | 30 | Super admin mutations |
| standardUploadLimiter | 5 min | 20 | Standard uploads |
| dicomUploadLimiter | 10 min | 10 | DICOM uploads |
| generalLimiter | 1 min | 300 | General API |

### 8.4 Security Headers

- Helmet: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- CORS configured for Replit proxy
- Trust proxy = 1 (real client IPs for rate limiting)
- No stack traces in production

### 8.5 File Upload Security

- MIME whitelists (standard + DICOM separate)
- Size limits: 25 MB standard, 512 MB DICOM
- Path traversal protection (no ../)
- SHA-256 checksums for integrity
- Metadata-only in PostgreSQL (never binary data)
- Soft delete only (compliance)
- DICOM: streaming multipart with diskStorage (never memoryStorage)
- DICOM SHA-256 computed via streaming (no RAM buffering)

---

## 9. Installation & Deployment

### 9.1 Prerequisites

- Node.js 24 (LTS)
- pnpm 10+
- PostgreSQL 15+
- Git

### 9.2 Docker Deployment (Recommended)

Services: PostgreSQL, API server, Orthanc.
Run: `docker-compose up -d`

### 9.3 Synology NAS

1. Install Container Manager
2. Create shared folder `care-diagnostics`
3. Create project with docker-compose.yml
4. Map volumes and set env vars
5. Expose port 8080 via reverse proxy
6. Enable HTTPS with Let's Encrypt
7. Schedule backups via Hyper Backup

Note: DS920+ or higher recommended. Smaller units: run ERP without Orthanc.

### 9.4 Windows Deployment

1. Install Node.js 24, pnpm, PostgreSQL 16
2. Clone repo: `git clone <url> && cd care-diagnostics`
3. `pnpm install`
4. Create `.env` with DATABASE_URL, SESSION_SECRET
5. `pnpm --filter @workspace/api-server run migrate`
6. `pnpm --filter @workspace/api-server run build-deploy`
7. `pnpm --filter @workspace/api-server run start`
8. Install Orthanc (optional) and configure ORTHANC_URL
9. Access ERP at `http://localhost:8080/erp`

For production: use pm2 or NSSM as Windows service.

### 9.5 Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | 32+ char secret for tokens |
| SUPER_ADMIN_USB_KEY | Yes* | USB gate key (*bypassed if unset) |
| AI_INTEGRATIONS_GEMINI_API_KEY | No | Gemini API key |
| ENABLE_SCHEDULERS | No | Set to 1 for cron jobs |
| NODE_ENV | Yes | production or development |
| SERVE_STATIC_DIR | Yes | Path to built frontend files |
| ORTHANC_URL | No | Orthanc DICOM URL |
| SMTP_HOST, PORT, etc. | No | Email server config |

---

## 10. Future Roadmap

### Short-Term (3 months)

- Mobile ERP app for staff worklists and approvals
- HL7 FHIR integration for EMR/EHR connectivity
- LIS integration via ASTM/HL7
- QR codes for bills and reports
- Advanced analytics dashboard
- Patient feedback system via SMS/WhatsApp

### Medium-Term (6-12 months)

- Multi-center cloud dashboard
- AI-powered lab quality control
- Predictive equipment maintenance
- Insurance claim submission
- Online payment gateway (Razorpay/Stripe)
- Voice assistant for radiologists
- Blockchain audit trail
- Dark mode across all artifacts

### Long-Term (1-2 years)

- AI diagnostic engine (pathology + radiology)
- Telemedicine video consultation
- Genomics test ordering and reporting
- IoT device integration (sensors)
- Digital pathology (whole slide imaging)
- CAP, ISO 15189, NABL compliance modules
- National health exchange integration (ABDM India)

### Architecture Recommendations

- Microservices split (billing, radiology services)
- Event-driven architecture (Redis Streams/Kafka)
- GraphQL API layer alongside REST
- Redis edge caching for hot data
- CDN for static assets and DICOM previews
- Kubernetes for multi-center deployments

---

*Care Diagnostics ERP | Confidential & Proprietary*
