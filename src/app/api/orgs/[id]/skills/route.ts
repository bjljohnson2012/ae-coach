/**
 * GET /api/orgs/[id]/skills
 *
 * Returns every skill benchmark for the org, with platform defaults filled
 * in for any skill the org hasn't customized. Each entry includes the
 * org override (if any), the platform default, the cascaded effective value,
 * and any uploaded reference files + AI synthesis status.
 *
 * v3.37 — `effectiveWhatGoodLooksLike` now resolves through the cascade:
 *   org override → platform-org override → hardcoded platform default.
 *
 * Permission:
 *   - ORG_ADMIN: any org
 *   - COMPANY_ADMIN: their own org only
 *   - Others: forbidden
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { getAllSkillBenchmarks } from "@/lib/skillBenchmarks";
import { getEffectiveBenchmarksForOrg } from "@/lib/effectiveBenchmark";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const overrides: any[] = await prisma.orgSkillBenchmark.findMany({
    where: { orgId: params.id },
    include: {
      files: {
        orderBy: { createdAt: "desc" },
        select: { id: true, filename: true, createdAt: true, uploadedBy: { select: { name: true } } },
      },
    },
  });
  const overrideByCategory = new Map<string, any>(overrides.map((o) => [o.category, o]));

  // Resolve effective rubric through the cascade in one batch.
  const allBenchmarks = getAllSkillBenchmarks();
  const effective = await getEffectiveBenchmarksForOrg(
    params.id,
    allBenchmarks.map((b) => b.category),
  );

  const merged = allBenchmarks.map((platform) => {
    const ovr = overrideByCategory.get(platform.category);
    const eff = effective.get(platform.category);
    return {
      category: platform.category,
      label: platform.label,
      definition: platform.definition,
      platformDefaultWhatGoodLooksLike: platform.whatGoodLooksLike,
      override: ovr ? {
        id: ovr.id,
        whatGoodLooksLike: ovr.whatGoodLooksLike,
        customNotes: ovr.customNotes,
        aiSynthesizedSummary: ovr.aiSynthesizedSummary,
        lastSynthesizedAt: ovr.lastSynthesizedAt,
        files: ovr.files,
      } : null,
      // Cascaded — org override wins, falls back to platform-org override,
      // finally hardcoded default.
      effectiveWhatGoodLooksLike: eff?.whatGoodLooksLike ?? platform.whatGoodLooksLike,
      effectiveSource: eff?.source ?? "PLATFORM_DEFAULT",
    };
  });

  return NextResponse.json({ skills: merged });
}
