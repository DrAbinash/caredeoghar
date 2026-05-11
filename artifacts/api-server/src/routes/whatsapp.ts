import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { whatsappSettingsTable, whatsappConversationsTable, clinicSettingsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireStaffPermission } from "../middleware/requireStaffAuth";
import { geminiGenerate } from "@workspace/integrations-gemini-ai";

export const whatsappRouter: IRouter = Router();
export const whatsappWebhookRouter: IRouter = Router();

async function getOrCreateSettings() {
  const [row] = await db.select().from(whatsappSettingsTable).limit(1);
  if (row) return row;
  const [created] = await db.insert(whatsappSettingsTable).values({}).returning();
  return created;
}

// ─── Existing Settings & Send Routes ──────────────────────────────────────────

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
  // New webhook + AI fields
  if (typeof body.wabaId === "string") updates.wabaId = body.wabaId.trim();
  if (typeof body.webhookVerifyToken === "string") updates.webhookVerifyToken = body.webhookVerifyToken.trim();
  if (body.aiAssistantEnabled !== undefined) updates.aiAssistantEnabled = !!body.aiAssistantEnabled;
  if (typeof body.aiAssistantName === "string") updates.aiAssistantName = body.aiAssistantName.trim();
  if (typeof body.aiSystemPrompt === "string") updates.aiSystemPrompt = body.aiSystemPrompt;
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

// ─── Conversation Inbox Routes ─────────────────────────────────────────────────

whatsappRouter.get("/conversations", requireStaffPermission("/settings"), async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select()
    .from(whatsappConversationsTable)
    .orderBy(desc(whatsappConversationsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(whatsappConversationsTable);

  res.json({ conversations: rows, total: Number(count), page, limit });
});

whatsappRouter.get("/conversations/:phone", requireStaffPermission("/settings"), async (req, res): Promise<void> => {
  const phone = String(req.params.phone ?? "");
  const rows = await db
    .select()
    .from(whatsappConversationsTable)
    .where(eq(whatsappConversationsTable.phone, phone))
    .orderBy(desc(whatsappConversationsTable.createdAt))
    .limit(100);
  res.json(rows);
});

whatsappRouter.post("/conversations/:phone/reply", requireStaffPermission("/settings"), async (req, res): Promise<void> => {
  const phone = String(req.params.phone ?? "");
  const { message } = req.body as { message?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: "message required" });
    return;
  }

  const s = await getOrCreateSettings();
  const result = await sendTextMessage(phone, message.trim(), s);
  if (!result.ok) {
    res.status(502).json({ error: result.error ?? "Send failed" });
    return;
  }

  // Log the outgoing reply
  await db.insert(whatsappConversationsTable).values({
    phone,
    customerName: "",
    direction: "outgoing",
    messageBody: message.trim(),
    waMessageId: result.messageId ?? "",
    aiHandled: false,
    status: "sent",
  });

  res.json({ ok: true, messageId: result.messageId });
});

// ─── Public Webhook Routes (Meta verification + incoming messages) ──────────────

whatsappWebhookRouter.get("/", (req: Request, res: Response): void => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  getOrCreateSettings().then((s) => {
    if (mode === "subscribe" && token && token === s.webhookVerifyToken) {
      res.status(200).send(String(challenge ?? ""));
    } else {
      res.status(403).json({ error: "Webhook verification failed" });
    }
  }).catch(() => res.status(500).json({ error: "Internal error" }));
});

whatsappWebhookRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  // Always respond 200 immediately to prevent Meta from retrying
  res.status(200).json({ status: "ok" });

  try {
    const body = req.body as WhatsappWebhookBody;
    if (body.object !== "whatsapp_business_account") return;

    const s = await getOrCreateSettings();

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const value = change.value;

        for (const msg of value.messages ?? []) {
          if (msg.type !== "text" || !msg.text?.body) continue;

          const phone = msg.from;
          const text  = msg.text.body;
          const waId  = msg.id;
          const name  = value.contacts?.find((c) => c.wa_id === phone)?.profile?.name ?? "";

          // Save incoming message
          await db.insert(whatsappConversationsTable).values({
            phone,
            customerName: name,
            direction: "incoming",
            messageBody: text,
            waMessageId: waId,
            aiHandled: false,
            status: "received",
          });

          // AI assistant auto-reply
          if (s.aiAssistantEnabled && s.accessToken && s.phoneNumberId) {
            void handleAiReply({ phone, text, name, s }).catch(() => {});
          }
        }
      }
    }
  } catch (_err) {
    // Errors are swallowed — 200 already sent to Meta
  }
});

// ─── AI Reply Handler ──────────────────────────────────────────────────────────

async function handleAiReply(params: {
  phone: string;
  text: string;
  name: string;
  s: typeof whatsappSettingsTable.$inferSelect;
}): Promise<void> {
  const { phone, text, name, s } = params;

  // Load clinic info for AI context
  const [clinic] = await db.select({
    name: clinicSettingsTable.name,
    tagline: clinicSettingsTable.tagline,
    address: clinicSettingsTable.address,
    phone: clinicSettingsTable.phone,
    email: clinicSettingsTable.email,
    website: clinicSettingsTable.website,
  }).from(clinicSettingsTable).limit(1);

  const clinicName    = clinic?.name    ?? "DiagnoCenter";
  const clinicAddress = clinic?.address ?? "";
  const clinicPhone   = clinic?.phone   ?? "";
  const clinicEmail   = clinic?.email   ?? "";
  const clinicWeb     = clinic?.website ?? "";
  const assistantName = s.aiAssistantName || "DiagnoCenter Assistant";

  const defaultSystemPrompt = `You are ${assistantName}, the AI assistant for ${clinicName} diagnostic center.
${clinic?.tagline ? `Tagline: ${clinic.tagline}` : ""}
${clinicAddress ? `Address: ${clinicAddress}` : ""}
${clinicPhone ? `Phone: ${clinicPhone}` : ""}
${clinicEmail ? `Email: ${clinicEmail}` : ""}
${clinicWeb ? `Website: ${clinicWeb}` : ""}

You help patients with:
- Information about available diagnostic tests and packages
- Appointment booking guidance (ask them to call or visit)
- Report collection and turnaround times
- General FAQs about the diagnostic center
- Directing urgent or complex queries to staff

Keep replies concise (under 100 words), warm, and professional. Do not make up specific prices, results, or medical diagnoses. Always recommend consulting a doctor for medical concerns.`;

  const systemPrompt = (s.aiSystemPrompt?.trim() || defaultSystemPrompt);

  const prompt = `${systemPrompt}

Patient name: ${name || "Patient"}
Patient message: ${text}

Reply in a helpful, friendly manner. Be concise.`;

  try {
    const reply = await geminiGenerate(prompt, { maxTokens: 300 });
    if (!reply) return;

    const result = await sendTextMessage(phone, reply, s);
    if (!result.ok) return;

    // Log outgoing AI reply
    await db.insert(whatsappConversationsTable).values({
      phone,
      customerName: name,
      direction: "outgoing",
      messageBody: reply,
      waMessageId: result.messageId ?? "",
      aiHandled: true,
      status: "sent",
    });
  } catch (_err) {
    // AI errors are swallowed to prevent webhook retry storms
  }
}

// ─── Low-level send helpers ────────────────────────────────────────────────────

async function sendTextMessage(
  to: string,
  body: string,
  s: typeof whatsappSettingsTable.$inferSelect,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  if (!s.accessToken || !s.phoneNumberId) return { ok: false, error: "WhatsApp not configured" };
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(s.phoneNumberId)}/messages`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    const data = (await resp.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!resp.ok) return { ok: false, error: data.error?.message ?? `HTTP ${resp.status}` };
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

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
    } catch { /* fall through to text fallback */ }
  }

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

  const result = await sendTextMessage(to, body, s);
  return result;
}

// ─── Webhook body types ────────────────────────────────────────────────────────

interface WhatsappWebhookBody {
  object?: string;
  entry?: {
    id: string;
    changes?: {
      field: string;
      value: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body?: string };
          timestamp: string;
        }[];
      };
    }[];
  }[];
}

export default whatsappRouter;
