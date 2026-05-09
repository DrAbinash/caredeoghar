export { ai } from "./client";
export { generateImage } from "./image";
export { batchProcess, batchProcessWithSSE, isRateLimitError, type BatchOptions } from "./batch";
export {
  geminiGenerate,
  buildClinicalNotePrompt,
  buildBillingInsightsPrompt,
  buildPatientMessagePrompt,
  generateClinicalNote,
  generateBillingInsights,
  generatePatientMessage,
  type GeminiGenerateOptions,
  type ClinicalNotePatient,
  type BillingInsightsMetrics,
  type PatientMessagePatient,
  type PatientMessageType,
} from "./helpers";
