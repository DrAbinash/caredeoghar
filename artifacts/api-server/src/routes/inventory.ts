import { Router } from "express";
import { db } from "@workspace/db";
import {
  inventoryItemsTable,
  inventoryTransactionsTable,
  inventoryConsumptionRulesTable,
  testsTable,
} from "@workspace/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";

const router = Router();

// List all inventory items
router.get("/", async (_req, res) => {
  const items = await db
    .select()
    .from(inventoryItemsTable)
    .orderBy(inventoryItemsTable.name);
  res.json(items.map(toNum));
});

// Low stock items
router.get("/low-stock", async (_req, res) => {
  const rows = await db
    .select()
    .from(inventoryItemsTable)
    .where(
      and(
        eq(inventoryItemsTable.isActive, true),
        lt(inventoryItemsTable.currentStock, inventoryItemsTable.minStock)
      )
    );
  res.json(rows.map(toNum));
});

// Create item
router.post("/", async (req, res) => {
  const { name, unit, category, currentStock, minStock, costPrice } = req.body;
  const [item] = await db
    .insert(inventoryItemsTable)
    .values({ name, unit, category: category || "consumable", currentStock: currentStock?.toString() || "0", minStock: minStock?.toString() || "0", costPrice: costPrice?.toString() || "0" })
    .returning();
  res.status(201).json(toNum(item));
});

// Update item
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const allowed = ["name", "unit", "category", "minStock", "costPrice", "isActive"];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      updates[k] = ["minStock", "costPrice"].includes(k) ? req.body[k].toString() : req.body[k];
    }
  }
  const [item] = await db.update(inventoryItemsTable).set(updates).where(eq(inventoryItemsTable.id, id)).returning();
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(toNum(item));
});

// Stock in
router.post("/:id/stock-in", async (req, res) => {
  const id = Number(req.params.id);
  const { quantity, reason, reference, performedBy } = req.body;
  const qty = Number(quantity);
  const [existing] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Item not found" });
  const before = Number(existing.currentStock);
  const after = before + qty;
  await db.update(inventoryItemsTable).set({ currentStock: after.toString() }).where(eq(inventoryItemsTable.id, id));
  const [txn] = await db.insert(inventoryTransactionsTable).values({
    itemId: id, type: "in", quantity: qty.toString(), stockBefore: before.toString(), stockAfter: after.toString(),
    reason, reference, performedBy,
  }).returning();
  res.status(201).json({ transaction: txn, newStock: after });
});

// Stock out
router.post("/:id/stock-out", async (req, res) => {
  const id = Number(req.params.id);
  const { quantity, reason, reference, performedBy } = req.body;
  const qty = Number(quantity);
  const [existing] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Item not found" });
  const before = Number(existing.currentStock);
  if (before < qty) return res.status(400).json({ error: "Insufficient stock" });
  const after = before - qty;
  await db.update(inventoryItemsTable).set({ currentStock: after.toString() }).where(eq(inventoryItemsTable.id, id));
  const [txn] = await db.insert(inventoryTransactionsTable).values({
    itemId: id, type: "out", quantity: qty.toString(), stockBefore: before.toString(), stockAfter: after.toString(),
    reason, reference, performedBy,
  }).returning();
  res.status(201).json({ transaction: txn, newStock: after });
});

// Stock adjustment
router.post("/:id/adjust", async (req, res) => {
  const id = Number(req.params.id);
  const { newQuantity, reason, performedBy } = req.body;
  const target = Number(newQuantity);
  const [existing] = await db.select().from(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Item not found" });
  const before = Number(existing.currentStock);
  await db.update(inventoryItemsTable).set({ currentStock: target.toString() }).where(eq(inventoryItemsTable.id, id));
  await db.insert(inventoryTransactionsTable).values({
    itemId: id, type: "adjustment", quantity: (target - before).toString(),
    stockBefore: before.toString(), stockAfter: target.toString(), reason, performedBy,
  });
  res.json({ newStock: target });
});

// Transaction history for an item
router.get("/:id/history", async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(inventoryTransactionsTable)
    .where(eq(inventoryTransactionsTable.itemId, id))
    .orderBy(desc(inventoryTransactionsTable.createdAt));
  res.json(rows);
});

// Consumption rules
router.get("/consumption-rules", async (_req, res) => {
  const rows = await db
    .select({
      id: inventoryConsumptionRulesTable.id,
      testId: inventoryConsumptionRulesTable.testId,
      itemId: inventoryConsumptionRulesTable.itemId,
      quantity: inventoryConsumptionRulesTable.quantity,
      testName: testsTable.name,
      itemName: inventoryItemsTable.name,
      itemUnit: inventoryItemsTable.unit,
    })
    .from(inventoryConsumptionRulesTable)
    .leftJoin(testsTable, eq(inventoryConsumptionRulesTable.testId, testsTable.id))
    .leftJoin(inventoryItemsTable, eq(inventoryConsumptionRulesTable.itemId, inventoryItemsTable.id));
  res.json(rows);
});

router.post("/consumption-rules", async (req, res) => {
  const { testId, itemId, quantity } = req.body;
  const [rule] = await db
    .insert(inventoryConsumptionRulesTable)
    .values({ testId: Number(testId), itemId: Number(itemId), quantity: quantity?.toString() || "1" })
    .returning();
  res.status(201).json(rule);
});

router.delete("/consumption-rules/:id", async (req, res) => {
  await db.delete(inventoryConsumptionRulesTable).where(eq(inventoryConsumptionRulesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

function toNum(item: Record<string, unknown>) {
  return {
    ...item,
    currentStock: Number(item.currentStock),
    minStock: Number(item.minStock),
    costPrice: Number(item.costPrice),
  };
}

export default router;
