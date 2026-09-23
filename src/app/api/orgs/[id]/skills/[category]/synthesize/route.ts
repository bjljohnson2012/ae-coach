/**
 * POST /api/orgs/[id]/skills/[category]/synthesize
 *
 * Read all uploaded reference files for this org+category and run the AI
 * synthesizer to produce a refined whatGoodLooksLike paragraph + observed
 * themes + evidence citations.
 *
 * The result is stored on `OrgSkillBenchmark.aiSynthesizedSummary`. The
 * admin then reviews it in the UI and can promote it to the public
 * `whatGoodLooksLike` override (or edit it first).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { synthesizeSkillBenchmark } from "@/lib/ai";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: { id: string; category: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const platform = getSkillBenchmark(params.category);
  if (!platform) {
    return NextResponse.json({ error: "Unknown skill category" }, { status: 400 });
  }

  const benchmark = await prisma.orgSkillBenchmark.findUnique({
    where: { orgId_category: { orgId: params.id, category: params.category } },
    include: { files: true },
  });
  if (!benchmark || benchmark.files.length === 0) {
    return NextResponse.json(
      { error: "No reference files uploaded yet. Upload top-rep transcripts, win stories, or training docs first." },
      { status: 400 }
    );
  }

  const org = await prisma.org.findUnique({
    where: { id: params.id },
    select: { name: true, aiModel: true },
  });

  const result = await synthesizeSkillBenchmark(
    {
      category: params.category,
      categoryLabel: platform.label,
      platformDefault: platform.whatGoodLooksLike,
      existingOverride: benchmark.whatGoodLooksLike,
      orgName: org?.name,
      files: benchmark.files.map((f: any) => ({ filename: f.filename, textPreview: f.textPreview })),
    },
    org?.aiModel,
  );

  // Persist the AI summary as a draft. Admin can review + promote in the UI.
  const updated = await prisma.orgSkillBenchmark.update({
    where: { id: benchmark.id },
    data: {
      aiSynthesizedSummary: result.refinedWhatGoodLooksLike,
      lastSynthesizedAt: new Date(),
    },
  });

  return NextResponse.json({
    benchmark: updated,
    synthesis: result,
  });
}
