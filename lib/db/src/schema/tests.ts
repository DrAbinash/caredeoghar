import { pgTable, text, serial, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testsTable = pgTable("diagnostic_tests", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  duration: text("duration").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  // Department this test belongs to — drives per-test queue routing.
  // Free text so users can add their own (Pathology, X-Ray, USG, MRI, CT,
  // ECG, Endoscopy, Mammography, Cardiology, etc.).
  department: text("department").notNull().default("Pathology"),
  // Room/counter where this test is performed (e.g. "Room 4").
  roomNumber: text("room_number").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTestSchema = createInsertSchema(testsTable).omit({ id: true, createdAt: true });
export type InsertTest = z.infer<typeof insertTestSchema>;
export type DiagnosticTest = typeof testsTable.$inferSelect;
