import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";

/**
 * CARE Emergency Billing — master data tables.
 * Populated by uploading CARE's doctors.csv and tests.csv from the super-admin portal.
 * Truncated and re-inserted on every upload (replace semantics).
 */

export const careDoctorsMasterTable = pgTable("care_doctors_master", {
  id: serial("id").primaryKey(),
  careId: integer("care_id").notNull(),
  name: text("name").notNull(),
  specialization: text("specialization").notNull().default(""),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const careTestsMasterTable = pgTable("care_tests_master", {
  id: serial("id").primaryKey(),
  careId: integer("care_id").notNull(),
  code: text("code").notNull().default(""),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});
