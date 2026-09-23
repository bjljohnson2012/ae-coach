import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ProductImporter } from "./ProductImporter";
import { ProductEditor } from "./ProductEditor";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      articles: {
        orderBy: { updatedAt: "desc" },
      },
      questions: {
        where: { active: true },
        select: { id: true, text: true, questionType: true, category: true },
      },
    },
  });
  if (!product || product.orgId !== ctx.effectiveOrgId) notFound();

  const brief = product.articles.find((a) => Array.isArray(a.tagsJson) && (a.tagsJson as string[]).includes("brief"));
  const sources = product.articles.filter((a) => a.id !== brief?.id);

  return (
    <div className="page">
      <Link href="/director/products" className="link text-sm">← All products</Link>
      <header className="flex items-end justify-between mt-2 mb-6 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-2">Product</div>
          <h1 className="h-page">{product.name}</h1>
          <div className="meta mt-1 font-mono">{product.slug}{product.active ? "" : " · inactive"}</div>
          {product.summary && <p className="mt-3 text-sm text-ink-slate max-w-3xl">{product.summary}</p>}
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <ProductImporter productId={product.id} productName={product.name} />

          {brief && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="eyebrow">Product brief</div>
                  <h2 className="h-section mt-1">{brief.title}</h2>
                </div>
                <Link href={`/director/knowledge/articles/${brief.id}/edit`} className="btn-ghost text-xs">Edit</Link>
              </div>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-ink-slate">{brief.body}</div>
            </section>
          )}

          {sources.length > 0 && (
            <section className="card p-5">
              <div className="eyebrow mb-3">Source artifacts ({sources.length})</div>
              <ul className="space-y-2">
                {sources.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between text-sm py-2 border-b border-ink-softLine last:border-0">
                    <Link href={`/director/knowledge/articles/${a.id}/edit`} className="link">{a.title}</Link>
                    <span className="meta">{a.updatedAt.toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <ProductEditor product={{ id: product.id, name: product.name, summary: product.summary, audience: product.audience, active: product.active }} />

          <section className="card p-5">
            <div className="eyebrow mb-2">Product-knowledge questions</div>
            <p className="text-sm text-ink-muted mb-3">Quiz questions tied to this product.</p>
            {product.questions.length === 0 ? (
              <p className="meta">None yet.</p>
            ) : (
              <ul className="text-sm space-y-1.5">
                {product.questions.slice(0, 6).map((q) => (
                  <li key={q.id} className="text-ink-slate line-clamp-1">• {q.text}</li>
                ))}
              </ul>
            )}
            <Link href={`/director/questions/new?category=PRODUCT_KNOWLEDGE&productId=${product.id}`} className="btn-secondary text-xs mt-3">
              + Add question
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
