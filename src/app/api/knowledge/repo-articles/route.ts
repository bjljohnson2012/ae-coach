/**
 * Create an article in a specific repo (by repositoryId).
 * Different from /api/knowledge POST which finds-or-creates the kind-default repo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  repositoryId: z.string(),
  title: z.string().min(2),
  body: z.string().min(10),
  tagsJson: z.array(z.string()).default([]),
  productId: z.string().optional(),
  skillCategory: z.string().optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const repo = await prisma.knowledgeRepository.findUnique({ where: { id: parsed.data.repositoryId } });
  if (!repo || repo.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  // Admins auto-approve their own creations; everyone else lands in PENDING.
  const autoApprove = ctx.role === "ORG_ADMIN" || ctx.role === "COMPANY_ADMIN";

  const article = await prisma.knowledgeArticle.create({
    data: {
      orgId: ctx.effectiveOrgId,
      repositoryId: repo.id,
      title: parsed.data.title,
      body: parsed.data.body,
      tagsJson: parsed.data.tagsJson as any,
      productId: parsed.data.productId,
      skillCategory: parsed.data.skillCategory as any,
      authorUserId: ctx.userId,
      status: autoApprove ? "APPROVED" : "PENDING",
      approvedByUserId: autoApprove ? ctx.userId : null,
      approvedAt: autoApprove ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: ctx.effectiveOrgId,
      actorUserId: ctx.userId,
      action: "KNOWLEDGE_ARTICLE_CREATED",
      targetType: "KnowledgeArticle",
      targetId: article.id,
      metadata: { repositoryId: repo.id, kind: repo.kind },
    },
  });

  return NextResponse.json({ article });
}
