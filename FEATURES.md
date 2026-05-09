# DiagnoCenter ERP — Complete Feature Reference

> Comprehensive documentation of all features built into the DiagnoCenter Diagnostic ERP system.
> Last updated: May 2026.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Technology Stack](#2-architecture--technology-stack)
3. [URL & Application Layout](#3-url--application-layout)
4. [Billing Desk](#4-billing-desk)
5. [Patient Management](#5-patient-management)
6. [Appointments & Online Bookings](#6-appointments--online-bookings)
7. [Test Catalog](#7-test-catalog)
8. [Outsourced Labs](#8-outsourced-labs)
9. [Packages](#9-packages)
10. [Orders](#10-orders)
11. [Bills & Payments](#11-bills--payments)
12. [Queue Token System](#12-queue-token-system)
13. [Report Generator](#13-report-generator)
14. [Report Hub](#14-report-hub)
15. [Radiology Workflow](#15-radiology-workflow)
16. [PACS Viewer & DICOM Nodes](#16-pacs-viewer--dicom-nodes)
17. [Inventory & Vendors](#17-inventory--vendors)
18. [Expenses](#18-expenses)
19. [Accounting & TallyPrime Export](#19-accounting--tallyprime-export)
20. [Doctor & Referral Management](#20-doctor--referral-management)
21. [Referral Commission System](#21-referral-commission-system)
22. [Doctor Dues & Ledger](#22-doctor-dues--ledger)
23. [Discounts & Discount Reasons](#23-discounts--discount-reasons)
24. [Staff Management](#24-staff-management)
25. [Dashboard & Daily Summary](#25-dashboard--daily-summary)
26. [Patient Portal](#26-patient-portal)
27. [Display Board (Token Screen)](#27-display-board-token-screen)
28. [Website Builder & Public Clinic Site](#28-website-builder--public-clinic-site)
29. [Form F (PCPNDT Compliance)](#29-form-f-pcpndt-compliance)
30. [Machines & Maintenance](#30-machines--maintenance)
31. [HR Forms](#31-hr-forms)
32. [Samples Module](#32-samples-module)
33. [AI Features](#33-ai-features)
34. [WhatsApp Integration](#34-whatsapp-integration)
35. [Email Notifications](#35-email-notifications)
36. [Settings & Configuration](#36-settings--configuration)
37. [Super-Admin Portal](#37-super-admin-portal)
38. [Security Architecture](#38-security-architecture)
39. [Deployment & Infrastructure](#39-deployment--infrastructure)
40. [Changelog of Major Builds](#40-changelog-of-major-builds)

---

## 1. System Overview

DiagnoCenter is a full-stack, multi-artifact TypeScript monorepo designed to run all operations of a diagnostic imaging and pathology center. It covers the entire patient journey — from walk-in registration and billing, through lab/radiology processing, to report delivery and payment collection — and wraps all of that in financial accounting, inventory, staff management, and a public-facing website and patient portal.

The system is built for a single-center deployment (one PostgreSQL database, one Express API) with optional multi-branch awareness in the data model.

---

## 2. Architecture & Technology Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 (strict) |
| API server | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4 + drizzle-zod |
| API contract | OpenAPI spec → Orval codegen (React Query hooks + Zod schemas) |
| Frontend build | Vite 7 + React 19 |
| Styling | Tailwind CSS + shadcn/ui components |
| State management | TanStack Query v5 |
| Routing | Wouter |
| Charts | Recharts |
| Build (prod) | esbuild (CJS/ESM bundle) |
| AI | Google Gemini REST API (via Replit AI Integrations proxy) |
| Email | Nodemailer + node-cron |
| Biometrics | @simplewebauthn/server (WebAuthn / FIDO2) |
| DICOM/PACS | Orthanc or Conquest + Weasis/OHIF viewers |
| File storage | Replit Object Storage |
| Scheduling | node-cron (in-process, gated by `ENABLE_SCHEDULERS=1`) |

### Monorepo Artifacts

| Artifact | Path | Purpose |
|---|---|---|
| `clinic-site` | `/` | Public marketing website |
| `diagnostic-erp` | `/erp` | Staff-facing ERP application |
| `api-server` | `/api` | Express 5 REST API + DB |
| `super-admin-portal` | `/super-admin-portal` | Privileged admin surface |
| `mockup-sandbox` | dev-only | Component design sandbox |

---

## 3. URL & Application Layout

The URL space (swapped May 2026) puts the marketing site at the root:

| URL | Content |
|---|---|
| `/` | Public clinic website |
| `/erp` | Staff ERP (login required) |
| `/erp/portal` | Patient + staff portal landing |
| `/super-admin-portal` | Super-admin portal (USB key gated) |
| `/api/*` | REST API |
| `/uploads/*` | Uploaded media (photos, logos) |

In production, a single Express process serves all three SPAs from `dist/web/` plus the API — one port, one process, required by the Reserved VM deployment model.

---

## 4. Billing Desk

The primary day-to-day workflow. Opens at `/erp/` (root of ERP).

### Patient Search & Registration
- Live search by name, phone, or patient ID with instant dropdown results
- One-click inline registration for new walk-in patients without leaving the billing screen
- Quick registration modal captures: first name, last name, phone, DOB, gender, address, referring doctor
- Patient photo capture via webcam or file upload, stored as base64 data URL

### Test Selection
- Full test catalog search with category filter
- Quick-slot system: up to N customizable "pinned" test slots on the billing screen for the most common tests — one click to add
- Package quick-add: select a pre-configured package to add all its tests at once
- Per-test price is shown; quantity defaults to 1

### Pricing & Discounts
- Subtotal auto-calculated from selected tests
- Flat or percentage discount input, capped server-side at subtotal
- Per-user maximum discount limit enforced (set in Staff settings)
- Discount reason selector (configurable list) for audit trail
- Tax amount field (optional, passed through to bill)
- Real-time balance calculation: subtotal − discount + tax − payments

### Payment Collection
- Multiple payment methods: Cash, Card, UPI, Insurance, Cheque
- Partial payment support at bill creation time
- Reference number field for non-cash methods

### Bill Generation
- Auto-generates a bill number in format `YYYYMM####` (e.g. `2026050042`)
- Per-test queue tokens generated and printed alongside bill
- Auto-print of receipt immediately after bill creation (A4 or A5 paper size, user preference saved)
- QR code on receipt linking to patient portal
- Referring doctor printed on receipt
- Receipt text forced to uppercase for consistency (opt-out class available per field)
- Print isolation uses visibility trick (not `display: none`) to avoid blank trailing page in Chrome

### Post-Bill Actions (from BillDetail)
- Add further payments against an existing bill
- Edit discount (staff, with reason and audit log)
- Super-admin edit: modify subtotal, discount, tax directly
- Reprint with reprint-by name and reason logged
- Bill cancellation with full refund workflow
- Partial refund workflow
- Cancel-and-refund combined workflow
- **Partial test cancellation**: cancel individual tests from a bill without cancelling the whole bill — recalculates subtotal, discount cap, total, balance, and status; logs audit entry
- Audit log viewer showing full change history of every bill

---

## 5. Patient Management

- Full patient list with search (name, phone, patient ID) and pagination
- Patient detail page showing: demographics, all visits/orders, all bills, all reports, all payments, all appointments
- Patient photo display
- Edit patient demographics inline
- Patient ID auto-generated (configurable format)
- Date of birth → auto-calculated age displayed
- Gender, blood group, address fields
- Portal PIN management (set/reset PIN for patient portal access)
- `hasPortalAccess` flag shown (sanitized — raw PIN hash never sent to client)
- WhatsApp-friendly phone number formatting

---

## 6. Appointments & Online Bookings

### Appointments (Internal)
- Day-view appointment scheduler
- Book appointments for existing or new patients
- Assign to doctor / department / time slot
- Status tracking: scheduled, arrived, completed, cancelled
- Appointment list with date-range filter

### Online Bookings
- Public-facing booking form on the clinic website
- Captures: name, phone, preferred date/time, test or department
- Bookings appear in the ERP's Online Bookings page for staff review
- Staff can convert a booking to a registered appointment

---

## 7. Test Catalog

- Full CRUD for diagnostic tests
- Fields: code, name, category, price, duration, description, department, room number
- **Test Type flag** (added May 2026): `inhouse` vs `outsourced`
  - Inhouse (teal badge): performed on-premises
  - Outsourced (orange badge): sent to an external lab
- **Outsourced Lab association**: link an outsourced test to a specific lab from the Outsourced Labs directory
- Type filter in the test list (All / In-House / Outsourced)
- Active/Inactive toggle per test
- Test categories: separate CRUD with active/inactive control; category shows test count
- Category manager dialog accessible from the Tests page
- CSV export/import for bulk test management
- Search by name/code/description
- Department filter drives which queue (e.g. USG room) the test routes to

---

## 8. Outsourced Labs

New module added May 2026 to manage external reference laboratories.

- List all outsourced labs with active/inactive status
- Full CRUD:
  - Name, contact person, phone, email
  - Address, GSTIN, notes
  - Active/inactive toggle
- Labs can be associated with individual tests in the Test Catalog
- Listed in sidebar under "Test Catalog" group
- Active labs appear in the test edit form's lab picker when test type is set to "Outsourced"
- API: `GET/POST/PATCH/DELETE /api/outsourced-labs` (staff auth required for mutations)

---

## 9. Packages

- Define named test bundles (packages) with a fixed price
- Package price can be set independently of individual test prices
- Add all package tests to a bill with one click from the Billing Desk
- Active/inactive control
- CRUD management page

---

## 10. Orders

- Every bill is backed by an order record linking patient → tests
- Order list with search, date filter, status filter
- Order detail page: patient info, tests in order, linked bill, linked reports
- Order number auto-generated
- Orders track the referring doctor for commission calculation

---

## 11. Bills & Payments

### Bills List
- Full bill list with search (bill number, patient name), date range filter, status filter
- Status badges: Pending, Partial, Paid, Cancelled
- Quick links to bill detail, patient, order

### Bill Detail
- Full receipt view with all demographics and tests
- Payment history table
- Audit log (full change history)
- All post-creation actions (see Billing Desk section above)

### Bill Number Format
- Post-May 2026: pure numeric `YYYYMM####` (e.g. `2026050001`)
- Legacy format `BILL-YYYYMM-####` still supported in super-admin flows

### Partial Test Cancellation (May 2026)
- Cancel individual tests from a multi-test bill
- The cancel button (✕) appears on each active test row
- Hidden when: the bill is already cancelled, or only one active test remains
- Cancellation captures: reason + cancelled-by name
- Cancelled tests shown struck-through with canceller's name and reason
- Bill totals (subtotal, discount cap, total, balance, status) recalculated atomically in a DB transaction
- Audit entry `test-cancelled` written to bill audit log
- Cancelled tests excluded from referral commission calculations

### Payments
- Payments list across all bills
- Filter by date, method, patient
- Payment methods: cash, card, UPI, insurance, cheque

### Dues
- Dedicated "Due Payments" view showing bills with outstanding balance
- Sorted by balance, with quick-pay action

---

## 12. Queue Token System

- Each test in an order gets an automatically assigned queue token number
- Token number is department-scoped (e.g. Pathology token #12, USG token #3)
- Tokens reset daily
- Tokens printed on the bill receipt so patients know their queue position
- Token display board (`/erp/display`) shows the current token being called per department — designed for a wall-mounted screen in the waiting area

---

## 13. Report Generator

A technician/doctor-facing tool for entering and formatting diagnostic results.

- Select patient + test to generate a report for
- Inline parameter entry: structured fields for pathology values (e.g. Haemoglobin: 12.5 g/dL)
- Template system: load a saved template to pre-fill the parameter structure
- Auto-flagging: values outside reference range are automatically flagged as abnormal
- Voice readout: text-to-speech reads out parameter names and values (useful for dictation-style entry)
- Impression / clinical notes free-text field
- Rich text report body
- Signature selection: attach a doctor's digital signature to the report
- Report status: Draft → Pending Verification → Verified → Delivered
- Critical value flagging with acknowledgement tracking

---

## 14. Report Hub

Central management surface for all generated reports.

- List all reports with search, date filter, status filter, type filter (Pathology / Radiology)
- Tabs: All Reports, Pending Verification, Verified, Delivered
- Per-report actions:
  - Preview report
  - Print report
  - Download as PDF
  - Email to patient
  - Share via secure link (tokenized URL, configurable expiry)
  - Mark as verified (with verifier signature)
  - Mark as delivered
  - Flag as critical
- Batch actions on multiple reports
- Report share links: generate a public URL the patient can open without logging in
- Teleradiology share: generate a link for an external radiologist to view images + provide report

---

## 15. Radiology Workflow

End-to-end imaging workflow built for USG, X-Ray, CT, MRI, and other modalities.

- Radiology worklist: all orders with imaging tests, filterable by modality/status
- Status flow: Ordered → In Progress → Images Acquired → Reported → Delivered
- Film/CD issuance tracking
- Integration with PACS for DICOM study management
- Radiology report entry with impression field
- DICOM study auto-creation when an imaging order is placed
- Accession number auto-assigned
- Reporting queue: shows studies awaiting radiologist report
- Teleradiology module: share studies with external radiologists via secure link

---

## 16. PACS Viewer & DICOM Nodes

- PACS viewer embedded in the ERP (at `/erp/pacs`)
- Supports Orthanc and Conquest DICOM servers
- Viewer integration: Weasis (desktop) and OHIF (web-based)
- DICOM nodes management: add/edit DICOM AE titles, host, port
- SSRF protection on DICOM probes — `tcpProbe` validates host/port before forwarding
- Study list from configured PACS node
- Launch viewer for a specific study from the radiology worklist

---

## 17. Inventory & Vendors

### Inventory
- Item catalog: name, SKU, unit, category, reorder level, current stock
- Stock-in and stock-out transactions
- Low-stock alerts on Dashboard
- Stock movement history per item

### Vendors (Suppliers)
- Full vendor directory: name, contact person, phone, email, address
- GSTIN field for GST compliance
- Payment terms per vendor
- Purchase history linked to vendor
- Active/inactive control

---

## 18. Expenses

- Record center expenses with category, amount, date, notes, vendor
- Expense categories (configurable)
- Date-range filter and category filter
- Totals summary
- Feeds into accounting / daily summary

---

## 19. Accounting & TallyPrime Export

- Voucher-based accounting system
- Income and expense vouchers
- Payment receipt vouchers
- TallyPrime-compatible XML export for accountant handoff
- Date-range export
- Chart of accounts (configurable heads)
- Ledger view per account head
- Cash/bank balance tracking

---

## 20. Doctor & Referral Management

- Full doctor/referral source directory
- Fields: name, specialization, phone, email, address, registration number
- Per-doctor default commission: flat or percentage
- Active/inactive status
- Doctor detail page with referral history and commission summary
- Doctors appear in Billing Desk referring-doctor dropdown
- Doctors appear on printed bills

---

## 21. Referral Commission System

Super-admin exclusive module.

### Commission Rules
- Rule types: percentage of test price, flat amount per test
- Rule scope:
  - Specific tests (by test ID)
  - Test categories
  - All tests (catch-all)
- Exclusive rules: override all other rules when matched
- Active/inactive per rule
- Multiple rules per doctor; priority order: exclusive test → exclusive category → non-exclusive test → non-exclusive category → catch-all → doctor default

### Commission Reports
Two report endpoints:

**Consolidated report** (`/report`):
- Per-doctor: total revenue, total commission, order count
- Discount-aware breakdown: separate totals for full-price vs discounted orders
- Date range filter, doctor filter

**Detailed report** (`/report-detailed`):
- Group by: test, category, or order
- Per-test: commission amount, rule applied, revenue
- Per-category: test count, order count, revenue, commission
- Per-order: drill-down into individual tests
- Grand totals across all doctors

**Key accuracy guarantee (May 2026):** Cancelled tests are excluded from all commission calculations — both endpoints filter `order_tests` with `status != 'cancelled'` at the DB query level.

---

## 22. Doctor Dues & Ledger

Super-admin exclusive module.

- Track amounts owed to referring doctors (commission payable)
- Record commission payments made to doctors
- Ledger view per doctor: running balance of dues vs payments
- Doctor payout records with date, amount, payment mode, notes

---

## 23. Discounts & Discount Reasons

- Configurable discount presets (e.g. "Senior Citizen — 10%", "Staff — 20%")
- Discount reasons list (mandatory selection when applying a discount during billing)
- Per-user maximum discount cap (set in Staff settings, enforced server-side)
- All discounts logged to bill audit trail with reason

---

## 24. Staff Management

### Staff Directory
- Full user/staff list with role badges
- Roles: `super_admin`, `admin`, `manager`, `accountant`, `billing`, `lab`, `receptionist`
- Per-user fields: name, email, username, role, PIN, photo
- `mustChangePin` flag: force PIN change on next login
- Active/inactive control

### Permissions
- Granular module-level permissions per user
- Configurable from Settings: check/uncheck which ERP modules a user can access
- Navigation automatically filters to permitted routes on login
- Per-user maximum discount limit

### Fingerprint / Biometric Kiosk
- WebAuthn (FIDO2) credential enrollment per staff member
- Fingerprint reader integration via local bridge service (`bridge-service`)
- Bridge runs on localhost on the workstation; communicates with the ERP API over a shared secret
- Staff can clock in/out or authenticate using fingerprint
- Biometric templates stored server-side; bridge only passes assertion responses

### PIN Authentication
- Staff login via email (or username) + PIN
- Session token stored in localStorage
- `readStaffSession()` / `writeStaffSession()` helpers in frontend
- Automatic redirect to login on 401
- `mustChangePin` flow: forced redirect to change-PIN screen before any other action

---

## 25. Dashboard & Daily Summary

### Dashboard (`/erp/dashboard`)
- KPI cards: Today's revenue, patients, bills, pending reports, outstanding dues, low-stock items
- Revenue bar chart (configurable date range)
- Popular tests list
- Recent bills and recent appointments
- Low-stock inventory alerts
- Quick-action buttons (New Bill, New Patient, New Appointment)

### Daily Summary (`/erp/daily-summary`)
- Per-day breakdown: collections by payment method, total billed, discounts given
- Test-wise revenue table
- Doctor-wise referrals for the day
- Expense summary
- Designed to be printed or exported as a daily report for the center manager

---

## 26. Patient Portal

Public-facing portal at `/erp/portal` — no ERP login required.

### Patient Login
- Login by phone number + portal PIN
- PIN set/reset by reception staff from the Patient detail page
- Session token stored in memory (not persisted across page refresh for security)

### Patient Dashboard
- Personal details (name, ID, DOB, phone, email)
- All visits summary with dates and amounts
- All bills: view details, download/print
- All reports: view, download, share link
- All appointments: upcoming and past
- Optional: book a new appointment (if enabled in Portal Settings)
- Optional: edit profile (if enabled in Portal Settings)

### Staff Login from Portal
- Staff can log in via the portal landing to access the ERP directly
- After staff login, redirected to first permitted ERP module

### Portal Settings (configurable from ERP Settings)
- Enable/disable the portal entirely
- Customise heading, welcome message, center name, tagline
- Show/hide address, phone, email, logo
- Toggle: allow appointment booking from portal
- Toggle: allow patients to edit their profile

---

## 27. Display Board (Token Screen)

- Separate full-screen view at `/erp/display`
- Designed to run on a wall-mounted TV in the waiting area
- Shows: current token being served per department
- Token displayed in large text with department name
- Auto-refreshes; no login required (public read)
- Clinic name and branding shown

---

## 28. Website Builder & Public Clinic Site

### Website Builder (ERP module at `/erp/website`)
- In-ERP editor for the public clinic website content
- Sections manageable: Hero, About, Services, Doctors, Gallery, Contact, Custom HTML
- Popup/announcement manager: create timed or permanent pop-ups shown on the public site
- Page manager: add/edit/delete custom pages with rich HTML content
- Publish-state gating: content only served publicly after it is published
- HTML sanitization on all user-supplied HTML before storage
- Custom `<head>` injection (for analytics tags, etc.)
- Logo and branding upload
- SEO fields: meta title, meta description per page

### Public Clinic Site (`/`)
- Served from the `clinic-site` Vite artifact
- Dynamically fetches content from `/api/website/settings`, `/api/website/pages`, `/api/website/popups`
- Online booking form embedded
- Responsive layout for mobile and desktop
- Dark/light mode support

---

## 29. Form F (PCPNDT Compliance)

- Form F is the mandatory pre-test form for ultrasound procedures under India's PCPNDT Act
- ERP module at `/erp/form-f`
- Captures all required fields: patient details, indication, husband's name, declaration
- Linked to specific orders/patients
- Printable in the prescribed legal format
- Records the conducting doctor and date

---

## 30. Machines & Maintenance

- Equipment register for all diagnostic machines
- Fields: machine name, model, serial number, manufacturer, purchase date, warranty expiry, AMC details
- Maintenance log per machine: service date, type (preventive/corrective), notes, engineer, cost
- AMC expiry alerts
- Active/inactive status

---

## 31. HR Forms

- Store and manage HR-related documents and forms per staff member
- Form templates configurable
- Linked to staff user records

---

## 32. Samples Module

- Track physical sample collection and dispatch
- Sample types, collection time, status (collected, dispatched to lab, result received)
- Links to order and patient
- Relevant for outsourced tests — track when sample was sent to external lab

---

## 33. AI Features

Powered by Google Gemini REST API (via Replit AI Integrations proxy — no direct API key management needed).

### Clinical Note Generation
- From a set of test parameters and values, generate a clinical narrative impression
- Used in the Report Generator to auto-draft the "Impression" field

### Billing Insights
- Analyze a patient's billing history to suggest relevant packages or tests
- Summarize cost vs typical range

### Patient Communication Drafting
- Draft an email or WhatsApp message to a patient about their results, appointment reminders, or payment dues

### All AI calls are:
- Gated behind staff authentication
- Rate-limited to prevent abuse
- Results editable before use — AI output is a draft, not final

---

## 34. WhatsApp Integration

- Send WhatsApp messages to patients directly from the ERP
- Message templates: bill ready, report ready, appointment reminder, payment due
- Integration via configurable WhatsApp API settings (provider-agnostic)
- WhatsApp settings writes require explicit permission (permission-gated endpoint)
- Phone number formatting helper for Indian mobile numbers

---

## 35. Email Notifications

- Powered by Nodemailer
- SMTP configured from Settings (host, port, user, password, secure flag, from name/address)
- Configurable recipients: admin email + extra recipients (comma-separated)

### Notification Types
- **Bill edited**: email sent to admin when a bill is modified (discount change, super-edit)
- **Bill reprint**: email sent when a bill is reprinted
- **Daily summary**: scheduled daily email with the day's revenue, patient count, and collection summary
  - Time configurable from Settings
  - Sent by `node-cron` scheduler (requires `ENABLE_SCHEDULERS=1`)
- Test SMTP connection button in Settings

---

## 36. Settings & Configuration

The Settings page (`/erp/settings`) is the control center for all clinic configuration.

### Clinic Branding
- Clinic name, tagline, address, phone, email, website, GSTIN
- Logo upload (stored as base64 data URL)
- Footer note for bill printouts
- Show TAT (turnaround time) on bill: toggle
- All clinic details pulled from a single `/api/clinic-settings` endpoint — changes propagate to all surfaces (sidebar, bills, display, portal, website)

### Users & Roles
- Add, edit, deactivate staff users
- Set role and granular permissions per user
- Set/reset PIN
- Set maximum discount limit per user
- Photo upload per user
- `mustChangePin` flag management

### Email Settings
- Full SMTP configuration
- Toggle bill-edit and daily-summary email notifications
- Daily summary time picker
- Test connection button

### WhatsApp Settings
- API endpoint, token, sender number
- Message template customization

### Printer Settings
- Default paper size (A4 / A5) for bill receipts
- Stored per-browser in localStorage, also configurable globally

### Discount Reasons
- Manage the list of selectable discount reasons shown during billing

### Branches
- Multi-branch data model support
- Branch name and details (data model exists; UI for branch-scoped reporting extensible)

### Departments
- Configurable department list used for queue routing and staff assignment

### Portal Settings
- Enable/disable patient portal
- Customise all portal-facing strings and toggles (see Patient Portal section)

### Backup
- On-demand database backup download
- Backup log (history of backup operations)
- System update upload (upload a new build package)

### DICOM / PACS Settings
- Manage DICOM AE nodes from within Settings

### In-app Manual
- Built-in user manual sections accessible from Settings
- Covers all major modules with bullet-point guidance

---

## 37. Super-Admin Portal

A separate application at `/super-admin-portal`, isolated from the main ERP.

### Access Control — USB Pen-Drive Gate
- Physical USB pen drive required containing a file `superadmin.key`
- File content must match `SUPER_ADMIN_USB_KEY` environment secret
- Both the portal and the main ERP billing UI respect this gate
- **ERP billing UI auto-detect**: a hidden `Ctrl+Alt+U` keyboard shortcut opens a one-time pairing dialog
  - Pairs with the USB drive using the File System Access API (Chrome/Edge)
  - Firefox/Safari fall back to a manual file picker
  - Paired drive remembered in IndexedDB
  - App silently re-reads `superadmin.key` every 4 seconds
  - "Super Admin" link appears/disappears in sidebar as drive is plugged/unplugged
- USB key stored in `sessionStorage` (cleared when the tab is closed)
- When `SUPER_ADMIN_USB_KEY` is unset, gate is bypassed with a startup warning (back-compat mode)

### Super-Admin Features
- **Bill delete**: permanently delete any bill with reason (irreversible; USB + PIN required)
- **Bill renumber**: change a bill's number (handles both new `YYYYMM####` and legacy `BILL-YYYYMM-####` formats)
- **Super-edit bill**: directly modify subtotal, discount, tax on any bill
- **Commission reports**: view full referral commission data (also accessible to super-admin from ERP)
- **Doctor dues**: manage what is owed to referring doctors
- **Audit trail access**: full read access to all bill audit logs

---

## 38. Security Architecture

### Authentication
- Staff: email/username + PIN → bearer token (JWT-like session token)
- Patient portal: phone + PIN → separate portal session token
- Super-admin: USB key + PIN → short-lived super-admin session token
- Bridge service: shared secret (`ERP_BRIDGE_SECRET`) in Authorization header

### Authorization
- Route-level middleware: `requireStaffAuth`, `requireSuperAdmin`, `requireSuperAdminUsb`
- Granular permissions checked per request for sensitive operations
- Patient data scoped to authenticated patient's own records
- `portalPinHash` always sanitized out of API responses (replaced with boolean `hasPortalAccess`)

### Input Validation
- All request bodies validated with Zod schemas before processing
- Server-side recalculation of all financial values — client subtotals are never trusted
- Discount capped server-side at subtotal
- Mass-assignment protection: only explicitly listed fields writable in UPDATE operations

### File & Upload Security
- Uploaded files served from `/uploads/` static path
- File type validation on upload
- Path traversal protection
- Website HTML content sanitized before storage and serving

### SSRF Protection
- `tcpProbe` helper validates DICOM node host/port before forwarding
- External URL/webhook inputs validated and restricted
- Gemini API calls proxied through Replit's AI Integrations proxy (no direct API key in code)

### Rate Limiting
- USB key verification endpoint: 20 attempts per 15 minutes
- Portal login: rate-limited
- AI endpoints: rate-limited

### Audit Trail
- Every bill modification creates an immutable `bill_audits` record with: actor, reason, change type, old value, new value, timestamp
- Change types include: discount-edit, status-edit, super-edit, test-cancelled, reprint, cancel, refund

---

## 39. Deployment & Infrastructure

### Production Deployment
- **Platform**: Replit Reserved VM (`deploymentTarget = "vm"`)
- **Single-process model**: one Express server serves the API plus all three SPA static builds
- **Build script**: `artifacts/api-server/scripts/build-deploy.mjs` bundles API with esbuild and builds all frontend Vite apps, outputs to `dist/web/`
- **Static serving**: activated when `SERVE_STATIC_DIR=artifacts/api-server/dist/web` is set
- **Geography**: India region (low-latency for Deoghar)

### Required Production Environment Variables
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Token signing secret |
| `SUPER_ADMIN_USB_KEY` | Content of the physical USB key file |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Gemini API (via Replit proxy) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini base URL |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | File storage bucket |
| `PRIVATE_OBJECT_DIR` | Private storage path |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public storage paths |
| `ENABLE_SCHEDULERS=1` | Enable node-cron email schedulers |
| `NODE_ENV=production` | Production mode |
| `SERVE_STATIC_DIR` | Path to built SPA files |

### Database Migrations
- No drizzle-kit migration pipeline in production
- Schema changes applied via `runStartupMigrations()` in `api-server/src/index.ts`
- Idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` SQL
- Runs every startup; safe to re-run; logs "Startup migrations applied"

---

## 40. Changelog of Major Builds

This section records significant features as they were built.

| Date | Feature |
|---|---|
| Initial | Core ERP: patients, orders, billing, tests, reports, payments, staff, settings |
| Early | Doctor & referral management |
| Early | Inventory & vendor management |
| Early | Accounting with TallyPrime export |
| Early | Appointment scheduler (day-view) |
| Early | Patient portal (phone + PIN login) |
| Early | Queue token system + display board |
| Early | Report Generator with templates, signatures, parameters |
| Early | Report Hub with share links, verification workflow |
| Early | PACS viewer and DICOM node management |
| Early | Website Builder + public clinic site |
| Early | Form F (PCPNDT) compliance module |
| Early | AI features (Gemini): clinical notes, billing insights, patient comms |
| Early | Email notifications: bill-edit alerts, daily summary (node-cron) |
| Early | WebAuthn fingerprint kiosk for staff (bridge service) |
| Early | Super-admin portal with USB pen-drive gate |
| Early | Referral commission rules and reports |
| Early | Doctor dues & ledger |
| Early | Discount reasons, per-user discount caps |
| Early | Radiology workflow: worklist, status flow, teleradiology |
| Early | Machines & maintenance log |
| Early | HR Forms module |
| Early | Samples tracking module |
| Early | Online bookings (public form + ERP intake) |
| Early | Expenses module |
| Early | Daily summary page |
| Early | Multi-branch data model |
| Early | Departments configuration |
| Early | Clinic branding centralization (single settings source for all surfaces) |
| Early | Bill number format changed to pure-numeric `YYYYMM####` (legacy format still parsed) |
| May 2026 | URL swap: clinic-site promoted to `/`, ERP moved to `/erp` |
| May 2026 | Outsourced Labs: new table, CRUD page, sidebar nav entry |
| May 2026 | Test type split: inhouse vs outsourced flag on each test; lab association |
| May 2026 | Partial test cancellation: cancel individual tests from a bill without voiding the whole bill |
| May 2026 | Cancelled tests excluded from referral commission calculations in both report endpoints |

---

*This document is generated from the live codebase and reflects all features as of May 2026.*
