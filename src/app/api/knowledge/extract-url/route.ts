/**
 * POST /api/knowledge/extract-url
 * Body: { repositoryId, url }
 *
 * v3.11: We DO NOT fetch the URL server-side anymore — too many sites block
 * server-side fetching (Cloudflare, paywalls, etc.). We send the URL straight
 * to Grok and let it produce an article from what it knows about the page.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { articleFromUrl } from "@/lib/ai";

const Body = z.object({
  repositoryId: z.string(),
  url: z.string().url(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const repo = await prisma.knowledgeRepository.findUnique({ where: { id: parsed.data.repositoryId } });
  if (!repo || repo.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  try {
    const result = await articleFromUrl({
      url: parsed.data.url,
      repositoryKind: repo.kind as any,
      repositoryName: repo.name,
    });
    return NextResponse.json({
      result: {
        title: result.title,
        body: result.body,
        tags: result.tags,
        summary: result.summary,
      },
      confidence: result.confidence ?? "medium",
      sourceUrl: parsed.data.url,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `AI extraction failed: ${err?.message ?? "unknown"}` }, { status: 502 });
  }
}
