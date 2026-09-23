/**
 * POST /api/intake/submit
 *
 * v3.37.5 — async pattern. Submission no longer blocks on Grok:
 *   1. Mark answerSet COMPLETED.
 *   2. Set AeProfile.synthesisStatus = GENERATING.
 *   3. Fire-and-forget the synthesis job.
 *   4. Return 200 immediately so the client redirects to /ae/card,
 *      where a banner polls until the job finishes.
 *
 * Replaces the v3.8 retry pattern. Errors don't bubble back as a 502 anymore;
 * they live on the profile row as synthesisStatus = FAILED + synthesisError,
 * and the dashboard banner exposes a retry button.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { runAeSynthesisJob } from "@/lib/synthesisJobs";

export const runtime = "nodejs";

const Body = z.object({ answerSetId: z.string() });

export async function POST(req: Request) {
  const ctx = await requireRole("AE");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const aSet = await prisma.answerSet.findUnique({
    where: { id: parsed.data.answerSetId },
    include: {
      aeProfile: { include: { org: { include: { companyProfile: true } } } },
      answers: { include: { question: true } },
    },
  });
  if (!aSet || aSet.aeProfile?.userId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent — if a job is already running for this profile, no-op.
  if (aSet.aeProfile?.synthesisStatus === "GENERATING") {
    return NextResponse.json({ ok: true, status: "GENERATING" });
  }

  const ae = aSet.aeProfile!;
  const cp = ae.org.companyProfile;

  await prisma.$transaction([
    prisma.answerSet.update({
      where: { id: aSet.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    prisma.aeProfile.update({
      where: { id: ae.id },
      data: {
        synthesisStatus: "GENERATING",
        synthesisError: null,
        synthesisStartedAt: new Date(),
      },
    }),
  ]);

  void runAeSynthesisJob({
    aeProfileId: ae.id,
    answerSetId: aSet.id,
    aeName: ctx.name,
    orgId: ae.orgId,
    orgName: ae.org.name,
    salesMethodology: cp?.salesMethodology ?? null,
    values: ((cp?.values as any) ?? []) as string[],
    requiredSkills: (cp?.requiredSkills as any) ?? [],
    answers: aSet.answers.map((a) => ({
      category: a.question.category,
      tags: (a.question.tagsJson as any) ?? [],
      questionText: a.question.text,
      questionType: a.question.questionType,
      value: a.value,
    })),
  });

  return NextResponse.json({ ok: true, status: "GENERATING" });
}
