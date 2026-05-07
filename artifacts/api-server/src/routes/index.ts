import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { patientsRouter } from "./patients";
import { doctorsRouter } from "./doctors";
import { testsRouter } from "./tests";
import { ordersRouter } from "./orders";
import { billsRouter, paymentsRouter } from "./bills";
import { reportsRouter } from "./reports";
import inventoryRouter from "./inventory";
import accountingRouter from "./accounting";
import commissionRouter from "./commission";
import usersRouter from "./users";
import emailSettingsRouter from "./email-settings";
import discountsRouter from "./discounts";
import aiRouter from "./ai";
import pacsRouter from "./pacs";
import dicomRouter from "./dicom";
import samplesRouter from "./samples";
import { superAdminRouter } from "./super-admin";
import { appointmentsRouter } from "./appointments";
import { packagesRouter } from "./packages";
import { expensesRouter } from "./expenses";
import discountReasonsRouter from "./discountReasons";
import testCategoriesRouter from "./testCategories";
import clinicSettingsRouter from "./clinicSettings";
import { ledgersRouter } from "./ledgers";
import { tokensRouter } from "./tokens";
import { testTokensRouter } from "./test-tokens";
import { radiologyRouter } from "./radiology";
import displayRouter from "./display";
import { whatsappRouter } from "./whatsapp";
import { printersRouter } from "./printers";
import { staffRouter } from "./staff";
import hrFormsRouter, { staffScopedHrFormsHandler } from "./hr-forms";
import storageRouter from "./storage";
import { bridgeRouter } from "./bridge";
import { reportTemplatesRouter } from "./report-templates";
import { abnormalFindingsRouter } from "./abnormal-findings";
import formFRouter from "./form-f";
import { portalRouter } from "./portal";
import { patientReportsRouter, signaturesRouter, publicReportsRouter } from "./patient-reports";
import { teleradiologyRouter } from "./teleradiology";
import { doctorLedgerRouter } from "./doctor-ledger";
import { machinesRouter } from "./machines";
import { departmentsRouter } from "./departments";
import { branchesRouter } from "./branches";
import { backupRouter } from "./backup";
import { vendorsRouter } from "./vendors";
import { websiteRouter } from "./website";
import { systemRouter } from "./system";
import internalCronRouter from "./internal-cron";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { requireStaffAuth, requireStaffPermission } from "../middleware/requireStaffAuth";

const router: IRouter = Router();

// ─── Public / unauthenticated routes ─────────────────────────────────────────
router.use(healthRouter);
// Internal cron trigger endpoints — auth via CRON_SECRET bearer token, not staff session.
// Hit by a Replit Scheduled deployment (see scripts/src/trigger-cron.ts) so cron emails
// keep firing on autoscale where in-process schedulers are disabled.
router.use("/internal/cron", internalCronRouter);
router.use("/super-admin", superAdminRouter);
router.use("/portal", portalRouter);
router.use("/display", displayRouter);
router.use("/bridge", bridgeRouter);
// Public tokenized PDF download for patient WhatsApp links — no staff auth.
router.use("/p/r", publicReportsRouter);
// Public tele-radiology share viewer (token-gated) — no staff auth.
router.use("/teleradiology", teleradiologyRouter);

// Website router: GET endpoints are intentionally public so the clinic-site
// frontend can fetch settings/pages/faqs/photos/popups without credentials.
// Mutating endpoints inside websiteRouter each apply requireStaffAuth directly.
// Must be mounted here (above the pathless storage middleware) so that
// unauthenticated public requests are not intercepted by requireStaffAuth.
router.use("/website", websiteRouter);

// ─── Staff-authenticated ERP routes ──────────────────────────────────────────
// Each route requiring a module permission is gated with requireStaffPermission
// immediately after requireStaffAuth so that low-privilege staff cannot access
// modules they have not been granted, even by calling the API directly.

// Patient data — /patients permission
router.use("/patients", requireStaffAuth, requireStaffPermission("/patients"), patientsRouter);

// Doctor management — /doctors permission
router.use("/doctors", requireStaffAuth, requireStaffPermission("/doctors"), doctorsRouter);

// Test catalogue — /tests permission
router.use("/tests", requireStaffAuth, requireStaffPermission("/tests"), testsRouter);

// Order management — /orders permission
router.use("/orders", requireStaffAuth, requireStaffPermission("/orders"), ordersRouter);

// Billing — /billing permission (covers bill creation, edits, refunds, cancels)
router.use("/bills", requireStaffAuth, requireStaffPermission("/billing"), billsRouter);

// Payments — /payments permission
router.use("/payments", requireStaffAuth, requireStaffPermission("/payments"), paymentsRouter);

// Reports — /reports permission (covers dashboard, revenue, print reports)
router.use("/reports", requireStaffAuth, requireStaffPermission("/reports"), reportsRouter);

// Inventory — /inventory permission
router.use("/inventory", requireStaffAuth, requireStaffPermission("/inventory"), inventoryRouter);

// Accounting — /accounting permission (vouchers, accounts, ledger entries)
router.use("/accounting", requireStaffAuth, requireStaffPermission("/accounting"), accountingRouter);

// Discounts — /discounts permission
router.use("/discounts", requireStaffAuth, requireStaffPermission("/discounts"), discountsRouter);

// Discount reasons — /discounts permission (configuration for the discounts module)
router.use("/discount-reasons", requireStaffAuth, requireStaffPermission("/discounts"), discountReasonsRouter);

// Expenses — /accounting permission (financial records)
router.use("/expenses", requireStaffAuth, requireStaffPermission("/accounting"), expensesRouter);

// Ledgers — /accounting permission (multi-ledger configuration)
router.use("/ledgers", requireStaffAuth, requireStaffPermission("/accounting"), ledgersRouter);

// Staff HR & payroll — /settings permission (only settings-level users may
// read salary/bank details or post salary and advance records)
router.use("/staff", requireStaffAuth, requireStaffPermission("/settings"), staffRouter);

// HR re-joining / update forms — same /settings permission as staff records
router.use("/hr-forms", requireStaffAuth, requireStaffPermission("/settings"), hrFormsRouter);

// Object storage (presigned URL request + object serving). Today the only
// consumer is the HR re-joining form photo uploader, which contains PII
// (passport-sized employee photo). Gate both endpoints behind the same
// /settings permission as the HR form and staff records so a regular biller
// with an object URL cannot fetch employee photos.
router.use(requireStaffAuth, requireStaffPermission("/settings"), storageRouter);
// Staff-scoped HR forms listing (mounted on the /staff path so the StaffDetail
// dialog can fetch all forms for a single employee).
router.get(
  "/staff/:staffId/hr-forms",
  requireStaffAuth,
  requireStaffPermission("/settings"),
  staffScopedHrFormsHandler,
);

// Clinic configuration — any authenticated staff can READ (the bill print
// receipt and many other surfaces need clinic name/address/logo). Writes
// (PUT) stay restricted to /settings-permitted users via a method gate.
router.use(
  "/clinic-settings",
  requireStaffAuth,
  (req, res, next) => {
    if (req.method === "GET") return next();
    return requireStaffPermission("/settings")(req, res, next);
  },
  clinicSettingsRouter,
);
router.use("/email-settings", requireStaffAuth, requireStaffPermission("/settings"), emailSettingsRouter);
// Test categories: anyone with staff auth can READ the list (Test Catalog,
// Billing Desk, Reports filter all need it). Mutations stay admin-only via
// the /settings permission.
router.use(
  "/test-categories",
  requireStaffAuth,
  (req, res, next) => {
    if (req.method === "GET") return next();
    return requireStaffPermission("/settings")(req, res, next);
  },
  testCategoriesRouter,
);
router.use("/report-templates", requireStaffAuth, requireStaffPermission("/settings"), reportTemplatesRouter);
router.use("/abnormal-findings", requireStaffAuth, requireStaffPermission("/settings"), abnormalFindingsRouter);
router.use("/machines", requireStaffAuth, requireStaffPermission("/settings"), machinesRouter);
router.use("/departments", requireStaffAuth, requireStaffPermission("/settings"), departmentsRouter);
router.use("/branches", requireStaffAuth, requireStaffPermission("/settings"), branchesRouter);
router.use("/printers", requireStaffAuth, requireStaffPermission("/settings"), printersRouter);
router.use("/vendors", requireStaffAuth, requireStaffPermission("/settings"), vendorsRouter);

// DICOM / PACS — /dicom-nodes permission
router.use("/pacs", requireStaffAuth, requireStaffPermission("/dicom-nodes"), pacsRouter);
router.use("/dicom", requireStaffAuth, requireStaffPermission("/dicom-nodes"), dicomRouter);

// Radiology studies are tied to the orders workflow — /orders permission
router.use("/radiology", requireStaffAuth, requireStaffPermission("/orders"), radiologyRouter);

// Clinical report & compliance routes — /reports permission.
// These expose patient PHI (names, codes, phone, email, test details),
// clinician signature records, and compliance Form-F data. Restricting them
// to the /reports permission matches every other sensitive clinical module.
router.use("/form-f", requireStaffAuth, requireStaffPermission("/reports"), formFRouter);
router.use("/patient-reports", requireStaffAuth, requireStaffPermission("/reports"), patientReportsRouter);
router.use("/signatures", requireStaffAuth, requireStaffPermission("/reports"), signaturesRouter);

// AI endpoints — each sub-route applies its own requireStaffPermission matching
// the data domain it accesses (patients PHI, billing records, or radiology
// orders). requireStaffAuth here provides the outer authentication guard;
// per-route permission checks inside aiRouter enforce module-level access.
router.use("/ai", requireStaffAuth, aiRouter);

// ─── Unrestricted staff-authenticated routes ──────────────────────────────────
// These routes serve operational functions genuinely shared across all staff
// roles and do not expose sensitive module-specific data on their own.
router.use("/samples", requireStaffAuth, samplesRouter);
router.use("/appointments", requireStaffAuth, appointmentsRouter);
router.use("/packages", requireStaffAuth, packagesRouter);
router.use("/whatsapp", requireStaffAuth, whatsappRouter);
router.use("/tokens", requireStaffAuth, tokensRouter);
router.use("/test-tokens", requireStaffAuth, testTokensRouter);

// ─── Super-admin-only sensitive operational routes ────────────────────────────
router.use("/backup", requireSuperAdmin, backupRouter);
router.use("/system", requireSuperAdmin, systemRouter);

// ─── Super-admin-only routes ──────────────────────────────────────────────────
// User management lives under the regular ERP "Settings" surface — admins
// (and anyone else granted /settings) need to add staff and reset PINs
// without holding a super-admin session. The route stays inside the
// staff-auth fence so unauthenticated public callers still cannot touch it.
router.use("/users", requireStaffAuth, requireStaffPermission("/settings"), usersRouter);
router.use("/commission", requireSuperAdmin, commissionRouter);
router.use("/doctor-ledger", requireSuperAdmin, doctorLedgerRouter);

export default router;
