# Care Diagnostics ERP — AI/Radiology Reporting Architecture Analysis

**Date:** June 02, 2026
**Scope:** Analysis of current AI provider integration, multi-provider support, and Ollama integration feasibility
**Target:** `http://100.79.100.41:11434` (Ollama via Tailscale)

---

## 1. Location of AI Provider Code

There are **two parallel AI systems** in the codebase:

| System | Location | Purpose |
|--------|----------|---------|
| **Legacy AI** | `artifacts/api-server/src/routes/ai.ts` | General-purpose AI (clinical notes, billing insights, patient messages, radiology findings/impression, transcription) |
| **Radiology AI Reporting** | `artifacts/api-server/src/routes/aiReporting.ts` | Radiology-specific AI with multi-provider support, DICOM image analysis, audit logging, draft management |
| **Gemini Integration Library** | `lib/integrations-gemini-ai/src/helpers.ts` | Low-level Gemini API client (`geminiGenerate`, `geminiTranscribe`, prompt builders) |
| **AI Enhancement Stub** | `artifacts/api-server/src/lib/aiReportEnhancer.ts` | Placeholder for AI report enhancement (returns dummy data) |

---

## 2. Currently Supported Providers

| System | Providers | Status |
|--------|-----------|--------|
| **Legacy AI (`ai.ts`)** | Gemini only (hardcoded) | Uses `geminiGenerate()` from `@workspace/integrations-gemini-ai` |
| **Radiology AI (`aiReporting.ts`)** | OpenAI, Gemini, Anthropic | Full multi-provider with encrypted API keys, per-provider models, test connections |
| **AI Inference (`AiInferenceSettings.tsx`)** | Local GPU endpoint (Triton/TensorRT) | Separate system for GPU inference with fallback to Gemini cloud |

**No Ollama support exists anywhere in the codebase.**

---

## 3. Abstraction/Service Layer Design

The current architecture has **no unified abstraction layer**:

```
Frontend (DicomViewer.tsx, RadiologyReportingWorkspace)
    |
    v
/api/ai-reporting/query
    |
    v
aiReporting.ts (route handler)
    |
    +-- hardcoded if/else -- queryOpenAI()
    +-- hardcoded if/else -- queryGemini()
    +-- hardcoded if/else -- queryAnthropic()
```

**Problems:**
- Provider-specific logic is embedded directly in the route handler (`aiReporting.ts` lines 252-316)
- No shared `AiProvider` interface or base class
- Adding a new provider requires modifying:
  - `aiReporting.ts` (new `queryXxx()` function, new `if/else` branch in 3 places)
  - `getProviderApiKey()` (provider name whitelist)
  - `getGlobalSettings()` (default provider whitelist)
  - Database schema (`aiProviderSettingsTable` provider column)
  - Frontend (`AiReportingSettings.tsx` provider list, model presets)
  - `test-provider` endpoint (new `if/else` branch)
- The legacy `ai.ts` router is completely separate and only supports Gemini

---

## 4. Files Requiring Modification for Ollama Support

| File | What to Change |
|------|---------------|
| `lib/db/src/schema/aiReporting.ts` | Add `ollama` to provider enum; add `endpointUrl` column for local providers |
| `artifacts/api-server/src/routes/aiReporting.ts` | Add `queryOllama()` function; add `ollama` to all provider whitelists; update `getProviderApiKey()` to handle no-key providers |
| `artifacts/diagnostic-erp/src/pages/AiReportingSettings.tsx` | Add `ollama` to `PROVIDER_META`, provider lists, model presets |
| `artifacts/api-server/src/routes/ai.ts` | Optionally refactor to use new provider abstraction (or leave as Gemini-only legacy) |
| `lib/integrations-gemini-ai/src/helpers.ts` | Consider extracting prompt builders to shared lib (not strictly required) |

---

## 5. Configurable Multi-Provider System

The **radiology AI reporting system** (`aiReporting.ts`) is already multi-provider:

- **Database:** `ai_provider_settings` table stores per-provider config (encrypted API key, default model, enabled flag, default flag)
- **Settings UI:** `AiReportingSettings.tsx` allows enabling/disabling providers, setting API keys, choosing models, testing connections
- **Global settings:** Stored in `__global__` row (enabled, defaultProvider, defaultPrompt, allowedRoles, anonymize, includeDemographics)
- **Security:** AES-256 encrypted API keys at rest; keys never returned to frontend; audit logging of every query
- **Permission model:** `ai_reporting.use` and `ai_reporting.configure` permissions

**To make it truly configurable (adding Ollama), you need:**
1. A provider abstraction layer (e.g., `interface AiProvider { query(prompt, images, model): Promise<string> }`)
2. A provider registry/factory pattern
3. Remove hardcoded provider lists from frontend and backend

---

## 6. Local Ollama Endpoint Support (`http://100.79.100.41:11434`)

**Current status:** No Ollama support exists.

**What Ollama requires:**
- No API key (or optional key for secured instances)
- OpenAI-compatible `/api/chat` endpoint
- Supports vision models (llava, bakllava, etc.) for DICOM image analysis
- Model pulled locally: `ollama pull llava` or `ollama pull qwen2.5`

**Implementation approach for Ollama:**

### 6.1 Schema Change

Add `endpointUrl` to `aiProviderSettingsTable` (Ollama needs a URL, not a key):

```typescript
// aiReporting.ts schema
endpointUrl: text("endpoint_url"), // e.g. http://100.79.100.41:11434
```

### 6.2 Backend Query Function

Ollama uses OpenAI-compatible API:

```typescript
async function queryOllama(opts: {
  endpointUrl: string;
  model: string;
  prompt: string;
  images: string[];
}): Promise<string> {
  const openai = new OpenAI({
    baseURL: `${opts.endpointUrl}/v1`,
    apiKey: "ollama", // dummy key
  });
  // ... same as queryOpenAI but with local endpoint
}
```

### 6.3 Frontend Changes

Add Ollama to `PROVIDER_META`:

```typescript
ollama: {
  label: "Ollama (Local)",
  color: "from-purple-50 to-violet-50 ...",
  models: ["llava", "bakllava", "qwen2.5", "llama3.2-vision"],
  placeholder: "No API key required",
}
```

### 6.4 Connection Test

Ollama endpoint test should call `GET /api/tags` to verify the server is running, then optionally test a small chat completion.

---

## 7. Additional Architecture Notes

| Aspect | Details |
|--------|---------|
| **AI Image Analysis** | The `aiReporting.ts` `/query` endpoint fetches DICOM JPEG thumbnails from Orthanc (`fetchStudyImages`) and sends them as base64 to the AI provider. |
| **Audit Logging** | Every query is logged to `ai_reporting_audit_logs` with user, study, provider, model, prompt, image count, anonymization status. |
| **Draft Management** | AI responses are saved as drafts (`ai_reporting_drafts`) and must be explicitly inserted into the final report by a radiologist. |
| **AI Inference (GPU)** | Separate system in `AiInferenceSettings.tsx` for local GPU inference (Triton/TensorRT) -- this is NOT the same as the AI reporting system. It does not currently integrate with Ollama. |
| **Legacy AI** | `ai.ts` endpoints (`/clinical-note`, `/billing-insights`, `/patient-message`, `/radiology-findings`, `/radiology-impression`, `/transcribe`) are all Gemini-only and use the `@workspace/integrations-gemini-ai` library. |

---

## 8. Summary: What's Needed for Ollama

1. **Refactor provider logic** in `aiReporting.ts` into a provider abstraction (interface + registry pattern)
2. **Add Ollama provider** with OpenAI-compatible client pointing to `http://100.79.100.41:11434`
3. **Add `endpointUrl` column** to `aiProviderSettingsTable` for local providers
4. **Update frontend** (`AiReportingSettings.tsx`) to show Ollama as a provider option
5. **Update database provider enum** to include `ollama`
6. **Optional:** Decide whether to keep `ai.ts` as Gemini-only or refactor it to use the same provider abstraction

---

*Document generated by Replit Agent for Care Diagnostics ERP*
