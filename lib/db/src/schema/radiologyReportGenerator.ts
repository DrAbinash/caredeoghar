import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// radiology_report_drafts — working document for the report generator module.
// Supports both PACS-worklist mode (studyId / worklistId linked) and manual
// entry mode (no study link). Promoted to patient_reports on final save.
export const radiologyReportDraftsTable = pgTable(
  "radiology_report_drafts",
  {
    id: serial("id").primaryKey(),
    studyId: integer("study_id"),        // FK → radiology_studies.id  (null in manual mode)
    worklistId: integer("worklist_id"),  // FK → radiology_worklist.id (null if internal)
    patientId: integer("patient_id"),    // FK → patients.id
    templateId: text("template_id"),     // e.g. "MRI_BRAIN_PLAIN"
    modality: text("modality"),          // MRI | CT | USG | X-RAY
    studyName: text("study_name"),
    clinicalHistory: text("clinical_history"),
    rawFindings: text("raw_findings"),
    // JSON object: { [sectionName: string]: string } — one entry per template section
    findingsSections: text("findings_sections"),
    // JSON array of impression bullet strings
    impression: text("impression"),
    recommendation: text("recommendation"),
    formattedReportHtml: text("formatted_report_html"),
    formattedReportText: text("formatted_report_text"),
    // DRAFT | FINAL
    status: text("status").notNull().default("DRAFT"),
    // Set once promoted to patient_reports
    finalReportId: integer("final_report_id"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byStudy: index("rad_report_drafts_study_idx").on(t.studyId),
    byPatient: index("rad_report_drafts_patient_idx").on(t.patientId),
    byStatus: index("rad_report_drafts_status_idx").on(t.status),
  }),
);

// radiology_voice_logs — immutable audit of every voice-dictation + cleanup event.
export const radiologyVoiceLogsTable = pgTable(
  "radiology_voice_logs",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id"),
    studyId: integer("study_id"),
    patientId: integer("patient_id"),
    targetField: text("target_field"),   // which form field the transcript was inserted into
    rawTranscript: text("raw_transcript"),
    cleanedText: text("cleaned_text"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byDraft: index("rad_voice_logs_draft_idx").on(t.draftId),
  }),
);

// radiology_report_key_images — screenshots captured from DICOM viewer or
// uploaded by the technician / radiologist to annotate the report.
// Only JPG/PNG/WebP screenshots (not raw DICOM data) are stored here.
export const radiologyReportKeyImagesTable = pgTable(
  "radiology_report_key_images",
  {
    id: serial("id").primaryKey(),
    draftId: integer("draft_id"),
    studyId: integer("study_id"),
    patientId: integer("patient_id"),
    accessionNumber: text("accession_number"),
    imageUrl: text("image_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    caption: text("caption").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    includeInReport: boolean("include_in_report").notNull().default(true),
    // UPLOAD | PACS_SCREENSHOT
    sourceType: text("source_type").notNull().default("UPLOAD"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byDraft: index("rad_key_images_draft_idx").on(t.draftId),
    byStudy: index("rad_key_images_study_idx").on(t.studyId),
  }),
);
