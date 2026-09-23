import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { computeSaturation } from "@/lib/intakeSaturation";

const Body = z.object({
  answerSetId: z.string(),
  questionId: z.string(),
  value: z.any(),
  resumeIndex: z.number().int().min(0),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { answerSetId, questionId, value, resumeIndex } = parsed.data;

  const aSet = await prisma.answerSet.findUnique({
    where: { id: answerSetId },
    include: { directorProfile: true },
  });
  if (!aSet || aSet.directorProfile?.userId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (aSet.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Wizard already completed" }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.answer.upsert({
      where: { answerSetId_questionId: { answerSetId, questionId } },
      create: { answerSetId, questionId, value },
      update: { value },
    }),
    prisma.answerSet.update({
      where: { id: answerSetId },
      data: { resumeIndex },
    }),
  ]);

  // Saturation refresh — same engine as the AE wizard. Lets the client show
  // an early-finish CTA the moment we have enough signal.
  const order = (aSet.questionOrder as string[]) ?? [];
  const questions = await prisma.question.findMany({
    where: { id: { in: order } },
    select: { id: true, category: true, tagsJson: true },
  });
  const allAnswers = await prisma.answer.findMany({
    where: { answerSetId },
    select: { questionId: true },
  });
  const saturation = computeSaturation(questions, allAnswers);

  return NextResponse.json({ ok: true, saturation });
}
