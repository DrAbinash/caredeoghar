import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("receptionist"),
  permissions: text("permissions"),
  pin: text("pin"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const billAuditsTable = pgTable("bill_audits", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull(),
  editedBy: text("edited_by").notNull(),
  reason: text("reason").notNull(),
  changeType: text("change_type").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBillAuditSchema = createInsertSchema(billAuditsTable).omit({ id: true, createdAt: true });
export type User = typeof usersTable.$inferSelect;
export type BillAudit = typeof billAuditsTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertBillAudit = z.infer<typeof insertBillAuditSchema>;
