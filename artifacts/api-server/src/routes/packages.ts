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

// Delete package
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(packageTestsTable).where(eq(packageTestsTable.packageId, id));
  const [pkg] = await db.delete(packagesTable).where(eq(packagesTable.id, id)).returning();
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json({ success: true });
});

export { router as packagesRouter };
