import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { EditArticleForm } from "./EditArticleForm";

export default async function EditArticlePage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: params.id },
    include: { repository: true },
  });
  if (!article || article.orgId !== ctx.effectiveOrgId) notFound();

  const canEdit =
    ctx.role === "ORG_ADMIN" ||
    ctx.role === "COMPANY_ADMIN" ||
    article.authorUserId === ctx.userId;

  if (!canEdit) {
    return (
      <div className="page max-w-2xl">
        <div className="card p-8 text-center">
          <h1 className="h-section">Read-only</h1>
          <p className="text-sm text-ink-muted mt-2">Only the author or an admin can edit this article.</p>
          <Link href={`/director/knowledge/repos/${article.repository.id}`} className="btn-secondary mt-4 inline-flex">← Back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page max-w-3xl">
      <Link href={`/director/knowledge/repos/${article.repository.id}`} className="link text-sm">
        ← {article.repository.name}
      </Link>
      <h1 className="h-page mt-2">Edit article</h1>
      <EditArticleForm article={article as any} />
    </div>
  );
}
