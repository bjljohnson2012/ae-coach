import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ActivitySearch } from "./ActivitySearch";
import { AnalyzeDrillTrigger } from "./AnalyzeDrillTrigger";
import { StatCardTrigger } from "./StatCardTrigger";
import { PersonalityInfoButton } from "@/components/PersonalityInfoButton";
import { SkillInfoButton } from "@/components/SkillInfoButton";

export default async function AnalyzePage() {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  const [users, aes, products, articles, files, questions, reviews, tasks] = await Promise.all([
    prisma.user.count({ where: orgFilter }),
    prisma.aeProfile.count({ where: orgFilter }),
    prisma.product.count({ where: { ...orgFilter, active: true } }),
    prisma.knowledgeArticle.count({ where: orgFilter }),
    prisma.fileAsset.count({ where: orgFilter }),
    prisma.question.count({ where: { OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }], active: true } }),
    prisma.directorReview.count({ where: { aeProfile: orgFilter } }),
    prisma.task.count({ where: { aeProfile: orgFilter, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const allScores = await prisma.skillScore.findMany({
    where: { aeProfile: orgFilter },
    select: { category: true, score: true },
  });
  const byCat = new Map<string, { sum: number; n: number }>();
  for (const s of allScores) {
    const cur = byCat.get(s.category) ?? { sum: 0, n: 0 };
    cur.sum += s.score;
    cur.n += 1;
    byCat.set(s.category, cur);
  }

  const pendingIntake = await prisma.aeProfile.count({ where: { ...orgFilter, lastSynthesizedAt: null } });

  const productsRaw = await prisma.product.findMany({
    where: { ...orgFilter, active: true },
    include: {
      articles: {
        where: { tagsJson: { array_contains: "brief" } as any },
        select: { id: true },
      },
    },
  });
  const productsWithoutBrief = productsRaw.filter((p) => p.articles.length === 0);

  // Pending knowledge articles
  const pendingArticles = await prisma.knowledgeArticle.count({
    where: { ...orgFilter, status: "PENDING" },
  });

  // Personality breakdowns
  const profiles = await prisma.aeProfile.findMany({
    where: orgFilter,
    select: { enneagramType: true, discProfile: true, mbtiType: true, lastSynthesizedAt: true },
  });
  const synthesized = profiles.filter((p) => p.lastSynthesizedAt);

  /**
   * Tally a profile field across synthesized profiles.
   *
   * `normalize` lets us collapse wing notations ("3w2" → "3") so all type-3s
   * are counted together. `fixedOrder` returns rows in a deterministic order
   * — used for Enneagram (1→9) so the chart reads like the framework.
   */
  function tally(
    field: keyof typeof profiles[number],
    opts: { normalize?: (raw: string) => string | null; fixedOrder?: string[] } = {},
  ) {
    const m = new Map<string, number>();
    for (const p of synthesized) {
      const raw = (p[field] as string | null) ?? null;
      if (!raw) continue;
      const v = opts.normalize ? opts.normalize(raw) : raw;
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    if (opts.fixedOrder) {
      // Always render every slot in the framework even if count is 0 — the
      // empty rows are still informative ("nobody is a 4 right now").
      return opts.fixedOrder.map((k): [string, number] => [k, m.get(k) ?? 0]);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }

  const enneagramDist = tally("enneagramType", {
    normalize: (raw) => raw.trim().match(/^[1-9]/)?.[0] ?? null,
    fixedOrder: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  });
  const discDist = tally("discProfile");
  const mbtiDist = tally("mbtiType");

  // Last 50 audit entries — surfaced via client search
  const audit = await prisma.auditLog.findMany({
    where: orgFilter,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: { select: { name: true } } },
  });
  const auditForClient = audit.map((a) => ({
    id: a.id,
    action: a.action,
    actorName: a.actor.name,
    targetType: a.targetType,
    createdAt: a.createdAt.toISOString(),
  }));

  const isOrgAdmin = ctx.role === "ORG_ADMIN";

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Analytics</div>
          <h1 className="h-page">Analyze</h1>
          <p className="mt-1 text-sm text-ink-muted">
            What's working, what's stuck, where to invest next. {isOrgAdmin ? "Cross-org view." : "Your org only."}
          </p>
        </div>
        <Link href="/admin/reports" className="btn-secondary">📊 Detailed Reports</Link>
      </header>

      {/* Headline counters — click any to drill in via drawer */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {isOrgAdmin && <StatDrawer kind="orgs" label="Orgs" value={products /* placeholder */} />}
        <StatDrawer kind="users" label={isOrgAdmin ? "Total users" : "Users in org"} value={users} />
        <StatDrawer kind="aes" label="AEs" value={aes} />
        <StatDrawer kind="products" label="Products" value={products} />
        <StatDrawer kind="articles" label="Knowledge articles" value={articles} />
        <StatDrawer kind="files" label="Files" value={files} />
        <StatDrawer kind="questions" label="Active questions" value={questions} />
        <StatDrawer kind="reviews" label="Reviews" value={reviews} />
        <StatDrawer kind="tasks" label="Open tasks" value={tasks} />
      </section>

      {/* Personality breakdowns — click any row to drill in, "See all" for full grid */}
      <section className="grid sm:grid-cols-3 gap-4 mb-6">
        <DistCard title="Enneagram" type="ENNEAGRAM" seeAllHref="/admin/analyze/full/enneagram" rows={enneagramDist} total={synthesized.length} />
        <DistCard title="DISC" type="DISC" seeAllHref="/admin/analyze/full/disc" rows={discDist} total={synthesized.length} />
        <DistCard title="MBTI" type="MBTI" seeAllHref="/admin/analyze/full/mbti" rows={mbtiDist} total={synthesized.length} />
      </section>

      {/* Gaps to close */}
      <section className="card p-5 mb-5">
        <div className="eyebrow mb-3">Gaps to close</div>
        <ul className="space-y-2 text-sm">
          {pendingIntake > 0 && (
            <li className="flex items-baseline gap-2">
              <span className="badge-warning">{pendingIntake}</span>
              <span>AE{pendingIntake === 1 ? "" : "s"} with incomplete intake</span>
            </li>
          )}
          {pendingArticles > 0 && (
            <li className="flex items-baseline gap-2">
              <span className="badge-warning">{pendingArticles}</span>
              <Link className="link" href="/director/knowledge">Knowledge article{pendingArticles === 1 ? "" : "s"} pending approval</Link>
            </li>
          )}
          {productsWithoutBrief.length > 0 && (
            <li className="flex items-baseline gap-2">
              <span className="badge-warning">{productsWithoutBrief.length}</span>
              <span>Product{productsWithoutBrief.length === 1 ? "" : "s"} missing AI brief: <em>{productsWithoutBrief.map((p) => p.name).join(", ")}</em></span>
            </li>
          )}
          {pendingIntake === 0 && pendingArticles === 0 && productsWithoutBrief.length === 0 && (
            <li className="text-ink-muted">Looking good — no major gaps right now.</li>
          )}
        </ul>
      </section>

      {/* Skill heat — click any row to drill into that skill */}
      {byCat.size > 0 && (
        <section className="card p-5 mb-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="eyebrow">Team-average skill scores</div>
            <div className="flex items-center gap-3">
              <span className="meta">click a row to filter AEs</span>
              <Link href="/admin/analyze/full/skills" className="text-xs link">See all →</Link>
            </div>
          </div>
          <ul className="space-y-2">
            {Array.from(byCat.entries()).map(([cat, { sum, n }]) => {
              const avg = Math.round(sum / n);
              return (
                <li key={cat}>
                  <div className="flex items-center gap-3 text-sm hover:bg-brand-indigo/5 rounded-brand p-1 -m-1 transition-colors">
                    <AnalyzeDrillTrigger kind="skill" category={cat} min={0} max={100}>
                      <div className="flex items-center gap-3 flex-1 cursor-pointer">
                        <span className="w-44 font-semibold">{cat.replace(/_/g, " ")}</span>
                        <div className="flex-1 h-2 bg-ink-softLine rounded-full overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${avg}%`,
                              background: avg >= 70 ? "#0E9F6E" : avg >= 50 ? "#1F3C88" : avg >= 30 ? "#F59E0B" : "#DC2626",
                            }}
                          />
                        </div>
                        <span className="font-mono w-10 text-right">{avg}</span>
                        <span className="meta w-16 text-right">n={n}</span>
                      </div>
                    </AnalyzeDrillTrigger>
                    <SkillInfoButton category={cat} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recent activity — last 10 with client-side search across 50 */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="eyebrow">Recent activity</div>
          <span className="meta">{audit.length} most recent · type to search</span>
        </div>
        <ActivitySearch entries={auditForClient} />
      </section>
    </div>
  );
}

function StatLink({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="card-hover p-4 block">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-3xl font-bold mt-1">{value}</div>
    </Link>
  );
}

function StatDrawer({ label, value, kind }: { label: string; value: number; kind: "orgs" | "users" | "aes" | "products" | "articles" | "files" | "questions" | "reviews" | "tasks" }) {
  return (
    <StatCardTrigger kind={kind}>
      <div className="card-hover p-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow">{label}</div>
          <svg className="w-3.5 h-3.5 text-ink-muted" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-display text-3xl font-bold mt-1">{value}</div>
      </div>
    </StatCardTrigger>
  );
}

function DistCard({ title, type, seeAllHref, rows, total }: { title: string; type?: "DISC" | "ENNEAGRAM" | "MBTI"; seeAllHref?: string; rows: Array<[string, number]>; total: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">{title}</div>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-xs link">See all →</Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No data yet — synthesize some profiles first.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.slice(0, 9).map(([k, n]) => (
            <li key={k}>
              <div className="flex items-center gap-2 hover:bg-brand-indigo/5 rounded-brand px-1 py-0.5 -mx-1 transition-colors">
                {type ? (
                  <AnalyzeDrillTrigger kind="personality" type={type} value={k}>
                    <div className="flex items-baseline justify-between flex-1 cursor-pointer">
                      <span className="font-mono">{k}</span>
                      <span className="meta">{n} ({total > 0 ? Math.round((n / total) * 100) : 0}%)</span>
                    </div>
                  </AnalyzeDrillTrigger>
                ) : (
                  <div className="flex items-baseline justify-between flex-1">
                    <span className="font-mono">{k}</span>
                    <span className="meta">{n} ({total > 0 ? Math.round((n / total) * 100) : 0}%)</span>
                  </div>
                )}
                {type && <PersonalityInfoButton framework={type} code={k} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
