import { pgTable, text, serial, timestamp, integer, numeric, date, boolean, uniqueIndex, bigint } from "drizzle-orm/pg-core";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  role: text("role").notNull(),
  department: text("department"),
  joiningDate: date("joining_date"),
  baseSalary: numeric("base_salary", { precision: 10, scale: 2 }).notNull().default("0"),
  address: text("address"),
  emergencyContact: text("emergency_contact"),
  bankAccount: text("bank_account"),
  ifsc: text("ifsc"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const staffCounterTable = pgTable("staff_counter", {
  id: serial("id").primaryKey(),
  counter: integer("counter").notNull().default(0),
});

export const staffAdvancesTable = pgTable("staff_advances", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  advanceDate: date("advance_date").notNull(),
  paymentMode: text("payment_mode").notNull().default("cash"),
  reason: text("reason"),
  recoveredAmount: numeric("recovered_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("outstanding"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffSalaryPaymentsTable = pgTable("staff_salary_payments", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  monthYear: text("month_year").notNull(),
  baseAmount: numeric("base_amount", { precision: 10, scale: 2 }).notNull(),
  bonus: numeric("bonus", { precision: 10, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  advanceDeducted: numeric("advance_deducted", { precision: 10, scale: 2 }).notNull().default("0"),
  daysPresent: integer("days_present").notNull().default(0),
  daysAbsent: integer("days_absent").notNull().default(0),
  netAmount: numeric("net_amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: date("payment_date").notNull(),
  paymentMode: text("payment_mode").notNull().default("cash"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffAttendanceTable = pgTable("staff_attendance", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  attendanceDate: date("attendance_date").notNull(),
  punchIn: timestamp("punch_in", { withTimezone: true }),
  punchOut: timestamp("punch_out", { withTimezone: true }),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  uniqStaffDate: uniqueIndex("staff_attendance_staff_date_uniq").on(t.staffId, t.attendanceDate),
}));

export const staffBiometricCredentialsTable = pgTable("staff_biometric_credentials", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: text("transports"),
  deviceName: text("device_name"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Bridge fingerprint templates — for dedicated USB scanners (ZKTeco, Mantra, Morpho, etc.)
// Used by both staff attendance and user login. Matching is performed by the local bridge service.
export const bridgeFingerprintTemplatesTable = pgTable("bridge_fingerprint_templates", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull(), // 'staff' | 'user'
  scopeId: integer("scope_id").notNull(),
  vendor: text("vendor").notNull().default("generic"), // mock | zkteco | mantra | morpho | generic
  fingerName: text("finger_name"), // e.g. "right-index"
  template: text("template").notNull(), // base64 vendor-specific template blob
  quality: integer("quality"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

// Sessions for ERP user login (fingerprint or PIN-based)
export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  loginMethod: text("login_method").notNull().default("fingerprint"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Staff = typeof staffTable.$inferSelect;
export type StaffAdvance = typeof staffAdvancesTable.$inferSelect;
export type StaffSalaryPayment = typeof staffSalaryPaymentsTable.$inferSelect;
export type StaffAttendance = typeof staffAttendanceTable.$inferSelect;
export type StaffBiometricCredential = typeof staffBiometricCredentialsTable.$inferSelect;
