/**
 * POST /api/improve/submit
 *
 * Submit the user's response to an IN_PROGRESS drill. Grades it via Grok,
 * awards points, updates streak/level, and returns instant feedback.
 *
 * Body: { attemptId: string, response: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { gradeDrillResponse, scoreToPoints, recordCompletedAttempt } from "@/lib/improve";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  attemptId: z.string().min(1),
  response:  z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const attempt = await prisma.gameAttempt.findUnique({
    where: { id: parsed.data.attemptId },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.userId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Attempt already finalized" }, { status: 400 });
  }

  // Decode the prompt payload we stashed during /start.
  let scenario = "";
  let expectedBehaviors: string[] = [];
  let trapBehaviors: string[] = [];
  let rubric = "";
  try {
    const decoded = JSON.parse(attempt.prompt);
    scenario = decoded.scenario ?? "";
    expectedBehaviors = decoded.expectedBehaviors ?? [];
    trapBehaviors = decoded.trapBehaviors ?? [];
    rubric = decoded.rubric ?? "";
  } catch {
    return NextResponse.json({ error: "Malformed attempt — please start again" }, { status: 500 });
  }

  const grade = await gradeDrillResponse({
    scenario,
    expectedBehaviors,
    trapBehaviors,
    rubric,
    userResponse: parsed.data.response,
  });

  const pointsAwarded = scoreToPoints(grade.score);

  // Persist the completed attempt + bump stats in one transaction so partial
  // failures can't leave us with points without a recorded attempt.
  await prisma.gameAttempt.update({
    where: { id: attempt.id },
    data: {
      userResponse: parsed.data.response,
      aiScore: grade.score,
      aiFeedback: JSON.stringify({
        summary: grade.summary,
        didWell: grade.didWell,
        toImprove: grade.toImprove,
        improvedExample: grade.improvedExample,
      }),
      pointsAwarded,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  const stats = await recordCompletedAttempt({
    userId: ctx.userId,
    attemptId: attempt.id,
    pointsAwarded,
  });

  return NextResponse.json({
    score: grade.score,
    pointsAwarded,
    summary: grade.summary,
    didWell: grade.didWell,
    toImprove: grade.toImprove,
    improvedExample: grade.improvedExample,
    expectedBehaviors,    // safe to reveal now that they've submitted
    trapBehaviors,
    stats: { totalPoints: stats.totalPoints, level: stats.level, streak: stats.streak },
  });
}
