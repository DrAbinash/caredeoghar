import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const whatsappSettingsTable = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  phoneNumberId: text("phone_number_id").notNull().default(""),
  accessToken: text("access_token").notNull().default(""),
  templateName: text("template_name").notNull().default(""),
  templateLang: text("template_lang").notNull().default("en"),
  defaultCountryCode: text("default_country_code").notNull().default("91"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WhatsappSettings = typeof whatsappSettingsTable.$inferSelect;
