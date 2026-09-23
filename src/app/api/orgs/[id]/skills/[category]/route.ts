/**
 * PATCH /api/orgs/[id]/skills/[category]
 *
 * Upsert the org's override for one skill category. Body:
 *   {
 *     whatGoodLooksLike?: string | null   // null = clear override, fall back to platform default
 *     customNotes?: string | null
 *     recalibrate?: boolean                // v3.37 — kick off background recalibration
 *   }
 *
 * v3.37 — when whatGoodLooksLike actually changes, schedule a fire-and-forget
 * recalibration so existing AE/director scores get re-judged against the
 * new bar. The recalibrator is idempotent and rate-limited per (orgId, category).
 *
 * Permission: ORG_ADMIN any org; COMPANY_ADMIN their own only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";
import { recalibrateOrgSkillScores } from "@/lib/recalibrate";

export const runtime = "nodejs";

const Body = z.object({
  whatGoodLooksLike: z.string().max(8000).nullable().optional(),
  customNotes:       z.string().max(8000).nullable().optional(),
  // Force-skip recalibration even if the rubric changed. Useful when an admin
  // is mid-edit and saving incremental drafts.
  skipRecalibrate:   z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string; category: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const platform = getSkillBenchmark(params.category);
  if (!platform) {
    return NextResponse.json({ error: "Unknown skill category" }, { status: 400 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Detect whether the rubric actually changed so we only recalibrate when
  // it's worth the API spend.
  const before = await prisma.orgSkillBenchmark.findUnique({
    where: { orgId_category: { orgId: params.id, category: params.category } },
    select: { whatGoodLooksLike: true },
  });
  const wglChanged =
    parsed.data.whatGoodLooksLike !== undefined &&
    parsed.data.whatGoodLooksLike !== before?.whatGoodLooksLike;

  const updated = await prisma.orgSkillBenchmark.upsert({
    where: { orgId_category: { orgId: params.id, category: params.category } },
    update: {
      ...(parsed.data.whatGoodLooksLike !== undefined && { whatGoodLooksLike: parsed.data.whatGoodLooksLike }),
      ...(parsed.data.customNotes !== undefined && { customNotes: parsed.data.customNotes }),
    },
    create: {
      orgId: params.id,
      category: params.category,
      whatGoodLooksLike: parsed.data.whatGoodLooksLike ?? null,
      customNotes:       parsed.data.customNotes       ?? null,
    },
  });

  // Fire-and-forget recalibration. Errors are swallowed — the scorer is
  // resilient and will pick up the new rubric on the next intake submit
  // even if this background pass fails.
  if (wglChanged && !parsed.data.skipRecalibrate) {
    void recalibrateOrgSkillScores(params.id, params.category, ctx.userId).catch((err) => {
      console.error("[recalibrate] failed", { orgId: params.id, category: params.category, err: err?.message });
    });
  }

  return NextResponse.json({
    benchmark: updated,
    recalibrationQueued: wglChanged && !parsed.data.skipRecalibrate,
  });
}
