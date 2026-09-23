/**
 * /director/profile — self-view leader profile.
 *
 * v3.37.7 changes:
 *   - Title is role-aware: "Your Profile" for ORG_ADMIN / COMPANY_ADMIN /
 *     VP_SALES, "Your Director Profile" for actual directors.
 *   - Renders the standard SynthesisStatusBanner — handles GENERATING /
 *     FAILED / orphaned (legacy stuck) / NEW: sparse-but-marked-synthesized
 *     (Grok returned an empty payload but lastSynthesizedAt got set).
 *   - Always shows a "Re-run synthesis" button so the user can refresh their
 *     profile from existing answers anytime — useful after rubric changes,
 *     after the org tweaks "what good looks like", or just because.
 *   - Renders proper brand classes + full personality/leadership/forecasting
 *     summaries with clickable explainers (PersonalityChip).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SynthesisStatusBanner } from "@/components/SynthesisStatusBanner";
import { PersonalityChip } from "@/components/PersonalityChip";
import { ProfileSkillTile } from "@/components/AeSkillTile";
import { discExplainer, enneagramExplainer, mbtiExplainer } from "@/lib/personalityExplainers";
import { getImproveButtonLabel } from "@/lib/improve";
import { ResynthesizeButton } from "./ResynthesizeButton";

export default async function DirectorProfilePage() {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN", "VP_SALES", "COMPANY_ADMIN");

  const profile = await prisma.directorProfile.findUnique({
    where: { userId: ctx.userId },
    include: {
      skillScores: true,
      answerSets: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });

  if (!profile) {
    // Auto-create the profile shell so the user can start intake. Same pattern
    // as the existing /api/director-intake/start does on first run.
    await prisma.directorProfile.create({
      data: { userId: ctx.userId, orgId: ctx.effectiveOrgId },
    });
    redirect("/director/intake");
  }

  const inProgress = profile.answerSets[0]?.status === "IN_PROGRESS";
  // v3.37.9 — title is always "Your Profile". Subtitle distinguishes the role.
  const titleLabel = "Your Profile";
  const isLeader = ctx.role === "DIRECTOR" || ctx.role === "VP_SALES" || ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN";
  const subtitle = isLeader
    ? "Personality + leadership intake. Run anytime to refresh against new org rubrics or after retake."
    : "Personality + skill intake. Run anytime to refresh.";

  const profileAny = profile as any;
  const strengths = (profile.strengthsJson as string[]) ?? [];
  const weaknesses = (profile.weaknessesJson as string[]) ?? [];
  const motivations = (profile.motivations as string[]) ?? [];

  // v3.37.9 — org-branded "Improve" button label for the skill tile CTA.
  const improveLabel = await getImproveButtonLabel(profile.orgId);

  // Sparse detection — Grok occasionally writes lastSynthesizedAt without
  // populating the actual fields (malformed JSON parsed into an empty object).
  // From the user's perspective this is "synthesized but blank" — same UX
  // problem as orphaned, so we route it through the same banner.
  const sparseSynthesis =
    !!profile.lastSynthesizedAt &&
    !profile.personalitySummary &&
    !profile.leadershipSummary &&
    !profile.forecastingSummary &&
    strengths.length === 0 &&
    weaknesses.length === 0 &&
    profile.skillScores.length === 0;

  // Build banner initial state.
  let synthesisInitial: any = null;
  if (profileAny.synthesisStatus) {
    synthesisInitial = {
      status: profileAny.synthesisStatus as "GENERATING" | "FAILED" | "READY" | null,
      error: profileAny.synthesisError ?? null,
      startedAt: profileAny.synthesisStartedAt ? new Date(profileAny.synthesisStartedAt).toISOString() : null,
      ageSeconds: profileAny.synthesisStartedAt
        ? Math.floor((Date.now() - new Date(profileAny.synthesisStartedAt).getTime()) / 1000)
        : 0,
      isOrphaned: false,
    };
  } else if (!profile.lastSynthesizedAt || sparseSynthesis) {
    const completed = await prisma.answerSet.findFirst({
      where: { directorProfileId: profile.id, status: "COMPLETED" },
      select: { id: true },
    });
    if (completed) {
      synthesisInitial = {
        status: null,
        error: sparseSynthesis
          ? "Synthesis finished but came back empty — re-run to populate your profile."
          : "Your intake was submitted but the AI didn't finish building your profile.",
        startedAt: null,
        ageSeconds: 0,
        isOrphaned: true,
      };
    }
  }

  return (
    <div className="page max-w-3xl">
      <Link href="/dashboard" className="link text-sm">← Dashboard</Link>
      <header className="mt-2 mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Profile</div>
          <h1 className="h-page">{titleLabel}</h1>
          <p className="text-sm text-ink-slate mt-1">{subtitle}</p>
        </div>
        {/* Always-visible re-synthesize button. Admins fire directly;
            everyone else creates a request task. */}
        {profile.lastSynthesizedAt && (
          <ResynthesizeButton role={ctx.role} />
        )}
      </header>

      {/* Status banner — renders for GENERATING / FAILED / orphaned / sparse */}
      {synthesisInitial && (
        synthesisInitial.status === "GENERATING" ||
        synthesisInitial.status === "FAILED" ||
        synthesisInitial.isOrphaned
      ) && (
        <SynthesisStatusBanner initial={synthesisInitial} role={ctx.role} />
      )}

      {/* Empty state — never started intake */}
      {!profile.lastSynthesizedAt && !synthesisInitial?.isOrphaned && synthesisInitial?.status !== "GENERATING" && (
        <div className="card p-6 bg-brand-amber/5 border border-brand-amber/30">
          <h2 className="font-display font-semibold">{inProgress ? "Resume your intake" : "Complete your intake"}</h2>
          <p className="text-sm text-ink-slate mt-1">
            {inProgress
              ? "You have an in-progress intake. Pick up where you left off."
              : "Take 5–10 minutes. Your profile feeds the platform's leadership coaching for you and informs how the system synthesizes recommendations."}
          </p>
          <Link href="/director/intake" className="btn-primary inline-flex mt-4">
            {inProgress ? "Resume intake →" : "Start intake →"}
          </Link>
        </div>
      )}

      {/* Synthesized profile — only render if we actually have content */}
      {profile.lastSynthesizedAt && !sparseSynthesis && (
        <>
          {/* Hero card */}
          <section className="card overflow-hidden mb-5">
            <div className="bg-gradient-to-br from-brand-navy via-brand-indigoDeep to-brand-indigo text-white px-6 py-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  {/* ADA: white/85 on the navy gradient hits ~10:1, comfortably above WCAG AA. */}
                  <div className="text-[11px] uppercase tracking-wider text-white/85 font-semibold">Profile card</div>
                  <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">{ctx.name}</h2>
                  <div className="text-xs text-white/90 mt-1">
                    Synthesized {profile.lastSynthesizedAt.toLocaleDateString()}
                  </div>
                </div>
              </div>
              {/* Personality chips — click to learn what each type means */}
              <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                {profile.enneagramType && (
                  <PersonalityChip
                    framework="ENNEAGRAM"
                    rawCode={profile.enneagramType}
                    explanation={enneagramExplainer(profile.enneagramType)}
                    onDarkBg
                  />
                )}
                {profile.discProfile && (
                  <PersonalityChip
                    framework="DISC"
                    rawCode={profile.discProfile}
                    explanation={discExplainer(profile.discProfile)}
                    onDarkBg
                  />
                )}
                {profile.mbtiType && (
                  <PersonalityChip
                    framework="MBTI"
                    rawCode={profile.mbtiType}
                    explanation={mbtiExplainer(profile.mbtiType)}
                    onDarkBg
                  />
                )}
              </div>
            </div>
            {/* Summaries */}
            <div className="p-6 grid sm:grid-cols-3 gap-4 text-sm">
              {profile.personalitySummary && (
                <div>
                  <div className="eyebrow mb-1.5">Personality</div>
                  <p className="text-ink-slate leading-relaxed">{profile.personalitySummary}</p>
                </div>
              )}
              {profile.leadershipSummary && (
                <div>
                  <div className="eyebrow mb-1.5">Leadership</div>
                  <p className="text-ink-slate leading-relaxed">{profile.leadershipSummary}</p>
                </div>
              )}
              {profile.forecastingSummary && (
                <div>
                  <div className="eyebrow mb-1.5">Forecasting</div>
                  <p className="text-ink-slate leading-relaxed">{profile.forecastingSummary}</p>
                </div>
              )}
            </div>
          </section>

          {/* Skill scores — clickable tiles (v3.37.9). Each opens a popover
              with rubric, current level, growth target, how-to-grow steps,
              and the org-branded "Improve" CTA. */}
          {profile.skillScores.length > 0 && (
            <section className="card p-5 mb-5">
              <div className="eyebrow mb-3">Leadership Skill Scores</div>
              <p className="text-xs text-ink-slate mb-3">Click any skill to see what your level means and how to grow.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {profile.skillScores.map((s: { id: string; category: string; score: number; source?: string | null }) => (
                  <ProfileSkillTile
                    key={s.id}
                    category={s.category as any}
                    score={s.score}
                    source={(s.source ?? null) as any}
                    improveLabel={improveLabel}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Strengths / Growth / Motivations */}
          <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="eyebrow mb-2">Strengths</div>
              <ul className="space-y-1.5 text-sm">
                {strengths.length > 0
                  ? strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-emerald font-bold shrink-0">+</span>{s}</li>)
                  : <li className="text-ink-muted">—</li>}
              </ul>
            </div>
            <div className="card p-5">
              <div className="eyebrow mb-2">Growth Areas</div>
              <ul className="space-y-1.5 text-sm">
                {weaknesses.length > 0
                  ? weaknesses.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-amber font-bold shrink-0">↗</span>{s}</li>)
                  : <li className="text-ink-muted">—</li>}
              </ul>
            </div>
            <div className="card p-5">
              <div className="eyebrow mb-2">Motivations</div>
              <ul className="space-y-1.5 text-sm">
                {motivations.length > 0
                  ? motivations.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-indigo font-bold shrink-0">→</span>{s}</li>)
                  : <li className="text-ink-muted">—</li>}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
