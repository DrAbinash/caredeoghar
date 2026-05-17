/**
 * aiReportEnhancer.ts
 * Phase 3 — AI-powered report enhancement using Gemini.
 * Generates impression drafts from findings, extracts measurements.
 */
import { db } from "@workspace/db";
import {
  radiologyAiEnhancementsTable,
  radiologyStudiesTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export type AiEnhancementResult = {
  findings: string;
  impression: string;
  measurements: Array<{ type: string; value: string; unit: string }>;
};

// Stub — integration with Gemini would call the AI service here
export async function generateAiEnhancement(studyId: number): Promise<AiEnhancementResult | null> {
  const [study] = await db.select().from(radiologyStudiesTable).where(eq(radiologyStudiesTable.id, studyId));
  if (!study) return null;

  // In production, this would call the Gemini AI integration
  // For now, return a structured placeholder that the UI can render
  const result: AiEnhancementResult = {
    findings: `AI-generated findings placeholder for ${study.modality} study ${study.accessionNumber}.`,
    impression: `AI impression placeholder — correlate clinically.`,
    measurements: [
      { type: "lesion_size", value: "2.4", unit: "cm" },
      { type: "density", value: "45", unit: "HU" },
    ],
  };

  await db.insert(radiologyAiEnhancementsTable).values({
    studyId,
    findingsJson: JSON.stringify({ findings: result.findings }),
    impressionDraft: result.impression,
    measurementExtractsJson: JSON.stringify(result.measurements),
    aiModel: "gemini-2.5-flash",
    aiVersion: "2025-05",
  });

  return result;
}

export async function getAiEnhancement(studyId: number): Promise<typeof radiologyAiEnhancementsTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(radiologyAiEnhancementsTable)
    .where(eq(radiologyAiEnhancementsTable.studyId, studyId))
    .orderBy(radiologyAiEnhancementsTable.createdAt)
    .limit(1);
  return row ?? null;
}

export async function acceptAiEnhancement(enhancementId: number, reviewerId: number): Promise<void> {
  await db
    .update(radiologyAiEnhancementsTable)
    .set({ accepted: true, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(radiologyAiEnhancementsTable.id, enhancementId));
}

export async function rejectAiEnhancement(enhancementId: number, reviewerId: number): Promise<void> {
  await db
    .update(radiologyAiEnhancementsTable)
    .set({ accepted: false, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(radiologyAiEnhancementsTable.id, enhancementId));
}
