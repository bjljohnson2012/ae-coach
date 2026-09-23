/**
 * Legacy /director/knowledge/[kind] route — redirects to the canonical /repos/[id].
 * Kept so old bookmarks/links still work.
 */
import { redirect, notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function KnowledgeKindRedirect({ params }: { params: { kind: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const kind = params.kind.toUpperCase();
  // Find the first repo of this kind for the org
  const repo = await prisma.knowledgeRepository.findFirst({
    where: { orgId: ctx.effectiveOrgId, kind: kind as any },
  });
  if (!repo) notFound();
  redirect(`/director/knowledge/repos/${repo.id}`);
}
