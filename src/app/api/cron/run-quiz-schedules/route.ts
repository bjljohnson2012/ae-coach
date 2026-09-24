/**
 * GET /api/cron/run-quiz-schedules
 *
 * Auth: bearer token matching CRON_SECRET env var. Designed to be called hourly
 * by the docker-compose cron sidecar (or manually by an admin).
 *
 * For each active RecurringQuizSchedule whose nextRunAt is in the past:
 *   1. Resolve the recipient profile (AE or director) and current weakest skills
 *   2. Pull candidate questions; AI selects the right ones based on weaknesses
 *      + pinned focusAreas
 *   3. Create AdHocQuiz with kind=RECURRING + email link
 *   4. Send email
 *   5. Advance nextRunAt by cadence; record lastRunAt + lastAdHocQuizId
 *
 * Errors on a single schedule don't fail the whole batch — they're collected.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { selectQuizQuestions } from "@/lib/ai";
import { sendEmail } from "@/lib/email";
import { nextRunAfter, type Cadence } from "@/lib/quizSchedule";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min for a batch

function frozenWritesResponse() {
  return NextResponse.json(
    { error: "AE writes are frozen" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(req: Request) {
  // This GET inserts AdHocQuiz rows. Refuse before any read or insert.
  // Bracket access so the runtime flag is not inlined at image build.
  if (process.env["AE_WRITES_FROZEN"] === "1") return frozenWritesResponse();

  // Auth: shared secret. Cron sidecar passes it as Authorization: Bearer ...
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (provided !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const due = await prisma.recurringQuizSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    take: 50,
  });

  const results: Array<{ scheduleId: string; status: "ok" | "skipped" | "failed"; reason?: string; quizId?: string; recipient?: string }> = [];

  for (const schedule of due) {
    try {
      const result = await runOne(schedule);
      results.push(result);
    } catch (e: any) {
      console.error(`[cron] schedule ${schedule.id} crashed:`, e);
      results.push({ scheduleId: schedule.id, status: "failed", reason: e?.message ?? String(e) });
    }
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    schedulesChecked: due.length,
    results,
  });
}

// Allow POST too for flexibility (some cron tools prefer POST)
export const POST = GET;

async function runOne(schedule: {
  id: string;
  aeProfileId: string | null;
  directorProfileId: string | null;
  createdByUserId: string;
  cadence: any;
  questionsPerQuiz: number;
  focusAreas: any;
  expiresAfterDays: number;
  titleTemplate: string | null;
  notesToRecipient: string | null;
}): Promise<{ scheduleId: string; status: "ok" | "skipped" | "failed"; reason?: string; quizId?: string; recipient?: string }> {

  // Resolve target: AE or director profile
  const isAe = !!schedule.aeProfileId;
  const profile = isAe
    ? await prisma.aeProfile.findUnique({
        where: { id: schedule.aeProfileId! },
        include: {
          user: { select: { name: true, email: true } },
          skillScores: true,
          org: { select: { aiModel: true, name: true, id: true } },
        },
      })
    : await prisma.directorProfile.findUnique({
        where: { id: schedule.directorProfileId! },
        include: {
          user: { select: { name: true, email: true } },
          skillScores: true,
          org: { select: { aiModel: true, name: true, id: true } },
        },
      });

  if (!profile) {
    return { scheduleId: schedule.id, status: "skipped", reason: "Profile no longer exists" };
  }

  // Pinned focus or auto-pick weakest
  const pinned = (schedule.focusAreas as string[]) ?? [];
  let focusAreas = pinned;
  if (focusAreas.length === 0) {
    // Pick the 2 weakest skills
    const sorted = [...profile.skillScores].sort((a, b) => a.score - b.score);
    focusAreas = sorted.slice(0, 2).map((s) => s.category);
  }

  // Pull candidates
  const candidates = await prisma.question.findMany({
    where: {
      OR: [{ orgId: profile.orgId }, { orgId: null }],
      active: true,
      ...(isAe ? {} : { category: { in: ["LEADERSHIP", "DIRECTOR_MONTHLY_REVIEW", "PERSONALITY", "ENNEAGRAM", "DISC", "MBTI", "COMMUNICATION", "RESILIENCE", "MOTIVATION"] as any } }),
    },
    select: { id: true, text: true, tagsJson: true, questionType: true, category: true, optionsJson: true },
    take: 200,
  });

  const candidateForAi = candidates.map((c: any) => {
    const optionTags: string[] = [];
    if (Array.isArray(c.optionsJson)) {
      for (const o of c.optionsJson as any[]) {
        if (Array.isArray(o?.tags)) optionTags.push(...o.tags);
      }
    }
    return {
      id: c.id,
      text: c.text.slice(0, 200),
      tags: [...((c.tagsJson as string[]) ?? []), ...optionTags].slice(0, 10),
      questionType: c.questionType,
      category: c.category,
    };
  });

  const filtered = focusAreas.length > 0
    ? candidateForAi.filter((q) =>
        q.tags.some((t) => focusAreas.some((f) => t.toUpperCase().startsWith(f.toUpperCase())))
      )
    : candidateForAi;
  const pool = filtered.length > 5 ? filtered : candidateForAi;

  let questionIds: string[] = [];
  let rationale = "Auto-selected based on weakest skills.";
  try {
    const result = await selectQuizQuestions({
      aeName: profile.user.name,
      weaknesses: (profile as any).weaknessesJson as string[] ?? [],
      skillScores: profile.skillScores.map((s) => ({ category: s.category, score: s.score })),
      focusAreas,
      candidateQuestions: pool.slice(0, 80),
      count: schedule.questionsPerQuiz,
    }, profile.org?.aiModel);
    questionIds = result.questionIds.filter((id) => candidates.some((c) => c.id === id));
    rationale = result.rationale;
  } catch (e: any) {
    // Fallback: pick the first N candidates from the filtered pool
    questionIds = pool.slice(0, schedule.questionsPerQuiz).map((q) => q.id);
    console.warn(`[cron] AI question pick failed, using fallback for ${schedule.id}:`, e?.message);
  }

  if (questionIds.length === 0) {
    // Re-advance nextRunAt so we don't churn on every run
    await prisma.recurringQuizSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: nextRunAfter(new Date(), schedule.cadence as Cadence),
      },
    });
    return { scheduleId: schedule.id, status: "skipped", reason: "No matching questions in bank" };
  }

  // Build title from template (if present)
  const now = new Date();
  const monthLabel = now.toLocaleDateString(undefined, { month: "long" });
  const dateLabel = now.toLocaleDateString();
  const title = (schedule.titleTemplate || "{cadence} check-in for {firstName}")
    .replace("{cadence}", String(schedule.cadence).toLowerCase())
    .replace("{firstName}", profile.user.name.split(" ")[0])
    .replace("{month}", monthLabel)
    .replace("{date}", dateLabel);

  // Create token + AdHocQuiz
  const tokenRaw = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
  const expiresAt = new Date(Date.now() + schedule.expiresAfterDays * 24 * 3600 * 1000);

  const quiz = await prisma.adHocQuiz.create({
    data: {
      aeProfileId: schedule.aeProfileId,
      directorProfileId: schedule.directorProfileId,
      sentByUserId: schedule.createdByUserId,
      title,
      description: schedule.notesToRecipient ?? `Auto-generated by ${String(schedule.cadence).toLowerCase()} schedule. ${rationale}`,
      kind: "RECURRING",
      questionIds: questionIds as any,
      focusAreas: focusAreas as any,
      tokenHash,
      expiresAt,
    },
  });

  // Email
  const appUrl = process.env.APP_URL ?? "https://portal.benjohnson.ai";
  const link = `${appUrl}/quiz/${tokenRaw}`;
  const subject = `${profile.org?.name ?? "Sales Coach"}: ${title}`;
  const html = `
    <p>Hi ${profile.user.name.split(" ")[0]},</p>
    <p>It's time for your ${String(schedule.cadence).toLowerCase()} check-in.</p>
    ${schedule.notesToRecipient ? `<p><em>${schedule.notesToRecipient}</em></p>` : ""}
    <p><strong>${questionIds.length} questions · about ${Math.max(2, Math.round(questionIds.length * 0.3))} minutes</strong></p>
    <p><a href="${link}" style="display:inline-block;background:#FF6A1A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Take the quiz →</a></p>
    <p>Or paste this link into your browser:<br /><code>${link}</code></p>
    <p>This link expires on ${expiresAt.toLocaleDateString()}.</p>
  `.trim();
  const text = `Hi ${profile.user.name.split(" ")[0]},\n\nIt's time for your ${String(schedule.cadence).toLowerCase()} check-in.\n${schedule.notesToRecipient ?? ""}\n\nTake the quiz: ${link}\n\nThis link expires on ${expiresAt.toLocaleDateString()}.`;

  await sendEmail({ to: profile.user.email, subject, html, text }, { orgId: profile.orgId });

  // Advance schedule
  await prisma.recurringQuizSchedule.update({
    where: { id: schedule.id },
    data: {
      lastRunAt: new Date(),
      nextRunAt: nextRunAfter(new Date(), schedule.cadence as Cadence),
      lastAdHocQuizId: quiz.id,
    },
  });

  return { scheduleId: schedule.id, status: "ok", quizId: quiz.id, recipient: profile.user.name };
}
