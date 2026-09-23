/**
 * POST /api/improve/start
 *
 * Start a new drill on one skill. Generates an AI scenario tailored to the
 * user's role (AE → sales drill, Director+ → coaching drill), stores it as
 * an IN_PROGRESS GameAttempt, and returns the scenario for display.
 *
 * Body: { skillCategory: string }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";
import { generateDrillPrompt, getRubricForDrill } from "@/lib/improve";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ skillCategory: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const benchmark = getSkillBenchmark(parsed.data.skillCategory);
  if (!benchmark) {
    return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
  }

  const rubric = await getRubricForDrill(ctx.effectiveOrgId, parsed.data.skillCategory);
  if (!rubric) {
    return NextResponse.json({ error: "No rubric found for this skill" }, { status: 400 });
  }

  // Avoid handing the same scenario back to the same user multiple times in a
  // session. Pull the last 5 prompts they got for this skill.
  const recent = await prisma.gameAttempt.findMany({
    where: { userId: ctx.userId, skillCategory: parsed.data.skillCategory },
    orderBy: { startedAt: "desc" },
    take: 5,
    select: { prompt: true },
  });

  const org = await prisma.org.findUnique({
    where: { id: ctx.effectiveOrgId },
    select: { name: true },
  });

  const shape: "AE" | "LEADER" = ctx.role === "AE" ? "AE" : "LEADER";

  const drill = await generateDrillPrompt({
    shape,
    skillCategory: parsed.data.skillCategory,
    skillLabel: benchmark.label,
    rubric,
    recentScenarios: recent.map((r) => r.prompt),
    orgName: org?.name ?? "your org",
  });

  // Persist the attempt with all the grading context baked into the prompt
  // payload so /submit can grade without regenerating context.
  const promptPayload = JSON.stringify({
    scenario: drill.scenario,
    expectedBehaviors: drill.expectedBehaviors,
    trapBehaviors: drill.trapBehaviors,
    rubric,
  });

  const attempt = await prisma.gameAttempt.create({
    data: {
      userId: ctx.userId,
      orgId: ctx.effectiveOrgId,
      skillCategory: parsed.data.skillCategory,
      shape,
      prompt: promptPayload,
      status: "IN_PROGRESS",
    },
  });

  return NextResponse.json({
    attemptId: attempt.id,
    skill: { category: parsed.data.skillCategory, label: benchmark.label },
    scenario: drill.scenario,
    // The expected/trap arrays power "show me what good looks like" reveal AFTER submit
    // — UI must NOT show them before the user answers.
  });
}
