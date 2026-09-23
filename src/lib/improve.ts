/**
 * Gamified self-coaching engine — v3.37.
 *
 * Single source of truth for:
 *   1. AI-generated drill prompts ("here's a buyer scenario, what do you say next")
 *   2. AI-graded responses with instant feedback
 *   3. Level / streak / point math
 *   4. The "improve button label" lookup (each org can rebrand it)
 *
 * Drill prompts are role-aware — same plumbing as v3.36 task generation. AEs
 * get sales-skill drills (e.g. "discovery question for this scenario"); leaders
 * get coaching drills (e.g. "your AE just said X — what's your coaching move").
 *
 * Each drill is graded against the org's effective rubric for the chosen skill,
 * so points actually mean "you matched what good looks like at this org."
 */
import { prisma } from "@/lib/prisma";
import { grok, MODEL_FAST, MODEL_DEFAULT } from "@/lib/ai";
import { getEffectiveBenchmark } from "@/lib/effectiveBenchmark";

// ============================================================
// LEVEL / STREAK MATH
// ============================================================

/**
 * Levels grow on a sqrt-ish curve so early levels feel fast and later levels
 * feel earned. Threshold table gives a clean mental model — instead of doing
 * arithmetic, you can read "Level 5 needs 1,000 points."
 */
const LEVEL_THRESHOLDS = [
  0,      // Level 1 (anyone with stats)
  100,    // Level 2
  300,    // Level 3
  600,    // Level 4
  1000,   // Level 5
  1500,   // Level 6
  2200,   // Level 7
  3000,   // Level 8
  4000,   // Level 9
  5500,   // Level 10
  7500,   // Level 11
  10000,  // Level 12
];

export function pointsToLevel(totalPoints: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalPoints >= LEVEL_THRESHOLDS[i]) lvl = i + 1;
  }
  return lvl;
}

export function pointsToNextLevel(totalPoints: number): { current: number; needed: number; pct: number } {
  const lvl = pointsToLevel(totalPoints);
  const floor = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const ceiling = LEVEL_THRESHOLDS[lvl] ?? floor + 5000; // open-ended cap above the table
  const within = totalPoints - floor;
  const span = ceiling - floor;
  return {
    current: within,
    needed: span,
    pct: Math.min(100, Math.round((within / Math.max(1, span)) * 100)),
  };
}

/**
 * Score (0-100) from an attempt → points awarded. Linear in the "passing"
 * range, with a floor at 50 (everyone who finishes earns something) and a
 * boost in the 90+ range to celebrate excellent answers.
 */
export function scoreToPoints(aiScore: number): number {
  if (aiScore >= 90) return 50 + Math.round(aiScore * 0.6); // 104 max
  if (aiScore >= 70) return 30 + Math.round(aiScore * 0.4);
  if (aiScore >= 50) return 15 + Math.round(aiScore * 0.2);
  return 5; // small participation award even on weak answers
}

// ============================================================
// IMPROVE BUTTON LABEL (per-org)
// ============================================================

/**
 * Each org can rebrand the action button in its CompanyProfile. Default
 * "Improve" — keeps the verb framing growth-oriented rather than scolding.
 */
export async function getImproveButtonLabel(orgId: string): Promise<string> {
  const cp = await prisma.companyProfile.findUnique({
    where: { orgId },
    select: { improveButtonLabel: true } as any,
  });
  const raw = (cp as any)?.improveButtonLabel;
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 40);
  return "Improve";
}

// ============================================================
// DRILL PROMPT GENERATION
// ============================================================

const DRILL_PROMPT_AE = `You are a sales coach generating ONE realistic practice drill for an AE.

You'll receive: skill name, "what good looks like" rubric for THIS org, AE's role context,
and any prior drills already attempted today (avoid duplicates).

Generate a single specific buyer scenario or moment-in-deal that tests this exact skill.
The scenario should:
- Be 2-4 sentences setting context (who's in the room, what they just said)
- End with a clear ask: "What do you say next?" or "Write your discovery question." or "Respond to this objection."
- Be answerable in 2-5 sentences — not a multi-step roleplay

Output strict JSON:
{
  "scenario": "the 2-4 sentence buyer scenario + clear ask",
  "expectedBehaviors": ["3-5 specific things a strong response would do"],
  "trapBehaviors": ["2-3 specific things a weak response would do"]
}

Tie expectedBehaviors directly to the rubric. trapBehaviors should be common pitfalls for this skill.`;

const DRILL_PROMPT_LEADER = `You are an executive coach generating ONE realistic practice drill for a sales LEADER (Director, VP).

The drill is about how the LEADER coaches their team — NOT about how they sell.
You'll receive: leadership skill name, "what good looks like" rubric for THIS org, leader role context,
and any prior drills already attempted today.

Generate a single specific situation between the leader and one of their AEs.
The situation should:
- Be 2-4 sentences setting context (which AE, what the AE did or said)
- End with a clear ask: "What do you say to your AE?" or "How do you frame the feedback?" or "Walk through your coaching move."
- Be answerable in 2-5 sentences

Output strict JSON:
{
  "scenario": "the 2-4 sentence team scenario + clear ask",
  "expectedBehaviors": ["3-5 specific things a strong leader's response would do"],
  "trapBehaviors": ["2-3 common leadership pitfalls"]
}

Focus on coaching, feedback, accountability, ritual-building — not closing deals.`;

export interface DrillPromptOutput {
  scenario: string;
  expectedBehaviors: string[];
  trapBehaviors: string[];
}

export async function generateDrillPrompt(input: {
  shape: "AE" | "LEADER";
  skillCategory: string;
  skillLabel: string;
  rubric: string;
  recentScenarios: string[]; // last 5 prompts for this user+skill — avoid repeats
  orgName: string;
}): Promise<DrillPromptOutput> {
  const sys = input.shape === "LEADER" ? DRILL_PROMPT_LEADER : DRILL_PROMPT_AE;
  // Drill generation is hot-path UX (user is staring at a spinner). Use the
  // FAST tier (post-May-15: grok-4.20-non-reasoning) — short scenario writing
  // doesn't need reasoning; cuts latency from ~6-9s to ~2-3s.
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8, // higher temp for variety in scenarios
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Drill generation failed");
  const parsed = JSON.parse(raw) as DrillPromptOutput;
  // Defensive defaults so the UI never crashes on a malformed payload.
  return {
    scenario: parsed.scenario ?? "",
    expectedBehaviors: Array.isArray(parsed.expectedBehaviors) ? parsed.expectedBehaviors : [],
    trapBehaviors: Array.isArray(parsed.trapBehaviors) ? parsed.trapBehaviors : [],
  };
}

// ============================================================
// GRADING
// ============================================================

const GRADER_PROMPT = `You are an expert sales coach grading ONE response to ONE drill.

You'll receive: scenario, expected behaviors, trap behaviors, the rubric, and the user's response.

Grade strictly:
- 90-100: hits all expected behaviors, avoids all traps, answer reads like the rubric
- 75-89: hits most expected behaviors, mostly avoids traps
- 60-74: hits some expected behaviors, falls into a minor trap
- 40-59: misses key behaviors or falls into a major trap
- 0-39: misses the point of the drill

Output strict JSON:
{
  "score": 0-100 integer,
  "summary": "1 sentence — what they did well + the one thing to fix",
  "didWell": ["2-4 specific strengths in their response"],
  "toImprove": ["1-3 specific improvements"],
  "improvedExample": "1-2 sentences showing how a 90+ response would phrase it"
}

Be encouraging but honest. The score must reflect the actual quality, not effort.`;

export interface GradeOutput {
  score: number;
  summary: string;
  didWell: string[];
  toImprove: string[];
  improvedExample: string;
}

export async function gradeDrillResponse(input: {
  scenario: string;
  expectedBehaviors: string[];
  trapBehaviors: string[];
  rubric: string;
  userResponse: string;
}): Promise<GradeOutput> {
  const completion = await grok.chat.completions.create({
    model: MODEL_FAST, // grading is cheap and high-volume — use fast tier
    messages: [
      { role: "system", content: GRADER_PROMPT },
      { role: "user", content: JSON.stringify(input, null, 2) },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Grading failed");
  const parsed = JSON.parse(raw) as GradeOutput;
  parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
  parsed.didWell = Array.isArray(parsed.didWell) ? parsed.didWell : [];
  parsed.toImprove = Array.isArray(parsed.toImprove) ? parsed.toImprove : [];
  parsed.summary = parsed.summary ?? "";
  parsed.improvedExample = parsed.improvedExample ?? "";
  return parsed;
}

// ============================================================
// STREAK / STATS UPDATE
// ============================================================

/**
 * Record a completed attempt. Updates UserGameStats transactionally so
 * concurrent submissions can't double-count points.
 */
export async function recordCompletedAttempt(input: {
  userId: string;
  attemptId: string;
  pointsAwarded: number;
}): Promise<{ totalPoints: number; level: number; streak: number }> {
  const now = new Date();
  const today = startOfDayUtc(now);

  return prisma.$transaction(async (tx: any) => {
    const existing = await tx.userGameStats.findUnique({ where: { userId: input.userId } });
    const last = existing?.lastDrillAt ? startOfDayUtc(existing.lastDrillAt) : null;

    let streak = existing?.currentStreak ?? 0;
    if (!last) {
      streak = 1;
    } else if (last.getTime() === today.getTime()) {
      // Same UTC day — keep current streak.
    } else if (today.getTime() - last.getTime() === 86_400_000) {
      streak += 1;
    } else {
      streak = 1; // gap > 1 day — reset
    }

    const newTotal = (existing?.totalPoints ?? 0) + input.pointsAwarded;
    const newLevel = pointsToLevel(newTotal);
    const newLongest = Math.max(existing?.longestStreak ?? 0, streak);

    const stats = await tx.userGameStats.upsert({
      where: { userId: input.userId },
      update: {
        totalPoints: newTotal,
        currentStreak: streak,
        longestStreak: newLongest,
        lastDrillAt: now,
        level: newLevel,
      },
      create: {
        userId: input.userId,
        totalPoints: newTotal,
        currentStreak: streak,
        longestStreak: newLongest,
        lastDrillAt: now,
        level: newLevel,
      },
    });

    return { totalPoints: stats.totalPoints, level: stats.level, streak: stats.currentStreak };
  });
}

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Resolve the rubric the drill should test against. Goes through the same
 * cascade the scorer uses, so points always reflect the org's actual bar.
 */
export async function getRubricForDrill(orgId: string, category: string): Promise<string | null> {
  const eff = await getEffectiveBenchmark(orgId, category);
  return eff?.whatGoodLooksLike ?? null;
}
