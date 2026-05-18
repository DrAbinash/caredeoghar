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
  showTatOnBill: boolean("show_tat_on_bill").notNull().default(false),
  billPrintCopies: integer("bill_print_copies").notNull().default(1),
  qrOnBillEnabled: boolean("qr_on_bill_enabled").notNull().default(true),
  portalEnabled: boolean("portal_enabled").notNull().default(false),
  portalHeading: text("portal_heading").notNull().default(""),
  portalWelcomeMessage: text("portal_welcome_message").notNull().default(""),
  portalAllowAppointmentBooking: boolean("portal_allow_appointment_booking").notNull().default(true),
  portalAllowProfileEdit: boolean("portal_allow_profile_edit").notNull().default(true),
  // Online booking
  onlineBookingEnabled: boolean("online_booking_enabled").notNull().default(false),
  razorpayKeyId: text("razorpay_key_id").notNull().default(""),
  onlineBookingLedgerId: integer("online_booking_ledger_id").notNull().default(1),
  vipQueueEnabled: boolean("vip_queue_enabled").notNull().default(false),
  // PayU India
  payuEnabled: boolean("payu_enabled").notNull().default(false),
  payuMerchantKey: text("payu_merchant_key").notNull().default(""),
  // PhonePe
  phonepeEnabled: boolean("phonepe_enabled").notNull().default(false),
  phonepeMerchantId: text("phonepe_merchant_id").notNull().default(""),
  // BharatPe
  bharatpeEnabled: boolean("bharatpe_enabled").notNull().default(false),
  bharatpeMerchantId: text("bharatpe_merchant_id").notNull().default(""),
  // Self-registration kiosk
  kioskEnabled: boolean("kiosk_enabled").notNull().default(false),
  kioskUpiVpa: text("kiosk_upi_vpa").notNull().default(""),
  kioskUpiName: text("kiosk_upi_name").notNull().default(""),
  kioskWelcomeMessage: text("kiosk_welcome_message").notNull().default(""),
  kioskAllowedTestIds: text("kiosk_allowed_test_ids").notNull().default("[]"),
  sidebarTheme: text("sidebar_theme").notNull().default("navy"),
  billDefaultPaperSize: text("bill_default_paper_size").notNull().default("A5"),
  billShowCode: boolean("bill_show_code").notNull().default(true),
  billShowCategory: boolean("bill_show_category").notNull().default(true),
  // When true, closing the day auto-prints the summary slip on the bill printer.
  dayCloseAutoPrint: boolean("day_close_auto_print").notNull().default(true),
  // Referral commission discount deduction mode (super-admin configurable):
  //   "none"            — discount has no effect on commission (default/legacy)
  //   "deduct"          — commission = max(0, commission - bill_discount)
  //   "deduct_rollover" — commission = commission - bill_discount (can go negative;
  //                       negative amount is deducted from doctor's overall ledger)
  commissionDiscountMode: text("commission_discount_mode").notNull().default("none"),
  // Network access control — when enabled, non-admin staff can only log in from
  // the hospital LAN (private RFC-1918 IP ranges). Extra trusted IPs can be added
  // as a JSON array of strings in lanAllowedIps.
  lanOnlyLogin: boolean("lan_only_login").notNull().default(false),
  lanAllowedIps: text("lan_allowed_ips").notNull().default("[]"),
  // FIDO2 / WebAuthn / YubiKey optional toggle — when enabled the login UI
  // offers security-key authentication alongside PIN login.
  fido2Enabled: boolean("fido2_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
