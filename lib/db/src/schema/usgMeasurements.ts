import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ── usg_measurements ──────────────────────────────────────────────────────────
// One row per extraction attempt per study. All measurement fields are nullable
// text (e.g. "4.2 cm") so mixed units from different machines are preserved as-is.
// Confidence: high = DICOM SR, medium = OCR clear text, low = uncertain OCR / AI guess.
export const usgMeasurementsTable = pgTable(
  "usg_measurements",
  {
    id: serial("id").primaryKey(),
    worklistId: integer("worklist_id"),
    studyId: integer("study_id"),
    studyInstanceUID: text("study_instance_uid"),
    accessionNumber: text("accession_number"),
    patientId: integer("patient_id"),
    extractionRunId: integer("extraction_run_id"),

    source: text("source").notNull().default("ocr"), // dicom_sr | ocr | combined | manual
    overallConfidence: text("overall_confidence").notNull().default("low"), // high | medium | low

    // ── Obstetric measurements ──────────────────────────────────────────────
    bpd: text("bpd"),                    bpdConfidence: text("bpd_confidence"),
    hc: text("hc"),                      hcConfidence: text("hc_confidence"),
    ac: text("ac"),                      acConfidence: text("ac_confidence"),
    fl: text("fl"),                      flConfidence: text("fl_confidence"),
    crl: text("crl"),                    crlConfidence: text("crl_confidence"),
    efw: text("efw"),                    efwConfidence: text("efw_confidence"),
    ga: text("ga"),                      gaConfidence: text("ga_confidence"),
    edd: text("edd"),                    eddConfidence: text("edd_confidence"),
    fhr: text("fhr"),                    fhrConfidence: text("fhr_confidence"),
    placentaPosition: text("placenta_position"),
    liquorAfi: text("liquor_afi"),
    fetalPresentation: text("fetal_presentation"),

    // ── Pelvis measurements ──────────────────────────────────────────────────
    uterusSize: text("uterus_size"),           uterusSizeConfidence: text("uterus_size_confidence"),
    endometrium: text("endometrium"),          endometriumConfidence: text("endometrium_confidence"),
    rightOvary: text("right_ovary"),           rightOvaryConfidence: text("right_ovary_confidence"),
    leftOvary: text("left_ovary"),             leftOvaryConfidence: text("left_ovary_confidence"),
    follicles: text("follicles"),
    adnexalLesion: text("adnexal_lesion"),

    // ── Abdomen measurements ─────────────────────────────────────────────────
    liverSize: text("liver_size"),             liverSizeConfidence: text("liver_size_confidence"),
    spleenSize: text("spleen_size"),           spleenSizeConfidence: text("spleen_size_confidence"),
    rightKidney: text("right_kidney"),         rightKidneyConfidence: text("right_kidney_confidence"),
    leftKidney: text("left_kidney"),           leftKidneyConfidence: text("left_kidney_confidence"),
    cbd: text("cbd"),                          cbdConfidence: text("cbd_confidence"),
    gbWall: text("gb_wall"),                   gbWallConfidence: text("gb_wall_confidence"),
    prostateVolume: text("prostate_volume"),   prostateVolumeConfidence: text("prostate_volume_confidence"),

    // ── Catch-all for any other visible measurement labels on the image ──────
    extraMeasurementsJson: text("extra_measurements_json").notNull().default("{}"),

    // ── DICOM metadata ───────────────────────────────────────────────────────
    manufacturer: text("manufacturer"),
    manufacturerModel: text("manufacturer_model"),
    institutionName: text("institution_name"),
    studyDescription: text("study_description"),
    studyDate: text("study_date"),

    // ── Review workflow ──────────────────────────────────────────────────────
    // SAFETY: status never transitions to auto_filled without human approval.
    // pending_review → approved → (auto_filled when copied into report)
    status: text("status").notNull().default("pending_review"), // pending_review | approved | rejected | auto_filled
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    byStudyUID: index("usg_meas_study_uid_idx").on(t.studyInstanceUID),
    byWorklist: index("usg_meas_worklist_idx").on(t.worklistId),
    byStatus: index("usg_meas_status_idx").on(t.status),
    byPatient: index("usg_meas_patient_idx").on(t.patientId),
  }),
);

// ── usg_extraction_logs ───────────────────────────────────────────────────────
// One row per extraction run. Records timing, frame counts, errors, and raw output
// for auditing and troubleshooting without embedding them in the measurements table.
export const usgExtractionLogsTable = pgTable(
  "usg_extraction_logs",
  {
    id: serial("id").primaryKey(),
    worklistId: integer("worklist_id"),
    studyInstanceUID: text("study_instance_uid"),
    accessionNumber: text("accession_number"),
    extractionType: text("extraction_type").notNull(), // dicom_sr | ocr | combined
    status: text("status").notNull().default("pending"), // pending | running | completed | failed
    framesProcessed: integer("frames_processed").notNull().default(0),
    framesFailed: integer("frames_failed").notNull().default(0),
    srFound: boolean("sr_found").notNull().default(false),
    aiNormalized: boolean("ai_normalized").notNull().default(false),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    triggeredBy: text("triggered_by").notNull().default("auto"), // auto | manual
    triggeredByUserId: integer("triggered_by_user_id"),
    rawOcrTextJson: text("raw_ocr_text_json"),
    rawSrJson: text("raw_sr_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    byStudy: index("usg_log_study_idx").on(t.studyInstanceUID),
    byWorklist: index("usg_log_worklist_idx").on(t.worklistId),
    byStatus: index("usg_log_status_idx").on(t.status),
  }),
);

// ── usg_key_images ────────────────────────────────────────────────────────────
// Images the radiologist selects for inclusion in the final report.
// Each row identifies one DICOM frame by SOP / series coordinates + an optional label.
export const usgKeyImagesTable = pgTable(
  "usg_key_images",
  {
    id: serial("id").primaryKey(),
    worklistId: integer("worklist_id"),
    studyInstanceUID: text("study_instance_uid"),
    accessionNumber: text("accession_number"),
    patientId: integer("patient_id"),
    seriesInstanceUID: text("series_instance_uid"),
    sopInstanceUID: text("sop_instance_uid"),
    seriesNumber: text("series_number"),
    imageNumber: text("image_number"),
    frameNumber: integer("frame_number").notNull().default(1),
    label: text("label").notNull().default(""),
    wadoUrl: text("wado_url"),
    thumbnailBase64: text("thumbnail_base64"),
    sortOrder: integer("sort_order").notNull().default(0),
    addedBy: text("added_by"),
    addedByUserId: integer("added_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudy: index("usg_key_img_study_idx").on(t.studyInstanceUID),
    byWorklist: index("usg_key_img_worklist_idx").on(t.worklistId),
  }),
);

export type UsgMeasurement = typeof usgMeasurementsTable.$inferSelect;
export type UsgExtractionLog = typeof usgExtractionLogsTable.$inferSelect;
export type UsgKeyImage = typeof usgKeyImagesTable.$inferSelect;
