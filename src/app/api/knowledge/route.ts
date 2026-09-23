/**
 * GET  /api/knowledge?kind=PRODUCT|SALES_SKILL|PERSONALITY|LEADERSHIP&q=search
 * POST /api/knowledge — create article
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  const q = searchParams.get("q");

  const repo = kind
    ? await prisma.knowledgeRepository.findFirst({
        where: { orgId: ctx.effectiveOrgId, kind: kind as any },
      })
    : null;

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      orgId: ctx.effectiveOrgId,
      ...(repo ? { repositoryId: repo.id } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { product: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ articles });
}

const Body = z.object({
  kind: z.enum(["PRODUCT", "SALES_SKILL", "PERSONALITY", "LEADERSHIP"]),
  title: z.string().min(2),
  body: z.string().min(10),
  productId: z.string().optional(),
  skillCategory: z.string().optional(),
  tagsJson: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Ensure a default-named repo of this kind exists (idempotent by name)
  const defaultName = defaultRepoName(parsed.data.kind);
  const repo = await prisma.knowledgeRepository.upsert({
    where: { orgId_name: { orgId: ctx.effectiveOrgId, name: defaultName } },
    update: {},
    create: { orgId: ctx.effectiveOrgId, kind: parsed.data.kind, name: defaultName },
  });

  const article = await prisma.knowledgeArticle.create({
    data: {
      orgId: ctx.effectiveOrgId,
      repositoryId: repo.id,
      title: parsed.data.title,
      body: parsed.data.body,
      productId: parsed.data.productId,
      skillCategory: parsed.data.skillCategory as any,
      tagsJson: parsed.data.tagsJson as any,
      authorUserId: ctx.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: ctx.effectiveOrgId,
      actorUserId: ctx.userId,
      action: "KNOWLEDGE_ARTICLE_CREATED",
      targetType: "KnowledgeArticle",
      targetId: article.id,
      metadata: { kind: parsed.data.kind },
    },
  });

  return NextResponse.json({ article });
}

function defaultRepoName(kind: string) {
  switch (kind) {
    case "PRODUCT": return "Product Knowledge";
    case "SALES_SKILL": return "Sales Skills";
    case "PERSONALITY": return "Personality (Director-Only)";
    case "LEADERSHIP": return "Leadership";
    default: return kind;
  }
}
