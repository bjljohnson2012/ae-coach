/**
 * POST /api/products/[id]/synthesize  (multipart/form-data)
 *
 * v3.11 refactor: each file gets its OWN Grok summarization call (lower
 * token risk, per-file failure isolation). Then a single small follow-up
 * call assembles a Product Brief from the per-file summaries.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { extractText } from "@/lib/files";
import { extractArticleMetadata, synthesizeProductBrief } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_BYTES = 50 * 1024 * 1024;

interface FileOutcome {
  filename: string;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  articleId?: string;
  title?: string;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product || product.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

  // Find or create the org's PRODUCT repo
  let repo = await prisma.knowledgeRepository.findFirst({
    where: { orgId: ctx.effectiveOrgId, kind: "PRODUCT" },
  });
  if (!repo) {
    repo = await prisma.knowledgeRepository.create({
      data: { orgId: ctx.effectiveOrgId, kind: "PRODUCT", name: "Product Knowledge" },
    });
  }

  // ── Per-file: extract text → Grok summarize → save as KnowledgeArticle ──
  const outcomes: FileOutcome[] = [];
  const summaries: Array<{ filename: string; summary: string; title: string }> = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      outcomes.push({ filename: file.name, status: "skipped", reason: "Over 50 MB" });
      continue;
    }
    let text = "";
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      text = await extractText(file.name, file.type, buf);
    } catch (e: any) {
      outcomes.push({ filename: file.name, status: "failed", reason: `Text extract: ${e?.message ?? "unknown"}` });
      continue;
    }
    if (!text || text.length < 30) {
      outcomes.push({ filename: file.name, status: "skipped", reason: "Empty / too little text" });
      continue;
    }

    // Per-file Grok call (isolated; one failure doesn't block the rest)
    let meta;
    try {
      meta = await extractArticleMetadata({
        rawText: text,
        repositoryKind: "PRODUCT",
        repositoryName: repo.name,
        filename: file.name,
      });
    } catch (e: any) {
      outcomes.push({ filename: file.name, status: "failed", reason: `AI: ${e?.message ?? "unknown"}` });
      continue;
    }

    try {
      const article = await prisma.knowledgeArticle.create({
        data: {
          orgId: ctx.effectiveOrgId,
          repositoryId: repo.id,
          productId: product.id,
          title: meta.title,
          body: meta.body,
          tagsJson: ["product", "imported", ...(meta.tags ?? [])] as any,
          authorUserId: ctx.userId,
          status: "APPROVED",
          approvedByUserId: ctx.userId,
          approvedAt: new Date(),
        },
      });
      outcomes.push({ filename: file.name, status: "ok", articleId: article.id, title: meta.title });
      summaries.push({ filename: file.name, summary: meta.summary || meta.body.slice(0, 240), title: meta.title });
    } catch (e: any) {
      outcomes.push({ filename: file.name, status: "failed", reason: `DB: ${e?.message ?? "unknown"}` });
    }
  }

  if (summaries.length === 0) {
    const failed = outcomes.filter((o) => o.status !== "ok");
    return NextResponse.json({
      ok: false,
      summary: `0 articles created. ${failed.length} file(s) failed or skipped.`,
      outcomes,
    }, { status: 502 });
  }

  // ── Master brief — small payload, just summaries (not full text) ──
  let brief: any | null = null;
  let briefArticleId: string | null = null;
  try {
    brief = await synthesizeProductBrief({
      productName: product.name,
      audience: product.audience ?? undefined,
      // Send summaries, not full text — keeps the call cheap and reliable
      sourceTexts: summaries.map((s) => ({ filename: s.filename, text: s.summary })),
    });

    const briefBody = [
      `## Summary`, brief.summary, ``,
      `## Key value propositions`,
      ...((brief.keyValueProps ?? []).map((v: string) => `- ${v}`)),
      ``,
      `## Audience fit`,
      ...((brief.audienceFit ?? []).map((v: string) => `- ${v}`)),
      ``,
      `## Common objections`,
      ...((brief.commonObjections ?? []).map((v: string) => `- ${v}`)),
      ``,
      `## Competitive differentiators`,
      ...((brief.competitiveDifferentiators ?? []).map((v: string) => `- ${v}`)),
      ``,
      `## Demo flow`,
      ...((brief.demoFlow ?? []).map((v: string, i: number) => `${i + 1}. ${v}`)),
    ].join("\n");

    const briefArticle = await prisma.knowledgeArticle.create({
      data: {
        orgId: ctx.effectiveOrgId,
        repositoryId: repo.id,
        productId: product.id,
        title: `${product.name} — Product Brief`,
        body: briefBody,
        tagsJson: ["brief", "synthesized", "product"] as any,
        authorUserId: ctx.userId,
        status: "APPROVED",
        approvedByUserId: ctx.userId,
        approvedAt: new Date(),
      },
    });
    briefArticleId = briefArticle.id;

    // Also fold the synthesized summary back onto the Product if empty
    if (!product.summary) {
      await prisma.product.update({ where: { id: product.id }, data: { summary: brief.summary } });
    }
  } catch (e: any) {
    // Brief failed but per-file articles saved — that's still a useful result
    console.warn("[product synthesize] master brief failed:", e?.message);
  }

  const ok = outcomes.filter((o) => o.status === "ok").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;

  return NextResponse.json({
    ok: true,
    summary: `${ok} article${ok === 1 ? "" : "s"} created · ${failed} failed · ${skipped} skipped${brief ? " · brief generated" : " · brief generation failed (articles saved)"}`,
    outcomes,
    brief: briefArticleId ? { id: briefArticleId, title: `${product.name} — Product Brief` } : null,
  });
}
