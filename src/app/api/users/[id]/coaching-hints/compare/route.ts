/**
 * GET /api/users/[id]/coaching-hints/compare
 *
 * Returns a personality comparison between the calling LEADER and the TARGET user (params.id).
 * Helps the leader see what THEY need to flex about their natural style to coach this person.
 *
 * Pre-flight: leader must have a profile (AE or director) with lastSynthesizedAt — otherwise
 *             returns { needsLeaderIntake: true } so the UI can show "complete intake first."
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { generatePersonalityComparison } from "@/lib/ai";

const LEADER_ROLES = new Set(["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR"]);

interface SidePersona {
  name: string;
  role: any;
  enneagramType: string | null;
  discProfile: string | null;
  mbtiType: string | null;
  personalitySummary: string | null;
  styleSummary: string | null;
  communicationSummary: string | null;
  strengths: string[];
  weaknesses: string[];
  motivations: string[];
  skillScores: Array<{ category: string; score: number }>;
}

async function loadPersonaForUser(userId: string): Promise<SidePersona | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true },
  });
  if (!u) return null;

  const [aeProfile, directorProfile] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { userId: u.id },
      include: { skillScores: true },
    }),
    prisma.directorProfile.findUnique({
      where: { userId: u.id },
      include: { skillScores: true },
    }),
  ]);

  const profile = aeProfile ?? directorProfile;
  if (!profile || !profile.lastSynthesizedAt) return null;

  return {
    name: u.name,
    role: u.role,
    enneagramType: profile.enneagramType,
    discProfile: profile.discProfile,
    mbtiType: profile.mbtiType,
    personalitySummary: profile.personalitySummary,
    styleSummary: (aeProfile as any)?.salesStyleSummary ?? (directorProfile as any)?.leadershipSummary ?? null,
    communicationSummary: (aeProfile as any)?.communicationSummary ?? (directorProfile as any)?.forecastingSummary ?? null,
    strengths: (profile.strengthsJson as string[]) ?? [],
    weaknesses: (profile.weaknessesJson as string[]) ?? [],
    motivations: (profile.motivations as string[]) ?? [],
    skillScores: profile.skillScores.map((s: any) => ({ category: s.category, score: s.score })),
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireSession();
    if (!LEADER_ROLES.has(ctx.role)) {
      return NextResponse.json({ error: "Leader-only" }, { status: 403 });
    }
    if (ctx.userId === params.id) {
      return NextResponse.json({ error: "Pick a different person to compare against" }, { status: 400 });
    }

    // Tenant boundary
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { orgId: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (ctx.role !== "ORG_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const leader = await loadPersonaForUser(ctx.userId);
    if (!leader) {
      return NextResponse.json({
        needsLeaderIntake: true,
        leaderRole: ctx.role,
        message:
          ctx.role === "DIRECTOR" || ctx.role === "VP_SALES"
            ? "Complete your leadership intake to enable cross-comparison."
            : "Complete your intake to enable cross-comparison. " +
              "Admins can take the director intake at /director/intake.",
      });
    }

    const targetPersona = await loadPersonaForUser(params.id);
    if (!targetPersona) {
      return NextResponse.json({
        needsTargetIntake: true,
        message: "This person hasn't completed their intake yet — comparison can't be calculated.",
      });
    }

    const result = await generatePersonalityComparison({ leader, target: targetPersona });
    return NextResponse.json({
      result,
      leaderName: leader.name,
      targetName: targetPersona.name,
      leaderTraits: {
        disc: leader.discProfile,
        enneagram: leader.enneagramType,
        mbti: leader.mbtiType,
      },
      targetTraits: {
        disc: targetPersona.discProfile,
        enneagram: targetPersona.enneagramType,
        mbti: targetPersona.mbtiType,
      },
    });
  } catch (e: any) {
    console.error("[coaching-hints/compare] crashed:", e);
    return NextResponse.json({ error: `Compare failed: ${e?.message ?? "unknown"}` }, { status: 500 });
  }
}
