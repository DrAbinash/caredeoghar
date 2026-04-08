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

const router: IRouter = Router();

router.use(healthRouter);
router.use("/patients", patientsRouter);
router.use("/doctors", doctorsRouter);
router.use("/tests", testsRouter);
router.use("/orders", ordersRouter);
router.use("/bills", billsRouter);
router.use("/payments", paymentsRouter);
router.use("/reports", reportsRouter);
router.use("/inventory", inventoryRouter);
router.use("/accounting", accountingRouter);
router.use("/commission", commissionRouter);
router.use("/users", usersRouter);
router.use("/email-settings", emailSettingsRouter);

export default router;
