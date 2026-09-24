/**
 * Public token-gated routes for quiz takers.
 *
 * GET    /api/quiz/[token]            — get quiz + question list (no login required)
 * POST   /api/quiz/[token]/submit     — finalize: persist all answers + close quiz
 *
 * AE_WRITES_FROZEN=1 leaves this GET up. It only reads. The write is
 * POST /api/quiz/[token]/submit, which returns 503 and does not insert.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function hashToken(t: string): string {
  return crypto.createHash("sha256").update(t).digest("hex");
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const tokenHash = hashToken(params.token);
  const quiz = await prisma.adHocQuiz.findUnique({
    where: { tokenHash },
    include: {
      sentBy: { select: { name: true } },
      aeProfile: { include: { user: { select: { name: true, email: true } }, org: { select: { name: true } } } },
      directorProfile: { include: { user: { select: { name: true, email: true } }, org: { select: { name: true } } } },
    },
  });
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  if (quiz.expiresAt < new Date()) return NextResponse.json({ error: "Quiz has expired" }, { status: 410 });
  if (quiz.status === "COMPLETED") return NextResponse.json({ error: "Already completed" }, { status: 410 });
  if (quiz.status === "CANCELLED") return NextResponse.json({ error: "Cancelled" }, { status: 410 });

  const ids = (quiz.questionIds as string[]) ?? [];
  const questions = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: { id: true, text: true, questionType: true, optionsJson: true, category: true, tagsJson: true },
  });
  // Preserve send-order
  const ordered = ids.map((id) => questions.find((q) => q.id === id)).filter(Boolean);

  const recipient = quiz.aeProfile?.user ?? quiz.directorProfile?.user;
  const orgName = quiz.aeProfile?.org?.name ?? quiz.directorProfile?.org?.name ?? "your organization";

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      kind: quiz.kind,
      status: quiz.status,
      expiresAt: quiz.expiresAt,
      sentBy: quiz.sentBy.name,
      orgName,
      recipientName: recipient?.name ?? null,
      recipientEmail: recipient?.email ?? null,
    },
    questions: ordered,
  });
}
