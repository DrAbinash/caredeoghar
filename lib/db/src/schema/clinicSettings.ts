import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

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
  // When true, bill receipts print each test's expected turn-around time
  // (sourced from the test's "duration" field).
  showTatOnBill: boolean("show_tat_on_bill").notNull().default(false),
  // How many physical copies of a bill to print per print job (1 or 2).
  // Used by BillingDesk auto-print and BillDetail manual print so a clinic
  // that needs a customer copy + clinic copy doesn't have to hit Print twice.
  billPrintCopies: integer("bill_print_copies").notNull().default(1),
  // When true, the printed bill receipt embeds a small "Scan to verify"
  // QR code (links to /verify/bill/:billNumber). Replaces the old
  // separate "QR Bill" print button on BillingDesk.
  qrOnBillEnabled: boolean("qr_on_bill_enabled").notNull().default(true),
  portalEnabled: boolean("portal_enabled").notNull().default(false),
  portalHeading: text("portal_heading").notNull().default(""),
  portalWelcomeMessage: text("portal_welcome_message").notNull().default(""),
  portalAllowAppointmentBooking: boolean("portal_allow_appointment_booking").notNull().default(true),
  portalAllowProfileEdit: boolean("portal_allow_profile_edit").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
