/**
 * /improve — gamified self-coaching landing page (v3.37).
 *
 * Lists every skill the user has a score for, with their current score,
 * level/streak banner up top, and a "Run a drill" button per skill.
 *
 * Click → modal with the AI-generated scenario → user types response →
 * instant feedback + points. All in one client component (DrillRunner).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SKILL_CATEGORY_LABELS, ALL_SKILL_CATEGORIES, DIRECTOR_SKILL_CATEGORIES } from "@/lib/scoring";
import { pointsToLevel, pointsToNextLevel, getImproveButtonLabel } from "@/lib/improve";
import { ImproveDrillRunner } from "./ImproveDrillRunner";

export default async function ImprovePage() {
  const ctx = await requireSession();

  // Resolve label early so the page header reflects the org's branding.
  const buttonLabel = await getImproveButtonLabel(ctx.effectiveOrgId);

  // Pull existing scores so the user sees their starting point per skill.
  let scores: Array<{ category: string; score: number }> = [];
  if (ctx.role === "AE") {
    const ae = await prisma.aeProfile.findUnique({
      where: { userId: ctx.userId },
      include: { skillScores: { select: { category: true, score: true } } },
    });
    if (!ae) {
      // No AE profile means intake hasn't run — push them there first.
      redirect("/ae/intake");
    }
    scores = ae.skillScores.map((s) => ({ category: s.category as string, score: s.score }));
  } else {
    const dp = await prisma.directorProfile.findUnique({
      where: { userId: ctx.userId },
      include: { skillScores: { select: { category: true, score: true } } },
    });
    scores = (dp?.skillScores ?? []).map((s) => ({ category: s.category as string, score: s.score }));
  }

  // Stats — create-on-read so the dashboard pill always has something.
  let stats = await prisma.userGameStats.findUnique({ where: { userId: ctx.userId } });
  if (!stats) {
    stats = await prisma.userGameStats.create({ data: { userId: ctx.userId } });
  }
  const progress = pointsToNextLevel(stats.totalPoints);
  const level = pointsToLevel(stats.totalPoints);

  // Decide which skills to show. AE = AE skills; leaders = director skills.
  const skillCategoryPool = ctx.role === "AE" ? ALL_SKILL_CATEGORIES : DIRECTOR_SKILL_CATEGORIES;
  const scoreByCategory = new Map(scores.map((s) => [s.category, s.score]));

  const skillRows = skillCategoryPool.map((cat) => ({
    category: cat as string,
    label: SKILL_CATEGORY_LABELS[cat]?.label ?? cat,
    emoji: SKILL_CATEGORY_LABELS[cat]?.emoji ?? "✦",
    score: scoreByCategory.get(cat as string) ?? null,
  }));
  // Sort: skills with the lowest score first (where you grow most).
  skillRows.sort((a, b) => (a.score ?? 100) - (b.score ?? 100));

  return (
    <div className="page max-w-3xl">
      <Link href={ctx.role === "AE" ? "/ae/card" : "/dashboard"} className="link text-sm">
        ← Back
      </Link>
      <header className="mt-2 mb-6">
        <div className="eyebrow mb-2">{buttonLabel}</div>
        <h1 className="h-page">Sharpen one skill at a time</h1>
        <p className="text-sm text-ink-muted mt-1">
          Pick a skill. Get a real scenario. Type your response. Get instant feedback.
          Earn points and build a streak.
        </p>
      </header>

      {/* Stats banner */}
      <section className="card p-5 mb-6 bg-gradient-to-br from-brand-indigo/10 to-brand-orange/10 border-l-4 border-brand-orange">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-4 flex-wrap">
            <div>
              <div className="eyebrow">Level</div>
              <div className="font-display text-3xl font-bold text-brand-indigo">{level}</div>
            </div>
            <div>
              <div className="eyebrow">Total points</div>
              <div className="font-display text-3xl font-bold text-brand-indigo">{stats.totalPoints.toLocaleString()}</div>
            </div>
            <div>
              <div className="eyebrow">Streak</div>
              <div className="font-display text-3xl font-bold text-brand-orange">
                {stats.currentStreak}
                <span className="text-sm text-ink-muted font-normal ml-1">day{stats.currentStreak === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
          <div className="min-w-[200px] flex-1 max-w-sm">
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-ink-muted">Level {level} progress</span>
              <span className="font-mono text-ink-slate">{progress.current} / {progress.needed}</span>
            </div>
            <div className="h-2 bg-ink-softLine rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-indigo to-brand-orange transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Skill list — picker for the drill runner */}
      <ImproveDrillRunner
        role={ctx.role}
        skills={skillRows}
        startingTotal={stats.totalPoints}
        startingLevel={level}
        startingStreak={stats.currentStreak}
      />
    </div>
  );
}
