/**
 * POST /api/director-intake/submit
 *
 * v3.37.5 — async pattern. Submission no longer blocks on Grok:
 *   1. Mark answerSet COMPLETED.
 *   2. Set DirectorProfile.synthesisStatus = GENERATING.
 *   3. Fire-and-forget the synthesis job.
 *   4. Return 200 immediately so the client redirects to dashboard,
 *      where a banner polls until the job finishes.
 *
 * The request returns in milliseconds. The actual AI work runs in the
 * Node.js process for ~30-90s and writes status transitions to the row.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { runDirectorSynthesisJob } from "@/lib/synthesisJobs";

export const runtime = "nodejs";

const Body = z.object({ answerSetId: z.string() });

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN", "VP_SALES", "COMPANY_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const aSet = await prisma.answerSet.findUnique({
    where: { id: parsed.data.answerSetId },
    include: {
      directorProfile: { include: { org: { include: { companyProfile: true } } } },
      answers: { include: { question: true } },
    },
  });
  if (!aSet || aSet.directorProfile?.userId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent — if synth has already finished and produced summaries, just
  // return ok. If it's currently generating, returning ok is also fine; the
  // dashboard banner will reflect the in-flight state.
  if (aSet.directorProfile?.synthesisStatus === "GENERATING") {
    return NextResponse.json({ ok: true, status: "GENERATING" });
  }

  const dp = aSet.directorProfile!;

  // Move answerSet to COMPLETED + flip profile to GENERATING in one round trip.
  await prisma.$transaction([
    prisma.answerSet.update({
      where: { id: aSet.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
    prisma.directorProfile.update({
      where: { id: dp.id },
      data: {
        synthesisStatus: "GENERATING",
        synthesisError: null,
        synthesisStartedAt: new Date(),
      },
    }),
  ]);

  // Fire-and-forget. The job catches its own errors and persists FAILED.
  void runDirectorSynthesisJob({
    directorProfileId: dp.id,
    answerSetId: aSet.id,
    directorName: ctx.name,
    orgId: dp.orgId,
    orgName: dp.org.name,
    salesMethodology: dp.org.companyProfile?.salesMethodology ?? null,
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
