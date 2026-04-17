import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const clinicSettingsTable = pgTable("clinic_settings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("DiagnoCenter"),
  tagline: text("tagline").notNull().default("Diagnostic & Pathology Services"),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  website: text("website").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  logoDataUrl: text("logo_data_url"),
  footerNote: text("footer_note").notNull().default("Thank you for choosing our diagnostic services."),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
