/**
 * GET  /api/knowledge/repos      — list this org's repos
 * POST /api/knowledge/repos      — create new (custom or rename existing)
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET() {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const repos = await prisma.knowledgeRepository.findMany({
    where: { orgId: ctx.effectiveOrgId },
    include: { _count: { select: { articles: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ repos });
}

const CreateBody = z.object({
  name: z.string().min(2).max(80),
  kind: z.enum(["PRODUCT", "SALES_SKILL", "PERSONALITY", "LEADERSHIP", "CUSTOM"]).default("CUSTOM"),
  description: z.string().max(500).optional(),
  visibility: z.enum(["AE_ONLY", "DIRECTOR_ONLY", "BOTH"]).default("BOTH"),
});

export async function POST(req: Request) {
  const ctx = await requireRole("COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  // Personality default to DIRECTOR_ONLY for safety
  const visibility =
    parsed.data.kind === "PERSONALITY" ? "DIRECTOR_ONLY" : parsed.data.visibility;

  try {
    const repo = await prisma.knowledgeRepository.create({
      data: {
        orgId: ctx.effectiveOrgId,
        kind: parsed.data.kind as any,
        name: parsed.data.name,
        description: parsed.data.description,
        visibility: visibility as any,
      },
    });
    return NextResponse.json({ repo });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A repo with that name already exists in this org." }, { status: 409 });
    }
    throw e;
  }
}
