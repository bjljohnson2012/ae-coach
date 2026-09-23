/**
 * DELETE /api/orgs/[id]/skills/[category]/files/[fileId]
 *
 * Remove a benchmark reference file. Doesn't delete the binary from disk
 * (those are cleaned up by a separate sweep) but removes the DB row so the
 * file no longer feeds AI synth.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { unmirrorBenchmarkFile } from "@/lib/knowledgeMirror";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; category: string; fileId: string } },
) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  if (ctx.role === "COMPANY_ADMIN" && ctx.effectiveOrgId !== params.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the file belongs to this org's benchmark for this category
  const file = await prisma.orgSkillBenchmarkFile.findUnique({
    where: { id: params.fileId },
    include: { benchmark: { select: { orgId: true, category: true } } },
  });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (file.benchmark.orgId !== params.id || file.benchmark.category !== params.category) {
    return NextResponse.json({ error: "Mismatched route" }, { status: 400 });
  }

  await prisma.orgSkillBenchmarkFile.delete({ where: { id: params.fileId } });

  // v3.37 — clean up the mirrored knowledge article so the library stays in sync.
  void unmirrorBenchmarkFile(params.id, params.fileId).catch((err) => {
    console.error("[knowledge-mirror] unmirror failed", err?.message);
  });

  return NextResponse.json({ ok: true });
}
