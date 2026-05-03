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
import { bridgeRouter } from "./bridge";
import { reportTemplatesRouter } from "./report-templates";
import { abnormalFindingsRouter } from "./abnormal-findings";
import formFRouter from "./form-f";
import { portalRouter } from "./portal";
import { patientReportsRouter, signaturesRouter } from "./patient-reports";
import { doctorLedgerRouter } from "./doctor-ledger";
import { machinesRouter } from "./machines";
import { departmentsRouter } from "./departments";
import { branchesRouter } from "./branches";
import { backupRouter } from "./backup";
import { vendorsRouter } from "./vendors";
import { websiteRouter } from "./website";
import { systemRouter } from "./system";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import { requireStaffAuth } from "../middleware/requireStaffAuth";

const router: IRouter = Router();

// ─── Public / unauthenticated routes ─────────────────────────────────────────
router.use(healthRouter);
router.use("/super-admin", superAdminRouter);
router.use("/portal", portalRouter);
router.use("/display", displayRouter);
router.use("/bridge", bridgeRouter);

// ─── Staff-authenticated ERP routes ──────────────────────────────────────────
router.use("/patients", requireStaffAuth, patientsRouter);
router.use("/doctors", requireStaffAuth, doctorsRouter);
router.use("/tests", requireStaffAuth, testsRouter);
router.use("/orders", requireStaffAuth, ordersRouter);
router.use("/bills", requireStaffAuth, billsRouter);
router.use("/payments", requireStaffAuth, paymentsRouter);
router.use("/reports", requireStaffAuth, reportsRouter);
router.use("/inventory", requireStaffAuth, inventoryRouter);
router.use("/accounting", requireStaffAuth, accountingRouter);
router.use("/email-settings", requireStaffAuth, emailSettingsRouter);
router.use("/discounts", requireStaffAuth, discountsRouter);
router.use("/ai", requireStaffAuth, aiRouter);
router.use("/pacs", requireStaffAuth, pacsRouter);
router.use("/dicom", requireStaffAuth, dicomRouter);
router.use("/samples", requireStaffAuth, samplesRouter);
router.use("/appointments", requireStaffAuth, appointmentsRouter);
router.use("/packages", requireStaffAuth, packagesRouter);
router.use("/expenses", requireStaffAuth, expensesRouter);
router.use("/discount-reasons", requireStaffAuth, discountReasonsRouter);
router.use("/test-categories", requireStaffAuth, testCategoriesRouter);
router.use("/clinic-settings", requireStaffAuth, clinicSettingsRouter);
router.use("/ledgers", requireStaffAuth, ledgersRouter);
router.use("/tokens", requireStaffAuth, tokensRouter);
router.use("/test-tokens", requireStaffAuth, testTokensRouter);
router.use("/radiology", requireStaffAuth, radiologyRouter);
router.use("/whatsapp", requireStaffAuth, whatsappRouter);
router.use("/printers", requireStaffAuth, printersRouter);
router.use("/staff", requireStaffAuth, staffRouter);
router.use("/report-templates", requireStaffAuth, reportTemplatesRouter);
router.use("/abnormal-findings", requireStaffAuth, abnormalFindingsRouter);
router.use("/form-f", requireStaffAuth, formFRouter);
router.use("/patient-reports", requireStaffAuth, patientReportsRouter);
router.use("/signatures", requireStaffAuth, signaturesRouter);
router.use("/machines", requireStaffAuth, machinesRouter);
router.use("/departments", requireStaffAuth, departmentsRouter);
router.use("/branches", requireStaffAuth, branchesRouter);
router.use("/vendors", requireStaffAuth, vendorsRouter);
router.use("/website", requireStaffAuth, websiteRouter);

// ─── Super-admin-only sensitive operational routes ────────────────────────────
router.use("/backup", requireSuperAdmin, backupRouter);
router.use("/system", requireSuperAdmin, systemRouter);

// ─── Super-admin-only routes ──────────────────────────────────────────────────
router.use("/users", requireSuperAdmin, usersRouter);
router.use("/commission", requireSuperAdmin, commissionRouter);
router.use("/doctor-ledger", requireSuperAdmin, doctorLedgerRouter);

export default router;
