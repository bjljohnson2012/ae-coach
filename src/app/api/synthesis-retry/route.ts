/**
 * POST /api/synthesis-retry
 *
 * v3.37.10 — admin-only direct retry. Body:
 *   { targetUserId?: string }   // omit → run on the caller's own profile
 *
 * Auth model:
 *   - ORG_ADMIN | COMPANY_ADMIN: can retry their own OR any user's profile
 *     in scope. Required for cross-user retries.
 *   - DIRECTOR | VP_SALES | AE: rejected. They must use /api/synthesis-request,
 *     which creates a task assigned to a company admin.
 *
 * Idempotent: if a job is already GENERATING for the target, returns success.
 * Finds the latest COMPLETED answer set for the target's profile and re-fires
 * the background synthesis job.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { runAeSynthesisJob, runDirectorSynthesisJob } from "@/lib/synthesisJobs";

export const runtime = "nodejs";

const Body = z.object({
  targetUserId: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireSession();

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const isAdmin = ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN";

  // If a non-admin requests retry, route them to the request flow.
  if (!isAdmin) {
    return NextResponse.json(
      {
        error: "Re-running synthesis is restricted to company admins. Use Request re-synthesis instead.",
        useRequestEndpoint: true,
      },
      { status: 403 },
    );
  }

  // Resolve the target user. Default = self. Cross-user only allowed for admins
  // (already gated above) and only within their org scope (COMPANY_ADMIN can't
  // act on other orgs).
  const targetUserId = parsed.data.targetUserId ?? ctx.userId;
  if (targetUserId !== ctx.userId) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, orgId: true, name: true },
    });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (ctx.role === "COMPANY_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
      return NextResponse.json({ error: "Forbidden — outside your org" }, { status: 403 });
    }
  }

  // AE branch
  const ae = await prisma.aeProfile.findUnique({
    where: { userId: targetUserId },
    include: { org: { include: { companyProfile: true } }, user: { select: { name: true } } },
  }) as any;

  if (ae) {
    if (ae.synthesisStatus === "GENERATING") {
      return NextResponse.json({ ok: true, status: "GENERATING" });
    }
    const aSet = await prisma.answerSet.findFirst({
      where: { aeProfileId: ae.id, status: "COMPLETED" },
      include: { answers: { include: { question: true } } },
      orderBy: { completedAt: "desc" },
    });
    if (!aSet) {
      return NextResponse.json({ error: "No completed intake found." }, { status: 400 });
    }
    await prisma.aeProfile.update({
      where: { id: ae.id },
      data: {
        synthesisStatus: "GENERATING",
        synthesisError: null,
        synthesisStartedAt: new Date(),
      },
    });
    void runAeSynthesisJob({
      aeProfileId: ae.id,
      answerSetId: aSet.id,
      aeName: ae.user.name,
      orgId: ae.orgId,
      orgName: ae.org.name,
      salesMethodology: ae.org.companyProfile?.salesMethodology ?? null,
      values: ((ae.org.companyProfile?.values as any) ?? []) as string[],
      requiredSkills: (ae.org.companyProfile?.requiredSkills as any) ?? [],
      answers: aSet.answers.map((a: any) => ({
        category: a.question.category,
        tags: (a.question.tagsJson as any) ?? [],
        questionText: a.question.text,
        questionType: a.question.questionType,
        value: a.value,
      })),
    });
    return NextResponse.json({ ok: true, status: "GENERATING" });
  }

  // Director branch
  const dp = await prisma.directorProfile.findUnique({
    where: { userId: targetUserId },
    include: { org: { include: { companyProfile: true } }, user: { select: { name: true } } },
  }) as any;
  if (!dp) return NextResponse.json({ error: "No profile found." }, { status: 404 });

  if (dp.synthesisStatus === "GENERATING") {
    return NextResponse.json({ ok: true, status: "GENERATING" });
  }
  const aSet = await prisma.answerSet.findFirst({
    where: { directorProfileId: dp.id, status: "COMPLETED" },
    include: { answers: { include: { question: true } } },
    orderBy: { completedAt: "desc" },
  });
  if (!aSet) {
    return NextResponse.json({ error: "No completed intake found." }, { status: 400 });
  }
  await prisma.directorProfile.update({
    where: { id: dp.id },
    data: {
      synthesisStatus: "GENERATING",
      synthesisError: null,
      synthesisStartedAt: new Date(),
    },
  });
  void runDirectorSynthesisJob({
    directorProfileId: dp.id,
    answerSetId: aSet.id,
    directorName: dp.user.name,
    orgId: dp.orgId,
    orgName: dp.org.name,
    salesMethodology: dp.org.companyProfile?.salesMethodology ?? null,
    answers: aSet.answers.map((a: any) => ({
      category: a.question.category,
      tags: (a.question.tagsJson as any) ?? [],
      questionText: a.question.text,
      questionType: a.question.questionType,
      value: a.value,
    })),
  });
  return NextResponse.json({ ok: true, status: "GENERATING" });
}
