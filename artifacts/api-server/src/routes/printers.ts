import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { printerSettingsTable } from "@workspace/db/schema";

export const printersRouter: IRouter = Router();

async function getOrCreateSettings() {
  const [row] = await db.select().from(printerSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(printerSettingsTable).values({}).returning();
  return created;
}

printersRouter.get("/settings", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json(s);
});

printersRouter.put("/settings", async (req, res) => {
  const current = await getOrCreateSettings();
  const body = req.body ?? {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.billPrinter === "string") updates.billPrinter = body.billPrinter.trim();
  if (typeof body.billPrinterType === "string" && ["color", "bw"].includes(body.billPrinterType)) updates.billPrinterType = body.billPrinterType;
  if (typeof body.barcodePrinter === "string") updates.barcodePrinter = body.barcodePrinter.trim();
  if (typeof body.tokenPrinter === "string") updates.tokenPrinter = body.tokenPrinter.trim();
  if (typeof body.tokenPrinterType === "string" && ["color", "bw"].includes(body.tokenPrinterType)) updates.tokenPrinterType = body.tokenPrinterType;
  const [row] = await db.update(printerSettingsTable).set(updates).where({ id: current.id } as never).returning();
  res.json(row);
});

export default printersRouter;