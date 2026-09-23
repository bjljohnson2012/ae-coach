import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { Markdown } from "@/components/Markdown";

export default async function ArticleViewPage({ params }: { params: { id: string } }) {
  const ctx = await requireSession();

  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: params.id },
    include: {
      repository: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      author: { select: { name: true } },
    },
  });
  if (!article) notFound();

  // Tenant boundary
  if (ctx.role !== "ORG_ADMIN" && article.orgId !== ctx.effectiveOrgId) {
    notFound();
  }

  // AE can only see APPROVED articles in repos that aren't director-only
  if (ctx.role === "AE" && article.status !== "APPROVED") {
    notFound();
  }

  const tags = Array.isArray(article.tagsJson) ? (article.tagsJson as string[]) : [];
  const canEdit =
    ctx.role === "ORG_ADMIN" ||
    ctx.role === "COMPANY_ADMIN" ||
    article.authorUserId === ctx.userId;

  return (
    <div className="page max-w-3xl">
      <header className="mb-5">
        <Link href={`/director/knowledge/repos/${article.repository.id}`} className="link text-sm">
          ← {article.repository.name}
        </Link>
        <div className="flex items-start justify-between gap-3 mt-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="h-page">{article.title}</h1>
            <div className="meta mt-1.5">
              {article.product?.name ? <>{article.product.name} · </> : null}
              {article.author?.name ?? "—"}
              {" · "}
              {article.updatedAt.toLocaleDateString()}
              {article.status !== "APPROVED" && (
                <span className="ml-2 badge-warning">{article.status.toLowerCase()}</span>
              )}
            </div>
          </div>
          {canEdit && (
            <Link href={`/director/knowledge/articles/${article.id}/edit`} className="btn-secondary text-sm">
              Edit
            </Link>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((t) => (
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
