import { pgTable, serial, text, timestamp, numeric, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const BANK_PROVIDERS = [
  "mock",
  "icici",
  "hdfc",
  "axis",
  "sbi",
  "kotak",
  "generic",
] as const;

export const BANK_ENVIRONMENTS = ["sandbox", "production"] as const;

export const BANK_ACCOUNT_STATUS = ["active", "inactive", "suspended"] as const;

export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("mock"), // One of BANK_PROVIDERS
  bankName: text("bank_name").notNull(),
  accountNickname: text("account_nickname"),
  maskedAccountNumber: text("masked_account_number").notNull(),
  ifsc: text("ifsc"),
  branch: text("branch"),
  environment: text("environment").notNull().default("sandbox"), // One of BANK_ENVIRONMENTS
  status: text("status").notNull().default("active"), // One of BANK_ACCOUNT_STATUS
  // Credential reference — NOT the actual secret. The real credentials live in
  // env vars keyed by a provider-specific prefix, e.g. ICICI_API_KEY, HDFC_API_KEY.
  // This field stores the prefix or identifier the adapter uses to look them up.
  credentialKey: text("credential_key"),
  // Link to the accounting ledger account (optional)
  ledgerAccountId: integer("ledger_account_id"),
  // Extra config the provider adapter may need (webhook secret, API version, etc.)
  // Stored as JSON so each provider can define its own config shape.
  providerConfig: jsonb("provider_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankTransactionsTable = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  provider: text("provider").notNull(),
  externalTransactionId: text("external_transaction_id"), // Bank's own txn ID
  transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
  description: text("description"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  type: text("type").notNull(), // 'credit' | 'debit'
  balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),
  // UTR — unique transaction reference used for reconciliation
  utr: text("utr"),
  // Reference number (cheque number, NEFT ref, etc.)
  referenceNumber: text("reference_number"),
  // Raw payload from the bank (for audit / debugging)
  rawPayload: jsonb("raw_payload"),
  // Reconciliation state
  reconciliationStatus: text("reconciliation_status").notNull().default("unreconciled"), // 'unreconciled' | 'matched' | 'manual' | 'ignored'
  // Link to a voucher if reconciled
  voucherId: integer("voucher_id"),
  // Link to a bill payment if matched
  paymentId: integer("payment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentRequestsTable = pgTable("payment_requests", {
  id: serial("id").primaryKey(),
  bankAccountId: integer("bank_account_id").notNull(),
  provider: text("provider").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("INR"),
  purpose: text("purpose"),
  beneficiaryName: text("beneficiary_name"),
  beneficiaryAccount: text("beneficiary_account"),
  beneficiaryIfsc: text("beneficiary_ifsc"),
  // Bank-specific external request/transaction ID
  externalRequestId: text("external_request_id"),
  externalTransactionId: text("external_transaction_id"),
  status: text("status").notNull().default("pending"), // 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  failureReason: text("failure_reason"),
  // Link to bill or voucher
  billId: integer("bill_id"),
  voucherId: integer("voucher_id"),
  performedBy: text("performed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookLogsTable = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  eventType: text("event_type"),
  payload: jsonb("payload"),
  // Raw body string for signature verification debugging
  rawBody: text("raw_body"),
  // Verification result
  signatureValid: boolean("signature_valid"),
  // Processing result
  processed: boolean("processed").notNull().default(false),
  processingError: text("processing_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankAuditLogsTable = pgTable("bank_audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // 'balance_check' | 'transaction_fetch' | 'payment_initiate' | 'payment_status' | 'webhook_received' | 'reconciliation' | 'account_create' | 'account_update'
  provider: text("provider").notNull(),
  bankAccountId: integer("bank_account_id"),
  externalId: text("external_id"), // transaction ID, payment ID, etc.
  amount: numeric("amount", { precision: 14, scale: 2 }),
  status: text("status"), // 'success' | 'error' | 'warning'
  details: jsonb("details"),
  performedBy: text("performed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Zod schemas for inserts
export const insertBankAccountSchema = createInsertSchema(bankAccountsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertBankTransactionSchema = createInsertSchema(bankTransactionsTable)
  .omit({ id: true, createdAt: true });

export const insertPaymentRequestSchema = createInsertSchema(paymentRequestsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const insertWebhookLogSchema = createInsertSchema(webhookLogsTable)
  .omit({ id: true, createdAt: true });

export const insertBankAuditLogSchema = createInsertSchema(bankAuditLogsTable)
  .omit({ id: true, createdAt: true });

// Types
export type BankAccount = typeof bankAccountsTable.$inferSelect;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
export type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
export type WebhookLog = typeof webhookLogsTable.$inferSelect;
export type BankAuditLog = typeof bankAuditLogsTable.$inferSelect;
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type InsertPaymentRequest = z.infer<typeof insertPaymentRequestSchema>;
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type InsertBankAuditLog = z.infer<typeof insertBankAuditLogSchema>;
