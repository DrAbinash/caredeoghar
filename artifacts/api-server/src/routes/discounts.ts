import { Router } from "express";
import { db } from "@workspace/db";
import { discountRulesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

type RuleCondition =
  | { type: "age_gte"; value: number }
  | { type: "age_lte"; value: number }
  | { type: "referral_doctor_id"; value: number };

function parseConditions(raw: string | null | undefined): RuleCondition[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function parseJson(raw: string | null | undefined): unknown[] {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

router.get("/", async (_req, res) => {
  const rules = await db.select().from(discountRulesTable).orderBy(discountRulesTable.createdAt);
  res.json(rules.map(r => ({
    ...r,
    value: Number(r.value),
    categories: parseJson(r.categories),
    testIds: parseJson(r.testIds),
    conditions: parseConditions(r.conditions),
  })));
});

router.post("/", async (req, res) => {
  const { name, type, value, scope, categories, testIds, expiresAt, reason, conditions } = req.body;
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
    conditions: JSON.stringify(conditions ?? []),
    expiresAt: expiresAt || null,
    reason: reason || null,
  }).returning();
  res.status(201).json({
    ...rule,
    value: Number(rule.value),
    categories: parseJson(rule.categories),
    testIds: parseJson(rule.testIds),
    conditions: parseConditions(rule.conditions),
  });
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, type, value, scope, categories, testIds, expiresAt, reason, isActive, conditions } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (value !== undefined) updates.value = String(value);
  if (scope !== undefined) updates.scope = scope;
  if (categories !== undefined) updates.categories = JSON.stringify(categories);
  if (testIds !== undefined) updates.testIds = JSON.stringify(testIds);
  if (conditions !== undefined) updates.conditions = JSON.stringify(conditions);
  if (expiresAt !== undefined) updates.expiresAt = expiresAt || null;
  if (reason !== undefined) updates.reason = reason;
  if (isActive !== undefined) updates.isActive = isActive;
  const [updated] = await db.update(discountRulesTable).set(updates).where(eq(discountRulesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...updated,
    value: Number(updated.value),
    categories: parseJson(updated.categories),
    testIds: parseJson(updated.testIds),
    conditions: parseConditions(updated.conditions),
  });
});

router.delete("/:id", async (req, res) => {
  await db.delete(discountRulesTable).where(eq(discountRulesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// Compute applicable discount for a list of tests/amounts,
// optionally filtered by patient age and referring doctor.
router.post("/apply", async (req, res) => {
  const {
    tests,
    maxAllowed,
    patientDob,
    doctorId,
  } = req.body as {
    tests: { testId: number; category: string; price: number }[];
    maxAllowed?: number;
    patientDob?: string | null;
    doctorId?: number | null;
  };

  const now = new Date().toISOString().split("T")[0];
  const rules = await db.select().from(discountRulesTable)
    .where(eq(discountRulesTable.isActive, true));

  const patientAge = ageFromDob(patientDob ?? null);
  const activeRules = rules.filter(r => !r.expiresAt || r.expiresAt >= now);
  const subtotal = (tests ?? []).reduce((s, t) => s + t.price, 0);

  let bestDiscount = 0;
  let bestRule: (typeof rules[0]) | null = null;

  for (const rule of activeRules) {
    const categories: string[] = parseJson(rule.categories) as string[];
    const testIds: number[] = parseJson(rule.testIds) as number[];
    const conditions = parseConditions(rule.conditions);

    // ── Scope check ──────────────────────────────────────────────
    let applicable = false;
    if (rule.scope === "all") applicable = true;
    else if (rule.scope === "category") applicable = (tests ?? []).some(t => categories.includes(t.category));
    else if (rule.scope === "test") applicable = (tests ?? []).some(t => testIds.includes(t.testId));
    if (!applicable) continue;

    // ── Conditions check (ALL must pass) ─────────────────────────
    let conditionsMet = true;
    for (const cond of conditions) {
      if (cond.type === "age_gte") {
        if (patientAge === null || patientAge < cond.value) { conditionsMet = false; break; }
      } else if (cond.type === "age_lte") {
        if (patientAge === null || patientAge > cond.value) { conditionsMet = false; break; }
      } else if (cond.type === "referral_doctor_id") {
        if (!doctorId || doctorId !== cond.value) { conditionsMet = false; break; }
      }
    }
    if (!conditionsMet) continue;

    let discountAmt = 0;
    if (rule.type === "percentage") discountAmt = (subtotal * Number(rule.value)) / 100;
    else discountAmt = Number(rule.value);

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
