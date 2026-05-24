import { pgTable, text, serial, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outsourcedLabsTable = pgTable("outsourced_labs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  gstin: text("gstin"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),

  // ── Default cost / rate configuration ────────────────────────────────────────
  // How cost is calculated when this lab processes a test:
  // 'percent_of_patient_bill'  → costPercent applies (e.g. 40 = 40% of patient price).
  // 'fixed_per_test'           → costFixed applies (e.g. 150 = Rs 150 flat per test).
  // 'custom_per_test'          → each test has its own outsourceCost override in tests table.
  costType: text("cost_type").notNull().default("percent_of_patient_bill"),
  // Percentage of patient bill to pay lab (0-100). Only used when costType='percent_of_patient_bill'.
  costPercent: numeric("cost_percent", { precision: 5, scale: 2 }).notNull().default("50"),
  // Fixed amount per test (in Rs). Only used when costType='fixed_per_test'.
  costFixed: numeric("cost_fixed", { precision: 10, scale: 2 }).notNull().default("0"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOutsourcedLabSchema = createInsertSchema(outsourcedLabsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutsourcedLab = z.infer<typeof insertOutsourcedLabSchema>;
export type OutsourcedLab = typeof outsourcedLabsTable.$inferSelect;
