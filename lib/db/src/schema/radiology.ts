import { pgTable, serial, integer, text, timestamp, date, uniqueIndex, index } from "drizzle-orm/pg-core";

// Radiology study — one row per ordered radiology test on a bill (USG, X-Ray,
// CT, MRI, Mammography, etc). Auto-fanned-out from bills via
// generateStudiesForOrder, similar to how test_tokens are issued.
//
// Lifecycle:
//   scheduled → in_progress → acquired → reported_preliminary → reported_final → delivered
//   (cancelled is a parallel terminal state)
//
// `accessionNumber` follows ACC-YYYYMMDD-MOD-NNN per modality per day.
export const radiologyStudiesTable = pgTable(
  "radiology_studies",
  {
    id: serial("id").primaryKey(),
    accessionNumber: text("accession_number").notNull(),
    billId: integer("bill_id"),
    orderId: integer("order_id"),
    orderTestId: integer("order_test_id"),
    patientId: integer("patient_id").notNull(),
    testId: integer("test_id").notNull(),
    modality: text("modality").notNull().default("OT"), // CR, US, MR, CT, MG, MA, BMD, OT
    department: text("department").notNull().default("X-Ray"),
    roomNumber: text("room_number").notNull().default(""),
    technicianId: integer("technician_id"),
    technicianName: text("technician_name"),
    // Tele-radiology: a study may be claimed by a remote radiologist for
    // night/back-up reading. Cleared when the study is unclaimed or final.
    assignedRadiologistId: integer("assigned_radiologist_id"),
    assignedRadiologistName: text("assigned_radiologist_name"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // Optional clinical context entered by reception/technician — used as
    // input to the AI findings/impression assistants.
    clinicalHistory: text("clinical_history"),
    status: text("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    numImages: integer("num_images").notNull().default(0),
    studyInstanceUid: text("study_instance_uid"),
    notes: text("notes"),
    prelimReport: text("prelim_report"),
    prelimReportedBy: text("prelim_reported_by"),
    prelimReportedAt: timestamp("prelim_reported_at", { withTimezone: true }),
    finalReport: text("final_report"),
    finalReportedBy: text("final_reported_by"),
    finalReportedAt: timestamp("final_reported_at", { withTimezone: true }),
    templateId: integer("template_id"), // optional — last template used
    studyDate: date("study_date").notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    accessionUq: uniqueIndex("radiology_studies_accession_uq").on(t.accessionNumber),
    orderTestUq: uniqueIndex("radiology_studies_order_test_uq").on(t.orderTestId),
    byStatus: index("radiology_studies_status_idx").on(t.status),
    byDate: index("radiology_studies_date_idx").on(t.studyDate),
  }),
);

// Film / CD / Print issuance log — every physical artifact handed to a patient
// is recorded here so we can answer "have they collected their CD yet?".
export const radiologyFilmIssuesTable = pgTable("radiology_film_issues", {
  id: serial("id").primaryKey(),
  studyId: integer("study_id").notNull(),
  issueType: text("issue_type").notNull(), // film | cd | print
  quantity: integer("quantity").notNull().default(1),
  issuedBy: text("issued_by"),
  receivedBy: text("received_by"),
  notes: text("notes"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

// Saved AI prompts for the radiology report modal. A radiologist can store
// reusable instruction snippets (e.g. "Use RSNA 2.0 structured format") that
// auto-paste into the dictation pane so the AI generates in a fixed layout.
// Prompts may be scoped to a specific testName / modality or left global (null).
export const radiologyPromptsTable = pgTable("radiology_prompts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  testName: text("test_name"),
  modality: text("modality"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byModality: index("radiology_prompts_modality_idx").on(t.modality),
}));

export type RadiologyStudy = typeof radiologyStudiesTable.$inferSelect;
export type RadiologyFilmIssue = typeof radiologyFilmIssuesTable.$inferSelect;
export type RadiologyPrompt = typeof radiologyPromptsTable.$inferSelect;
