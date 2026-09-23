/**
 * Score recalibration — v3.37.
 *
 * When an org admin changes "what good looks like" for a skill, every existing
 * AE / director score for that skill in that org needs to be re-judged against
 * the new bar. This module does that as a fire-and-forget background pass.
 *
 * Design notes:
 *   - We do NOT re-run the full intake synthesis. That would re-write summaries
 *     and personality types, which the admin didn't ask for.
 *   - Instead, we feed the AI just the existing score + notes + the new rubric
 *     and ask "given this rubric, what's the score now?". Cheap (one call per
 *     person), focused, and reversible.
 *   - Idempotent: a per-(orgId, category) in-memory lock keeps overlapping runs
 *     from doubling up if an admin mashes Save twice.
 *   - Records each adjustment in SkillScoreHistory so the change is visible.
 */
import { prisma } from "@/lib/prisma";
import { grok, MODEL_FAST } from "@/lib/ai";
import { getEffectiveBenchmark } from "@/lib/effectiveBenchmark";
import { scoreToLevel } from "@/lib/scoring";

// In-process locks. Multi-replica deployments would need redis here, but for
// a single-VPS Hostinger setup this is enough to prevent self-overlap.
const inflight = new Map<string, Promise<void>>();

interface RescoreOutput {
  score: number;
  notes: string;
  rationale: string;
}

const RECALIBRATE_PROMPT = `You are re-scoring one sales skill for one person against a NEW rubric.

You'll receive:
- the skill name + the new "what good looks like" definition (rubric)
- the person's prior score (0-100), prior notes, and any context the org has
- the person's strengths and weaknesses from synthesis

Re-judge the person ONLY for this skill, against the new rubric. Output strict JSON:
{
  "score": 0-100 integer,
  "notes": "1 short sentence describing where they are now relative to the new bar",
  "rationale": "1 short sentence on what changed vs the prior score, if anything"
}

Rules:
- Most adjustments are small (±5 to ±15). Only make large swings if the new rubric is dramatically different from a generic default.
- If the prior notes already match the new rubric well, score may not move.
- Be conservative; don't introduce bias from the person's strengths/weaknesses beyond the rubric.`;

async function rescoreOne(input: {
  category: string;
  rubric: string;
  priorScore: number;
  priorNotes: string | null;
  strengths: string[];
  weaknesses: string[];
  personName: string;
}): Promise<RescoreOutput | null> {
  try {
    const completion = await grok.chat.completions.create({
      model: MODEL_FAST,
      messages: [
        { role: "system", content: RECALIBRATE_PROMPT },
        { role: "user", content: JSON.stringify(input, null, 2) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RescoreOutput;
    if (typeof parsed.score !== "number") return null;
    parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    return parsed;
  } catch (err: any) {
    console.error("[recalibrate] grok call failed", err?.message);
    return null;
  }
}

/**
 * Recalibrate every score for one (orgId, category). Hits both AE + director
 * tables since the AE table holds skills like DISCOVERY and the director
 * table holds LEADERSHIP / FORECASTING — only one will have rows for any
 * given category, but checking both keeps the caller simple.
 */
export async function recalibrateOrgSkillScores(
  orgId: string,
  category: string,
  triggeredByUserId: string,
): Promise<void> {
  const lockKey = `${orgId}::${category}`;
  if (inflight.has(lockKey)) return inflight.get(lockKey)!;

  const job = (async () => {
    try {
      const effective = await getEffectiveBenchmark(orgId, category);
      if (!effective) return;
      const rubric = effective.whatGoodLooksLike;

      // AE-side scores
      const aeScores = await prisma.skillScore.findMany({
        where: { aeProfile: { orgId }, category: category as any },
        include: {
          aeProfile: {
            select: {
              id: true,
              strengthsJson: true,
              weaknessesJson: true,
              user: { select: { name: true } },
            },
          },
        },
      });

      for (const s of aeScores) {
        const ae = s.aeProfile;
        const out = await rescoreOne({
          category,
          rubric,
          priorScore: s.score,
          priorNotes: s.notes,
          strengths: (ae.strengthsJson as string[]) ?? [],
          weaknesses: (ae.weaknessesJson as string[]) ?? [],
          personName: ae.user.name,
        });
        if (!out) continue;
        if (out.score === s.score) continue; // skip no-op writes
        await prisma.$transaction([
          prisma.skillScore.update({
            where: { id: s.id },
            data: {
              score: out.score,
              level: scoreToLevel(out.score),
              notes: out.notes,
              source: "AI",
              lastUpdatedAt: new Date(),
            },
          }),
          prisma.skillScoreHistory.create({
            data: {
              aeProfileId: ae.id,
              category: category as any,
              score: out.score,
              source: "AI",
            },
          }),
        ]);
      }

      // Director-side scores
      const dirScores = await prisma.directorSkillScore.findMany({
        where: { directorProfile: { orgId }, category: category as any },
        include: {
          directorProfile: {
            select: {
              id: true,
              strengthsJson: true,
              weaknessesJson: true,
              user: { select: { name: true } },
            },
          },
        },
      });

      for (const s of dirScores) {
        const dp = s.directorProfile;
        const out = await rescoreOne({
          category,
          rubric,
          priorScore: s.score,
          priorNotes: s.notes,
          strengths: (dp.strengthsJson as string[]) ?? [],
          weaknesses: (dp.weaknessesJson as string[]) ?? [],
          personName: dp.user.name,
        });
        if (!out) continue;
        if (out.score === s.score) continue;
        await prisma.directorSkillScore.update({
          where: { id: s.id },
          data: {
            score: out.score,
            level: scoreToLevel(out.score),
            notes: out.notes,
            source: "AI",
            lastUpdatedAt: new Date(),
          },
        });
      }

      // Audit trail so admins know the recalibration ran.
      await prisma.auditLog.create({
        data: {
          orgId,
          actorUserId: triggeredByUserId,
          action: "PROFILE_SYNTHESIZED",
          targetType: "OrgSkillBenchmark",
          targetId: `${orgId}::${category}`,
          metadata: {
            kind: "RECALIBRATE",
            category,
            aeCount: aeScores.length,
            dirCount: dirScores.length,
          },
        },
      });
    } finally {
      inflight.delete(lockKey);
    }
  })();

  inflight.set(lockKey, job);
  return job;
}
