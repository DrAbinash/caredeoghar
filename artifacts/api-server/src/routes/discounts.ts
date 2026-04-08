import { Router } from "express";
import { db } from "@workspace/db";
import { discountRulesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rules = await db.select().from(discountRulesTable).orderBy(discountRulesTable.createdAt);
  res.json(rules.map(r => ({
    ...r,
    value: Number(r.value),
    categories: JSON.parse(r.categories || "[]"),
    testIds: JSON.parse(r.testIds || "[]"),
  })));
});

router.post("/", async (req, res) => {
  const { name, type, value, scope, categories, testIds, expiresAt, reason } = req.body;
  if (!name || !type || value === undefined) {
    res.status(400).json({ error: "name, type and value are required" });
    return;
  }
  const [rule] = await db.insert(discountRulesTable).values({
    name,
    type,
    value: String(value),
    scope: scope ?? "all",
    categories: JSON.stringify(categories ?? []),
    testIds: JSON.stringify(testIds ?? []),
    expiresAt: expiresAt || null,
    reason: reason || null,
  }).returning();
  res.status(201).json({ ...rule, value: Number(rule.value), categories: JSON.parse(rule.categories), testIds: JSON.parse(rule.testIds) });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, type, value, scope, categories, testIds, expiresAt, reason, isActive } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (value !== undefined) updates.value = String(value);
  if (scope !== undefined) updates.scope = scope;
  if (categories !== undefined) updates.categories = JSON.stringify(categories);
  if (testIds !== undefined) updates.testIds = JSON.stringify(testIds);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt || null;
  if (reason !== undefined) updates.reason = reason;
  if (isActive !== undefined) updates.isActive = isActive;
  const [updated] = await db.update(discountRulesTable).set(updates).where(eq(discountRulesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, value: Number(updated.value), categories: JSON.parse(updated.categories), testIds: JSON.parse(updated.testIds) });
});

router.delete("/:id", async (req, res) => {
  await db.delete(discountRulesTable).where(eq(discountRulesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// Compute applicable discount for a list of tests/amounts
router.post("/apply", async (req, res) => {
  const { tests, maxAllowed } = req.body as {
    tests: { testId: number; category: string; price: number }[];
    maxAllowed?: number; // user's max discount %
  };
  const now = new Date().toISOString().split("T")[0];
  const rules = await db.select().from(discountRulesTable)
    .where(eq(discountRulesTable.isActive, true));

  const activeRules = rules.filter(r => !r.expiresAt || r.expiresAt >= now);
  const subtotal = tests.reduce((s, t) => s + t.price, 0);

  let bestDiscount = 0;
  let bestRule: (typeof rules[0]) | null = null;

  for (const rule of activeRules) {
    const categories: string[] = JSON.parse(rule.categories || "[]");
    const testIds: number[] = JSON.parse(rule.testIds || "[]");

    let applicable = false;
    if (rule.scope === "all") applicable = true;
    else if (rule.scope === "category") applicable = tests.some(t => categories.includes(t.category));
    else if (rule.scope === "test") applicable = tests.some(t => testIds.includes(t.testId));

    if (!applicable) continue;

    let discountAmt = 0;
    if (rule.type === "percentage") discountAmt = (subtotal * Number(rule.value)) / 100;
    else discountAmt = Number(rule.value);

    // Apply user max discount cap
    if (maxAllowed !== undefined) {
      const maxDiscountAmt = (subtotal * maxAllowed) / 100;
      discountAmt = Math.min(discountAmt, maxDiscountAmt);
    }

    if (discountAmt > bestDiscount) {
      bestDiscount = discountAmt;
      bestRule = rule;
    }
  }

  res.json({
    discount: Math.round(bestDiscount * 100) / 100,
    rule: bestRule ? { id: bestRule.id, name: bestRule.name, reason: bestRule.reason } : null,
  });
});

export default router;
