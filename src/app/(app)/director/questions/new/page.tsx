import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { NewQuestionForm } from "./NewQuestionForm";

export default async function NewQuestionPage({
  searchParams,
}: {
  searchParams: { category?: string; productId?: string; targetOrgId?: string };
}) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  // ORG_ADMIN can author into a specific customer org via ?targetOrgId=
  const targetOrgId =
    ctx.role === "ORG_ADMIN" && searchParams.targetOrgId ? searchParams.targetOrgId : undefined;
  const targetOrg = targetOrgId
    ? await prisma.org.findUnique({ where: { id: targetOrgId }, select: { id: true, name: true } })
    : null;

  // Products are scoped to whichever org we're authoring into
  const productOrgId = targetOrgId ?? ctx.effectiveOrgId;
  const products = await prisma.product.findMany({
    where: { orgId: productOrgId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page max-w-3xl">
      <Link href="/director/questions" className="link text-sm">← Back to Question Bank</Link>
      <h1 className="h-page mt-2">New Question</h1>
      <p className="mt-1 text-sm text-ink-muted mb-6">
        Author a single question, or generate a batch with AI and edit before saving.
      </p>
      <Suspense fallback={<div className="card p-6">Loading…</div>}>
        <NewQuestionForm
          presetCategory={searchParams.category}
          presetProductId={searchParams.productId}
          targetOrgId={targetOrg?.id}
          targetOrgName={targetOrg?.name}
          products={products}
        />
      </Suspense>
    </div>
  );
}
