import { pgTable, text, serial, timestamp, boolean, integer, numeric, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Login handle preferred over email for staff sign-in. Nullable + unique
  // so legacy rows without a username still work via the email fallback in
  // /api/portal/staff-login. Stored lowercase.
  username: text("username").unique(),
  role: text("role").notNull().default("receptionist"),
  permissions: text("permissions"),
  pin: text("pin"),
  // Optional staff portrait shown next to their name. Stored as a base64
  // data URL (kept small client-side, < 800 KB) so it round-trips through
  // existing JSON endpoints without needing object-storage plumbing.
  photoDataUrl: text("photo_data_url"),
  // Per-user sidebar colour preference — synced across devices via DB.
  // localStorage acts as a same-session cache; this column is the source of truth.
  sidebarTheme: text("sidebar_theme"),
  // Set to true whenever an admin creates the user or resets their PIN.
  // Cleared the moment the user successfully changes the PIN themselves.
  // Staff-login response reports this so the UI can force a PIN-change
  // step before letting them into the ERP.
  mustChangePin: boolean("must_change_pin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  maxDiscount: numeric("max_discount", { precision: 5, scale: 2 }),
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

export const superAdminSessionsTable = pgTable("super_admin_sessions", {
  token: varchar("token", { length: 128 }).primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBillAuditSchema = createInsertSchema(billAuditsTable).omit({ id: true, createdAt: true });
export type User = typeof usersTable.$inferSelect;
export type BillAudit = typeof billAuditsTable.$inferSelect;
export type SuperAdminSession = typeof superAdminSessionsTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertBillAudit = z.infer<typeof insertBillAuditSchema>;
