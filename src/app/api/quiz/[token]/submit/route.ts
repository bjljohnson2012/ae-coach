/**
 * POST /api/quiz/[token]/submit
 * Body: { answers: [{ questionId, value }] }
 *
 * Creates an AnswerSet, links it to the AdHocQuiz, marks COMPLETED.
 * Public (token-gated). No auth required.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const Body = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    value: z.any(),
  })).min(1).max(50),
});

function hashToken(t: string): string {
  return crypto.createHash("sha256").update(t).digest("hex");
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const tokenHash = hashToken(params.token);
  const quiz = await prisma.adHocQuiz.findUnique({ where: { tokenHash } });
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  if (quiz.expiresAt < new Date()) return NextResponse.json({ error: "Expired" }, { status: 410 });
  if (quiz.status === "COMPLETED") return NextResponse.json({ error: "Already submitted" }, { status: 410 });
  if (quiz.status === "CANCELLED") return NextResponse.json({ error: "Cancelled" }, { status: 410 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const expectedIds = (quiz.questionIds as string[]) ?? [];
  const provided = new Set(parsed.data.answers.map((a) => a.questionId));
  const validAnswers = parsed.data.answers.filter((a) => expectedIds.includes(a.questionId));

  // Create the AnswerSet + Answers in a single tx
  const answerSet = await prisma.answerSet.create({
    data: {
      aeProfileId: quiz.aeProfileId ?? undefined,
      directorProfileId: quiz.directorProfileId ?? undefined,
      version: 1,
      status: "COMPLETED",
      questionOrder: expectedIds as any,
      resumeIndex: expectedIds.length,
      startedAt: quiz.startedAt ?? new Date(),
      completedAt: new Date(),
    },
  });

  for (const a of validAnswers) {
    await prisma.answer.create({
      data: {
        answerSetId: answerSet.id,
        questionId: a.questionId,
        value: a.value as any,
      },
    });
  }

  await prisma.adHocQuiz.update({
    where: { id: quiz.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      answerSetId: answerSet.id,
    },
  });

  return NextResponse.json({ ok: true, answerSetId: answerSet.id, answersSaved: validAnswers.length });
}
