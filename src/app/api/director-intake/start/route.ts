import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { intercalate } from "@/lib/intercalate";
import { MAX_INTAKE_QUESTIONS, computeSaturation } from "@/lib/intakeSaturation";

const DIRECTOR_INTAKE_CATEGORIES = [
  "PERSONALITY",
  "ENNEAGRAM",
  "DISC",
  "MBTI",
  "COMMUNICATION",
  "RESILIENCE",
  "MOTIVATION",
  "LEADERSHIP",
] as const;

// Director intake is open to anyone in a leadership role — Director, VP,
// Company Admin, Super Admin. Same questions; same profile shape.
export async function POST() {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  // Idempotent DirectorProfile
  let dp = await prisma.directorProfile.findUnique({ where: { userId: ctx.userId } });
  if (!dp) {
    dp = await prisma.directorProfile.create({
      data: { userId: ctx.userId, orgId: ctx.effectiveOrgId },
    });
  }

  // Resume in-progress
  let answerSet = await prisma.answerSet.findFirst({
    where: { directorProfileId: dp.id, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    include: { answers: true },
  });

  if (!answerSet) {
    const lastVersion = await prisma.answerSet.findFirst({
      where: { directorProfileId: dp.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const questions = await prisma.question.findMany({
      where: {
        active: true,
        category: { in: DIRECTOR_INTAKE_CATEGORIES as any },
        OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      },
    });

    // Cap leadership intake at MAX_INTAKE_QUESTIONS (100) just like the AE flow.
    // Intercalation guarantees the first 100 span the most dimensions.
    const ordered = intercalate(questions, (q) => q.category);
    const capped = ordered.slice(0, MAX_INTAKE_QUESTIONS);
    const order = capped.map((q) => q.id);

    answerSet = await prisma.answerSet.create({
      data: {
        directorProfileId: dp.id,
        version: (lastVersion?.version ?? 0) + 1,
        status: "IN_PROGRESS",
        questionOrder: order,
        resumeIndex: 0,
      },
      include: { answers: true },
    });
  }

  // v3.37.4 — defensive cap. Existing AnswerSets created before the cap
  // can have 240+ ids in questionOrder; without slicing here, resume would
  // surface "Question 130 of 100" past the limit. Saturation still counts
  // every prior answer, so any work done past 100 isn't lost.
  const fullOrder = (answerSet.questionOrder as string[]) ?? [];
  const order = fullOrder.slice(0, MAX_INTAKE_QUESTIONS);
  const questions = await prisma.question.findMany({ where: { id: { in: order } } });
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

  const minimalQs = orderedQuestions.map((q) => ({
    id: q.id,
    category: q.category,
    tagsJson: byId.get(q.id)?.tagsJson,
  }));
  const saturation = computeSaturation(minimalQs, answerSet.answers);

  // Clamp resumeIndex to the new order length so a user who got past 100
  // before this fix shipped lands on the last visible question, not OOB.
  const safeResumeIndex = Math.min(
    answerSet.resumeIndex ?? 0,
    Math.max(0, orderedQuestions.length - 1),
  );

  return NextResponse.json({
    answerSetId: answerSet.id,
    resumeIndex: safeResumeIndex,
    questions: orderedQuestions,
    answers: Object.fromEntries(answerSet.answers.map((a) => [a.questionId, a.value])),
    saturation,
    maxQuestions: MAX_INTAKE_QUESTIONS,
  });
}
