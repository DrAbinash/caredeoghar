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

The API server uses Express 5, capable of serving static frontends. The database schema is managed with Drizzle ORM. AI integration leverages the Gemini REST API for clinical note generation, billing insights, and patient communication. Email notifications are powered by Nodemailer and `node-cron`. The system is designed for cross-platform compatibility (Windows, macOS, Linux) and supports Dockerized deployment using `Dockerfile` and `docker-compose.yml`. Security features include SSRF-guarded `tcpProbe` and bearer token authentication.

## Feature Specifications

-   **Billing Desk**: Unified workflow for patient search, registration, test catalog, package quick-add, discounts, payments, and bill generation.
-   **Diagnostic ERP Modules**: Includes Dashboard, Patient Management, Orders, Test Catalog, Billing, Payments, Doctors, Reports (with AI Insights), Inventory, Referrals, Accounting (TallyPrime export), PACS Viewer, Appointments, Staff Management, and Settings.
-   **Per-Test Queue Tokens**: Manages unique queue numbers per billed test, preventing concurrent allocation and supporting VIP priority.
-   **Public LCD/TV Display**: A dedicated display route (`/display`) polls for queue updates, announces "Now serving," and shows privacy-trimmed patient labels.
-   **Tests with Department + Room**: Allows specification of department and room for tests, flowing into per-test tokens for routing.
-   **Configurable TAT on Bill**: Toggle to show Turn-Around-Time on printed bills.
-   **Dashboard Custom Date Range**: Provides income/expense KPIs and daily bar charts with configurable date ranges.
-   **Doctor Due / Payment Ledger**: Manages commissions earned and payouts for referring doctors with detailed ledger views and CSV export.
-   **Report Generation Hub**: Centralized system for pathology and radiology reports, including inline parameter entry, radiology typing templates, doctor/radiologist signature management, critical alert marking, two-person verification, A4 letterhead printing, and multiple sharing options (WhatsApp, Email, PDF, Print).
-   **Machine / Maintenance Module**: Manages the full lifecycle of diagnostic equipment, including AMC/CMC contracts, breakdowns, service/calibration records, calibration reminders, and downtime reports.
-   **Master Settings**: Includes management for Departments, Branches, Report Templates, and a master-data backup facility.
-   **Radiology Workflow**: End-to-end imaging workflow with worklist, reporting queue, and film/CD issuance, including modality worklist filtering, auto study fan-out, technician assignment, image/status tracking, and preliminary/final report stages.
-   **AI Features**: Clinical note generation, billing insights, and patient communication drafting.
-   **Patient Portal**: Public-facing portal for patients to view bills, visits, reports, and book appointments.
-   **Staff Portal**: Staff login for accessing the main ERP.

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