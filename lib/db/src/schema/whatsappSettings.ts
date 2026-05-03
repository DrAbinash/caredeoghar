import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const whatsappSettingsTable = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  phoneNumberId: text("phone_number_id").notNull().default(""),
  accessToken: text("access_token").notNull().default(""),
  templateName: text("template_name").notNull().default(""),
  templateLang: text("template_lang").notNull().default("en"),
  defaultCountryCode: text("default_country_code").notNull().default("91"),
  // When true, verifying a patient report auto-sends a WhatsApp delivery message
  // to the patient (PDF link + optional image-viewer link for radiology).
  autoSendOnVerify: boolean("auto_send_on_verify").notNull().default(false),
  // Custom message body for report delivery. Supports placeholders:
  //   {{name}} {{reportNumber}} {{testName}} {{reportUrl}} {{viewerUrl}}
  // If empty, a sensible default is used.
  reportMessageTemplate: text("report_message_template").notNull().default(""),
  // Whether to include a tokenized DICOM viewer link for radiology reports.
  includeViewerLink: boolean("include_viewer_link").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappSettings = typeof whatsappSettingsTable.$inferSelect;
