import { Router } from "express";
import { db } from "@workspace/db";
import {
  doctorsTable,
  doctorPayoutsTable,
  commissionRulesTable,
  ordersTable,
  orderTestsTable,
  testsTable,
  billsTable,
} from "@workspace/db/schema";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";

export const doctorLedgerRouter = Router();

// ─── Commission helper (mirrors commission.ts) ────────────────────────────────
type TestInfo = { id: number; name: string; category: string | null; price: number };
type RuleInfo = typeof commissionRulesTable.$inferSelect;
type DoctorInfo = typeof doctorsTable.$inferSelect;

function safeParseArray<T = unknown>(s: string | null | undefined): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function calcTestCommission(
  ot: { testId: number; price: string },
  test: TestInfo | undefined,
  rules: RuleInfo[],
  doctor: DoctorInfo,
): { commission: number; ruleName: string } {
  const price = Number(ot.price);
  let matched = rules.find(r => {
    if (!r.isExclusive || !r.isActive) return false;
    if (r.scope === "test" && r.testIds) return safeParseArray<number>(r.testIds).includes(ot.testId);
    if (r.scope === "category" && r.categories && test) return safeParseArray<string>(r.categories).includes(test.category || "");
    return false;
  });
  if (!matched) {
    matched = rules.find(r => {
      if (!r.isActive) return false;
      if (r.scope === "test" && r.testIds) return safeParseArray<number>(r.testIds).includes(ot.testId);
      if (r.scope === "category" && r.categories && test) return safeParseArray<string>(r.categories).includes(test.category || "");
      return false;
    });
  }
  if (!matched) matched = rules.find(r => r.isActive && r.scope === "all");
  if (matched) {
    const val = Number(matched.value);
    return { commission: matched.type === "percentage" ? (price * val) / 100 : val, ruleName: matched.name };
  }
  const defVal = Number(doctor.defaultCommission);
  if (defVal > 0) {
    return { commission: doctor.defaultCommissionType === "percentage" ? (price * defVal) / 100 : defVal, ruleName: "Default" };
  }
  return { commission: 0, ruleName: "None" };
}

// Compute commission earned per doctor over a date range (or lifetime when from/to omitted).
async function computeEarned(opts: { from?: string; to?: string; doctorId?: number }) {
  const doctors = await db.select().from(doctorsTable);
  const allRules = await db.select().from(commissionRulesTable);
  const allTests = await db.select().from(testsTable);
  const testMap = new Map(allTests.map(t => [t.id, { id: t.id, name: t.name, category: t.category, price: Number(t.price) }]));

  const conditions = [];
  if (opts.doctorId) conditions.push(eq(ordersTable.doctorId, opts.doctorId));
  if (opts.from) conditions.push(gte(ordersTable.createdAt, new Date(opts.from)));
  if (opts.to) conditions.push(lte(ordersTable.createdAt, new Date(opts.to + "T23:59:59Z")));

  const orders = await db.select().from(ordersTable).where(conditions.length ? and(...conditions) : undefined);
  const orderIds = orders.map(o => o.id);
  const orderTests = orderIds.length ? await db.select().from(orderTestsTable).where(inArray(orderTestsTable.orderId, orderIds)) : [];

  const filteredDoctors = opts.doctorId ? doctors.filter(d => d.id === opts.doctorId) : doctors;

  return filteredDoctors.map(doctor => {
    const doctorOrders = orders.filter(o => o.doctorId === doctor.id);
    const rules = allRules.filter(r => r.doctorId === doctor.id);
    let totalRevenue = 0, totalCommission = 0;
    const orderRows: { orderId: number; orderNumber: string; date: string; revenue: number; commission: number; testCount: number }[] = [];
    for (const order of doctorOrders) {
      const tests = orderTests.filter(ot => ot.orderId === order.id);
      let r = 0, c = 0;
      for (const ot of tests) {
        const test = testMap.get(ot.testId);
        const { commission } = calcTestCommission(ot, test, rules, doctor);
        r += Number(ot.price);
        c += commission;
      }
      totalRevenue += r;
      totalCommission += c;
      if (tests.length > 0) {
        orderRows.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          date: order.createdAt.toISOString().split("T")[0],
          revenue: r,
          commission: c,
          testCount: tests.length,
        });
      }
    }
    return {
      doctor,
      totalRevenue,
      totalCommission,
      orderCount: doctorOrders.length,
      orders: orderRows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    };
  });
}

// ─── GET / : Summary table — Earned vs Paid vs Due per doctor ──────────────────
doctorLedgerRouter.get("/", async (req, res) => {
  try {
    const { from, to, search } = req.query as Record<string, string | undefined>;
    const earnedByDoctor = await computeEarned({ from, to });

    // Sum payouts per doctor in same window (or lifetime). Always include lifetime totals too for an Outstanding column.
    const payoutCondsWindow = [];
    if (from) payoutCondsWindow.push(gte(doctorPayoutsTable.paymentDate, from));
    if (to) payoutCondsWindow.push(lte(doctorPayoutsTable.paymentDate, to));
    const paidWindowRows = await db
      .select({ doctorId: doctorPayoutsTable.doctorId, total: sql<string>`SUM(${doctorPayoutsTable.amount})` })
      .from(doctorPayoutsTable)
      .where(payoutCondsWindow.length ? and(...payoutCondsWindow) : undefined)
      .groupBy(doctorPayoutsTable.doctorId);
    const paidWindow = new Map(paidWindowRows.map(r => [r.doctorId, Number(r.total)]));

    const paidLifetimeRows = await db
      .select({ doctorId: doctorPayoutsTable.doctorId, total: sql<string>`SUM(${doctorPayoutsTable.amount})` })
      .from(doctorPayoutsTable)
      .groupBy(doctorPayoutsTable.doctorId);
    const paidLifetime = new Map(paidLifetimeRows.map(r => [r.doctorId, Number(r.total)]));

    // Lifetime earned for each doctor (for outstanding balance even when window is set)
    const lifetimeEarned = (from || to) ? await computeEarned({}) : earnedByDoctor;
    const lifetimeEarnedMap = new Map(lifetimeEarned.map(r => [r.doctor.id, r.totalCommission]));

    const term = (search || "").trim().toLowerCase();

    const rows = earnedByDoctor
      .map(r => {
        const earnedWindow = r.totalCommission;
        const paidW = paidWindow.get(r.doctor.id) ?? 0;
        const earnedLife = lifetimeEarnedMap.get(r.doctor.id) ?? 0;
        const paidLife = paidLifetime.get(r.doctor.id) ?? 0;
        return {
          doctorId: r.doctor.id,
          doctorName: r.doctor.name,
          specialization: r.doctor.specialization,
          phone: r.doctor.phone,
          email: r.doctor.email,
          orderCount: r.orderCount,
          revenueWindow: r.totalRevenue,
          earnedWindow,
          paidWindow: paidW,
          dueWindow: earnedWindow - paidW,
          earnedLifetime: earnedLife,
          paidLifetime: paidLife,
          outstanding: earnedLife - paidLife,
        };
      })
      .filter(r => {
        if (!term) return true;
        return (
          r.doctorName.toLowerCase().includes(term) ||
          (r.specialization || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.outstanding - a.outstanding);

    const totals = rows.reduce(
      (acc, r) => ({
        doctors: acc.doctors + 1,
        earnedWindow: acc.earnedWindow + r.earnedWindow,
        paidWindow: acc.paidWindow + r.paidWindow,
        dueWindow: acc.dueWindow + r.dueWindow,
        outstanding: acc.outstanding + r.outstanding,
      }),
      { doctors: 0, earnedWindow: 0, paidWindow: 0, dueWindow: 0, outstanding: 0 },
    );

    res.json({ rows, totals, window: { from: from ?? null, to: to ?? null } });
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger summary failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /:doctorId : per-doctor detailed ledger ───────────────────────────────
doctorLedgerRouter.get("/:doctorId", async (req, res) => {
  try {
    const doctorId = Number(req.params.doctorId);
    if (!Number.isFinite(doctorId)) return res.status(400).json({ error: "Invalid doctorId" });

    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });

    const { from, to } = req.query as Record<string, string | undefined>;

    const earnedReport = await computeEarned({ from, to, doctorId });
    const earnedRows = earnedReport[0]?.orders ?? [];
    const totalEarned = earnedReport[0]?.totalCommission ?? 0;
    const totalRevenue = earnedReport[0]?.totalRevenue ?? 0;

    const conds = [eq(doctorPayoutsTable.doctorId, doctorId)];
    if (from) conds.push(gte(doctorPayoutsTable.paymentDate, from));
    if (to) conds.push(lte(doctorPayoutsTable.paymentDate, to));
    const payouts = await db
      .select()
      .from(doctorPayoutsTable)
      .where(and(...conds))
      .orderBy(desc(doctorPayoutsTable.paymentDate), desc(doctorPayoutsTable.id));

    // Build merged ledger entries (earned = credit to doctor, paid = debit).
    type Entry = { kind: "earned" | "paid"; date: string; particular: string; credit: number; debit: number; ref?: string | null; id?: number };
    const entries: Entry[] = [];
    for (const o of earnedRows) {
      entries.push({
        kind: "earned",
        date: o.date,
        particular: `Commission · Order ${o.orderNumber} (${o.testCount} test${o.testCount === 1 ? "" : "s"})`,
        credit: o.commission,
        debit: 0,
        ref: o.orderNumber,
      });
    }
    for (const p of payouts) {
      entries.push({
        kind: "paid",
        date: p.paymentDate,
        particular: `Payout · ${p.paymentMethod}${p.reference ? ` (${p.reference})` : ""}${p.notes ? ` — ${p.notes}` : ""}`,
        credit: 0,
        debit: Number(p.amount),
        ref: p.reference,
        id: p.id,
      });
    }
    entries.sort((a, b) => {
      const d = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (d !== 0) return d;
      // Within the same day, earned should come before paid so balance shows the right intra-day flow
      if (a.kind !== b.kind) return a.kind === "earned" ? -1 : 1;
      return 0;
    });
    let running = 0;
    const ledger = entries.map(e => {
      running += e.credit - e.debit;
      return { ...e, balance: running };
    });

    const totalPaid = payouts.reduce((s, p) => s + Number(p.amount), 0);

    // Lifetime totals (for outstanding regardless of window)
    const lifetimeEarned = (from || to)
      ? (await computeEarned({ doctorId }))[0]?.totalCommission ?? 0
      : totalEarned;
    const lifetimePaidRow = await db
      .select({ total: sql<string>`COALESCE(SUM(${doctorPayoutsTable.amount}), 0)` })
      .from(doctorPayoutsTable)
      .where(eq(doctorPayoutsTable.doctorId, doctorId));
    const lifetimePaid = Number(lifetimePaidRow[0]?.total ?? 0);

    res.json({
      doctor: {
        ...doctor,
        defaultCommission: Number(doctor.defaultCommission),
      },
      window: { from: from ?? null, to: to ?? null },
      summary: {
        totalRevenue,
        totalEarned,
        totalPaid,
        dueWindow: totalEarned - totalPaid,
        lifetimeEarned,
        lifetimePaid,
        outstanding: lifetimeEarned - lifetimePaid,
        orderCount: earnedRows.length,
        payoutCount: payouts.length,
      },
      earnedOrders: earnedRows,
      payouts: payouts.map(p => ({ ...p, amount: Number(p.amount) })),
      ledger,
    });
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger detail failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── POST /:doctorId/payouts : record a new payout ─────────────────────────────
doctorLedgerRouter.post("/:doctorId/payouts", async (req, res) => {
  try {
    const doctorId = Number(req.params.doctorId);
    if (!Number.isFinite(doctorId)) return res.status(400).json({ error: "Invalid doctorId" });

    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });

    const body = req.body ?? {};
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }
    const paymentDate = typeof body.paymentDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate)
      ? body.paymentDate
      : new Date().toISOString().split("T")[0];
    const allowedMethods = ["cash", "bank", "upi", "cheque", "card", "other"];
    const paymentMethod = allowedMethods.includes(body.paymentMethod) ? body.paymentMethod : "cash";

    const periodFrom = typeof body.periodFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.periodFrom) ? body.periodFrom : null;
    const periodTo   = typeof body.periodTo   === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.periodTo)   ? body.periodTo   : null;

    const trim = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    const [row] = await db
      .insert(doctorPayoutsTable)
      .values({
        doctorId,
        amount: amount.toFixed(2),
        paymentDate,
        paymentMethod,
        reference: trim(body.reference),
        periodFrom,
        periodTo,
        notes: trim(body.notes),
        performedBy: trim(body.performedBy),
      })
      .returning();

    res.status(201).json({ ...row, amount: Number(row.amount) });
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger payout create failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── PATCH /payouts/:id : edit an existing payout ─────────────────────────────
doctorLedgerRouter.patch("/payouts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid payout id" });
    const body = req.body ?? {};
    const updates: Record<string, unknown> = {};
    if (body.amount !== undefined) {
      const a = Number(body.amount);
      if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ error: "amount must be positive" });
      updates.amount = a.toFixed(2);
    }
    if (body.paymentDate !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.paymentDate))) return res.status(400).json({ error: "Invalid paymentDate" });
      updates.paymentDate = body.paymentDate;
    }
    if (body.paymentMethod !== undefined) {
      const allowed = ["cash", "bank", "upi", "cheque", "card", "other"];
      if (!allowed.includes(body.paymentMethod)) return res.status(400).json({ error: "Invalid paymentMethod" });
      updates.paymentMethod = body.paymentMethod;
    }
    if (body.reference !== undefined) updates.reference = body.reference || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;
    if (body.periodFrom !== undefined) updates.periodFrom = body.periodFrom || null;
    if (body.periodTo !== undefined) updates.periodTo = body.periodTo || null;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });

    const [row] = await db
      .update(doctorPayoutsTable)
      .set(updates)
      .where(eq(doctorPayoutsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Payout not found" });
    res.json({ ...row, amount: Number(row.amount) });
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger payout patch failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── DELETE /payouts/:id ───────────────────────────────────────────────────────
doctorLedgerRouter.delete("/payouts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid payout id" });
    const result = await db.delete(doctorPayoutsTable).where(eq(doctorPayoutsTable.id, id)).returning();
    if (result.length === 0) return res.status(404).json({ error: "Payout not found" });
    res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger payout delete failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── GET /:doctorId/export : CSV export of the ledger window ──────────────────
doctorLedgerRouter.get("/:doctorId/export", async (req, res) => {
  try {
    const doctorId = Number(req.params.doctorId);
    if (!Number.isFinite(doctorId)) return res.status(400).json({ error: "Invalid doctorId" });
    const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, doctorId));
    if (!doctor) return res.status(404).json({ error: "Doctor not found" });
    const { from, to } = req.query as Record<string, string | undefined>;

    const earnedReport = await computeEarned({ from, to, doctorId });
    const earnedRows = earnedReport[0]?.orders ?? [];
    const conds = [eq(doctorPayoutsTable.doctorId, doctorId)];
    if (from) conds.push(gte(doctorPayoutsTable.paymentDate, from));
    if (to) conds.push(lte(doctorPayoutsTable.paymentDate, to));
    const payouts = await db.select().from(doctorPayoutsTable).where(and(...conds));

    type Row = { date: string; kind: string; particular: string; credit: number; debit: number; reference: string };
    const entries: Row[] = [];
    for (const o of earnedRows) entries.push({ date: o.date, kind: "Commission", particular: `Order ${o.orderNumber} (${o.testCount} tests)`, credit: o.commission, debit: 0, reference: o.orderNumber });
    for (const p of payouts) entries.push({ date: p.paymentDate, kind: "Payout", particular: `${p.paymentMethod}${p.notes ? " — " + p.notes : ""}`, credit: 0, debit: Number(p.amount), reference: p.reference || "" });
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.kind === "Commission" ? -1 : 1));

    const esc = (v: unknown) => {
      let s = String(v ?? "");
      // CSV formula-injection guard: prefix with single quote if cell starts with =, +, -, @, tab, or CR
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    let running = 0;
    const lines = [["Date", "Type", "Particular", "Credit", "Debit", "Balance", "Reference"].join(",")];
    for (const e of entries) {
      running += e.credit - e.debit;
      lines.push([esc(e.date), esc(e.kind), esc(e.particular), e.credit ? e.credit.toFixed(2) : "", e.debit ? e.debit.toFixed(2) : "", running.toFixed(2), esc(e.reference)].join(","));
    }
    const totalEarned = earnedRows.reduce((s, r) => s + r.commission, 0);
    const totalPaid = payouts.reduce((s, p) => s + Number(p.amount), 0);
    lines.push("");
    lines.push([esc(""), esc("TOTAL EARNED"), esc(""), totalEarned.toFixed(2), "", "", ""].join(","));
    lines.push([esc(""), esc("TOTAL PAID"), esc(""), "", totalPaid.toFixed(2), "", ""].join(","));
    lines.push([esc(""), esc("BALANCE DUE"), esc(""), "", "", (totalEarned - totalPaid).toFixed(2), ""].join(","));

    const safeName = doctor.name.replace(/[^a-z0-9]+/gi, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="doctor_ledger_${safeName}_${from ?? "all"}_${to ?? "all"}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    req.log?.error({ err }, "doctor-ledger export failed");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
