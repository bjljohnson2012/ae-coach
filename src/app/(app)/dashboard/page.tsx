import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession, getAccessibleAeIds, getManageableUsers } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getImproveButtonLabel } from "@/lib/improve";
import { SynthesisStatusBanner } from "@/components/SynthesisStatusBanner";

export default async function Dashboard() {
  const ctx = await requireSession();

  // AE → personal card
  if (ctx.role === "AE") redirect("/ae/card");

  // Self-intake status: every user (Director+, since AE redirected above) needs
  // a synthesized profile. If theirs is missing, show a prominent card on
  // dashboard until they finish.
  const myDirectorProfile = ctx.role === "DIRECTOR" || ctx.role === "VP_SALES" || ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN"
    ? await prisma.directorProfile.findUnique({
        where: { userId: ctx.userId },
        select: {
          id: true,
          lastSynthesizedAt: true,
          // v3.37.5 — async synthesis status for the polling banner.
          synthesisStatus: true,
          synthesisError: true,
          synthesisStartedAt: true,
        } as any,
      }) as any
    : null;
  const myIntakeIncomplete = !myDirectorProfile?.lastSynthesizedAt;
  const myIntakeStarted = !!myDirectorProfile;
  const myIntakeUrl = "/director/intake";

  // Initial state for the polling banner — server-rendered so we don't
  // flash an empty banner before the first fetch resolves.
  // v3.37.6 — also detect orphaned state (COMPLETED answerSet exists but
  // profile never synthesized) so users stranded by the legacy synchronous
  // flow have a one-click retry path.
  let synthesisInitial: any = null;
  if (myDirectorProfile?.synthesisStatus) {
    synthesisInitial = {
      status: myDirectorProfile.synthesisStatus as "GENERATING" | "FAILED" | "READY" | null,
      error: myDirectorProfile.synthesisError ?? null,
      startedAt: myDirectorProfile.synthesisStartedAt
        ? new Date(myDirectorProfile.synthesisStartedAt).toISOString()
        : null,
      ageSeconds: myDirectorProfile.synthesisStartedAt
        ? Math.floor((Date.now() - new Date(myDirectorProfile.synthesisStartedAt).getTime()) / 1000)
        : 0,
      isOrphaned: false,
    };
  } else if (myDirectorProfile && !myDirectorProfile.lastSynthesizedAt) {
    // Possibly orphaned. Confirm a COMPLETED answerSet exists.
    const orphanCheck = await prisma.answerSet.findFirst({
      where: { directorProfileId: myDirectorProfile.id, status: "COMPLETED" },
      select: { id: true },
    });
    if (orphanCheck) {
      synthesisInitial = {
        status: null,
        error: "Your intake was submitted but the AI didn't finish building your profile.",
        startedAt: null,
        ageSeconds: 0,
        isOrphaned: true,
      };
    }
  }

  // Pull AEs the user can see (centralized in tenancy)
  const aeIds = await getAccessibleAeIds(ctx);
  const aes = aeIds.length === 0
    ? []
    : await prisma.aeProfile.findMany({
        where: { id: { in: aeIds } },
        include: {
          user: { select: { email: true, name: true, status: true } },
          skillScores: true,
          director: { select: { name: true } },
          // Company name is shown for ORG_ADMIN so they can tell at a glance
          // which customer org each AE belongs to.
          org: { select: { name: true, brandColor: true } },
        },
        orderBy: { createdAt: "desc" },
      });

  const pendingReviews = await prisma.directorReview.count({
    where:
      ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN"
        ? { status: { not: "COMPLETED" } }
        : ctx.role === "VP_SALES"
          ? { aeProfileId: { in: aeIds }, status: { not: "COMPLETED" } }
          : { directorId: ctx.userId, status: { not: "COMPLETED" } },
  });

  const synthesizedCount = aes.filter((a) => a.lastSynthesizedAt).length;
  const pendingIntake = aes.filter((a) => !a.lastSynthesizedAt).length;
  const allScores = aes.flatMap((a) => a.skillScores);
  const teamAvg =
    allScores.length > 0
      ? Math.round(allScores.reduce((s, x) => s + x.score, 0) / allScores.length)
      : null;

  // Director roster — visible to VP, Company Admin, Org Admin.
  // VP sees only directors who report to them.
  // Company Admin sees every director in their org.
  // Org Admin sees every director everywhere (with company column).
  const directorWhere: any = ctx.role === "VP_SALES"
    ? { user: { vpId: ctx.userId, role: "DIRECTOR" } }
    : ctx.role === "COMPANY_ADMIN"
      ? { orgId: ctx.effectiveOrgId }
      : ctx.role === "ORG_ADMIN"
        ? {}
        : null; // DIRECTOR — no director roster
  const directors = directorWhere
    ? await prisma.directorProfile.findMany({
        where: directorWhere,
        include: {
          user: { select: { id: true, name: true, email: true, status: true, vpId: true } },
          skillScores: true,
          org: { select: { name: true, brandColor: true } },
        },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  // Per-director AE counts (separate query because Prisma can't count via the
  // user's directedAes relation in the same include block above).
  const directorIds = directors.map((d: any) => d.user.id);
  const aeCounts = directorIds.length > 0
    ? await prisma.aeProfile.groupBy({
        by: ["directorId"],
        where: { directorId: { in: directorIds } },
        _count: true,
      })
    : [];
  const aeCountByDirector: Record<string, number> = {};
  for (const c of aeCounts) {
    if (c.directorId) aeCountByDirector[c.directorId] = (c as any)._count;
  }

  // VP roster — visible to Company Admin, Org Admin only.
  const vpWhere: any = ctx.role === "COMPANY_ADMIN"
    ? { role: "VP_SALES", orgId: ctx.effectiveOrgId }
    : ctx.role === "ORG_ADMIN"
      ? { role: "VP_SALES" }
      : null;
  const vps = vpWhere
    ? await prisma.user.findMany({
        where: vpWhere,
        select: {
          id: true, name: true, email: true, status: true, lastLoginAt: true,
          org: { select: { name: true, brandColor: true } },
        },
        orderBy: { name: "asc" },
      })
    : [];

  // Per-VP director count
  const vpIds = vps.map((v: any) => v.id);
  const directorCounts = vpIds.length > 0
    ? await prisma.user.groupBy({
        by: ["vpId"],
        where: { vpId: { in: vpIds }, role: "DIRECTOR" },
        _count: true,
      })
    : [];
  const directorCountByVp: Record<string, number> = {};
  for (const c of directorCounts) {
    if (c.vpId) directorCountByVp[c.vpId] = (c as any)._count;
  }

  // For Org Admin: also count orgs and total users
  const isOrgAdmin = ctx.role === "ORG_ADMIN";
  const orgCount = isOrgAdmin ? await prisma.org.count() : null;
  const userCount = isOrgAdmin
    ? await prisma.user.count()
    : await prisma.user.count({ where: { orgId: ctx.effectiveOrgId } });

  // v3.37 — per-org "Improve" button label for the gamified self-coach flow.
  const improveLabel = await getImproveButtonLabel(ctx.effectiveOrgId);

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">{roleHeader(ctx.role)}</div>
          <h1 className="h-page">{greeting(ctx.name)}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {roleSubhead(ctx.role)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/improve" className="btn-primary text-sm whitespace-nowrap">
            ✨ {improveLabel}
          </Link>
          {pendingReviews > 0 && (
            <Link href="/director/reviews" className="btn-secondary text-sm">
              {pendingReviews} review{pendingReviews === 1 ? "" : "s"} pending →
            </Link>
          )}
          {(ctx.role === "DIRECTOR" || ctx.role === "VP_SALES" || ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN") && aes.length >= 2 && (
            <Link href="/director/compare" className="btn-secondary text-sm">⇄ Compare AEs</Link>
          )}
          {(ctx.role === "VP_SALES" || ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN") && (
            <Link href="/director/compare-directors" className="btn-secondary text-sm">⇄ Compare Directors</Link>
          )}
          {(ctx.role === "DIRECTOR" || ctx.role === "VP_SALES" || ctx.role === "COMPANY_ADMIN") && (
            <Link href="/director/invite" className="btn-primary">+ Invite AE</Link>
          )}
          {ctx.role === "ORG_ADMIN" && (
            <Link href="/admin/orgs" className="btn-primary">Manage Orgs</Link>
          )}
        </div>
      </header>

      {/* v3.37.5 — async synthesis status. Renders for GENERATING / FAILED
          and (v3.37.6) for orphaned legacy submissions. Polls every 5s and
          refreshes the page when the job lands. */}
      {synthesisInitial && (synthesisInitial.status === "GENERATING" || synthesisInitial.status === "FAILED" || synthesisInitial.isOrphaned) && (
        <SynthesisStatusBanner initial={synthesisInitial} role={ctx.role} />
      )}

      {/* Self-intake nudge — shows until the current user has a synthesized profile.
          Hides once a synthesis is in flight or stuck orphaned (banner above takes over). */}
      {myIntakeIncomplete && synthesisInitial?.status !== "GENERATING" && !synthesisInitial?.isOrphaned && (
        <section className="card p-6 mb-6 bg-gradient-to-br from-brand-orange/10 to-brand-indigo/10 border-l-4 border-brand-orange">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="text-3xl shrink-0" aria-hidden="true">📋</div>
            <div className="flex-1 min-w-0">
              <h2 className="h-section">{myIntakeStarted ? "Finish your intake" : "Build your profile"}</h2>
              <p className="text-sm mt-1 text-ink-slate">
                {myIntakeStarted
                  ? "You've started your intake but haven't finished. Pick up where you left off — about 5–10 minutes."
                  : "The platform's coaching power comes from your personality + skill profile. Take 10–12 minutes to complete your intake so the AI can help you and your team."}
              </p>
              <p className="text-xs mt-2 text-ink-muted">
                Once complete: you'll see your skill card, leadership style, and tailored coaching hints.
              </p>
            </div>
            <Link href={myIntakeUrl} className="btn-primary shrink-0">
              {myIntakeStarted ? "Resume intake →" : "Start intake →"}
            </Link>
          </div>
        </section>
      )}

      {/* Today panel — what needs my attention right now */}
      <TodayPanelWrapper />

      {/* Metric cards (role-aware) */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {isOrgAdmin && (
          <div className="card p-5">
            <div className="eyebrow">Orgs</div>
            <div className="font-display text-3xl font-bold tracking-tight mt-1">{orgCount}</div>
          </div>
        )}
        <div className="card p-5">
          <div className="eyebrow">{isOrgAdmin ? "Total users" : "Users in org"}</div>
          <div className="font-display text-3xl font-bold tracking-tight mt-1">{userCount}</div>
        </div>
        <div className="card p-5">
          <div className="eyebrow">Active AEs</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tight">{aes.length}</span>
            {pendingIntake > 0 && (
              <span className="badge-warning text-[10px]">{pendingIntake} pending</span>
            )}
          </div>
        </div>
        <div className="card p-5">
          <div className="eyebrow">Profiles synthesized</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tight">{synthesizedCount}</span>
            {synthesizedCount > 0 && synthesizedCount === aes.length && (
              <span className="badge-success text-[10px]">All set</span>
            )}
          </div>
        </div>
        {teamAvg !== null && (
          <div className="card p-5">
            <div className="eyebrow">Team avg score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold tracking-tight">{teamAvg}</span>
              {teamAvg >= 60 ? (
                <span className="badge-success text-[10px]">On track</span>
              ) : (
                <span className="badge-warning text-[10px]">Coaching needed</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* VP Roster — Company Admin / Org Admin only */}
      {vps.length > 0 && (
        <section className="card overflow-hidden mb-6">
          <header className="flex items-center justify-between p-5 border-b border-ink-softLine">
            <div>
              <h2 className="h-section">VP Roster</h2>
              <p className="text-xs text-ink-muted mt-0.5">Sales VPs who manage directors. Click a row to view their user record.</p>
            </div>
            <span className="meta">{vps.length} {vps.length === 1 ? "VP" : "VPs"}</span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
                <th className="px-5 py-2.5 font-semibold">VP</th>
                {isOrgAdmin && <th className="px-5 py-2.5 font-semibold">Company</th>}
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold text-right">Directors</th>
                <th className="px-5 py-2.5 font-semibold">Last login</th>
              </tr>
            </thead>
            <tbody>
              {vps.map((v: any) => (
                <tr key={v.id} className="border-t border-ink-softLine hover:bg-brand-indigo/5 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/users/${v.id}`} className="flex items-center gap-3 group">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white font-semibold text-sm shrink-0">
                        {v.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-ink group-hover:text-brand-indigo">{v.name}</div>
                        <div className="text-xs text-ink-muted truncate">{v.email}</div>
                      </div>
                    </Link>
                  </td>
                  {isOrgAdmin && (
                    <td className="px-5 py-3 text-ink-slate">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: v.org?.brandColor || "#1F3C88" }}
                          aria-hidden="true"
                        />
                        {v.org?.name ?? "—"}
                      </span>
                    </td>
                  )}
                  <td className="px-5 py-3">
                    {v.status === "ACTIVE" ? <span className="badge-success">Active</span>
                      : v.status === "PENDING" ? <span className="badge-warning">Pending</span>
                      : <span className="badge-neutral">Inactive</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="font-mono text-base font-semibold">{directorCountByVp[v.id] ?? 0}</span>
                  </td>
                  <td className="px-5 py-3 text-ink-muted text-xs">
                    {v.lastLoginAt ? new Date(v.lastLoginAt).toLocaleDateString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Director Roster — VP / Company Admin / Org Admin */}
      {directors.length > 0 && (
        <section className="card overflow-hidden mb-6">
          <header className="flex items-center justify-between p-5 border-b border-ink-softLine">
            <div>
              <h2 className="h-section">Director Roster</h2>
              <p className="text-xs text-ink-muted mt-0.5">Directors and their leadership profiles. Click a row for the full coaching workspace.</p>
            </div>
            <span className="meta">{directors.length} {directors.length === 1 ? "Director" : "Directors"}</span>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
                <th className="px-5 py-2.5 font-semibold">Director</th>
                {isOrgAdmin && <th className="px-5 py-2.5 font-semibold">Company</th>}
                <th className="px-5 py-2.5 font-semibold">Profile</th>
                <th className="px-5 py-2.5 font-semibold text-right">AEs</th>
                <th className="px-5 py-2.5 font-semibold text-right">Score</th>
                <th className="px-5 py-2.5 font-semibold w-32">Skill heatmap</th>
              </tr>
            </thead>
            <tbody>
              {directors.map((d: any) => {
                const avg = d.skillScores.length > 0
                  ? Math.round(d.skillScores.reduce((s: number, x: any) => s + x.score, 0) / d.skillScores.length)
                  : null;
                return (
                  <tr key={d.id} className="border-t border-ink-softLine hover:bg-brand-indigo/5 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/director/director/${d.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white font-semibold text-sm shrink-0">
                          {d.user.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink group-hover:text-brand-indigo">{d.user.name}</div>
                          <div className="text-xs text-ink-muted truncate">{d.user.email}</div>
                        </div>
                      </Link>
                    </td>
                    {isOrgAdmin && (
                      <td className="px-5 py-3 text-ink-slate">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: d.org?.brandColor || "#1F3C88" }}
                            aria-hidden="true"
                          />
                          {d.org?.name ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3">
                      {d.lastSynthesizedAt ? (
                        <span className="badge-success">Synthesized</span>
                      ) : (
                        <span className="badge-active">Awaiting intake</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-mono text-base font-semibold">{aeCountByDirector[d.user.id] ?? 0}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-mono text-base font-semibold">{avg ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-0.5">
                        {d.skillScores.length === 0
                          ? <span className="text-xs text-ink-muted">—</span>
                          : d.skillScores.slice(0, 4).map((s: any) => (
                              <div
                                key={s.id}
                                title={`${s.category}: ${s.score}`}
                                className="w-3 h-6 rounded-sm"
                                style={{ background: heatColor(s.score) }}
                              />
                            ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* AE table — clean, scannable, leadership view */}
      <section className="card overflow-hidden">
        <header className="flex items-center justify-between p-5 border-b border-ink-softLine">
          <div>
            <h2 className="h-section">AE Roster</h2>
            <p className="text-xs text-ink-muted mt-0.5">Click a row to open profile + coaching workspace.</p>
          </div>
          <span className="meta">{aes.length} {aes.length === 1 ? "AE" : "AEs"}</span>
        </header>

        {aes.length === 0 ? (
          <div className="p-12 text-center">
            <div className="font-display text-lg font-semibold text-ink mb-1">No AEs yet</div>
            <p className="text-sm text-ink-muted mb-5">Invite one to start coaching.</p>
            <Link href="/director/invite" className="btn-primary">+ Invite AE</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
                <th className="px-5 py-2.5 font-semibold">AE</th>
                {isOrgAdmin && <th className="px-5 py-2.5 font-semibold">Company</th>}
                <th className="px-5 py-2.5 font-semibold">Director</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-2.5 font-semibold text-right">Score</th>
                <th className="px-5 py-2.5 font-semibold w-32">Skill heatmap</th>
              </tr>
            </thead>
            <tbody>
              {aes.map((ae) => {
                const avg =
                  ae.skillScores.length > 0
                    ? Math.round(ae.skillScores.reduce((s, x) => s + x.score, 0) / ae.skillScores.length)
                    : null;
                return (
                  <tr key={ae.id} className="border-t border-ink-softLine hover:bg-brand-indigo/5 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/director/ae/${ae.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white font-semibold text-sm shrink-0">
                          {ae.user.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-ink group-hover:text-brand-indigo">{ae.user.name}</div>
                          <div className="text-xs text-ink-muted truncate">{ae.user.email}</div>
                        </div>
                      </Link>
                    </td>
                    {isOrgAdmin && (
                      <td className="px-5 py-3 text-ink-slate">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ background: ae.org?.brandColor || "#1F3C88" }}
                            aria-hidden="true"
                          />
                          {ae.org?.name ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="px-5 py-3 text-ink-slate">{ae.director?.name ?? "—"}</td>
                    <td className="px-5 py-3">
                      {ae.user.status === "PENDING" ? (
                        <span className="badge-warning">Pending invite</span>
                      ) : ae.lastSynthesizedAt ? (
                        <span className="badge-success">Synthesized</span>
                      ) : (
                        <span className="badge-active">Awaiting wizard</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-mono text-base font-semibold">{avg ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-0.5">
                        {ae.skillScores.length === 0
                          ? <span className="text-xs text-ink-muted">—</span>
                          : ae.skillScores.slice(0, 6).map((s) => (
                              <div
                                key={s.id}
                                title={`${s.category}: ${s.score}`}
                                className="w-3 h-6 rounded-sm"
                                style={{ background: heatColor(s.score) }}
                              />
                            ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}.`;
}
function roleHeader(role: string) {
  switch (role) {
    case "ORG_ADMIN":     return "Platform overview";
    case "COMPANY_ADMIN": return "Company overview";
    case "VP_SALES":      return "Team overview";
    case "DIRECTOR":      return "Today's overview";
    default:              return "Overview";
  }
}
function roleSubhead(role: string) {
  switch (role) {
    case "ORG_ADMIN":     return "All companies, every team, every coach.";
    case "COMPANY_ADMIN": return "Everyone in your org. Manage users, content, and coaching health.";
    case "VP_SALES":      return "Your directors and their reps at a glance.";
    case "DIRECTOR":      return "Your AEs and what to coach this week.";
    default:              return "";
  }
}
function heatColor(score: number) {
  if (score >= 80) return "#0E9F6E";  // emerald
  if (score >= 60) return "#1F3C88";  // indigo
  if (score >= 40) return "#F59E0B";  // amber
  return "#DC2626";                   // red
}

/**
 * Today panel — actionable items for leaders. Renders as a card row above the
 * existing metric cards. Pulls four signal types in parallel:
 *   - Pending retake requests (PENDING)
 *   - Recent quiz completions (last 7 days)
 *   - Pending monthly reviews
 *   - AEs in low-skill bucket needing coaching
 * Empty by design when nothing needs attention.
 */
async function TodayPanelWrapper() {
  const ctx = await requireSession();
  if (ctx.role === "AE") return null;

  // Manageable users (lower-perm scope). Used to filter retake requests and recent submissions.
  const manageable = await getManageableUsers(ctx);
  const managedUserIds = manageable.map((u) => u.id).filter((id) => id !== ctx.userId);
  const aeIds = await getAccessibleAeIds(ctx);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [pendingRetakes, recentQuizCompletions, pendingReviews, lowSkillAes, tasksIAssigned] = await Promise.all([
    managedUserIds.length === 0 ? Promise.resolve([]) : prisma.quizRetakeRequest.findMany({
      where: { requesterUserId: { in: managedUserIds }, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { requester: { select: { name: true } } },
      take: 5,
    }),
    aeIds.length === 0 ? Promise.resolve([]) : prisma.adHocQuiz.findMany({
      where: {
        aeProfileId: { in: aeIds },
        status: "COMPLETED",
        completedAt: { gte: sevenDaysAgo },
      },
      orderBy: { completedAt: "desc" },
      include: {
        aeProfile: { include: { user: { select: { name: true } } } },
      },
      take: 5,
    }),
    aeIds.length === 0 ? Promise.resolve([]) : prisma.directorReview.findMany({
      where: {
        aeProfileId: { in: aeIds },
        status: { in: ["PENDING", "IN_PROGRESS"] },
        ...(ctx.role === "DIRECTOR" ? { directorId: ctx.userId } : {}),
      },
      orderBy: { dueAt: "asc" },
      include: { aeProfile: { include: { user: { select: { name: true } } } } },
      take: 5,
    }),
    aeIds.length === 0 ? Promise.resolve([]) : prisma.aeProfile.findMany({
      where: {
        id: { in: aeIds },
        skillScores: { some: { score: { lt: 50 } } },
      },
      include: {
        user: { select: { id: true, name: true } },
        skillScores: { where: { score: { lt: 50 } }, orderBy: { score: "asc" }, take: 1 },
      },
      take: 5,
    }),
    // v3.36: tasks the leader has delegated and is waiting on. Leaders
    // don't have AeProfiles, so every aeProfileId-targeted task created by
    // them is by definition delegated. For assigneeUserId tasks, exclude
    // the ones the leader assigned to themselves.
    prisma.task.findMany({
      where: {
        createdByUserId: ctx.userId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        NOT: { assigneeUserId: ctx.userId },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        aeProfile: { include: { user: { select: { name: true } } } },
        assignee: { select: { name: true } },
      },
      take: 5,
    }),
  ]);

  const totalSignals = pendingRetakes.length + recentQuizCompletions.length + pendingReviews.length + lowSkillAes.length + tasksIAssigned.length;
  if (totalSignals === 0) return null;

  return (
    <section className="card overflow-hidden mb-6 border-l-4 border-brand-orange">
      <header className="px-5 py-3 border-b border-ink-softLine bg-brand-orange/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold">Today</span>
          <span className="badge-warning">{totalSignals}</span>
        </div>
        <span className="meta">what needs your attention</span>
      </header>
      <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink-softLine">
        <div className="p-5 space-y-4">
          {pendingRetakes.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-ink-slate mb-2">
                Retake requests · {pendingRetakes.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {pendingRetakes.map((r: any) => (
                  <li key={r.id}>
                    <Link href="/tasks" className="link">{r.requester.name}</Link>
                    <span className="text-ink-muted text-xs"> · {new Date(r.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pendingReviews.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-ink-slate mb-2">
                Monthly reviews due · {pendingReviews.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {pendingReviews.map((r: any) => (
                  <li key={r.id}>
                    <Link href="/director/reviews" className="link">{r.aeProfile.user.name}</Link>
                    <span className="text-ink-muted text-xs"> · {r.dueAt ? `due ${new Date(r.dueAt).toLocaleDateString()}` : "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-5 space-y-4">
          {recentQuizCompletions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-ink-slate mb-2">
                Just completed quizzes · {recentQuizCompletions.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {recentQuizCompletions.map((q: any) => (
                  <li key={q.id}>
                    <Link href={`/director/ae/${q.aeProfileId}`} className="link">{q.aeProfile.user.name}</Link>
                    <span className="text-ink-muted text-xs"> · {q.title.slice(0, 30)}{q.title.length > 30 ? "…" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowSkillAes.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-ink-slate mb-2">
                AEs needing coaching · {lowSkillAes.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {lowSkillAes.map((a: any) => (
                  <li key={a.id}>
                    <Link href={`/director/ae/${a.id}`} className="link">{a.user.name}</Link>
                    <span className="text-ink-muted text-xs">
                      {" "}· {a.skillScores[0].category.replace(/_/g, " ").toLowerCase()} ({a.skillScores[0].score})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tasksIAssigned.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-ink-slate mb-2">
                Tasks I delegated · {tasksIAssigned.length}
              </div>
              <ul className="space-y-1.5 text-sm">
                {tasksIAssigned.map((t: any) => {
                  const ownerName = t.aeProfile?.user?.name ?? t.assignee?.name ?? "—";
                  const dueDays = t.dueAt ? Math.round((new Date(t.dueAt).getTime() - Date.now()) / 86_400_000) : null;
                  const overdue = dueDays !== null && dueDays < 0;
                  return (
                    <li key={t.id}>
                      <Link href="/tasks" className="link">{ownerName}</Link>
                      <span className="text-ink-muted text-xs"> · {t.title.slice(0, 36)}{t.title.length > 36 ? "…" : ""}</span>
                      {dueDays !== null && (
                        <span className={`text-xs ml-1 ${overdue ? "text-brand-red font-semibold" : "text-ink-muted"}`}>
                          {overdue ? `${Math.abs(dueDays)}d overdue` : `due in ${dueDays}d`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
