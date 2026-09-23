import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: params.id } });
  if (!article || (ctx.role !== "ORG_ADMIN" && article.orgId !== ctx.effectiveOrgId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.knowledgeArticle.update({
    where: { id: params.id },
    data: { status: "APPROVED", approvedByUserId: ctx.userId, approvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: {
      orgId: article.orgId,
      actorUserId: ctx.userId,
      action: "KNOWLEDGE_ARTICLE_APPROVED",
      targetType: "KnowledgeArticle",
      targetId: article.id,
    },
  });
  return NextResponse.json({ ok: true });
}
