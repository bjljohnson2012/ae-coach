/**
 * /knowledge — AE-accessible knowledge browser, v3.37.3.
 *
 * Lists every approved article in the user's org, grouped by repository,
 * filtered by what their role can see:
 *   - PERSONALITY repos are director-only — excluded for AEs.
 *   - Only APPROVED articles for AEs (drafts and pending stay hidden).
 *
 * Leaders see everything via /director/knowledge (the admin browser).
 * This page is the AE-side reading view — search-friendly, no edit affordances.
 */
import Link from "next/link";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

const KIND_META: Record<string, { label: string; emoji: string }> = {
  PRODUCT: { label: "Product", emoji: "📦" },
  SALES_SKILL: { label: "Sales Skills", emoji: "🎯" },
  LEADERSHIP: { label: "Leadership", emoji: "🧭" },
  CUSTOM: { label: "Custom", emoji: "✨" },
  // PERSONALITY intentionally omitted — never shown to AEs
};

export default async function AeKnowledgePage() {
  const ctx = await requireSession();

  // Build a permission-aware where clause. AEs get APPROVED only and never
  // PERSONALITY repos. Leaders see everything.
  const isLeader = ctx.role !== "AE";
  const orgId = ctx.role === "ORG_ADMIN" ? undefined : ctx.effectiveOrgId;

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      ...(isLeader ? {} : { status: "APPROVED" }),
      ...(isLeader ? {} : { repository: { kind: { not: "PERSONALITY" } } }),
    },
    include: {
      repository: { select: { id: true, name: true, kind: true, description: true } },
      product: { select: { name: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  // Group by repository
  const byRepo = new Map<string, { repo: { id: string; name: string; kind: string; description: string | null }; articles: typeof articles }>();
  for (const a of articles) {
    const k = a.repository.id;
    if (!byRepo.has(k)) byRepo.set(k, { repo: a.repository, articles: [] });
    byRepo.get(k)!.articles.push(a);
  }
  const groups = Array.from(byRepo.values()).sort((a, b) => a.repo.name.localeCompare(b.repo.name));

  return (
    <div className="page max-w-4xl">
      <header className="mb-6">
        <div className="eyebrow mb-2">Knowledge</div>
        <h1 className="h-page">Library</h1>
        <p className="text-sm text-ink-muted mt-1">
          Approved playbooks, value props, and frameworks from your org. Use
          <kbd className="mx-1 px-1.5 py-0.5 rounded border border-ink-softLine bg-surface-soft text-xs font-mono">⌘K</kbd>
          to search across everything.
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">
            Nothing here yet. Your director will add articles you can read soon.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ repo, articles }) => {
            const meta = KIND_META[repo.kind] ?? { label: repo.kind, emoji: "📚" };
            return (
              <section key={repo.id} className="card overflow-hidden">
                <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-display font-semibold flex items-center gap-2">
                      <span aria-hidden="true">{meta.emoji}</span>
                      <span>{repo.name}</span>
                    </div>
                    {repo.description && <p className="meta mt-0.5">{repo.description}</p>}
                  </div>
                  <span className="meta">{articles.length} article{articles.length === 1 ? "" : "s"}</span>
                </header>
                <ul className="divide-y divide-ink-softLine">
                  {articles.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/knowledge/articles/${a.id}`}
                        className="px-5 py-3 flex items-baseline justify-between gap-3 hover:bg-brand-indigo/5 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-ink truncate">{a.title}</div>
                          <div className="meta">
                            {a.product?.name ? <>{a.product.name} · </> : null}
                            updated {a.updatedAt.toLocaleDateString()}
                          </div>
                        </div>
                        <span className="text-ink-muted shrink-0">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
