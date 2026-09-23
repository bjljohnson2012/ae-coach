/**
 * GET  /api/users/[id]/coaching-hints   — leader-only. Returns the full hints
 *                                          payload for all 6 fields + reasoning summary.
 *                                          Regenerates if cache is stale relative to latest input signal.
 *
 * POST /api/users/[id]/coaching-hints   — force-regenerate (manual refresh).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { generateCoachingHints, type CoachingHintsOutput } from "@/lib/ai";
import { getLatestInputSignalAt, isStale } from "@/lib/profileSignals";

const LEADER_ROLES = new Set(["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR"]);

async function ensureHints(targetUserId: string, force: boolean = false) {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, role: true, orgId: true },
  });
  if (!target) return { error: "Not found", status: 404 as const };

  const [aeProfile, directorProfile] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { userId: target.id },
      include: {
        skillScores: true,
        coachingNotes: { orderBy: { createdAt: "desc" }, take: 5, select: { content: true, createdAt: true } },
      },
    }),
    prisma.directorProfile.findUnique({
      where: { userId: target.id },
      include: { skillScores: true },
    }),
  ]);

  const profile = aeProfile ?? directorProfile;
  if (!profile) {
    return {
      data: {
        hints: null,
        reasoningSummary: null,
        coachingHintsAt: null,
        empty: true,
        reason: "No synthesized profile yet — they may not have completed intake.",
        target,
      },
    };
  }

  let hints = (profile as any).coachingHintsJson as CoachingHintsOutput | null;
  let cachedAt: Date | null = (profile as any).coachingHintsAt ?? null;
  let reasoningSummary: string | null = (profile as any).reasoningSummary ?? null;

  const latestSignalAt = await getLatestInputSignalAt(
    aeProfile ? { aeProfileId: aeProfile.id } : { directorProfileId: directorProfile!.id },
  );
  const needsRegen = force || !hints || isStale(cachedAt, latestSignalAt);

  if (needsRegen) {
    try {
      const org = await prisma.org.findUnique({ where: { id: target.orgId }, select: { aiModel: true } });
      const recentReviews = aeProfile
        ? await prisma.directorReview.findMany({
            where: { aeProfileId: aeProfile.id },
            orderBy: { monthOf: "desc" },
            take: 3,
            select: { summary: true },
          })
        : [];
      const recentPreps = await prisma.oneOnOnePrep.findMany({
        where: aeProfile ? { aeProfileId: aeProfile.id } : { directorProfileId: directorProfile!.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { generatedJson: true },
      });
      const prepSummaries: string[] = recentPreps
        .map((p: any) => (p.generatedJson?.summary ?? "") as string)
        .filter(Boolean);

      const generated = await generateCoachingHints({
        name: target.name,
        role: aeProfile ? "AE" : "DIRECTOR",
        enneagramType: profile.enneagramType,
        discProfile: profile.discProfile,
        mbtiType: profile.mbtiType,
        personalitySummary: profile.personalitySummary,
        salesStyleSummary: (aeProfile as any)?.salesStyleSummary,
        leadershipSummary: (directorProfile as any)?.leadershipSummary,
        communicationSummary: (aeProfile as any)?.communicationSummary ?? (directorProfile as any)?.forecastingSummary,
        strengths: (profile.strengthsJson as string[]) ?? [],
        weaknesses: (profile.weaknessesJson as string[]) ?? [],
        motivations: (profile.motivations as string[]) ?? [],
        skillScores: profile.skillScores.map((s: any) => ({ category: s.category, score: s.score })),
        recentNotes: aeProfile?.coachingNotes.map((n: any) => ({ date: n.createdAt.toISOString().slice(0, 10), content: n.content })),
        recentReviewSummaries: [
          ...recentReviews.map((r: any) => r.summary).filter(Boolean) as string[],
          ...prepSummaries,
        ],
      }, org?.aiModel);
      hints = generated;
      cachedAt = new Date();
      reasoningSummary = generated.reasoningSummary || null;

      if (aeProfile) {
        await prisma.aeProfile.update({
          where: { id: aeProfile.id },
          data: {
            coachingHintsJson: generated as any,
            coachingHintsAt: cachedAt,
            reasoningSummary,
            reasoningSummaryAt: cachedAt,
          },
        });
      } else {
        await prisma.directorProfile.update({
          where: { id: directorProfile!.id },
          data: {
            coachingHintsJson: generated as any,
            coachingHintsAt: cachedAt,
            reasoningSummary,
            reasoningSummaryAt: cachedAt,
          },
        });
      }
    } catch (e: any) {
      console.warn("[coaching-hints] generation failed:", e?.message);
    }
  }

  return {
    data: {
      hints,
      reasoningSummary,
      coachingHintsAt: cachedAt?.toISOString() ?? null,
      latestSignalAt: latestSignalAt?.toISOString() ?? null,
      regenerated: needsRegen,
      target,
    },
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  if (!LEADER_ROLES.has(ctx.role) || ctx.userId === params.id) {
    return NextResponse.json({ error: "Leader-only" }, { status: 403 });
  }
  const result = await ensureHints(params.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  if (!LEADER_ROLES.has(ctx.role) || ctx.userId === params.id) {
    return NextResponse.json({ error: "Leader-only" }, { status: 403 });
  }
  const result = await ensureHints(params.id, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
