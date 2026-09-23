/**
 * Starts (or resumes) a wizard session for the current AE.
 * Returns the intercalated question order and any prior answers.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { intercalate } from "@/lib/intercalate";
import { MAX_INTAKE_QUESTIONS, computeSaturation } from "@/lib/intakeSaturation";

export async function POST() {
  const ctx = await requireRole("AE");

  const ae = await prisma.aeProfile.findUnique({ where: { userId: ctx.userId } });
  if (!ae) return NextResponse.json({ error: "No AE profile" }, { status: 404 });

  // Resume in-progress
  let answerSet = await prisma.answerSet.findFirst({
    where: { aeProfileId: ae.id, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    include: { answers: true },
  });

  if (!answerSet) {
    // Start new
    const lastVersion = await prisma.answerSet.findFirst({
      where: { aeProfileId: ae.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    // Pull active questions for this org
    const questions = await prisma.question.findMany({
      where: {
        active: true,
        category: { not: "DIRECTOR_MONTHLY_REVIEW" }, // those aren't intake questions
        OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      },
    });

    // Intercalate (round-robin across categories) so the first questions
    // span the most personality/skill dimensions. Then cap at the intake max.
    const ordered = intercalate(questions, (q) => `${q.category}:${q.productId ?? ""}`);
    const capped = ordered.slice(0, MAX_INTAKE_QUESTIONS);
    const order = capped.map((q) => q.id);

    answerSet = await prisma.answerSet.create({
      data: {
        aeProfileId: ae.id,
        version: (lastVersion?.version ?? 0) + 1,
        status: "IN_PROGRESS",
        questionOrder: order,
        resumeIndex: 0,
      },
      include: { answers: true },
    });
  }

  // v3.37.4 — defensive cap on resume. Existing AnswerSets created before
  // the cap was introduced can have 240+ ids in questionOrder; without
  // slicing here, resume would surface "Question 130 of 100" past the limit.
  // Saturation still counts every prior answer, so any work done past 100
  // isn't lost — those answers stay attached to the AnswerSet.
  const fullOrder = (answerSet.questionOrder as string[]) ?? [];
  const order = fullOrder.slice(0, MAX_INTAKE_QUESTIONS);
  const questions = await prisma.question.findMany({
    where: { id: { in: order } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const orderedQuestions = order
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((q) => ({
      id: q!.id,
      category: q!.category,
      questionType: q!.questionType,
      text: q!.text,
      optionsJson: q!.optionsJson,
    }));

  const answersByQ = Object.fromEntries(answerSet.answers.map((a) => [a.questionId, a.value]));

  // Compute initial saturation so the wizard can show time estimates and
  // the "you can finish now" signal from the first paint.
  const minimalQs = orderedQuestions.map((q) => ({
    id: q.id,
    category: q.category,
    tagsJson: byId.get(q.id)?.tagsJson,
  }));
  const saturation = computeSaturation(minimalQs, answerSet.answers);

  // Clamp resumeIndex to the (possibly newly-shrunk) order length so a user
  // already past 100 lands on the last visible question instead of OOB.
  const safeResumeIndex = Math.min(
    answerSet.resumeIndex ?? 0,
    Math.max(0, orderedQuestions.length - 1),
  );

  return NextResponse.json({
    answerSetId: answerSet.id,
    resumeIndex: safeResumeIndex,
    questions: orderedQuestions,
    answers: answersByQ,
    saturation,
    maxQuestions: MAX_INTAKE_QUESTIONS,
  });
}
