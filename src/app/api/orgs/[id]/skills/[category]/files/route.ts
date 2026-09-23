/**
 * POST /api/orgs/[id]/skills/[category]/files
 *
 * multipart/form-data — field "file" — uploads a reference document for the
 * skill benchmark. Extracts text via the shared extractText pipeline and
 * stores it on OrgSkillBenchmarkFile so the AI synth can use it later
 * without re-extracting.
 *
 * If no OrgSkillBenchmark row exists yet for this (orgId, category), one is
 * created on the fly so the file has a parent.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { extractText, saveFileBuffer } from "@/lib/files";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";
import { mirrorBenchmarkFileToKnowledge } from "@/lib/knowledgeMirror";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: { id: string; category: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!getSkillBenchmark(params.category)) {
    return NextResponse.json({ error: "Unknown skill category" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25 MB" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let textPreview = "";
  try {
    textPreview = await extractText(file.name, file.type || "application/octet-stream", buffer);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Could not extract text: ${err?.message ?? "unknown"}` },
      { status: 422 }
    );
  }
  if (!textPreview || textPreview.length < 30) {
    return NextResponse.json(
      { error: "Extracted text was too short. Try a different format (PDF, DOCX, TXT)." },
      { status: 422 }
    );
  }

  // Persist the binary
  const { storagePath } = await saveFileBuffer(params.id, file.name, buffer);

  // Ensure the parent OrgSkillBenchmark row exists
  const benchmark = await prisma.orgSkillBenchmark.upsert({
    where: { orgId_category: { orgId: params.id, category: params.category } },
    update: {},
    create: { orgId: params.id, category: params.category },
  });

  const created = await prisma.orgSkillBenchmarkFile.create({
    data: {
      benchmarkId: benchmark.id,
      filename: file.name,
      storagePath,
      textPreview: textPreview.slice(0, 50000),
      uploadedByUserId: ctx.userId,
    },
    include: { uploadedBy: { select: { name: true } } },
  });

  // v3.37 — also surface this in the org's KnowledgeRepository so AEs and
  // directors browsing the knowledge library see the reference material.
  // Fire-and-forget: knowledge mirror failures shouldn't block the upload.
  void mirrorBenchmarkFileToKnowledge({
    orgId: params.id,
    category: params.category,
    benchmarkFileId: created.id,
    filename: file.name,
    text: textPreview,
    uploadedByUserId: ctx.userId,
  }).catch((err) => {
    console.error("[knowledge-mirror] failed", err?.message);
  });

  return NextResponse.json({ file: created });
}
