import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";

export const portalSessionsTable = pgTable(
  "portal_sessions",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    scope: text("scope").notNull(), // 'patient' | 'staff'
    subjectId: integer("subject_id").notNull(),
    subjectName: text("subject_name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byTokenIdx: index("portal_sessions_token_idx").on(t.token),
  }),
);

export type PortalSession = typeof portalSessionsTable.$inferSelect;
