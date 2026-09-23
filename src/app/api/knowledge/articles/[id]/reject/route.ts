import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({ reason: z.string().max(1000).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const reason = parsed.success ? parsed.data.reason : undefined;

  const article = await prisma.knowledgeArticle.findUnique({ where: { id: params.id } });
  if (!article || (ctx.role !== "ORG_ADMIN" && article.orgId !== ctx.effectiveOrgId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.knowledgeArticle.update({
    where: { id: params.id },
    data: { status: "REJECTED", rejectedReason: reason ?? null },
  });
  await prisma.auditLog.create({
    data: {
      orgId: article.orgId,
      actorUserId: ctx.userId,
      action: "KNOWLEDGE_ARTICLE_REJECTED",
      targetType: "KnowledgeArticle",
      targetId: article.id,
      metadata: { reason: reason ?? null },
    },
  });
  return NextResponse.json({ ok: true });
}
