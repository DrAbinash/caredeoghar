import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { whatsappSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireStaffPermission } from "../middleware/requireStaffAuth";

export const whatsappRouter: IRouter = Router();

async function getOrCreateSettings() {
  const [row] = await db.select().from(whatsappSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(whatsappSettingsTable).values({}).returning();
  return created;
}

whatsappRouter.get("/settings", async (_req, res) => {
  const s = await getOrCreateSettings();
  res.json({ ...s, accessToken: s.accessToken ? "••••••••" : "" });
});

whatsappRouter.put("/settings", requireStaffPermission("/settings"), async (req, res) => {
  const current = await getOrCreateSettings();
  const body = req.body ?? {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;
  if (typeof body.phoneNumberId === "string") updates.phoneNumberId = body.phoneNumberId.trim();
  if (typeof body.templateName === "string") updates.templateName = body.templateName.trim();
  if (typeof body.templateLang === "string") updates.templateLang = body.templateLang.trim() || "en";
  if (typeof body.defaultCountryCode === "string") updates.defaultCountryCode = body.defaultCountryCode.replace(/\D/g, "") || "91";
  if (typeof body.accessToken === "string" && body.accessToken && body.accessToken !== "••••••••") {
    updates.accessToken = body.accessToken.trim();
  }
  if (body.autoSendOnVerify !== undefined) updates.autoSendOnVerify = !!body.autoSendOnVerify;
  if (body.includeViewerLink !== undefined) updates.includeViewerLink = !!body.includeViewerLink;
  if (typeof body.reportMessageTemplate === "string") updates.reportMessageTemplate = body.reportMessageTemplate;
  const [row] = await db.update(whatsappSettingsTable).set(updates).where(eq(whatsappSettingsTable.id, current.id)).returning();
  res.json({ ...row, accessToken: row.accessToken ? "••••••••" : "" });
});

whatsappRouter.post("/test", requireStaffPermission("/settings"), async (req, res): Promise<void> => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: "phone required" });
    return;
  }
  const result = await sendBillWhatsapp({ phone, patientName: "Test User", billNumber: "TEST-0001", totalAmount: 0, tokenNo: 1 });
  res.json(result);
});

export function normalizePhone(raw: string, countryCode: string): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length >= 11) return digits;
  return `${countryCode}${digits}`;
}

export async function sendBillWhatsapp(params: {
  phone: string;
  patientName: string;
  billNumber: string;
  totalAmount: number;
  tokenNo: number;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; messageId?: string }> {
  const s = await getOrCreateSettings();
  if (!s.enabled) return { ok: false, skipped: true };
  if (!s.accessToken || !s.phoneNumberId || !s.templateName) {
    return { ok: false, error: "WhatsApp settings incomplete" };
  }
  const to = normalizePhone(params.phone, s.defaultCountryCode);
  if (!to) return { ok: false, error: "Invalid phone" };

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(s.phoneNumberId)}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: s.templateName,
      language: { code: s.templateLang || "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.patientName },
            { type: "text", text: params.billNumber },
            { type: "text", text: `₹${params.totalAmount.toFixed(2)}` },
            { type: "text", text: String(params.tokenNo) },
          ],
        },
      ],
    },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${s.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!resp.ok) {
      return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    }
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

// Send a report-ready notification via WhatsApp. Uses the same configured
// template as bills (4 body parameters: name, code, amount, token slot) since
// the typical clinic template is a single 4-slot interpolation. We map the
// fields semantically: patientName / reportNumber / testName / "READY".
// Falls back to a plain-text message if the template send fails because the
// template wasn't configured.
export async function sendReportWhatsapp(params: {
  phone: string;
  patientName: string;
  reportNumber: string;
  testName: string;
  reportUrl: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; messageId?: string }> {
  const s = await getOrCreateSettings();
  if (!s.enabled) return { ok: false, skipped: true };
  if (!s.accessToken || !s.phoneNumberId) {
    return { ok: false, error: "WhatsApp settings incomplete" };
  }
  const to = normalizePhone(params.phone, s.defaultCountryCode);
  if (!to) return { ok: false, error: "Invalid phone" };

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(s.phoneNumberId)}/messages`;

  // Try template first if configured.
  if (s.templateName) {
    const tplPayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: s.templateName,
        language: { code: s.templateLang || "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: params.patientName },
              { type: "text", text: params.reportNumber },
              { type: "text", text: params.testName },
              { type: "text", text: "READY" },
            ],
          },
        ],
      },
    };
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(tplPayload),
      });
      const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (resp.ok) return { ok: true, messageId: data.messages?.[0]?.id };
      // fall through to text fallback
    } catch { /* fall through to text fallback */ }
  }

  // Plain-text fallback (works when templates aren't approved yet).
  const textPayload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: `Hello ${params.patientName}, your ${params.testName} report (${params.reportNumber}) is ready. View: ${params.reportUrl}` },
  };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(textPayload),
    });
    const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!resp.ok) return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

// Auto-delivery helper used by patient-reports verify hook. Sends a friendly
// plain-text message containing the PDF link and (optionally) a tokenized
// image-viewer link. Honours `reportMessageTemplate` placeholders.
export async function sendReportDelivery(params: {
  phone: string;
  patientName: string;
  reportNumber: string;
  testName: string;
  reportUrl: string;
  viewerUrl?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; messageId?: string }> {
  const s = await getOrCreateSettings();
  if (!s.enabled) return { ok: false, skipped: true };
  if (!s.accessToken || !s.phoneNumberId) return { ok: false, error: "WhatsApp settings incomplete" };
  const to = normalizePhone(params.phone, s.defaultCountryCode);
  if (!to) return { ok: false, error: "Invalid phone" };

  const tpl = (s.reportMessageTemplate || "").trim();
  const viewerLine = params.viewerUrl && s.includeViewerLink !== false
    ? `\nView images: ${params.viewerUrl}`
    : "";
  const defaultBody = `Hello ${params.patientName}, your ${params.testName} report (${params.reportNumber}) is ready.\nDownload: ${params.reportUrl}${viewerLine}\n— DiagnoCenter`;
  const body = tpl
    ? tpl
        .replace(/\{\{name\}\}/g, params.patientName)
        .replace(/\{\{reportNumber\}\}/g, params.reportNumber)
        .replace(/\{\{testName\}\}/g, params.testName)
        .replace(/\{\{reportUrl\}\}/g, params.reportUrl)
        .replace(/\{\{viewerUrl\}\}/g, params.viewerUrl ?? "")
    : defaultBody;

  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(s.phoneNumberId)}/messages`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!resp.ok) return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

export default whatsappRouter;
