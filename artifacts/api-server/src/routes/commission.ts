import { Router } from "express";
import { db } from "@workspace/db";
import {
  commissionRulesTable,
  doctorsTable,
  orderTestsTable,
  ordersTable,
  testsTable,
  billsTable,
} from "@workspace/db/schema";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";

const router = Router();

// List commission rules (optionally filtered by doctorId)
router.get("/rules", async (req, res) => {
  const { doctorId } = req.query as Record<string, string>;
  const conditions = doctorId ? [eq(commissionRulesTable.doctorId, Number(doctorId))] : [];
  const rows = await db
    .select()
    .from(commissionRulesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(commissionRulesTable.createdAt));
  res.json(rows.map(r => ({
    ...r,
    value: Number(r.value),
    categories: r.categories ? JSON.parse(r.categories) : [],
    testIds: r.testIds ? JSON.parse(r.testIds) : [],
  })));
});

// Create rule
router.post("/rules", async (req, res) => {
  const { doctorId, name, type, value, scope, categories, testIds, isExclusive } = req.body;
  const [rule] = await db
    .insert(commissionRulesTable)
    .values({
      doctorId: Number(doctorId),
      name,
      type: type || "percentage",
      value: value.toString(),
      scope: scope || "all",
      categories: categories ? JSON.stringify(categories) : null,
      testIds: testIds ? JSON.stringify(testIds) : null,
      isExclusive: isExclusive || false,
    })
    .returning();
  res.status(201).json({ ...rule, value: Number(rule.value) });
});

// Update rule
router.patch("/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const updates: Record<string, unknown> = {};
  const allowed = ["name", "type", "value", "scope", "categories", "testIds", "isExclusive", "isActive"];
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === "value") updates[k] = req.body[k].toString();
      else if (k === "categories" || k === "testIds") updates[k] = JSON.stringify(req.body[k]);
      else updates[k] = req.body[k];
    }
  }
  const [rule] = await db.update(commissionRulesTable).set(updates).where(eq(commissionRulesTable.id, id)).returning();
  if (!rule) return res.status(404).json({ error: "Rule not found" });
  res.json({ ...rule, value: Number(rule.value) });
});

// Delete rule
router.delete("/rules/:id", async (req, res) => {
  await db.delete(commissionRulesTable).where(eq(commissionRulesTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

// Commission payout report
router.get("/report", async (req, res) => {
  const { from, to, doctorId } = req.query as Record<string, string>;

  // Get all doctors with their commission rules
  const doctors = await db.select().from(doctorsTable);
  const allRules = await db.select().from(commissionRulesTable);
  const allTests = await db.select().from(testsTable);
  const testMap = new Map(allTests.map(t => [t.id, t]));

  // Get completed orders with their tests
  const conditions = [];
  if (doctorId) conditions.push(eq(ordersTable.doctorId, Number(doctorId)));
  if (from) conditions.push(gte(ordersTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(ordersTable.createdAt, new Date(to + "T23:59:59Z")));

  const orders = await db
    .select()
    .from(ordersTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const orderIds = orders.map(o => o.id);
  const orderTests = orderIds.length
    ? await db.select().from(orderTestsTable).where(inArray(orderTestsTable.orderId, orderIds))
    : [];

  const report = doctors
    .filter(d => !doctorId || d.id === Number(doctorId))
    .map(doctor => {
      const doctorOrders = orders.filter(o => o.doctorId === doctor.id);
      const rules = allRules.filter(r => r.doctorId === doctor.id && r.isActive);

      let totalRevenue = 0;
      let totalCommission = 0;
      const orderDetails: {
        orderId: number; orderNumber: string; date: string;
        revenue: number; commission: number; commissionRule: string;
      }[] = [];

      for (const order of doctorOrders) {
        const tests = orderTests.filter(ot => ot.orderId === order.id);
        let orderRevenue = 0;
        let orderCommission = 0;
        let appliedRule = "Default";

        for (const ot of tests) {
          const price = Number(ot.price);
          orderRevenue += price;
          const test = testMap.get(ot.testId);

          // Find matching exclusive rule first
          let matchedRule = rules.find(r => {
            if (!r.isExclusive) return false;
            if (r.scope === "test" && r.testIds) {
              const ids = JSON.parse(r.testIds) as number[];
              return ids.includes(ot.testId);
            }
            if (r.scope === "category" && r.categories && test) {
              const cats = JSON.parse(r.categories) as string[];
              return cats.includes(test.category || "");
            }
            return false;
          });

          if (!matchedRule) {
            matchedRule = rules.find(r => {
              if (r.scope === "test" && r.testIds) {
                const ids = JSON.parse(r.testIds) as number[];
                return ids.includes(ot.testId);
              }
              if (r.scope === "category" && r.categories && test) {
                const cats = JSON.parse(r.categories) as string[];
                return cats.includes(test.category || "");
              }
              return r.scope === "all";
            });
          }

          if (matchedRule) {
            const val = Number(matchedRule.value);
            orderCommission += matchedRule.type === "percentage" ? (price * val) / 100 : val;
            appliedRule = matchedRule.name;
          } else if (Number(doctor.defaultCommission) > 0) {
            const defVal = Number(doctor.defaultCommission);
            orderCommission += doctor.defaultCommissionType === "percentage"
              ? (price * defVal) / 100
              : defVal;
            appliedRule = "Default";
          }
        }

        totalRevenue += orderRevenue;
        totalCommission += orderCommission;

        if (doctorOrders.length > 0) {
          orderDetails.push({
            orderId: order.id,
            orderNumber: order.orderNumber,
            date: order.createdAt.toISOString().split("T")[0],
            revenue: orderRevenue,
            commission: orderCommission,
            commissionRule: appliedRule,
          });
        }
      }

      return {
        doctor: { ...doctor, defaultCommission: Number(doctor.defaultCommission) },
        orderCount: doctorOrders.length,
        totalRevenue,
        totalCommission,
        orders: orderDetails,
      };
    });

  res.json(report);
});

export default router;
