# Overview

This pnpm monorepo, built with TypeScript, provides a comprehensive Diagnostic ERP system. Its purpose is to streamline operations for diagnostic centers, covering patient management, billing, lab operations, inventory, accounting, and AI-driven insights. The system supports both web and self-contained Windows desktop applications. The business vision is to modernize diagnostic center workflows, improve efficiency, and elevate patient care through intelligent automation.

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
-   **Validation**: Zod, `drizzle-zod`
-   **API codegen**: Orval (from OpenAPI spec)
-   **Build**: esbuild (CJS bundle)

## UI/UX Decisions

The system features a unified single-page billing workflow, customizable quick test slots, and a modern dashboard. Key UI/UX elements include patient photo capture, a comprehensive report generator with auto-flagging and voice readout, a PACS viewer, a day-view appointment scheduler, WebAuthn-powered fingerprint kiosk for staff, and mobile-friendly patient and staff portals.

## Technical Implementations

The API server uses Express 5. The database schema is managed with Drizzle ORM. AI integration leverages the Gemini REST API for clinical note generation, billing insights, and patient communication. Email notifications are powered by Nodemailer and `node-cron`. In-process schedulers are gated behind `ENABLE_SCHEDULERS=1` for execution on always-on hosts, with API endpoints available for cloud-based scheduled deployments. The system is designed for cross-platform compatibility (Windows, macOS, Linux) and supports Dockerized deployment. Security features include SSRF-guarded `tcpProbe` and bearer token authentication. All API endpoints returning patient data sanitize `portalPinHash` to `hasPortalAccess`. Server-side validation is implemented for billing amounts, including discounts and payments, and DICOM SSRF hardening. Biometric capture and enrollment flows are secured with token validation and role-based authorization. WhatsApp settings writes are permission-gated.

### Super-Admin USB Pen-Drive Gate

The super-admin surface is gated by a physical USB pen drive containing `superadmin.key`, whose content must match the `SUPER_ADMIN_USB_KEY` environment secret. Implemented in `artifacts/api-server/src/middleware/requireSuperAdminUsb.ts` and applied to `POST /api/super-admin/login`, all `requireSuperAdmin`-protected routes, and the super-admin bill mutations (`PATCH /api/bills/:id/super-edit`, `DELETE /api/bills/:id`) for defense-in-depth. Public endpoints `GET /api/super-admin/usb/status` and `POST /api/super-admin/usb/verify` (rate-limited) let the UI verify a key file. **Billing UI auto-detect (`artifacts/diagnostic-erp/src/lib/usbKey.ts` + `Layout.tsx`)**: the sidebar shows ZERO USB-related affordance. A hidden Ctrl+Alt+U combo opens a one-time pairing dialog that uses the File System Access API to remember the pen-drive root in IndexedDB; from then on the app silently re-reads `superadmin.key` every 4s and the Super Admin link appears/disappears as the drive is plugged/unplugged. Firefox/Safari fall back to a manual file picker inside the same dialog. The super-admin-portal also shows a `UsbUnlockScreen` before its PIN login. The key is stashed in `sessionStorage` (dies with the tab). When `SUPER_ADMIN_USB_KEY` is unset, the gate is bypassed with a startup warning (back-compat). See `PEN_DRIVE_SETUP.md` for operator instructions.

## Feature Specifications

The ERP system includes modules for Dashboard, Patient Management, Orders, Test Catalog, Billing, Payments, Doctors, Reports (with AI Insights), Inventory, Referrals, Accounting (TallyPrime export), PACS Viewer, Appointments, Staff Management, and Settings.
Key features:
-   **Billing Desk**: Unified workflow for patient search, registration, test catalog, package quick-add, discounts, payments, and bill generation with per-test queue tokens.
-   **Report Generation Hub**: Centralized system for pathology and radiology reports with inline parameter entry, templates, signature management, verification, and sharing options.
-   **Website Builder & Public Clinic Site**: An ERP module for designing and publishing the clinic's public website, with content served dynamically and security measures including publish-state gating and HTML sanitization.
-   **Vendor Management (Inventory)**: Manages suppliers with contact details, GSTIN, payment terms, and tracks purchase history.
-   **Radiology Workflow**: End-to-end imaging workflow with worklist, reporting queue, and film/CD issuance.
-   **AI Features**: Clinical note generation, billing insights, and patient communication drafting.
-   **Patient Portal**: Public-facing portal for patients to view bills, visits, reports, and book appointments.
-   **Staff Portal**: Staff login for accessing the main ERP.
-   **Compliance**: Referral commission features and doctor due/payment ledgers are super-admin exclusive.
-   **Admin Tools**: Machine/Maintenance module, Master Settings, and Clinic Branding Centralization.

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