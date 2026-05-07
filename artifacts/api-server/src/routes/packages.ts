import { Router } from "express";
import { db } from "@workspace/db";
import {
  packagesTable,
  packageTestsTable,
  packageCounterTable,
  testsTable,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

function toNum(row: Record<string, unknown>) {
  return {
    ...row,
    price: Number(row.price ?? 0),
    discountPct: Number(row.discountPct ?? 0),
  };
}

async function generatePackageCode(): Promise<string> {
  const [counter] = await db.select().from(packageCounterTable).limit(1);
  let seq = 1;
  if (counter) {
    seq = counter.counter + 1;
    await db.update(packageCounterTable).set({ counter: seq }).where(eq(packageCounterTable.id, counter.id));
  } else {
    await db.insert(packageCounterTable).values({ counter: 1 });
  }
  return `PKG-${String(seq).padStart(4, "0")}`;
}

// List all packages with their test IDs
router.get("/", async (_req, res) => {
  const pkgs = await db.select().from(packagesTable).orderBy(desc(packagesTable.createdAt));

  const allLinks = await db.select().from(packageTestsTable);
  const allTests = await db.select().from(testsTable);

  const testMap = new Map(allTests.map((t) => [t.id, t]));

  const result = pkgs.map((pkg) => {
    const links = allLinks.filter((l) => l.packageId === pkg.id);
    const tests = links.map((l) => testMap.get(l.testId)).filter(Boolean);
    return { ...toNum(pkg as unknown as Record<string, unknown>), tests };
  });

  return res.json(result);
});

// Get single package
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [pkg] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  const links = await db.select().from(packageTestsTable).where(eq(packageTestsTable.packageId, id));
  const testIds = links.map((l) => l.testId);
  const tests = testIds.length
    ? await db.select().from(testsTable).where(eq(testsTable.id, testIds[0]))
    : [];

  return res.json({ ...toNum(pkg as unknown as Record<string, unknown>), tests, testIds });
});

// Create package
router.post("/", async (req, res) => {
  const { name, description, price, discountPct, isActive, testIds } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const code = await generatePackageCode();
  const [pkg] = await db
    .insert(packagesTable)
    .values({
      packageCode: code,
      name,
      description: description || null,
      price: String(price ?? 0),
      discountPct: String(discountPct ?? 0),
      isActive: isActive !== false,
    })
    .returning();

  if (Array.isArray(testIds) && testIds.length > 0) {
    await db.insert(packageTestsTable).values(
      testIds.map((tid: number) => ({ packageId: pkg.id, testId: tid }))
    );
  }

  return res.status(201).json(toNum(pkg as unknown as Record<string, unknown>));
});

// Update package
router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, description, price, discountPct, isActive, testIds } = req.body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (price !== undefined) updates.price = String(price);
  if (discountPct !== undefined) updates.discountPct = String(discountPct);
  if (isActive !== undefined) updates.isActive = isActive;

  if (Object.keys(updates).length > 0) {
    const [pkg] = await db.update(packagesTable).set(updates).where(eq(packagesTable.id, id)).returning();
    if (!pkg) return res.status(404).json({ error: "Package not found" });
  }

  if (Array.isArray(testIds)) {
    await db.delete(packageTestsTable).where(eq(packageTestsTable.packageId, id));
    if (testIds.length > 0) {
      await db.insert(packageTestsTable).values(
        testIds.map((tid: number) => ({ packageId: id, testId: tid }))
      );
    }
  }

  const [updated] = await db.select().from(packagesTable).where(eq(packagesTable.id, id));
  return res.json(toNum(updated as unknown as Record<string, unknown>));
});

// ── Bulk CSV import ───────────────────────────────────────────────────────
// Upsert packages by `packageCode` if present, otherwise by name. The
// `testCodes` column is a semicolon-separated list of test codes (e.g.
// "CBC;LFT;TSH") — we resolve them against the tests table and replace
// the package's full test set on each import. Unknown test codes are
// reported per-row but do not fail the row (the package is still
// upserted; the missing tests are simply not linked).
router.post("/import", async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? (req.body.rows as Record<string, unknown>[]) : null;
  if (!rows) return res.status(400).json({ error: "Request body must include `rows: []`." });
  if (rows.length > 5000) return res.status(413).json({ error: "Too many rows in one import (max 5000)." });

  // Pre-load test code → id once for fast lookups.
  const allTests = await db.select({ id: testsTable.id, code: testsTable.code }).from(testsTable);
  const testByCode = new Map(allTests.map(t => [t.code.toLowerCase(), t.id]));

  let inserted = 0, updated = 0, skipped = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r.name ?? "").trim();
    const codeInput = typeof r.packageCode === "string" ? r.packageCode.trim() : "";
    if (!name) {
      skipped++;
      errors.push({ row: i + 2, reason: "Missing required field (name)." });
      continue;
    }
    const price = Number(r.price ?? 0);
    const discountPct = Number(r.discountPct ?? 0);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
      skipped++;
      errors.push({ row: i + 2, reason: "price must be ≥ 0 and discountPct between 0 and 100." });
      continue;
    }

    const isActiveStr = typeof r.isActive === "string" ? r.isActive.trim() : "";
    const isActive = isActiveStr ? !/^(false|0|no|inactive)$/i.test(isActiveStr) : true;

    // Resolve test codes → ids. Track misses for the per-row error message.
    const codesRaw = typeof r.testCodes === "string" ? r.testCodes : "";
    const codes = codesRaw.split(";").map(c => c.trim()).filter(Boolean);
    const testIds: number[] = [];
    const missing: string[] = [];
    for (const c of codes) {
      const id = testByCode.get(c.toLowerCase());
      if (id !== undefined) testIds.push(id); else missing.push(c);
    }

    const values = {
      name,
      description: typeof r.description === "string" && r.description.trim() ? r.description.trim() : null,
      price: price.toFixed(2),
      discountPct: discountPct.toFixed(2),
      isActive,
    };

    try {
      let existingId: number | undefined;
      if (codeInput) {
        const [hit] = await db.select({ id: packagesTable.id }).from(packagesTable).where(eq(packagesTable.packageCode, codeInput));
        existingId = hit?.id;
      }
      if (!existingId) {
        const [hit] = await db.select({ id: packagesTable.id }).from(packagesTable).where(eq(packagesTable.name, name));
        existingId = hit?.id;
      }

      if (existingId) {
        await db.update(packagesTable).set(values).where(eq(packagesTable.id, existingId));
        await db.delete(packageTestsTable).where(eq(packageTestsTable.packageId, existingId));
        if (testIds.length > 0) {
          await db.insert(packageTestsTable).values(testIds.map(tid => ({ packageId: existingId!, testId: tid })));
        }
        updated++;
      } else {
        const packageCode = codeInput || await generatePackageCode();
        const [pkg] = await db.insert(packagesTable).values({ ...values, packageCode }).returning();
        if (testIds.length > 0) {
          await db.insert(packageTestsTable).values(testIds.map(tid => ({ packageId: pkg.id, testId: tid })));
        }
        inserted++;
      }
      if (missing.length > 0) {
        errors.push({ row: i + 2, reason: `Unknown test codes (skipped): ${missing.join(", ")}` });
      }
    } catch (e) {
      skipped++;
      errors.push({ row: i + 2, reason: (e as Error).message || "Database error" });
    }
  }

  return res.json({ inserted, updated, skipped, errors: errors.slice(0, 50) });
});

// Delete package
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(packageTestsTable).where(eq(packageTestsTable.packageId, id));
  const [pkg] = await db.delete(packagesTable).where(eq(packagesTable.id, id)).returning();
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json({ success: true });
});

export { router as packagesRouter };
