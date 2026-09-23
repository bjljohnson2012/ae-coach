/**
 * GET /api/compare/narrative?ids=ae1,ae2,ae3
 * Returns an AI-summarized cohort narrative for the comparison view.
 * Leader-only. Uses MODEL_FAST. Tenant-scoped.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { generateCompareNarrative } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 4);
    if (ids.length < 2) return NextResponse.json({ error: "Pick 2-4 AEs" }, { status: 400 });

    const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };
    const aes = await prisma.aeProfile.findMany({
      where: { id: { in: ids }, ...orgFilter, lastSynthesizedAt: { not: null } },
      include: {
        user: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
      },
    });

    if (aes.length < 2) return NextResponse.json({ error: "At least 2 synthesized AEs required" }, { status: 400 });

    const narrative = await generateCompareNarrative(
      aes.map((a) => ({
        name: a.user.name,
        enneagramType: a.enneagramType,
        discProfile: a.discProfile,
        mbtiType: a.mbtiType,
        strengths: (a.strengthsJson as string[]) ?? [],
        weaknesses: (a.weaknessesJson as string[]) ?? [],
        motivations: (a.motivations as string[]) ?? [],
        skillScores: a.skillScores,
      })),
    );

    return NextResponse.json({ narrative, aeIds: aes.map((a) => a.id) });
  } catch (e: any) {
    console.error("[compare/narrative] crashed:", e);
    return NextResponse.json({ error: `Compare narrative failed: ${e?.message ?? "unknown"}` }, { status: 500 });
  }
}
