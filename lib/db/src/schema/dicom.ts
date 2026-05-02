import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// DICOM modality registry. Each row is one imaging device or PACS node that
// the ERP knows about (CT scanner, MRI, CR/DR, ultrasound, etc.) — used for
// the DICOM Node Configuration page, MWL push targets, and connection tests.
export const dicomNodesTable = pgTable("dicom_nodes", {
  id: serial("id").primaryKey(),
  aeTitle: text("ae_title").notNull().unique(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(104),
  // Modality short code per DICOM PS3.3 C.7.3.1.1.1 (CT, MR, CR, DX, US, NM, PT, XA, RF, OT)
  modality: text("modality").notNull().default("OT"),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  // Connection test telemetry — populated by the "Test" button on the config page.
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestStatus: text("last_test_status"),  // 'success' | 'failed' | null
  lastTestMessage: text("last_test_message"),
  lastTestLatencyMs: integer("last_test_latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDicomNodeSchema = createInsertSchema(dicomNodesTable).omit({
  id: true, createdAt: true, updatedAt: true,
  lastTestAt: true, lastTestStatus: true, lastTestMessage: true, lastTestLatencyMs: true,
});
export type InsertDicomNode = z.infer<typeof insertDicomNodeSchema>;
export type DicomNode = typeof dicomNodesTable.$inferSelect;
