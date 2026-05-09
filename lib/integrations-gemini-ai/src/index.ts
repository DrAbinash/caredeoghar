export { ai } from "./client";
export { generateImage } from "./image";
export { batchProcess, batchProcessWithSSE, isRateLimitError, type BatchOptions } from "./batch";
export {
  geminiGenerate,
  geminiTranscribe,
  buildClinicalNotePrompt,
  buildBillingInsightsPrompt,
  buildPatientMessagePrompt,
  buildRadiologyFindingsPrompt,
  buildRadiologyImpressionPrompt,
  generateClinicalNote,
  generateBillingInsights,
  generatePatientMessage,
  MODALITY_NAMES,
  type GeminiGenerateOptions,
  type GeminiTranscribeOptions,
  type ClinicalNotePatient,
  type BillingInsightsMetrics,
  type PatientMessagePatient,
  type PatientMessageType,
  type RadiologyFindingsInput,
  type RadiologyImpressionInput,
} from "./helpers";
