import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Metadata for uploaded files stored on disk (not in PostgreSQL BLOBs).
 * The actual bytes live under data/uploads/<module>/ or an external store.
 */
export const uploadFilesTable = pgTable(
  "upload_files",
  {
    id: serial("id").primaryKey(),
    patientId: integer("patient_id"),        // nullable for non-patient uploads
    module: text("module").notNull(),          // reports | patient_documents | billing | temp | dicom | site_assets
    fileName: text("file_name").notNull(),     // original client filename (sanitized)
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(), // relative path under data/uploads/
    checksum: text("checksum"),                // optional SHA-256 for integrity
    uploadedBy: text("uploaded_by").notNull().default("system"),
    uploadedById: integer("uploaded_by_id"),
    isDeleted: text("is_deleted").notNull().default("false"), // soft delete flag
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("upload_patient_idx").on(table.patientId),
    index("upload_module_idx").on(table.module),
    index("upload_created_idx").on(table.createdAt),
  ],
);

export const insertUploadFileSchema = createInsertSchema(uploadFilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type UploadFile = typeof uploadFilesTable.$inferSelect;
export type InsertUploadFile = z.infer<typeof insertUploadFileSchema>;

// Safe MIME whitelist for general uploads (not DICOM)
export const SAFE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

// DICOM-specific MIME types (future PACS integration)
export const DICOM_MIME_TYPES = new Set([
  "application/dicom",
  "application/octet-stream", // some DICOM servers send this
]);

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;      // 10 MB for normal uploads
export const MAX_DICOM_UPLOAD_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB for DICOM
