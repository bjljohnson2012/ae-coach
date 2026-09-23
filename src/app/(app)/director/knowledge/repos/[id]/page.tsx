import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ArticleCreator } from "./ArticleCreator";
import { RepoSynthesizer } from "./RepoSynthesizer";
import { ApprovalActions } from "./ApprovalActions";

export default async function RepoDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const canAdmin = ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN";

  const repo = await prisma.knowledgeRepository.findUnique({
    where: { id: params.id },
    include: {
      articles: {
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        include: {
          product: { select: { name: true } },
          author: { select: { name: true } },
        },
      },
    },
  });
  if (!repo || repo.orgId !== ctx.effectiveOrgId) notFound();

  // Non-admins only see APPROVED articles
  const visibleArticles = canAdmin
    ? repo.articles
    : repo.articles.filter((a) => a.status === "APPROVED" || a.authorUserId === ctx.userId);

  const pending = visibleArticles.filter((a) => a.status === "PENDING");
  const approved = visibleArticles.filter((a) => a.status === "APPROVED");
  const rejected = visibleArticles.filter((a) => a.status === "REJECTED");

  return (
    <div className="page">
      <Link href="/director/knowledge" className="link text-sm">← All repositories</Link>
      <div className="flex items-end justify-between mt-2 mb-6 flex-wrap gap-3">
        <div>
          <div className="eyebrow mb-1">{repo.kind.replace("_", " ")}{repo.visibility === "DIRECTOR_ONLY" ? " · Director-only" : ""}</div>
          <h1 className="h-page">{repo.name}</h1>
          {repo.description && <p className="mt-1 text-sm text-ink-muted">{repo.description}</p>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <ArticleCreator repositoryId={repo.id} repositoryName={repo.name} />
        <RepoSynthesizer repositoryId={repo.id} repositoryName={repo.name} />
      </div>

      {/* Pending approval queue — admins only */}
      {canAdmin && pending.length > 0 && (
        <section className="card overflow-hidden mt-6 border-brand-amber/40">
          <header className="px-5 py-3 border-b border-brand-amber/30 bg-brand-amber/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold">Pending approval</span>
              <span className="badge-warning">{pending.length}</span>
            </div>
            <span className="meta">Approve or reject before they appear in the listing.</span>
          </header>
          <ul className="divide-y divide-ink-softLine">
            {pending.map((a) => (
              <li key={a.id} className="px-5 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/director/knowledge/articles/${a.id}`} className="font-medium text-ink hover:underline">
                    {a.title}
                  </Link>
                  <p className="text-sm text-ink-slate mt-1 line-clamp-2 whitespace-pre-wrap">{a.body}</p>
                  <div className="meta mt-1.5">
                    Submitted by {a.author?.name ?? "—"} · {a.updatedAt.toLocaleDateString()}
                  </div>
                </div>
                <ApprovalActions articleId={a.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Approved articles */}
      {approved.length === 0 && pending.length === 0 ? (
        <div className="card p-12 text-center mt-6">
          <p className="text-sm text-ink-muted">No articles yet. Add one above.</p>
        </div>
      ) : approved.length > 0 ? (
        <ul className="space-y-3 mt-6">
          {approved.map((a) => (
            <li key={a.id} className="card-hover p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/director/knowledge/articles/${a.id}`} className="block group">
                    <h3 className="h-card group-hover:text-brand-indigo transition-colors">{a.title}</h3>
                    <p className="text-sm text-ink-slate mt-1.5 line-clamp-3 whitespace-pre-wrap">{a.body}</p>
                  </Link>
                  <div className="meta mt-2">
                    {a.product?.name ? `${a.product.name} · ` : ""}
                    {a.author?.name ?? "—"} · {a.updatedAt.toLocaleDateString()}
                    {Array.isArray(a.tagsJson) && (a.tagsJson as string[]).length > 0 && (
                      <> · {(a.tagsJson as string[]).slice(0, 4).join(", ")}</>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Link href={`/director/knowledge/articles/${a.id}`} className="btn-ghost text-xs">View</Link>
                  {(canAdmin || a.authorUserId === ctx.userId) && (
                    <Link href={`/director/knowledge/articles/${a.id}/edit`} className="btn-ghost text-xs">Edit</Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Rejected — admins see for context */}
      {canAdmin && rejected.length > 0 && (
        <section className="mt-6">
          <details>
            <summary className="cursor-pointer text-sm text-ink-muted py-2">Rejected ({rejected.length})</summary>
            <ul className="divide-y divide-ink-softLine card overflow-hidden mt-2">
              {rejected.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <div className="font-medium line-through text-ink-muted">{a.title}</div>
                  {a.rejectedReason && <div className="text-xs text-brand-red">Reason: {a.rejectedReason}</div>}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
