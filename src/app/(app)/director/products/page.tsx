import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { ProductCreator } from "./ProductCreator";
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const products = await prisma.product.findMany({
    where: { orgId: ctx.effectiveOrgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl mx-auto p-8">
      <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold mt-1">Products</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Each product can have its own product-knowledge questions and a knowledge-library section.
      </p>

      <ProductCreator />

      {products.length === 0 ? (
        <div className="card p-12 mt-6 text-center text-sm text-ink-muted">No products yet. Create one above.</div>
      ) : (
        <ul className="space-y-2 mt-6">
          {products.map((p) => (
            <Link key={p.id} href={`/director/products/${p.id}`} className="card-hover p-4 block">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-semibold">{p.name}</h2>
                <span className="meta font-mono">{p.slug}{p.active ? "" : " · inactive"}</span>
              </div>
              {p.summary && <p className="text-sm text-ink-slate mt-1 line-clamp-2">{p.summary}</p>}
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}
