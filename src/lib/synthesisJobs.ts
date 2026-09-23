/**
 * Background synthesis jobs — v3.37.5.
 *
 * Wraps `synthesizeProfile` / `synthesizeDirectorProfile` so the API endpoint
 * can fire-and-forget while we record status transitions on the profile row:
 *
 *   user submits intake
 *     → endpoint flips synthesisStatus = GENERATING immediately, returns 200
 *     → endpoint kicks off `runAeSynthesisJob(...)` without awaiting
 *
 *   background job
 *     → calls Grok with full answer payload + cascaded skill rubrics
 *     → on success: writes profile fields + skill scores, sets status READY
 *     → on failure: writes synthesisError, sets status FAILED
 *
 * The dashboard polls profile.synthesisStatus and renders a banner so the
 * user has a place to wait without staring at the wizard form.
 *
 * Why a separate file: keeps the `void runJob(...).catch(noop)` pattern out
 * of the route handler so the route stays focused on auth + persistence,
 * and the job is unit-testable in isolation.
 */
import { prisma } from "@/lib/prisma";
import {
  synthesizeProfile,
  synthesizeDirectorProfile,
  type SynthesizeInput,
  type DirectorSynthesizeInput,
} from "@/lib/ai";
import { scoreToLevel, ALL_SKILL_CATEGORIES, DIRECTOR_SKILL_CATEGORIES } from "@/lib/scoring";
import { getEffectiveBenchmarksForOrg } from "@/lib/effectiveBenchmark";

// ============================================================
// AE
// ============================================================

export async function runAeSynthesisJob(args: {
  aeProfileId: string;
  answerSetId: string;
  aeName: string;
  orgId: string;
  orgName: string;
  salesMethodology?: string | null;
  values?: string[];
  requiredSkills?: SynthesizeInput["companyContext"]["requiredSkills"];
  answers: SynthesizeInput["answers"];
}): Promise<void> {
  try {
    const aeSkillCategories = ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "COMMUNICATION", "RESILIENCE", "PRODUCT_MASTERY"];
    const effective = await getEffectiveBenchmarksForOrg(args.orgId, aeSkillCategories);
    const skillRubrics: Record<string, string> = {};
    for (const [cat, ben] of effective.entries()) skillRubrics[cat] = ben.whatGoodLooksLike;

    const synth = await synthesizeProfile({
      aeName: args.aeName,
      companyContext: {
        name: args.orgName,
        requiredSkills: args.requiredSkills ?? [],
        products: [],
        values: args.values ?? [],
        salesMethodology: args.salesMethodology ?? undefined,
      },
      answers: args.answers,
    }, { skillRubrics });

    const safe = {
      personalitySummary: typeof synth.personalitySummary === "string" ? synth.personalitySummary : "",
      salesStyleSummary: typeof synth.salesStyleSummary === "string" ? synth.salesStyleSummary : "",
      communicationSummary: typeof synth.communicationSummary === "string" ? synth.communicationSummary : "",
      motivations: Array.isArray(synth.motivations) ? synth.motivations : [],
      strengths: Array.isArray(synth.strengths) ? synth.strengths : [],
      weaknesses: Array.isArray(synth.weaknesses) ? synth.weaknesses : [],
      enneagramType: synth.enneagramType,
      discProfile: synth.discProfile,
      mbtiType: synth.mbtiType,
      skillScores: Array.isArray(synth.skillScores) ? synth.skillScores : [],
    };

    // v3.37.7 — empty-payload guard. See director job for context.
    const hasSummaries = !!(safe.personalitySummary || safe.salesStyleSummary || safe.communicationSummary);
    const hasArrays = safe.strengths.length > 0 || safe.weaknesses.length > 0;
    const hasScores = safe.skillScores.length > 0;
    if (!hasSummaries && !hasArrays && !hasScores) {
      // v3.37.8 — log payload for diagnostics
      console.error("[runAeSynthesisJob] empty Grok payload", {
        aeProfileId: args.aeProfileId,
        answerSetId: args.answerSetId,
        answerCount: args.answers.length,
        rubricCount: Object.keys(skillRubrics).length,
        rawSynthKeys: Object.keys(synth ?? {}),
        rawSynthPreview: JSON.stringify(synth ?? {}).slice(0, 500),
      });
      throw new Error("AI returned an empty payload. Please retry — most retries succeed.");
    }

    await prisma.aeProfile.update({
      where: { id: args.aeProfileId },
      data: {
        personalitySummary: safe.personalitySummary,
        salesStyleSummary: safe.salesStyleSummary,
        communicationSummary: safe.communicationSummary,
        motivations: safe.motivations as any,
        strengthsJson: safe.strengths as any,
        weaknessesJson: safe.weaknesses as any,
        enneagramType: safe.enneagramType,
        discProfile: safe.discProfile,
        mbtiType: safe.mbtiType,
        lastSynthesizedAt: new Date(),
        synthesisStatus: "READY",
        synthesisError: null,
      },
    });

    for (const s of safe.skillScores) {
      if (!ALL_SKILL_CATEGORIES.includes(s.category as any)) continue;
      const score = Math.max(0, Math.min(100, Number(s.score) || 50));
      await prisma.skillScore.upsert({
        where: { aeProfileId_category: { aeProfileId: args.aeProfileId, category: s.category as any } },
        update: {
          score, level: scoreToLevel(score), notes: s.notes,
          source: "AI", lastUpdatedAt: new Date(),
        },
        create: {
          aeProfileId: args.aeProfileId, category: s.category as any,
          score, level: scoreToLevel(score), notes: s.notes, source: "AI",
        },
      });
      await prisma.skillScoreHistory.create({
        data: { aeProfileId: args.aeProfileId, category: s.category as any, score, source: "AI" },
      });
    }

    await prisma.auditLog.create({
      data: {
        orgId: args.orgId,
        actorUserId: (await prisma.aeProfile.findUnique({ where: { id: args.aeProfileId }, select: { userId: true } }))!.userId,
        action: "PROFILE_SYNTHESIZED",
        targetType: "AeProfile",
        targetId: args.aeProfileId,
        metadata: { kind: "ASYNC", answerSetId: args.answerSetId },
      },
    });
  } catch (err: any) {
    console.error("[runAeSynthesisJob] failed", { aeProfileId: args.aeProfileId, err: err?.message });
    await prisma.aeProfile.update({
      where: { id: args.aeProfileId },
      data: {
        synthesisStatus: "FAILED",
        synthesisError: String(err?.message ?? err).slice(0, 2000),
      },
    });
  }
}

// ============================================================
// Director
// ============================================================

export async function runDirectorSynthesisJob(args: {
  directorProfileId: string;
  answerSetId: string;
  directorName: string;
  orgId: string;
  orgName: string;
  salesMethodology?: string | null;
  answers: DirectorSynthesizeInput["answers"];
}): Promise<void> {
  try {
    const directorCategories = ["LEADERSHIP", "FORECASTING", "COMMUNICATION", "RESILIENCE"];
    const effective = await getEffectiveBenchmarksForOrg(args.orgId, directorCategories);
    const skillRubrics: Record<string, string> = {};
    for (const [cat, ben] of effective.entries()) skillRubrics[cat] = ben.whatGoodLooksLike;

    const synth = await synthesizeDirectorProfile({
      directorName: args.directorName,
      companyContext: { name: args.orgName, salesMethodology: args.salesMethodology ?? undefined },
      answers: args.answers,
    }, { skillRubrics });

    // v3.37.7 — empty-payload guard. Grok occasionally returns a parseable
    // JSON that's mostly empty fields. Without this check we'd silently flip
    // synthesisStatus=READY and lastSynthesizedAt=now() with no actual content,
    // leaving the user staring at empty Strengths/Growth-Areas cards.
    const hasSummaries = !!(synth.personalitySummary || synth.leadershipSummary || synth.forecastingSummary);
    const hasArrays = (synth.strengths?.length ?? 0) > 0 || (synth.weaknesses?.length ?? 0) > 0;
    const hasScores = (synth.skillScores?.length ?? 0) > 0;
    if (!hasSummaries && !hasArrays && !hasScores) {
      // v3.37.8 — log the payload so we can diagnose model behavior. The
      // truncate keeps the log size sane while preserving enough to debug.
      console.error("[runDirectorSynthesisJob] empty Grok payload", {
        directorProfileId: args.directorProfileId,
        answerSetId: args.answerSetId,
        answerCount: args.answers.length,
        rubricCount: Object.keys(skillRubrics).length,
        rawSynthKeys: Object.keys(synth ?? {}),
        rawSynthPreview: JSON.stringify(synth ?? {}).slice(0, 500),
      });
      throw new Error("AI returned an empty payload. Please retry — most retries succeed.");
    }

    await prisma.directorProfile.update({
      where: { id: args.directorProfileId },
      data: {
        personalitySummary: synth.personalitySummary,
        leadershipSummary: synth.leadershipSummary,
        forecastingSummary: synth.forecastingSummary,
        motivations: synth.motivations as any,
        strengthsJson: synth.strengths as any,
        weaknessesJson: synth.weaknesses as any,
        enneagramType: synth.enneagramType,
        discProfile: synth.discProfile,
        mbtiType: synth.mbtiType,
        lastSynthesizedAt: new Date(),
        synthesisStatus: "READY",
        synthesisError: null,
      },
    });

    for (const s of synth.skillScores) {
      if (!DIRECTOR_SKILL_CATEGORIES.includes(s.category as any)) continue;
      await prisma.directorSkillScore.upsert({
        where: { directorProfileId_category: { directorProfileId: args.directorProfileId, category: s.category as any } },
        update: {
          score: s.score, level: scoreToLevel(s.score), notes: s.notes,
          source: "AI", lastUpdatedAt: new Date(),
        },
        create: {
          directorProfileId: args.directorProfileId, category: s.category as any,
          score: s.score, level: scoreToLevel(s.score), notes: s.notes, source: "AI",
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        orgId: args.orgId,
        actorUserId: (await prisma.directorProfile.findUnique({ where: { id: args.directorProfileId }, select: { userId: true } }))!.userId,
        action: "PROFILE_SYNTHESIZED",
        targetType: "DirectorProfile",
        targetId: args.directorProfileId,
        metadata: { kind: "ASYNC", answerSetId: args.answerSetId },
      },
    });
  } catch (err: any) {
    console.error("[runDirectorSynthesisJob] failed", { directorProfileId: args.directorProfileId, err: err?.message });
    await prisma.directorProfile.update({
      where: { id: args.directorProfileId },
      data: {
        synthesisStatus: "FAILED",
        synthesisError: String(err?.message ?? err).slice(0, 2000),
      },
    });
  }
}
