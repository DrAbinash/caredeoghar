import { Router } from "express";
import { db, clinicSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const clinicSettingsRouter = Router();

async function getOrCreate() {
  try {
    const rows = await db.select().from(clinicSettingsTable).limit(1);
    if (rows[0]) return rows[0];
    const [created] = await db.insert(clinicSettingsTable).values({}).returning();
    return created;
  } catch (_e: any) {
    // Drizzle schema may be ahead of the production DB (missing columns).
    // Return safe defaults so the UI can still load while migrations catch up.
    return {
      id: 1,
      name: "Care Diagnostics",
      tagline: "Diagnostic & Pathology Services",
      address: "",
      registeredAddress: "",
      email: "",
      phone: "",
      website: "",
      gstin: "",
      logoDataUrl: null,
      footerNote: "Thank you for choosing our diagnostic services.",
      formFTestIds: "[]",
      quickTestIds: "[null,null,null,null,null,null]",
      patientPhotoEnabled: false,
      showTatOnBill: false,
      billPrintCopies: 1,
      qrOnBillEnabled: true,
      portalEnabled: false,
      portalHeading: "Care Diagnostics",
      portalWelcomeMessage: "",
      portalAllowAppointmentBooking: true,
      portalAllowProfileEdit: true,
      onlineBookingEnabled: false,
      razorpayKeyId: "",
      onlineBookingLedgerId: 1,
      vipQueueEnabled: false,
      payuEnabled: false,
      payuMerchantKey: "",
      phonepeEnabled: false,
      phonepeMerchantId: "",
      bharatpeEnabled: false,
      bharatpeMerchantId: "",
      cashfreeEnabled: false,
      cashfreeAppId: "",
      iciciEnabled: false,
      iciciMerchantId: "",
      iciciAggregatorId: "",
      kioskEnabled: false,
      kioskUpiVpa: "",
      kioskUpiName: "",
      kioskWelcomeMessage: "",
      kioskAllowedTestIds: "[]",
      upiQrImageUrl: "",
      upiVpa: "",
      upiQrEnabled: false,
      onlineBookingAllowedTestIds: "[]",
      onlineBookingAllowedPackageIds: "[]",
      sidebarTheme: "navy",
      billDefaultPaperSize: "A5",
      billShowCode: true,
      billShowCategory: true,
      dayCloseAutoPrint: true,
      commissionDiscountMode: "none",
      lanOnlyLogin: false,
      lanAllowedIps: "[]",
      fido2Enabled: false,
      formFBillingPrompt: false,
      formFAddressRequired: true,
      formFGuardianRequired: true,
      updatedAt: new Date(),
    } as any;
  }
}

// Public branding fields (no auth required) — used by bill printing, public
// clinic site, patient portal, and bill verification QR pages.
clinicSettingsRouter.get("/branding", async (_req, res) => {
  const row = await getOrCreate();
  res.json({
    name: row.name ?? "",
    tagline: row.tagline ?? "",
    address: row.address ?? "",
    registeredAddress: row.registeredAddress ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    gstin: row.gstin ?? "",
    logoDataUrl: row.logoDataUrl ?? null,
    footerNote: row.footerNote ?? "",
    portalHeading: row.portalHeading ?? "",
    portalWelcomeMessage: row.portalWelcomeMessage ?? "",
    billPrintCopies: row.billPrintCopies ?? 1,
    billDefaultPaperSize: row.billDefaultPaperSize ?? "A5",
    billShowCode: row.billShowCode ?? false,
    billShowCategory: row.billShowCategory ?? false,
    qrOnBillEnabled: row.qrOnBillEnabled ?? true,
    showTatOnBill: row.showTatOnBill ?? false,
    dayCloseAutoPrint: row.dayCloseAutoPrint ?? true,
    quickTestIds: row.quickTestIds ?? "[null,null,null,null,null,null]",
    formFTestIds: row.formFTestIds ?? "[]",
    formFBillingPrompt: row.formFBillingPrompt ?? false,
    formFAddressRequired: row.formFAddressRequired ?? true,
    formFGuardianRequired: row.formFGuardianRequired ?? true,
  });
});

clinicSettingsRouter.get("/", async (_req, res) => {
  const row = await getOrCreate();
  res.json(row);
});

clinicSettingsRouter.put("/", async (req, res) => {
  const current = await getOrCreate();
  const body = req.body ?? {};
  const fields = ["name", "tagline", "address", "registeredAddress", "email", "phone", "website", "gstin", "footerNote", "logoDataUrl", "formFTestIds", "quickTestIds"] as const;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of fields) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (body.sidebarTheme !== undefined) {
    const VALID_THEMES = ["navy", "violet", "teal", "charcoal", "forest"];
    const isCustom = typeof body.sidebarTheme === "string" && /^custom:#[0-9a-fA-F]{6}$/.test(body.sidebarTheme);
    if (typeof body.sidebarTheme !== "string" || (!VALID_THEMES.includes(body.sidebarTheme) && !isCustom)) {
      res.status(400).json({ error: `sidebarTheme must be one of: ${VALID_THEMES.join(", ")} or custom:#rrggbb` });
      return;
    }
    update.sidebarTheme = body.sidebarTheme;
  }
  const boolFields = ["patientPhotoEnabled", "showTatOnBill", "qrOnBillEnabled", "portalEnabled", "portalAllowAppointmentBooking", "portalAllowProfileEdit", "onlineBookingEnabled", "vipQueueEnabled", "payuEnabled", "phonepeEnabled", "bharatpeEnabled", "cashfreeEnabled", "iciciEnabled", "upiQrEnabled", "billShowCode", "billShowCategory", "dayCloseAutoPrint", "lanOnlyLogin", "fido2Enabled", "kioskEnabled", "formFBillingPrompt", "formFAddressRequired", "formFGuardianRequired"] as const;
  const textFields = ["kioskUpiVpa", "kioskUpiName", "kioskWelcomeMessage", "kioskAllowedTestIds", "onlineBookingAllowedTestIds", "onlineBookingAllowedPackageIds", "razorpayKeyId", "payuMerchantKey", "phonepeMerchantId", "bharatpeMerchantId", "cashfreeAppId", "iciciMerchantId", "iciciAggregatorId", "formFTestIds", "quickTestIds", "footerNote", "commissionDiscountMode", "lanAllowedIps", "billDefaultPaperSize", "name", "tagline", "address", "registeredAddress", "email", "phone", "website", "gstin", "logoDataUrl", "portalHeading", "portalWelcomeMessage", "sidebarTheme"] as const;
  // NOTE: quickTestIds and formFTestIds are intentionally NOT in boolFields
  // because they store JSON-as-text (e.g. "[null,null,null,null,null,null]").
  // They are listed in textFields above.
  for (const f of boolFields) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "boolean") {
        res.status(400).json({ error: `${f} must be a boolean` });
        return;
      }
      update[f] = body[f];
    }
  }
  const portalTextFields = ["portalHeading", "portalWelcomeMessage"] as const;
  for (const f of portalTextFields) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "string") {
        res.status(400).json({ error: `${f} must be a string` });
        return;
      }
      if (body[f].length > 500) {
        res.status(400).json({ error: `${f} too long (max 500 chars)` });
        return;
      }
      update[f] = body[f];
    }
  }
  if (body.razorpayKeyId !== undefined) {
    if (typeof body.razorpayKeyId !== "string") {
      res.status(400).json({ error: "razorpayKeyId must be a string" });
      return;
    }
    update.razorpayKeyId = body.razorpayKeyId.trim();
  }
  if (body.payuMerchantKey !== undefined) {
    if (typeof body.payuMerchantKey !== "string") {
      res.status(400).json({ error: "payuMerchantKey must be a string" });
      return;
    }
    update.payuMerchantKey = body.payuMerchantKey.trim();
  }
  if (body.phonepeMerchantId !== undefined) {
    if (typeof body.phonepeMerchantId !== "string") {
      res.status(400).json({ error: "phonepeMerchantId must be a string" });
      return;
    }
    update.phonepeMerchantId = body.phonepeMerchantId.trim();
  }
  if (body.bharatpeMerchantId !== undefined) {
    if (typeof body.bharatpeMerchantId !== "string") {
      res.status(400).json({ error: "bharatpeMerchantId must be a string" });
      return;
    }
    update.bharatpeMerchantId = body.bharatpeMerchantId.trim();
  }
  if (body.cashfreeAppId !== undefined) {
    if (typeof body.cashfreeAppId !== "string") {
      res.status(400).json({ error: "cashfreeAppId must be a string" });
      return;
    }
    update.cashfreeAppId = body.cashfreeAppId.trim();
  }
  if (body.iciciMerchantId !== undefined) {
    if (typeof body.iciciMerchantId !== "string") {
      res.status(400).json({ error: "iciciMerchantId must be a string" });
      return;
    }
    update.iciciMerchantId = body.iciciMerchantId.trim();
  }
  if (body.iciciAggregatorId !== undefined) {
    if (typeof body.iciciAggregatorId !== "string") {
      res.status(400).json({ error: "iciciAggregatorId must be a string" });
      return;
    }
    update.iciciAggregatorId = body.iciciAggregatorId.trim();
  }
  const arrayJsonTextFields = ["kioskUpiVpa", "kioskUpiName", "kioskWelcomeMessage", "kioskAllowedTestIds", "onlineBookingAllowedTestIds", "onlineBookingAllowedPackageIds", "upiVpa", "upiQrImageUrl"] as const;
  for (const f of arrayJsonTextFields) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "string") {
        res.status(400).json({ error: `${f} must be a string` });
        return;
      }
      update[f] = body[f];
    }
  }
  if (body.onlineBookingLedgerId !== undefined) {
    const n = Number(body.onlineBookingLedgerId);
    if (!Number.isInteger(n) || n <= 0) {
      res.status(400).json({ error: "onlineBookingLedgerId must be a positive integer" });
      return;
    }
    update.onlineBookingLedgerId = n;
  }
  if (body.billDefaultPaperSize !== undefined) {
    if (body.billDefaultPaperSize !== "A4" && body.billDefaultPaperSize !== "A5") {
      res.status(400).json({ error: "billDefaultPaperSize must be A4 or A5" });
      return;
    }
    update.billDefaultPaperSize = body.billDefaultPaperSize;
  }
  if (body.billPrintCopies !== undefined) {
    const n = Number(body.billPrintCopies);
    if (!Number.isInteger(n) || (n !== 1 && n !== 2)) {
      res.status(400).json({ error: "billPrintCopies must be 1 or 2" });
      return;
    }
    update.billPrintCopies = n;
  }
  if (body.lanAllowedIps !== undefined) {
    if (typeof body.lanAllowedIps !== "string") {
      res.status(400).json({ error: "lanAllowedIps must be a JSON string" });
      return;
    }
    try {
      const parsed = JSON.parse(body.lanAllowedIps);
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) {
        res.status(400).json({ error: "lanAllowedIps must be a JSON array of strings" });
        return;
      }
    } catch {
      res.status(400).json({ error: "lanAllowedIps must be valid JSON" });
      return;
    }
    update.lanAllowedIps = body.lanAllowedIps;
  }
  if (body.commissionDiscountMode !== undefined) {
    const valid = ["none", "deduct", "deduct_rollover"];
    if (!valid.includes(body.commissionDiscountMode)) {
      res.status(400).json({ error: `commissionDiscountMode must be one of: ${valid.join(", ")}` });
      return;
    }
    update.commissionDiscountMode = body.commissionDiscountMode;
  }
  if (typeof update.logoDataUrl === "string" && update.logoDataUrl.length > 2_000_000) {
    res.status(413).json({ error: "Logo too large (max ~1.5MB)" });
    return;
  }
  if (typeof update.quickTestIds === "string") {
    if (update.quickTestIds.length > 200) {
      res.status(400).json({ error: "quickTestIds payload too large" });
      return;
    }
    try {
      const parsed = JSON.parse(update.quickTestIds);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 6 ||
        !parsed.every((v) => v === null || (typeof v === "number" && Number.isInteger(v) && v > 0))
      ) {
        res.status(400).json({ error: "quickTestIds must be an array of exactly 6 entries (positive integer test id or null)" });
        return;
      }
    } catch {
      res.status(400).json({ error: "quickTestIds must be valid JSON" });
      return;
    }
  }
  const updateResult = await db
    .update(clinicSettingsTable)
    .set(update)
    .where(eq(clinicSettingsTable.id, current.id))
    .returning();
  if (updateResult.length > 0) {
    res.json(updateResult[0]);
    return;
  }
  // Row was missing (e.g. getOrCreate returned a fallback object with no DB row).
  // Insert a new row with current defaults merged with the update.
  try {
    const insertValues = { ...current, ...update };
    delete (insertValues as any).id; // let DB auto-generate the PK
    const [inserted] = await db
      .insert(clinicSettingsTable)
      .values(insertValues)
      .returning();
    res.json(inserted);
  } catch (insertErr) {
    const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
    res.status(500).json({ error: "Settings save failed: " + msg });
  }
});

export default clinicSettingsRouter;
