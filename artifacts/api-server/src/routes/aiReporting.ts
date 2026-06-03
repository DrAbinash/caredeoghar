/**
 * AI Radiology Reporting routes
 *
 * Security model:
 *  - All routes require requireStaffAuth (enforced at mount in routes/index.ts)
 *  - GET/POST /settings + GET /audit-log require canConfigure (admin/superadmin
 *    or "ai_reporting.configure" permission)
 *  - POST /query, POST /drafts, POST /insert-to-report require canUse
 *    (FULL_ACCESS_ROLES or "ai_reporting.use") filtered by allowedRoles global setting
 *  - API keys AES-256-CBC encrypted at rest; never returned to frontend
 *  - All AI calls go through this backend — never directly from the browser
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  aiProviderSettingsTable,
  aiReportingAuditLogsTable,
  aiReportingDraftsTable,
  aiPromptTemplatesTable,
  pacsSettingsTable,
  patientsTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { type StaffAuthRequest, FULL_ACCESS_ROLES } from "../middleware/requireStaffAuth";
import { encryptSecret } from "../lib/cryptoUtils";
import {
  BUILTIN_PROVIDER_NAMES,
  BUILTIN_PROVIDER_CONFIGS,
  loadProviderConfigs,
  loadProviderConfig,
  createAiProvider,
  getProviderApiKey,
  getProviderEndpointUrl,
  generateAiResponse,
  resolveTaskRoute,
} from "@workspace/ai-providers";
import { radiologyWorklistTable } from "@workspace/db/schema";

// ─── Prompt template presets ──────────────────────────────────────────────────
export const AI_PROMPT_TEMPLATES: Record<string, string> = {
  "MRI Brain Report Sequence Wise":
    "Provide a detailed radiology report for this MRI Brain study. Report findings sequence by sequence: T1W, T2W, FLAIR, DWI/ADC, T1W+Contrast (if available), SWI/GRE. Comment on: parenchyma, white matter, ventricles, sulci, basal ganglia, thalami, brainstem, cerebellum, extra-axial spaces, and vascular structures. Conclude with Impression.",
  "CT Brain Report":
    "Provide a structured CT Brain report. Comment on: parenchyma density, grey-white differentiation, ventricles and CSF spaces, sulci, midline shift, basal cisterns, bone windows (calvarium, skull base), and any hemorrhage or ischemic change. Conclude with Impression.",
  "MRI Spine Report":
    "Provide a detailed MRI Spine report. For each vertebral level comment on: vertebral body height and signal, disc height and signal, facet joints, neural foramina, spinal canal diameter, cord/cauda equina signal, and any focal lesion or herniation. Summarise alignment and any significant stenosis. Conclude with Impression.",
  "USG Abdomen Report":
    "Provide a structured Ultrasound Abdomen report. Systematically evaluate: liver (size, echotexture, focal lesions, biliary radicles), gallbladder, CBD, spleen, pancreas, kidneys (size, parenchyma, PCS), urinary bladder, aorta, and free fluid. Conclude with Impression.",
  "X-ray Report":
    "Provide a structured X-ray report. Comment on: technical adequacy, bones and joints, soft tissues, and the relevant organ system (chest: cardiomediastinal silhouette, lung fields, costophrenic angles, pleura; abdomen: bowel gas pattern, solid organ outlines, free gas). Conclude with Impression.",
  "Abnormality Only":
    "Review the provided imaging and report ONLY significant abnormal findings. Skip normal structures. Use concise, structured bullet points. Conclude with a short Impression.",
  "Impression Only":
    "Based on the imaging provided, generate a brief 3–5 line Impression section only (no detailed findings). Use standard radiology terminology.",
  "Compare With Previous Study":
    "Compare the current imaging with the previous study. For each relevant structure, note: unchanged, improved, or worsened — with specifics. Highlight any new findings. Conclude with a comparative Impression.",
  "Emergency Findings":
    "Rapidly assess the imaging for life-threatening or time-critical findings requiring immediate action. Flag: herniation, large stroke, tension pneumothorax, active hemorrhage, bowel obstruction, aortic dissection, cord compression, or other emergencies. Conclude with an urgent Impression.",
  "Post-Contrast Enhancement Query":
    "Analyse post-contrast sequences. Describe the pattern of enhancement (homogeneous, heterogeneous, ring-enhancing, peripheral, no enhancement) for each lesion or region of interest. Comment on breakdown of blood-brain barrier or blood supply. Conclude with Impression.",
  "Infarct vs Tumor Differentiation":
    "Analyse the imaging to differentiate cerebral infarct from neoplasm. Compare: DWI restriction, ADC values, enhancement pattern, surrounding oedema/mass effect, vascular territory distribution, and clinical timeline if provided. Provide differential diagnosis with rationale. Conclude with Impression.",
  "Stroke Protocol MRI":
    "Report this Stroke Protocol MRI. Evaluate in order: DWI (acute restriction, volume, vascular territory), ADC map, FLAIR (infarct age, leukoaraiosis), T2*, SWI or GRE (haemorrhagic transformation, microbleeds), MRA (vessel occlusion/stenosis if included), T1+Gad (if included). Conclude with ASPECTS score estimate and Impression.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getSetting(key: string, category: string): Promise<string | null> {
  const row = await db
    .select({ value: pacsSettingsTable.value })
    .from(pacsSettingsTable)
    .where(and(eq(pacsSettingsTable.key, key), eq(pacsSettingsTable.category, category)))
    .limit(1);
  return row[0]?.value ?? null;
}

function getStaffSession(req: StaffAuthRequest) {
  return req.staffSession ?? null;
}

function canConfigure(req: StaffAuthRequest): boolean {
  const u = getStaffSession(req);
  if (!u) return false;
  if (FULL_ACCESS_ROLES.has(u.role)) return true;
  return u.permissions.includes("ai_reporting.configure");
}

function canUse(req: StaffAuthRequest, allowedRoles: string[]): boolean {
  const u = getStaffSession(req);
  if (!u) return false;
  if (FULL_ACCESS_ROLES.has(u.role)) return true;
  if (!u.permissions.includes("ai_reporting.use")) return false;
  return allowedRoles.length === 0 || allowedRoles.includes(u.role);
}

async function getGlobalSettings(): Promise<{
  enabled: boolean;
  defaultProvider: string;
  defaultPrompt: string;
  defaultPromptTemplate: string;
  includeDemographics: boolean;
  anonymize: boolean;
  allowedRoles: string[];
}> {
  const row = await db
    .select({ settingsJson: aiProviderSettingsTable.settingsJson })
    .from(aiProviderSettingsTable)
    .where(eq(aiProviderSettingsTable.provider, "__global__"))
    .limit(1);

  const defaults = {
    enabled: false,
    defaultProvider: "gemini",
    defaultPrompt: "",
    defaultPromptTemplate: "",
    includeDemographics: false,
    anonymize: true,
    allowedRoles: ["admin", "super_admin", "doctor", "radiologist"],
  };

  if (!row[0]?.settingsJson) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(row[0].settingsJson) as object) };
  } catch {
    return defaults;
  }
}

// Fetch JPEG thumbnails from Orthanc DICOMweb for a study.
async function fetchStudyImages(opts: {
  studyInstanceUID: string;
  seriesUIDs?: string[];
  maxImages: number;
  maxWidthPx?: number;
}): Promise<string[]> {
  const orthancBase = await getSetting("orthanc_base_url", "orthanc");
  if (!orthancBase) return [];

  const base = orthancBase.replace(/\/$/, "");
  const dicomWebBase = `${base}/dicom-web`;
  const jsonHeaders: Record<string, string> = { Accept: "application/json" };

  type DcmTag = { Value?: (string | { Alphabetic?: string })[] };
  type DcmEntry = Record<string, DcmTag>;

  // 1. Get series list
  const seriesResp = await fetch(
    `${dicomWebBase}/studies/${opts.studyInstanceUID}/series`,
    { headers: jsonHeaders },
  ).catch(() => null);
  if (!seriesResp?.ok) return [];

  let seriesList: DcmEntry[] = [];
  try {
    seriesList = (await seriesResp.json()) as DcmEntry[];
  } catch {
    return [];
  }

  // Filter by requested seriesUIDs if provided
  if (opts.seriesUIDs && opts.seriesUIDs.length > 0) {
    seriesList = seriesList.filter((s) => {
      const uid = (s["0020000E"]?.Value?.[0] as string | undefined) ?? "";
      return opts.seriesUIDs!.includes(uid);
    });
  }

  const images: string[] = [];
  const maxImages = Math.min(opts.maxImages, 20);

  for (const series of seriesList) {
    if (images.length >= maxImages) break;
    const seriesUID = (series["0020000E"]?.Value?.[0] as string | undefined) ?? "";
    if (!seriesUID) continue;

    // 2. Get instances in series
    const instancesResp = await fetch(
      `${dicomWebBase}/studies/${opts.studyInstanceUID}/series/${seriesUID}/instances`,
      { headers: jsonHeaders },
    ).catch(() => null);
    if (!instancesResp?.ok) continue;

    let instances: DcmEntry[] = [];
    try {
      instances = (await instancesResp.json()) as DcmEntry[];
    } catch {
      continue;
    }

    // Pick middle instance for representative frame
    const midIdx = Math.floor(instances.length / 2);
    const inst = instances[midIdx];
    if (!inst) continue;
    const instanceUID = (inst["00080018"]?.Value?.[0] as string | undefined) ?? "";
    if (!instanceUID) continue;

    // 3. Fetch rendered JPEG
    const rendered = await fetch(
      `${dicomWebBase}/studies/${opts.studyInstanceUID}/series/${seriesUID}/instances/${instanceUID}/rendered`,
      { headers: { Accept: "image/jpeg" } },
    ).catch(() => null);
    if (!rendered?.ok) continue;

    try {
      const arrayBuf = await rendered.arrayBuffer();
      const rawArr = new Uint8Array(arrayBuf as ArrayBuffer);
      let b64: string;

      // Resize with sharp (optional — skip gracefully if unavailable)
      try {
        const sharp = (await import("sharp")).default;
        // sharp accepts Uint8Array directly, and we type the result as string immediately
        const resized = await sharp(rawArr)
          .resize({ width: opts.maxWidthPx ?? 512, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        b64 = resized.toString("base64");
      } catch {
        // sharp not available or failed — encode raw bytes
        b64 = Buffer.from(rawArr).toString("base64");
      }

      images.push(b64);
    } catch {
      continue;
    }
  }

  return images;
}

// ─── AI provider query functions ──────────────────────────────────────────────
// ─── Router ───────────────────────────────────────────────────────────────────
const router = Router();

/**
 * GET /api/ai-reporting/settings
 * Returns settings with hasApiKey flag but never the raw key.
 */
router.get("/settings", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!sReq.staffSession) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [globalSettings, providers, dbTemplates] = await Promise.all([
    getGlobalSettings(),
    loadProviderConfigs(),
    db
      .select({
        name: aiPromptTemplatesTable.name,
        modality: aiPromptTemplatesTable.modality,
      })
      .from(aiPromptTemplatesTable)
      .where(eq(aiPromptTemplatesTable.isActive, true))
      .orderBy(aiPromptTemplatesTable.modality, aiPromptTemplatesTable.name),
  ]);

  const providersOut: Record<string, object> = {};
  for (const p of providers) {
    const meta = BUILTIN_PROVIDER_CONFIGS[p.provider];
    providersOut[p.provider] = {
      provider: p.provider,
      isEnabled: p.isEnabled ?? false,
      isDefault: p.isDefault ?? false,
      hasApiKey: p.hasApiKey,
      hasEndpointUrl: p.hasEndpointUrl,
      defaultModel: p.defaultModel ?? null,
      endpointUrl: p.endpointUrl ?? null,
      label: meta?.label ?? p.provider,
      needsApiKey: meta?.needsApiKey ?? false,
      needsEndpointUrl: meta?.needsEndpointUrl ?? false,
      defaultModels: meta?.defaultModels ?? [],
      placeholder: meta?.placeholder ?? "",
    };
  }

  // Phase 1: DB-backed templates are the source of truth; merge in any legacy
  // hardcoded preset names that haven't been migrated yet (de-duplicated).
  const dbNames = dbTemplates.map((t) => t.name);
  const mergedTemplateNames = Array.from(
    new Set([...dbNames, ...Object.keys(AI_PROMPT_TEMPLATES)]),
  );

  res.json({
    global: globalSettings,
    providers: providersOut,
    promptTemplates: mergedTemplateNames,
    promptTemplatesByModality: dbTemplates,
  });
});

/**
 * POST /api/ai-reporting/settings
 * Saves global settings and per-provider settings. Admin/superadmin only.
 */
router.post("/settings", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!canConfigure(sReq)) {
    res.status(403).json({ error: "Only administrators can configure AI reporting settings." });
    return;
  }

  const { global: globalIn, providers: providersIn } = req.body as {
    global?: {
      enabled?: boolean;
      defaultProvider?: string;
      defaultPrompt?: string;
      defaultPromptTemplate?: string;
      includeDemographics?: boolean;
      anonymize?: boolean;
      allowedRoles?: string[];
    };
    providers?: Record<string, {
      isEnabled?: boolean;
      isDefault?: boolean;
      apiKey?: string;
      defaultModel?: string;
      endpointUrl?: string;
    }>;
  };

  if (globalIn !== undefined) {
    const existing = await db
      .select({ id: aiProviderSettingsTable.id, settingsJson: aiProviderSettingsTable.settingsJson })
      .from(aiProviderSettingsTable)
      .where(eq(aiProviderSettingsTable.provider, "__global__"))
      .limit(1);

    const prev = existing[0]?.settingsJson
      ? (() => { try { return JSON.parse(existing[0].settingsJson!) as object; } catch { return {}; } })()
      : {};
    const next = { ...prev, ...globalIn };

    if (existing[0]) {
      await db.update(aiProviderSettingsTable)
        .set({ settingsJson: JSON.stringify(next) })
        .where(eq(aiProviderSettingsTable.id, existing[0].id));
    } else {
      await db.insert(aiProviderSettingsTable).values({ provider: "__global__", settingsJson: JSON.stringify(next) });
    }
  }

  for (const provName of BUILTIN_PROVIDER_NAMES) {
    const pd = providersIn?.[provName];
    if (!pd) continue;

    const existing = await db
      .select()
      .from(aiProviderSettingsTable)
      .where(eq(aiProviderSettingsTable.provider, provName))
      .limit(1);

    const update: Partial<typeof aiProviderSettingsTable.$inferInsert> = {};
    if (pd.isEnabled !== undefined) update.isEnabled = pd.isEnabled;
    if (pd.isDefault !== undefined) update.isDefault = pd.isDefault;
    if (pd.defaultModel !== undefined) update.defaultModel = pd.defaultModel;
    if (pd.apiKey && pd.apiKey.trim().length > 0) {
      update.encryptedApiKey = encryptSecret(pd.apiKey.trim());
    }
    if (pd.endpointUrl && pd.endpointUrl.trim().length > 0) {
      update.endpointUrl = pd.endpointUrl.trim();
    }

    if (existing[0]) {
      if (Object.keys(update).length > 0) {
        await db.update(aiProviderSettingsTable).set(update).where(eq(aiProviderSettingsTable.id, existing[0].id));
      }
    } else {
      await db.insert(aiProviderSettingsTable).values({ provider: provName, ...update });
    }

    if (pd.isDefault) {
      for (const op of BUILTIN_PROVIDER_NAMES.filter((p) => p !== provName)) {
        await db.update(aiProviderSettingsTable).set({ isDefault: false }).where(eq(aiProviderSettingsTable.provider, op));
      }
    }
  }

  res.json({ success: true });
});

/**
 * POST /api/ai-reporting/test-provider
 */
router.post("/test-provider", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!canConfigure(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const { provider, apiKey, model, endpointUrl } = req.body as { provider: string; apiKey?: string; model?: string; endpointUrl?: string };

  if (!BUILTIN_PROVIDER_NAMES.includes(provider)) {
    res.status(400).json({ error: "Unknown provider." }); return;
  }

  const config = BUILTIN_PROVIDER_CONFIGS[provider];
  let key = apiKey?.trim() ?? "";
  let url = endpointUrl?.trim() ?? "";

  if (config.needsEndpointUrl) {
    if (!url) {
      const stored = await getProviderEndpointUrl(provider);
      if (!stored) { res.status(400).json({ error: `No endpoint URL configured for ${config.label}.` }); return; }
      url = stored;
    }
  } else {
    if (!key) {
      const stored = await getProviderApiKey(provider);
      if (!stored) { res.status(400).json({ error: "No API key configured for this provider." }); return; }
      key = stored;
    }
  }

  const instance = await createAiProvider(provider, key || undefined, url || undefined);
  if (!instance) {
    res.status(400).json({ error: "Could not create provider instance." }); return;
  }

  const result = await instance.testConnection();
  res.json({
    success: result.ok,
    response: result.message.substring(0, 200),
    availableModels: result.availableModels,
    error: result.ok ? undefined : result.message,
  });
});

/**
 * POST /api/ai-reporting/query
 * Main AI query endpoint.
 */
router.post("/query", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();

  if (!globalSettings.enabled) {
    res.status(403).json({ error: "AI Reporting is disabled. Enable it in Settings." }); return;
  }
  if (!canUse(sReq, globalSettings.allowedRoles)) {
    res.status(403).json({ error: "You do not have permission to use AI reporting." }); return;
  }

  const user = sReq.staffSession!;

  const {
    studyInstanceUID,
    accessionNumber,
    patientId,
    seriesUIDs,
    scope = "study",
    provider: providerReq,
    model: modelReq,
    prompt,
    templateName,
    clinicalHistory,
    anonymize,
    includeDemographics = globalSettings.includeDemographics,
    maxImages = 6,
  } = req.body as {
    studyInstanceUID?: string;
    accessionNumber?: string;
    patientId?: number;
    seriesUIDs?: string[];
    scope?: string;
    provider?: string;
    model?: string;
    prompt?: string;
    templateName?: string;
    clinicalHistory?: string;
    anonymize?: boolean;
    includeDemographics?: boolean;
    maxImages?: number;
  };

  const shouldAnonymize = anonymize ?? globalSettings.anonymize;
  // Phase 4: when the caller does not explicitly pick a provider, consult the
  // per-task model route for "radiology_draft" before falling back to the
  // global default. Explicit request values always win, so this is non-breaking.
  const taskRoute = providerReq ? null : await resolveTaskRoute("radiology_draft");
  const providerName = providerReq ?? taskRoute?.provider ?? globalSettings.defaultProvider;

  if (!BUILTIN_PROVIDER_NAMES.includes(providerName)) {
    res.status(400).json({ error: "Invalid provider." }); return;
  }

  const provConfig = await loadProviderConfig(providerName);
  if (!provConfig || !provConfig.isEnabled) {
    res.status(400).json({ error: `${providerName} provider is disabled or not configured. Enable it in AI Reporting Settings.` }); return;
  }

  const model = modelReq ?? taskRoute?.model ?? provConfig.defaultModel ?? "";

  // Build prompt
  let finalPrompt = prompt?.trim() ?? "";
  // Phase 1: prefer the DB-backed (editable) prompt template library, then fall
  // back to the legacy hardcoded presets for backward compatibility.
  if (!finalPrompt && templateName) {
    const dbTpl = await db
      .select({ promptContent: aiPromptTemplatesTable.promptContent })
      .from(aiPromptTemplatesTable)
      .where(
        and(
          eq(aiPromptTemplatesTable.name, templateName),
          eq(aiPromptTemplatesTable.isActive, true),
        ),
      )
      .orderBy(aiPromptTemplatesTable.id)
      .limit(1);
    if (dbTpl[0]?.promptContent) {
      finalPrompt = dbTpl[0].promptContent;
    } else if (AI_PROMPT_TEMPLATES[templateName]) {
      finalPrompt = AI_PROMPT_TEMPLATES[templateName];
    }
  }
  if (!finalPrompt) {
    finalPrompt = globalSettings.defaultPrompt || "Provide a detailed radiology report for the provided images.";
  }
  if (clinicalHistory?.trim()) {
    finalPrompt += `\n\nClinical History: ${clinicalHistory.trim()}`;
  }

  // Optionally append patient demographics
  if (includeDemographics && patientId && !shouldAnonymize) {
    try {
      const pt = await db
        .select({
          firstName: patientsTable.firstName,
          lastName: patientsTable.lastName,
          ageValue: patientsTable.ageValue,
          gender: patientsTable.gender,
        })
        .from(patientsTable)
        .where(eq(patientsTable.id, patientId))
        .limit(1);
      if (pt[0]) {
        const name = [pt[0].firstName, pt[0].lastName].filter(Boolean).join(" ");
        finalPrompt += `\n\nPatient: ${name || "Unknown"}, Age: ${pt[0].ageValue ?? "Unknown"}, Gender: ${pt[0].gender ?? "Unknown"}`;
      }
    } catch {
      // non-critical
    }
  }

  if (shouldAnonymize) {
    finalPrompt = `[Note: Patient identifiers have been removed from images for privacy.]\n\n${finalPrompt}`;
  }

  // Fetch images
  let images: string[] = [];
  if (studyInstanceUID) {
    images = await fetchStudyImages({
      studyInstanceUID,
      seriesUIDs: scope === "series" ? seriesUIDs : undefined,
      maxImages: Math.min(maxImages, 20),
      maxWidthPx: 512,
    });
  }

  // Call AI provider via unified abstraction
  const aiResult = await generateAiResponse(providerName, finalPrompt, images, { model });
  const success = aiResult.success;
  const aiResponse = aiResult.text;
  const errorMsg = aiResult.error;

  // Audit log (non-critical)
  await db.insert(aiReportingAuditLogsTable).values({
    userId: user.subjectId,
    userName: user.subjectName,
    patientId: patientId ?? null,
    studyInstanceUID: studyInstanceUID ?? null,
    accessionNumber: accessionNumber ?? null,
    provider: providerName,
    model: model || null,
    promptText: finalPrompt.substring(0, 2000),
    numImages: images.length,
    anonymized: shouldAnonymize,
    includedDemographics: includeDemographics && !shouldAnonymize,
    success,
    errorMessage: errorMsg ?? null,
  }).catch(() => { /* non-critical */ });

  if (!success) {
    res.status(502).json({ error: errorMsg ?? "AI provider error" }); return;
  }

  res.json({ aiResponse, provider: providerName, model: model || null, numImages: images.length, anonymized: shouldAnonymize });
});

/**
 * GET /api/ai-reporting/audit-log
 */
router.get("/audit-log", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  if (!canConfigure(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const limit = Math.min(Number(req.query["limit"] ?? 50), 200);
  const offset = Number(req.query["offset"] ?? 0);
  const studyUID = req.query["studyInstanceUID"] as string | undefined;

  const rows = await db
    .select()
    .from(aiReportingAuditLogsTable)
    .where(studyUID ? eq(aiReportingAuditLogsTable.studyInstanceUID, studyUID) : undefined)
    .orderBy(desc(aiReportingAuditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

/**
 * POST /api/ai-reporting/drafts
 */
router.post("/drafts", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();
  if (!canUse(sReq, globalSettings.allowedRoles)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const user = sReq.staffSession!;
  const {
    id: existingId,
    studyInstanceUID,
    accessionNumber,
    patientId,
    provider,
    model,
    promptText,
    templateName,
    aiResponse,
    draftText,
    status = "draft",
  } = req.body as {
    id?: number;
    studyInstanceUID?: string;
    accessionNumber?: string;
    patientId?: number;
    provider: string;
    model?: string;
    promptText?: string;
    templateName?: string;
    aiResponse?: string;
    draftText?: string;
    status?: string;
  };

  if (existingId) {
    await db.update(aiReportingDraftsTable)
      .set({ draftText, aiResponse, status, updatedAt: new Date() })
      .where(eq(aiReportingDraftsTable.id, existingId));
    res.json({ id: existingId }); return;
  }

  const inserted = await db.insert(aiReportingDraftsTable)
    .values({
      studyInstanceUID: studyInstanceUID ?? null,
      accessionNumber: accessionNumber ?? null,
      patientId: patientId ?? null,
      userId: user.subjectId,
      userName: user.subjectName,
      provider,
      model: model ?? null,
      promptText: promptText ?? null,
      templateName: templateName ?? null,
      aiResponse: aiResponse ?? null,
      draftText: draftText ?? null,
      status,
    })
    .returning({ id: aiReportingDraftsTable.id });

  res.json({ id: inserted[0]?.id });
});

/**
 * GET /api/ai-reporting/drafts/:studyId
 */
router.get("/drafts/:studyId", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();
  if (!canUse(sReq, globalSettings.allowedRoles)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const rows = await db
    .select()
    .from(aiReportingDraftsTable)
    .where(eq(aiReportingDraftsTable.studyInstanceUID, req.params["studyId"] ?? ""))
    .orderBy(desc(aiReportingDraftsTable.createdAt));

  res.json(rows);
});

/**
 * POST /api/ai-reporting/insert-to-report
 */
router.post("/insert-to-report", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();
  if (!canUse(sReq, globalSettings.allowedRoles)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const user = sReq.staffSession!;
  const { draftId } = req.body as { draftId: number };

  await db.update(aiReportingDraftsTable)
    .set({ status: "inserted", insertedAt: new Date(), insertedBy: user.subjectName })
    .where(eq(aiReportingDraftsTable.id, draftId));

  await db.update(aiReportingAuditLogsTable)
    .set({ wasInsertedToReport: true })
    .where(eq(aiReportingAuditLogsTable.draftId, draftId));

  res.json({ success: true });
});

/**
 * GET /api/ai-reporting/quality-scores
 * Phase 5: Reporting Quality Scoring — aggregate metrics from radiologist feedback.
 */
router.get("/quality-scores", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();
  if (!canConfigure(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const { from, to, scope = "overall" } = req.query as Record<string, string>;
  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const dateTo = to ? new Date(to) : new Date();

  const whereClause = and(
    gte(radiologyWorklistTable.createdAt, dateFrom),
    lte(radiologyWorklistTable.createdAt, dateTo),
  );

  const [overall, byModality] = await Promise.all([
    db
      .select({
        totalDrafts: sql<number>`count(*)`,
        totalWithFeedback: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback} is not null then 1 end)`,
        helpfulCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"helpful"%' then 1 end)`,
        needsImprovementCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"needs_improvement"%' then 1 end)`,
        inaccurateCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"inaccurate"%' then 1 end)`,
      })
      .from(radiologyWorklistTable)
      .where(whereClause),
    db
      .select({
        modality: radiologyWorklistTable.modality,
        totalWithFeedback: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback} is not null then 1 end)`,
        helpfulCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"helpful"%' then 1 end)`,
        needsImprovementCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"needs_improvement"%' then 1 end)`,
        inaccurateCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"inaccurate"%' then 1 end)`,
      })
      .from(radiologyWorklistTable)
      .where(whereClause)
      .groupBy(radiologyWorklistTable.modality),
  ]);

  const o = overall[0];
  const total = o.totalWithFeedback || 1;
  const qualityScore = (o.helpfulCount * 100 + o.needsImprovementCount * 50) / total;

  const modalityBreakdown = byModality.map((m) => {
    const t = m.totalWithFeedback || 1;
    return {
      modality: m.modality,
      totalWithFeedback: m.totalWithFeedback,
      helpfulCount: m.helpfulCount,
      needsImprovementCount: m.needsImprovementCount,
      inaccurateCount: m.inaccurateCount,
      qualityScore: Number(((m.helpfulCount * 100 + m.needsImprovementCount * 50) / t).toFixed(1)),
      helpfulRate: Number(((m.helpfulCount / t) * 100).toFixed(1)),
    };
  });

  res.json({
    scope,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    overall: {
      totalDrafts: o.totalDrafts,
      totalWithFeedback: o.totalWithFeedback,
      helpfulCount: o.helpfulCount,
      needsImprovementCount: o.needsImprovementCount,
      inaccurateCount: o.inaccurateCount,
      qualityScore: Number(qualityScore.toFixed(1)),
      helpfulRate: Number(((o.helpfulCount / total) * 100).toFixed(1)),
    },
    byModality: modalityBreakdown,
  });
});

/**
 * GET /api/ai-reporting/prompt-effectiveness
 * Phase 6: AI Prompt Effectiveness — rank templates by radiologist feedback.
 */
router.get("/prompt-effectiveness", async (req, res): Promise<void> => {
  const sReq = req as StaffAuthRequest;
  const globalSettings = await getGlobalSettings();
  if (!canConfigure(sReq)) { res.status(403).json({ error: "Insufficient permissions." }); return; }

  const { from, to, modality } = req.query as Record<string, string>;
  const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const dateTo = to ? new Date(to) : new Date();

  const dateFilter = and(
    gte(radiologyWorklistTable.createdAt, dateFrom),
    lte(radiologyWorklistTable.createdAt, dateTo),
  );

  const modalityFilter = modality ? eq(radiologyWorklistTable.modality, modality) : undefined;
  const whereClause = modalityFilter ? and(dateFilter, modalityFilter) : dateFilter;

  const byTemplate = await db
    .select({
      templateName: aiReportingDraftsTable.templateName,
      modality: radiologyWorklistTable.modality,
      totalDrafts: sql<number>`count(*)`,
      totalWithFeedback: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback} is not null then 1 end)`,
      helpfulCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"helpful"%' then 1 end)`,
      needsImprovementCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"needs_improvement"%' then 1 end)`,
      inaccurateCount: sql<number>`count(case when ${radiologyWorklistTable.aiFeedback}::text like '%"verdict":"inaccurate"%' then 1 end)`,
    })
    .from(aiReportingDraftsTable)
    .leftJoin(radiologyWorklistTable, eq(radiologyWorklistTable.studyInstanceUID, aiReportingDraftsTable.studyInstanceUID))
    .where(whereClause)
    .groupBy(aiReportingDraftsTable.templateName, radiologyWorklistTable.modality);

  const ranked = byTemplate
    .filter((t) => t.templateName)
    .map((t) => {
      const total = t.totalWithFeedback || 1;
      return {
        templateName: t.templateName!,
        modality: t.modality,
        totalDrafts: t.totalDrafts,
        totalWithFeedback: t.totalWithFeedback,
        helpfulCount: t.helpfulCount,
        needsImprovementCount: t.needsImprovementCount,
        inaccurateCount: t.inaccurateCount,
        qualityScore: Number(((t.helpfulCount * 100 + t.needsImprovementCount * 50) / total).toFixed(1)),
        helpfulRate: Number(((t.helpfulCount / total) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  res.json({
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    modality: modality ?? null,
    templates: ranked,
  });
});

export const aiReportingRouter = router;
