export { ai } from "./client";
export { generateImage } from "./image";
export { batchProcess, batchProcessWithSSE, isRateLimitError, type BatchOptions } from "./batch";
export {
  geminiGenerate,
  buildClinicalNotePrompt,
  buildBillingInsightsPrompt,
  generateClinicalNote,
  generateBillingInsights,
  type GeminiGenerateOptions,
  type ClinicalNotePatient,
  type BillingInsightsMetrics,
} from "./helpers";
