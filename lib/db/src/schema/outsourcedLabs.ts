import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOutsourcedLabSchema = createInsertSchema(outsourcedLabsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOutsourcedLab = z.infer<typeof insertOutsourcedLabSchema>;
export type OutsourcedLab = typeof outsourcedLabsTable.$inferSelect;
