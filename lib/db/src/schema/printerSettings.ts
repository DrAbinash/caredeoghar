import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const printerSettingsTable = pgTable("printer_settings", {
  id: serial("id").primaryKey(),
  billPrinter: text("bill_printer").notNull().default(""),
  barcodePrinter: text("barcode_printer").notNull().default(""),
  tokenPrinter: text("token_printer").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrinterSettings = typeof printerSettingsTable.$inferSelect;