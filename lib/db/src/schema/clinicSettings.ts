import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

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
  formFTestIds: text("form_f_test_ids").notNull().default("[]"),
  quickTestIds: text("quick_test_ids").notNull().default("[null,null,null,null,null,null]"),
  patientPhotoEnabled: boolean("patient_photo_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
