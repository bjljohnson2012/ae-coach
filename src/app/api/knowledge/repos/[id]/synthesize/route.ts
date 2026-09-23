/**
 * POST /api/knowledge/repos/[id]/synthesize  (multipart/form-data)
 * Each uploaded file is processed via its OWN Grok call (per-file synthesis).
 * Returns per-file outcomes so the client can show progress + which failed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { extractText } from "@/lib/files";
import { extractArticleMetadata } from "@/lib/ai";

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

  const repo = await prisma.knowledgeRepository.findUnique({ where: { id: params.id } });
  if (!repo || repo.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });

  const outcomes: FileOutcome[] = [];
  const isAdmin = ctx.role === "COMPANY_ADMIN" || ctx.role === "ORG_ADMIN";

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

    // One Grok call per file (isolated)
    let meta;
    try {
      meta = await extractArticleMetadata({
        rawText: text,
        repositoryKind: repo.kind as any,
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
          title: meta.title,
          body: meta.body,
          tagsJson: (meta.tags ?? ["imported"]) as any,
          authorUserId: ctx.userId,
          status: isAdmin ? "APPROVED" : "PENDING",
          approvedByUserId: isAdmin ? ctx.userId : null,
          approvedAt: isAdmin ? new Date() : null,
        },
      });
      outcomes.push({ filename: file.name, status: "ok", articleId: article.id, title: meta.title });
    } catch (e: any) {
      outcomes.push({ filename: file.name, status: "failed", reason: `DB: ${e?.message ?? "unknown"}` });
    }
  }

  const ok = outcomes.filter((o) => o.status === "ok").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;

  return NextResponse.json({
    ok: ok > 0,
    summary: `${ok} created · ${failed} failed · ${skipped} skipped`,
    outcomes,
  });
}
