import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { NewRepoButton } from "./NewRepoButton";

const KIND_META: Record<string, { label: string; description: string; emoji: string }> = {
  PRODUCT: { label: "Product Knowledge", description: "Specs, value props, demo flows.", emoji: "📦" },
  SALES_SKILL: { label: "Sales Skills", description: "Best practices, role-plays, frameworks.", emoji: "🎯" },
  PERSONALITY: { label: "Personality (Director-Only)", description: "Coaching tips by personality. Never shown to AEs.", emoji: "🧠" },
  LEADERSHIP: { label: "Leadership", description: "For directors. Forecasting, team-building.", emoji: "🧭" },
  CUSTOM: { label: "Custom", description: "Org-defined library.", emoji: "✨" },
};

export default async function KnowledgeIndex() {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const canAdmin = ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN";

  const repos = await prisma.knowledgeRepository.findMany({
    where: { orgId: ctx.effectiveOrgId },
    include: { _count: { select: { articles: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="page">
      <header className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Library</div>
          <h1 className="h-page">Knowledge Repositories</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Curate the content that powers AI recommendations.
            Personality and Leadership content stays director-only.
          </p>
        </div>
        {canAdmin && <NewRepoButton />}
      </header>

      {repos.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="font-display text-lg font-semibold mb-1">No repositories yet</div>
          <p className="text-sm text-ink-muted">
            {canAdmin ? "Create your first one above." : "Your org admin needs to create one."}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {repos.map((r) => {
            const meta = KIND_META[r.kind] ?? KIND_META.CUSTOM;
            return (
              <Link
                key={r.id}
                href={`/director/knowledge/repos/${r.id}`}
                className="card-hover p-5 flex items-start gap-3"
              >
                <div className="text-2xl shrink-0">{meta.emoji}</div>
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="h-card">{r.name}</h2>
                    <span className="meta">{r._count.articles} articles</span>
                  </div>
                  <p className="text-sm text-ink-muted mt-1">{r.description ?? meta.description}</p>
                  <div className="mt-2 flex gap-1.5">
                    <span className="badge-neutral text-[10px]">{r.kind.replace("_", " ")}</span>
                    {r.visibility === "DIRECTOR_ONLY" && (
                      <span className="badge-warning text-[10px]">Director-only</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
