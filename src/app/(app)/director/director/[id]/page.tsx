import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, assertCanAccessDirector } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { DirectorTabs } from "./DirectorTabs";
import { DirectorPrepTab } from "./DirectorPrepTab";
import { DirectorChatTab } from "./DirectorChatTab";
import { DirectorReasoningTab } from "./DirectorReasoningTab";
import { QuizScheduleCard } from "../../ae/[id]/QuizScheduleCard";
import { SendQuizButton } from "../../ae/[id]/SendQuizButton";
import { CoachingHintsTab } from "../../ae/[id]/CoachingHintsTab";
import { ProfileCardTrigger } from "@/components/ProfileCardDrawer";
import { GenerateTasksForUserButton } from "@/components/GenerateTasksForUserButton";
import { PersonalityChip } from "@/components/PersonalityChip";
import { discExplainer, enneagramExplainer, mbtiExplainer } from "@/lib/personalityExplainers";
import { CoachingPlansTab } from "@/components/CoachingPlansTab";
import { SkillScoreChip } from "@/components/SkillScoreChip";

function dollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function DirectorProfilePage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const access = await assertCanAccessDirector(ctx, params.id);
  if (!access) notFound();

  const dp = await prisma.directorProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true, status: true, vp: { select: { name: true } } } },
      skillScores: true,
      org: { select: { id: true, name: true } },
    },
  });
  if (!dp) notFound();

  // Pull this org's "what good looks like" overrides so the score popovers
  // show the company-specific bar above the platform default.
  const orgOverrides = await prisma.orgSkillBenchmark.findMany({
    where: { orgId: dp.orgId },
    select: { category: true, whatGoodLooksLike: true },
  });
  const overrideMap = new Map<string, string>(
    orgOverrides
      .filter((o: any) => o.whatGoodLooksLike)
      .map((o: any) => [o.category as string, o.whatGoodLooksLike as string]),
  );

  const strengths = (dp.strengthsJson as string[]) ?? [];
  const weaknesses = (dp.weaknessesJson as string[]) ?? [];
  const motivations = (dp.motivations as string[]) ?? [];

  // Coaching plan unread count — drives the lit-up Coaching Plans tab badge.
  // "Unread" = the subject (this profile's user) hasn't opened it yet.
  const allPlans = await prisma.coachingPlan.findMany({
    where: { directorProfileId: dp.id, status: "READY" as any },
    select: { id: true, readByJson: true },
  });
  const unreadPlanCount = allPlans.filter((p: any) => {
    const arr = Array.isArray(p.readByJson) ? (p.readByJson as string[]) : [];
    return !arr.includes(dp.userId);
  }).length;

  // Pull team for the Team Performance tab
  const teamAes = await prisma.aeProfile.findMany({
    where: { directorId: dp.userId },
    include: {
      user: { select: { name: true, email: true, imageUrl: true } },
      skillScores: { select: { category: true, score: true } },
      quarterlyPerformance: {
        orderBy: [{ year: "desc" }, { quarter: "desc" }],
        take: 4,
        select: { year: true, quarter: true, quotaCents: true, attainedCents: true },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  // Aggregate team-level stats
  const allQuarters = teamAes.flatMap((ae) => ae.quarterlyPerformance);
  const teamLifetime = allQuarters.reduce(
    (acc, r) => ({ quota: acc.quota + (r.quotaCents ?? 0), attained: acc.attained + (r.attainedCents ?? 0) }),
    { quota: 0, attained: 0 },
  );

  const overview = (
    <div className="space-y-5">
      {!dp.lastSynthesizedAt ? (
        <div className="card p-5 bg-brand-amber/5 border-brand-amber/30">
          <p className="text-sm">
            This director hasn't completed their leadership intake yet. They should go to <code>/director/intake</code> after logging in.
          </p>
        </div>
      ) : (
        <>
          {/* Personality types — clickable chips that explain what each code means */}
          <section className="card p-5">
            <div className="eyebrow mb-2">Personality types</div>
            <p className="text-xs text-ink-muted mb-3">Click any type to see what it means for sales and how to coach this person.</p>
            <div className="flex flex-wrap gap-2">
              {dp.enneagramType && (
                <PersonalityChip
                  framework="ENNEAGRAM"
                  rawCode={dp.enneagramType}
                  explanation={enneagramExplainer(dp.enneagramType)}
                />
              )}
              {dp.discProfile && (
                <PersonalityChip
                  framework="DISC"
                  rawCode={dp.discProfile}
                  explanation={discExplainer(dp.discProfile)}
                />
              )}
              {dp.mbtiType && (
                <PersonalityChip
                  framework="MBTI"
                  rawCode={dp.mbtiType}
                  explanation={mbtiExplainer(dp.mbtiType)}
                />
              )}
              {!dp.enneagramType && !dp.discProfile && !dp.mbtiType && (
                <span className="meta">No personality data yet — finish the intake to populate.</span>
              )}
            </div>
          </section>

          {ctx.role !== "DIRECTOR" && <QuizScheduleCard aeProfileId={dp.id} name={dp.user.name} kind="director" />}

          {dp.skillScores.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="eyebrow">Leadership skill scores</div>
                <span className="meta">click any to see how it's graded</span>
              </div>
              <ul className="space-y-2">
                {dp.skillScores.map((s: any) => (
                  <li key={s.category}>
                    <SkillScoreChip
                      category={s.category}
                      score={s.score}
                      orgOverrideWhatGoodLooksLike={overrideMap.get(s.category) ?? null}
                      orgName={(dp as any).org?.name}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <ProfileCardTrigger userId={dp.userId} field="strengths">
              <div className="eyebrow mb-2">Strengths</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {strengths.map((s, i) => <li key={i}>{s}</li>)}
                {strengths.length === 0 && <li className="text-ink-muted list-none">None recorded.</li>}
              </ul>
            </ProfileCardTrigger>
            <ProfileCardTrigger userId={dp.userId} field="weaknesses">
              <div className="eyebrow mb-2">Growth areas</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                {weaknesses.length === 0 && <li className="text-ink-muted list-none">None recorded.</li>}
              </ul>
            </ProfileCardTrigger>
          </div>

          {dp.personalitySummary && (
            <ProfileCardTrigger userId={dp.userId} field="personality">
              <div className="eyebrow mb-2">Personality summary</div>
              <p className="text-sm whitespace-pre-wrap">{dp.personalitySummary}</p>
            </ProfileCardTrigger>
          )}
          {dp.leadershipSummary && (
            <ProfileCardTrigger userId={dp.userId} field="salesStyle">
              <div className="eyebrow mb-2">Leadership style</div>
              <p className="text-sm whitespace-pre-wrap">{dp.leadershipSummary}</p>
            </ProfileCardTrigger>
          )}
          {dp.forecastingSummary && (
            <ProfileCardTrigger userId={dp.userId} field="communication">
              <div className="eyebrow mb-2">Forecasting style</div>
              <p className="text-sm whitespace-pre-wrap">{dp.forecastingSummary}</p>
            </ProfileCardTrigger>
          )}
          {motivations.length > 0 && (
            <ProfileCardTrigger userId={dp.userId} field="motivations">
              <div className="eyebrow mb-2">Motivations</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {motivations.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </ProfileCardTrigger>
          )}
        </>
      )}
    </div>
  );

  const team = (
    <div className="space-y-4">
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Reports" value={teamAes.length.toString()} />
        <Stat label="Team quota total" value={dollars(teamLifetime.quota)} />
        <Stat label="Team attained" value={dollars(teamLifetime.attained)} />
        <Stat label="Attainment %" value={teamLifetime.quota > 0 ? `${Math.round((teamLifetime.attained / teamLifetime.quota) * 100)}%` : "—"} />
      </section>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-softLine bg-surface-soft">
          <div className="eyebrow">Roster</div>
        </div>
        {teamAes.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No AEs reporting to {dp.user.name} yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft border-t border-ink-softLine">
              <tr>
                <th className="px-5 py-2.5 font-semibold">AE</th>
                <th className="px-5 py-2.5 font-semibold text-right">Last Q quota</th>
                <th className="px-5 py-2.5 font-semibold text-right">Last Q attained</th>
                <th className="px-5 py-2.5 font-semibold text-right">Last %</th>
                <th className="px-5 py-2.5 font-semibold text-right">Avg skill</th>
              </tr>
            </thead>
            <tbody>
              {teamAes.map((ae) => {
                const lastQ = ae.quarterlyPerformance[0];
                const pct = lastQ?.quotaCents && lastQ.attainedCents !== null
                  ? Math.round(((lastQ.attainedCents ?? 0) / lastQ.quotaCents) * 100)
                  : null;
                const avg = ae.skillScores.length > 0
                  ? Math.round(ae.skillScores.reduce((a, s) => a + s.score, 0) / ae.skillScores.length)
                  : null;
                const color = pct === null ? "" : pct >= 100 ? "text-brand-emerald" : pct >= 80 ? "text-brand-indigo" : pct >= 60 ? "text-brand-amber" : "text-brand-red";
                return (
                  <tr key={ae.id} className="border-t border-ink-softLine">
                    <td className="px-5 py-3">
                      <Link href={`/director/ae/${ae.id}`} className="font-medium text-ink hover:text-brand-indigo hover:underline">
                        {ae.user.name}
                      </Link>
                      <div className="meta">{ae.user.email}</div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{dollars(lastQ?.quotaCents)}</td>
                    <td className="px-5 py-3 text-right font-mono">{dollars(lastQ?.attainedCents)}</td>
                    <td className={`px-5 py-3 text-right font-mono font-semibold ${color}`}>{pct === null ? "—" : `${pct}%`}</td>
                    <td className="px-5 py-3 text-right font-mono">{avg ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="page max-w-5xl">
      <header className="mb-4">
        <Link href="/dashboard" className="link text-sm">← Dashboard</Link>
        <div className="flex items-center gap-4 mt-2">
          {dp.user.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dp.user.imageUrl} alt={dp.user.name} className="w-16 h-16 rounded-full object-cover ring-2 ring-ink-softLine" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-lg font-bold">
              {dp.user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="h-page truncate">{dp.user.name}</h1>
            <p className="text-sm text-ink-muted">
              Director · {dp.user.email}
              {dp.user.vp?.name && <span> · reports to {dp.user.vp.name}</span>}
            </p>
          </div>
          {(ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN" || ctx.role === "VP_SALES") && (
            <div className="shrink-0 flex flex-col gap-1.5">
              <SendQuizButton aeProfileId={dp.id} aeName={dp.user.name} kind="director" />
              <GenerateTasksForUserButton
                preselectedUserId={dp.userId}
                buttonLabel="✨ Generate tasks"
                buttonClassName="btn-secondary text-xs"
              />
            </div>
          )}
        </div>
      </header>

      <DirectorTabs
        overview={overview}
        team={team}
        prep={<DirectorPrepTab directorProfileId={dp.id} name={dp.user.name} />}
        chat={<DirectorChatTab directorProfileId={dp.id} name={dp.user.name} />}
        hints={
          (ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN" || ctx.role === "VP_SALES") && ctx.userId !== dp.userId
            ? <CoachingHintsTab userId={dp.userId} />
            : undefined
        }
        reasoning={
          ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN" || ctx.role === "VP_SALES"
            ? <DirectorReasoningTab directorProfileId={dp.id} />
            : undefined
        }
        plans={<CoachingPlansTab userId={dp.userId} viewerId={ctx.userId} />}
        unreadPlans={unreadPlanCount}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
