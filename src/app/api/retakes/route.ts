/**
 * GET  /api/retakes        — list retake requests
 *   - For AE: their own (as requester)
 *   - For leader: pending requests from anyone in their accessible scope
 * POST /api/retakes        — create a retake request
 *   Body: { adHocQuizId?, answerSetId?, reason? } (exactly one of the IDs)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, getManageableUsers } from "@/lib/tenancy";

const Body = z.object({
  adHocQuizId: z.string().optional(),
  answerSetId: z.string().optional(),
  reason: z.string().max(2000).optional(),
}).refine((b) => !!b.adHocQuizId !== !!b.answerSetId, "Provide exactly one of adHocQuizId or answerSetId");

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  // Verify the requester actually owns the target (the quiz / answer set is for them)
  if (parsed.data.adHocQuizId) {
    const quiz = await prisma.adHocQuiz.findUnique({
      where: { id: parsed.data.adHocQuizId },
      include: {
        aeProfile: { select: { userId: true } },
        directorProfile: { select: { userId: true } },
      },
    });
    if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    const ownerUserId = quiz.aeProfile?.userId ?? quiz.directorProfile?.userId;
    if (ownerUserId !== ctx.userId) {
      return NextResponse.json({ error: "Can only request a retake of your own quiz" }, { status: 403 });
    }
  }
  if (parsed.data.answerSetId) {
    const set = await prisma.answerSet.findUnique({
      where: { id: parsed.data.answerSetId },
      include: {
        aeProfile: { select: { userId: true } },
        directorProfile: { select: { userId: true } },
      },
    });
    if (!set) return NextResponse.json({ error: "Answer set not found" }, { status: 404 });
    const ownerUserId = set.aeProfile?.userId ?? set.directorProfile?.userId;
    if (ownerUserId !== ctx.userId) {
      return NextResponse.json({ error: "Can only request a retake of your own answers" }, { status: 403 });
    }
  }

  // Block duplicate pending requests for the same target
  const existing = await prisma.quizRetakeRequest.findFirst({
    where: {
      requesterUserId: ctx.userId,
      status: "PENDING",
      adHocQuizId: parsed.data.adHocQuizId ?? null,
      answerSetId: parsed.data.answerSetId ?? null,
    },
  });
  if (existing) {
    return NextResponse.json({ error: "You already have a pending retake request for this." }, { status: 409 });
  }

  const request = await prisma.quizRetakeRequest.create({
    data: {
      requesterUserId: ctx.userId,
      adHocQuizId: parsed.data.adHocQuizId ?? null,
      answerSetId: parsed.data.answerSetId ?? null,
      reason: parsed.data.reason ?? null,
    },
  });

  return NextResponse.json({ request });
}

export async function GET() {
  const ctx = await requireSession();

  // AE: see their own requests
  if (ctx.role === "AE") {
    const requests = await prisma.quizRetakeRequest.findMany({
      where: { requesterUserId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: {
        adHocQuiz: { select: { title: true } },
        answerSet: { select: { version: true, completedAt: true } },
        decidedBy: { select: { name: true } },
      },
    });
    return NextResponse.json({ requests });
  }

  // Leader: pending requests from manageable users
  const manageable = await getManageableUsers(ctx);
  const requesterIds = manageable.map((u) => u.id).filter((id) => id !== ctx.userId);
  if (requesterIds.length === 0) return NextResponse.json({ requests: [] });

  const requests = await prisma.quizRetakeRequest.findMany({
    where: {
      requesterUserId: { in: requesterIds },
      status: { in: ["PENDING", "APPROVED", "DENIED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      requester: { select: { id: true, name: true, email: true, role: true } },
      adHocQuiz: { select: { id: true, title: true, questionIds: true, sentAt: true } },
      answerSet: { select: { id: true, version: true, completedAt: true } },
      decidedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ requests });
}
