import { pgTable, text, serial, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'cash' | 'bank' | 'income' | 'expense' | 'liability' | 'asset'
  code: text("code").unique(),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  ifscCode: text("ifsc_code"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vouchersTable = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull().unique(),
  type: text("type").notNull(), // 'payment' | 'receipt' | 'bank_transfer' | 'journal'
  date: text("date").notNull(),
  creditAccountId: text("credit_account_id").notNull(),
  debitAccountId: text("debit_account_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  particular: text("particular").notNull(),
  remark: text("remark"),
  performedBy: text("performed_by"),
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true });
export const insertVoucherSchema = createInsertSchema(vouchersTable).omit({ id: true, voucherNumber: true, createdAt: true });

export type Account = typeof accountsTable.$inferSelect;
export type Voucher = typeof vouchersTable.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertVoucher = z.infer<typeof insertVoucherSchema>;
