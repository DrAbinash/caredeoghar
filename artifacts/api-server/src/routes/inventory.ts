import { Router } from "express";
import { db } from "@workspace/db";
import {
  inventoryItemsTable,
  inventoryTransactionsTable,
  inventoryConsumptionRulesTable,
  testsTable,
} from "@workspace/db/schema";
import { eq, desc, lt, and, inArray } from "drizzle-orm";

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

// Replace ALL consumption rules for a single test in one atomic operation.
// Body shape:  { items: [ { itemId: number, quantity: number|string }, ... ] }
// An empty `items` array effectively clears the test's rules.
//
// We deliberately delete-then-insert inside a transaction (instead of trying
// to diff/upsert) because:
//   1. The dialog always sends the FULL desired list (it is a multi-item
//      editor, not a partial-patch endpoint), so a wholesale replace is
//      both simpler and matches the user's mental model.
//   2. The composite (testId,itemId) is not enforced as unique at the DB
//      level, so there is no `ON CONFLICT` shortcut available.
router.put("/consumption-rules/by-test/:testId", async (req, res) => {
  const testId = Number(req.params.testId);
  if (!Number.isFinite(testId) || testId <= 0) {
    return res.status(400).json({ error: "Invalid testId" });
  }

  // STRICT contract: `items` must be explicitly present AND an array.
  // We never coerce missing/null to []; that would let a malformed client
  // payload (e.g. `{}` or `{ items: null }`) silently wipe out every rule
  // for the test. The dialog always sends a real array, so a missing
  // field is always a client bug worth surfacing as a 400.
  if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, "items")) {
    return res.status(400).json({ error: "Missing required field: items" });
  }
  const rawItems = req.body.items;
  if (!Array.isArray(rawItems)) {
    return res.status(400).json({ error: "Field 'items' must be an array" });
  }

  // Validate / normalise input BEFORE touching the DB so a bad payload
  // can never leave a test with zero rules by mistake.
  const normalised: { itemId: number; quantity: string }[] = [];
  const seen = new Set<number>();
  for (const it of rawItems) {
    const itemId = Number(it?.itemId);
    const qty = Number(it?.quantity);
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return res.status(400).json({ error: `Invalid itemId: ${it?.itemId}` });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: `Quantity for item ${itemId} must be > 0` });
    }
    // Dedupe — if the user added the same item twice in the dialog, sum the
    // quantities rather than inserting two conflicting rows for the same test.
    if (seen.has(itemId)) {
      const existing = normalised.find((n) => n.itemId === itemId)!;
      existing.quantity = (Number(existing.quantity) + qty).toString();
    } else {
      seen.add(itemId);
      normalised.push({ itemId, quantity: qty.toString() });
    }
  }

  // Pre-check that the test and every item actually exist. This turns what
  // would otherwise be an opaque 500 (raw FK violation) into a clean 400
  // with a useful message — and avoids wasting a transaction round-trip.
  const [testExists] = await db
    .select({ id: testsTable.id })
    .from(testsTable)
    .where(eq(testsTable.id, testId))
    .limit(1);
  if (!testExists) return res.status(404).json({ error: `Test ${testId} not found` });

  if (normalised.length > 0) {
    const itemIds = normalised.map((n) => n.itemId);
    const found = await db
      .select({ id: inventoryItemsTable.id })
      .from(inventoryItemsTable)
      .where(inArray(inventoryItemsTable.id, itemIds));
    const foundSet = new Set(found.map((r) => r.id));
    const missing = itemIds.filter((id) => !foundSet.has(id));
    if (missing.length > 0) {
      return res
        .status(400)
        .json({ error: `Inventory item(s) not found: ${missing.join(", ")}` });
    }
  }

  const inserted = await db.transaction(async (tx) => {
    await tx
      .delete(inventoryConsumptionRulesTable)
      .where(eq(inventoryConsumptionRulesTable.testId, testId));
    if (normalised.length === 0) return [];
    return tx
      .insert(inventoryConsumptionRulesTable)
      .values(normalised.map((n) => ({ testId, itemId: n.itemId, quantity: n.quantity })))
      .returning();
  });

  res.json({ ok: true, count: inserted.length, rules: inserted });
});

// Delete every consumption rule for a given test.
router.delete("/consumption-rules/by-test/:testId", async (req, res) => {
  const testId = Number(req.params.testId);
  if (!Number.isFinite(testId) || testId <= 0) {
    return res.status(400).json({ error: "Invalid testId" });
  }
  await db
    .delete(inventoryConsumptionRulesTable)
    .where(eq(inventoryConsumptionRulesTable.testId, testId));
  res.json({ ok: true });
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
