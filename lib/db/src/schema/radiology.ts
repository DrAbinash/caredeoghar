import { pgTable, serial, integer, text, timestamp, date, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";

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
    // ── DICOM Modality Worklist (MWL) fields ──────────────────────────────
    // These are required before a study can move to in_progress.
    // bodyPart       → DICOM tag BodyPartExamined (0018,0015)
    // studyDescription → DICOM tag StudyDescription (0008,1030)
    // scheduledStationAETitle → DICOM tag ScheduledStationAETitle (0040,0001)
    // referringDoctor → DICOM tag ReferringPhysicianName (0008,0090)
    bodyPart: text("body_part"),
    studyDescription: text("study_description"),
    scheduledStationAETitle: text("scheduled_station_ae_title"),
    referringDoctor: text("referring_doctor"),
    prelimReport: text("prelim_report"),
    prelimReportedBy: text("prelim_reported_by"),
    prelimReportedAt: timestamp("prelim_reported_at", { withTimezone: true }),
    finalReport: text("final_report"),
    finalReportedBy: text("final_reported_by"),
    finalReportedAt: timestamp("final_reported_at", { withTimezone: true }),
    templateId: integer("template_id"), // optional — last template used
    studyDate: date("study_date").notNull().defaultNow(),
    priority: text("priority").notNull().default("routine"), // stat | emergency | urgent | routine | vip
    priorityReason: text("priority_reason"),                   // why this priority was assigned
    priorityOverriddenAt: timestamp("priority_overridden_at", { withTimezone: true }),
    priorityOverriddenBy: text("priority_overridden_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    accessionUq: uniqueIndex("radiology_studies_accession_uq").on(t.accessionNumber),
    orderTestUq: uniqueIndex("radiology_studies_order_test_uq").on(t.orderTestId),
    byStatus: index("radiology_studies_status_idx").on(t.status),
    byDate: index("radiology_studies_date_idx").on(t.studyDate),
    byPriority: index("radiology_studies_priority_idx").on(t.priority),
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

// ── Study priority rules ──
// Admin-configurable keyword/pattern rules that auto-assign study priorities.
// Rules are evaluated in order (sortOrder ASC); first match wins.
export const radiologyPriorityRulesTable = pgTable("radiology_priority_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  priority: text("priority").notNull(), // stat | emergency | urgent | routine | vip
  // Matching logic (OR across non-null fields)
  bodyPartPattern: text("body_part_pattern"),       // ILIKE on body_part
  studyDescPattern: text("study_desc_pattern"),     // ILIKE on study_description
  modalityList: text("modality_list"),              // comma-separated, e.g. "CT,MR"
  referringDoctorPattern: text("referring_doctor_pattern"),
  // Keyword matching on clinical_history + study_description
  keywords: text("keywords"),                         // comma-separated
  // Routing context
  locationPattern: text("location_pattern"),        // e.g. "ICU,IPD,ER,TRAUMA"
  // Override guard
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── Radiologist assignment rules ──
// Maps modality (+ optional subspecialty + shift) to preferred radiologist user ids.
export const radiologistAssignmentRulesTable = pgTable("radiologist_assignment_rules", {
  id: serial("id").primaryKey(),
  modality: text("modality").notNull(),              // e.g. "CT", "MR", "US", "CR"
  bodyPart: text("body_part"),                       // optional filter
  subspecialty: text("subspecialty"),                // e.g. "neuroradiology"
  shiftStart: text("shift_start"),                   // "HH:MM"
  shiftEnd: text("shift_end"),                       // "HH:MM"
  primaryRadiologistId: integer("primary_radiologist_id").notNull(),
  backupRadiologistId: integer("backup_radiologist_id"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── Radiologist subspecialty tags ──
// Many-to-many: a user may have multiple subspecialties.
export const radiologistSubspecialtiesTable = pgTable("radiologist_subspecialties", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  subspecialty: text("subspecialty").notNull(),      // e.g. "neuroradiology", "muskuloskeletal"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Radiologist workload snapshot ──
// Updated when studies are assigned/reported/unassigned.
export const radiologistWorkloadsTable = pgTable("radiologist_workloads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  assignedCount: integer("assigned_count").notNull().default(0),
  inProgressCount: integer("in_progress_count").notNull().default(0),
  pendingCount: integer("pending_count").notNull().default(0),
  todayReportedCount: integer("today_reported_count").notNull().default(0),
  lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RadiologyStudy = typeof radiologyStudiesTable.$inferSelect;
export type RadiologyFilmIssue = typeof radiologyFilmIssuesTable.$inferSelect;
export type RadiologyPrompt = typeof radiologyPromptsTable.$inferSelect;
export type RadiologyPriorityRule = typeof radiologyPriorityRulesTable.$inferSelect;
export type RadiologistAssignmentRule = typeof radiologistAssignmentRulesTable.$inferSelect;
export type RadiologistSubspecialty = typeof radiologistSubspecialtiesTable.$inferSelect;
export type RadiologistWorkload = typeof radiologistWorkloadsTable.$inferSelect;
