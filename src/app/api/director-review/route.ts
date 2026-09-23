/**
 * POST /api/director-review/submit
 *   { directorReviewId, answers: [{questionId, value}] }
 *   - Marks review COMPLETED
 *   - Calls Grok to summarize + compute score deltas
 *   - Applies deltas to AE SkillScores
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { summarizeMonthlyReview } from "@/lib/ai";
import { scoreToLevel } from "@/lib/scoring";

const Body = z.object({
  directorReviewId: z.string(),
  answers: z.array(z.object({ questionId: z.string(), value: z.any() })),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const review = await prisma.directorReview.findUnique({
    where: { id: parsed.data.directorReviewId },
    include: {
      aeProfile: { include: { user: true, skillScores: true } },
    },
  });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (review.directorId !== ctx.userId && ctx.role !== "ORG_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Persist answers
  const questions = await prisma.question.findMany({
    where: { id: { in: parsed.data.answers.map((a) => a.questionId) } },
  });
  const qById = new Map(questions.map((q) => [q.id, q]));

  await prisma.$transaction(
    parsed.data.answers.map((a) =>
      prisma.directorReviewAnswer.upsert({
        where: { directorReviewId_questionId: { directorReviewId: review.id, questionId: a.questionId } },
        create: { directorReviewId: review.id, questionId: a.questionId, value: a.value },
        update: { value: a.value },
      })
    )
  );

  const ae = review.aeProfile;
  const summary = await summarizeMonthlyReview({
    aeName: ae.user.name,
    monthOf: review.monthOf.toISOString().slice(0, 10),
    director: { name: ctx.name },
    answers: parsed.data.answers.map((a) => {
      const q = qById.get(a.questionId);
      return {
        questionText: q?.text ?? "",
        questionType: q?.questionType ?? "LONG_FORM",
        value: a.value,
        skillCategory: undefined,
      };
    }),
    priorScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
  });

  // Apply deltas
  for (const d of summary.scoreDeltas ?? []) {
    const existing = ae.skillScores.find((s) => s.category === d.category);
    if (!existing) continue;
    const newScore = Math.max(0, Math.min(100, existing.score + d.delta));
    await prisma.skillScore.update({
      where: { id: existing.id },
      data: {
        score: newScore,
        level: scoreToLevel(newScore),
        source: "MONTHLY_REVIEW",
        lastUpdatedByUserId: ctx.userId,
        lastUpdatedAt: new Date(),
        notes: d.rationale,
      },
    });
    await prisma.skillScoreHistory.create({
      data: { aeProfileId: ae.id, category: existing.category, score: newScore, source: "MONTHLY_REVIEW" },
    });
  }

  // Persist follow-up recommendations
  for (const rec of summary.followUpRecommendations ?? []) {
    const cat = (rec.category as any) ?? "GENERAL";
    const isPersonality = cat === "PERSONALITY" || cat === "LEADERSHIP";
    await prisma.recommendation.create({
      data: {
        aeProfileId: ae.id,
        source: "MONTHLY_REVIEW",
        category: cat,
        routeTo: isPersonality ? "DIRECTOR_ONLY" : (rec.routeTo as any) ?? "AE",
        channel: isPersonality ? "NOTE" : "TASK",
        title: rec.title,
        description: rec.description,
      },
    });
  }

  await prisma.directorReview.update({
    where: { id: review.id },
    data: { status: "COMPLETED", completedAt: new Date(), summary: summary.summary },
  });

  return NextResponse.json({ ok: true, summary });
}
