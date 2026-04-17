import { Router } from "express";
import {
  db,
  ledgersTable,
  doctorsTable,
  patientsTable,
  ordersTable,
  orderTestsTable,
  billsTable,
  paymentsTable,
  appointmentsTable,
  superAdminSessionsTable,
  billAuditsTable,
} from "@workspace/db";
import { eq, and, sql, isNull, or, inArray } from "drizzle-orm";

export const ledgersRouter = Router();

// ── Helper: ensure default ledger (id=1) exists ───────────────────────────────
export async function ensureDefaultLedger(): Promise<void> {
  const [existing] = await db.select().from(ledgersTable).where(eq(ledgersTable.id, 1));
  if (existing) return;
  await db.execute(sql`
    INSERT INTO ledgers (id, name, is_default, created_at)
    VALUES (1, 'Default / Walk-in', true, NOW())
    ON CONFLICT (id) DO NOTHING
  `);
  await db.execute(sql`
    SELECT setval(pg_get_serial_sequence('ledgers', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ledgers), 1))
  `);
}

// id=1 (default) also matches NULL (legacy rows)
function matchLedger<T extends { ledgerId: import("drizzle-orm/pg-core").PgColumn }>(
  table: T,
  ledgerId: number,
) {
  return ledgerId === 1
    ? or(eq(table.ledgerId, 1), isNull(table.ledgerId))!
    : eq(table.ledgerId, ledgerId);
}

// ── Helper: verify super admin token ──────────────────────────────────────────
async function verifySuperAdmin(token: string): Promise<{ valid: boolean; userName: string }> {
  if (!token) return { valid: false, userName: "" };
  const [s] = await db.select().from(superAdminSessionsTable).where(eq(superAdminSessionsTable.token, token));
  if (!s || !s.isActive || new Date(s.expiresAt) < new Date()) return { valid: false, userName: "" };
  return { valid: true, userName: s.userName };
}

// ── GET /api/ledgers — list books with stats ──────────────────────────────────
ledgersRouter.get("/", async (_req, res) => {
  await ensureDefaultLedger();
  const ledgers = await db.select().from(ledgersTable).orderBy(ledgersTable.id);

  const result = await Promise.all(
    ledgers.map(async (l) => {
      const [doctorCount, patientCount, billCount, orderCount, appointmentCount] = await Promise.all([
        db.select({ c: sql<number>`count(*)` }).from(doctorsTable).where(matchLedger(doctorsTable, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(patientsTable).where(matchLedger(patientsTable, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(billsTable).where(matchLedger(billsTable, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(ordersTable).where(matchLedger(ordersTable, l.id)),
        db.select({ c: sql<number>`count(*)` }).from(appointmentsTable).where(matchLedger(appointmentsTable, l.id)),
      ]);
      return {
        ...l,
        doctorCount: Number(doctorCount[0]?.c ?? 0),
        patientCount: Number(patientCount[0]?.c ?? 0),
        billCount: Number(billCount[0]?.c ?? 0),
        orderCount: Number(orderCount[0]?.c ?? 0),
        appointmentCount: Number(appointmentCount[0]?.c ?? 0),
      };
    }),
  );

  res.json(result);
});

// ── POST /api/ledgers — create new book (super admin) ─────────────────────────
ledgersRouter.post("/", async (req, res) => {
  const { token, name } = req.body;
  if (!token) return res.status(400).json({ error: "token is required" });
  const { valid } = await verifySuperAdmin(token);
  if (!valid) return res.status(403).json({ error: "Super admin session expired or invalid." });

  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) return res.status(400).json({ error: "name is required" });

  try {
    const [created] = await db.insert(ledgersTable).values({ name: trimmedName, isDefault: false }).returning();
    res.status(201).json(created);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create ledger";
    if (msg.includes("unique")) return res.status(409).json({ error: "A book with that name already exists" });
    res.status(500).json({ error: msg });
  }
});

// ── PATCH /api/ledgers/:id — rename ───────────────────────────────────────────
ledgersRouter.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { token, name } = req.body;
  const { valid } = await verifySuperAdmin(token);
  if (!valid) return res.status(403).json({ error: "Super admin session expired or invalid." });

  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) return res.status(400).json({ error: "name is required" });

  try {
    const [updated] = await db.update(ledgersTable).set({ name: trimmedName }).where(eq(ledgersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Book not found" });
    res.json(updated);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to rename";
    if (msg.includes("unique")) return res.status(409).json({ error: "A book with that name already exists" });
    res.status(500).json({ error: msg });
  }
});

// ── DELETE /api/ledgers/:id — delete book (must be empty, cannot be default) ─
ledgersRouter.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { token } = req.body;
  const { valid } = await verifySuperAdmin(token);
  if (!valid) return res.status(403).json({ error: "Super admin session expired or invalid." });

  const [ledger] = await db.select().from(ledgersTable).where(eq(ledgersTable.id, id));
  if (!ledger) return res.status(404).json({ error: "Book not found" });
  if (ledger.isDefault) return res.status(400).json({ error: "Cannot delete the default book" });

  // Move any doctors assigned to this book back to the default book
  await db.update(doctorsTable).set({ ledgerId: 1 }).where(eq(doctorsTable.ledgerId, id));

  // Refuse if there is any patient/bill/order/appointment data
  const [bc] = await db.select({ c: sql<number>`count(*)` }).from(billsTable).where(eq(billsTable.ledgerId, id));
  const [pc] = await db.select({ c: sql<number>`count(*)` }).from(patientsTable).where(eq(patientsTable.ledgerId, id));
  if (Number(bc?.c ?? 0) > 0 || Number(pc?.c ?? 0) > 0) {
    return res.status(400).json({ error: "Book is not empty — reset it first before deleting" });
  }

  await db.delete(ledgersTable).where(eq(ledgersTable.id, id));
  res.json({ ok: true });
});

// ── POST /api/ledgers/:id/assign-doctors — set doctor list for this book ─────
ledgersRouter.post("/:id/assign-doctors", async (req, res) => {
  const id = Number(req.params.id);
  const { token, doctorIds } = req.body as { token: string; doctorIds: number[] };
  const { valid } = await verifySuperAdmin(token);
  if (!valid) return res.status(403).json({ error: "Super admin session expired or invalid." });

  const [ledger] = await db.select().from(ledgersTable).where(eq(ledgersTable.id, id));
  if (!ledger) return res.status(404).json({ error: "Book not found" });

  if (!Array.isArray(doctorIds)) return res.status(400).json({ error: "doctorIds must be an array" });

  // Move all currently-in-this-book doctors that are NOT in the new list back to default
  await db.update(doctorsTable)
    .set({ ledgerId: 1 })
    .where(and(eq(doctorsTable.ledgerId, id), doctorIds.length > 0 ? sql`${doctorsTable.id} NOT IN (${sql.join(doctorIds.map(d => sql`${d}`), sql`, `)})` : sql`true`));

  // Set the requested doctors to this book
  if (doctorIds.length > 0) {
    await db.update(doctorsTable).set({ ledgerId: id }).where(inArray(doctorsTable.id, doctorIds));
  }

  res.json({ ok: true });
});

// ── POST /api/ledgers/:id/reset — wipe all data for this book ────────────────
ledgersRouter.post("/:id/reset", async (req, res) => {
  const id = Number(req.params.id);
  const { token, reason } = req.body;
  if (!reason || String(reason).trim().length < 3) {
    return res.status(400).json({ error: "A reason of at least 3 characters is required" });
  }
  const { valid, userName } = await verifySuperAdmin(token);
  if (!valid) return res.status(403).json({ error: "Super admin session expired or invalid." });

  const [ledger] = await db.select().from(ledgersTable).where(eq(ledgersTable.id, id));
  if (!ledger) return res.status(404).json({ error: "Book not found" });

  // Find rows that belong to this ledger (id=1 also includes NULL)
  const isDefault = id === 1;
  const billRows = await db.select({ id: billsTable.id }).from(billsTable).where(
    isDefault ? or(eq(billsTable.ledgerId, 1), isNull(billsTable.ledgerId)) : eq(billsTable.ledgerId, id),
  );
  const billIds = billRows.map(r => r.id);

  const orderRows = await db.select({ id: ordersTable.id }).from(ordersTable).where(
    isDefault ? or(eq(ordersTable.ledgerId, 1), isNull(ordersTable.ledgerId)) : eq(ordersTable.ledgerId, id),
  );
  const orderIds = orderRows.map(r => r.id);

  const patientRows = await db.select({ id: patientsTable.id }).from(patientsTable).where(
    isDefault ? or(eq(patientsTable.ledgerId, 1), isNull(patientsTable.ledgerId)) : eq(patientsTable.ledgerId, id),
  );
  const patientIds = patientRows.map(r => r.id);

  // Wipe in dependency-safe order
  if (billIds.length) {
    await db.delete(paymentsTable).where(inArray(paymentsTable.billId, billIds));
    await db.delete(billAuditsTable).where(inArray(billAuditsTable.billId, billIds));
    await db.delete(billsTable).where(inArray(billsTable.id, billIds));
  }
  if (orderIds.length) {
    await db.delete(orderTestsTable).where(inArray(orderTestsTable.orderId, orderIds));
    await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds));
  }
  // Appointments tied directly to ledger OR to one of the wiped patients
  await db.delete(appointmentsTable).where(
    isDefault
      ? or(eq(appointmentsTable.ledgerId, 1), isNull(appointmentsTable.ledgerId))
      : eq(appointmentsTable.ledgerId, id),
  );
  if (patientIds.length) {
    await db.delete(appointmentsTable).where(inArray(appointmentsTable.patientId, patientIds));
    await db.delete(patientsTable).where(inArray(patientsTable.id, patientIds));
  }

  res.json({
    ok: true,
    book: ledger.name,
    by: userName,
    reason,
    wiped: {
      bills: billIds.length,
      orders: orderIds.length,
      patients: patientIds.length,
    },
  });
});
