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
  geminiOcrBill,
  geminiParseBankStatement,
  MODALITY_NAMES,
  type GeminiGenerateOptions,
  type GeminiTranscribeOptions,
  type ClinicalNotePatient,
  type BillingInsightsMetrics,
  type PatientMessagePatient,
  type PatientMessageType,
  type RadiologyFindingsInput,
  type RadiologyImpressionInput,
  type BillOcrResult,
  type BankTransaction,
} from "./helpers";
