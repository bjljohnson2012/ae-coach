/**
 * /knowledge/articles/[id] — AE-accessible article reader, v3.37.3.
 *
 * Shows a single approved article. Hard rules:
 *   - Tenant boundary: must be in the user's org (ORG_ADMIN bypasses).
 *   - AE-only: APPROVED status required + PERSONALITY repos forbidden.
 *
 * Editors keep using /director/knowledge/articles/[id]/edit — this is a
 * read-only surface. Leaders can land here too; the existing /director/...
 * route still works for authoring.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Markdown } from "@/components/Markdown";

export default async function AeArticleViewPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: params.id },
    include: {
      repository: { select: { id: true, name: true, kind: true } },
      product: { select: { id: true, name: true } },
      author: { select: { name: true } },
    },
  });
  if (!article) notFound();

  // Tenant boundary — never leak across orgs.
  if (ctx.role !== "ORG_ADMIN" && article.orgId !== ctx.effectiveOrgId) {
    notFound();
  }

  // AE permission gates: only APPROVED articles + no PERSONALITY repos.
  if (ctx.role === "AE") {
    if (article.status !== "APPROVED") notFound();
    if (article.repository.kind === "PERSONALITY") notFound();
  }

  const tags = Array.isArray(article.tagsJson) ? (article.tagsJson as string[]) : [];

  return (
    <div className="page max-w-3xl">
      <header className="mb-5">
        <Link href="/knowledge" className="link text-sm">← Library</Link>
        <h1 className="h-page mt-2">{article.title}</h1>
        <div className="meta mt-1.5">
          {article.repository.name}
          {article.product?.name ? <> · {article.product.name}</> : null}
          {article.author?.name ? <> · {article.author.name}</> : null}
          {" · updated "}{article.updatedAt.toLocaleDateString()}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags
              // Hide internal mirror markers like bf:<id>
              .filter((t) => !t.startsWith("bf:"))
              .map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-brand-indigo/10 text-brand-indigo font-mono">
                  {t}
                </span>
              ))}
          </div>
        )}
      </header>

      <article className="card p-6 text-base">
        <Markdown source={article.body} />
      </article>
    </div>
  );
}
