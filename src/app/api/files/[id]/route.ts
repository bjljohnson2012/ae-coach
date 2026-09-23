import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { deleteFile } from "@/lib/files";

const Patch = z.object({
  filename: z.string().min(1).optional(),
  kind: z.enum(["PHOTO", "AE_PREP_DOC", "COACHING_DOC", "PROFILE_ASSET", "PRODUCT_REFERENCE", "PERSONALITY_NOTE", "GENERAL", "OTHER"]).optional(),
  visibility: z.enum(["AE_ONLY", "DIRECTOR_ONLY", "BOTH"]).optional(),
  aeProfileId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const file = await prisma.fileAsset.findUnique({ where: { id: params.id } });
  if (!file || file.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updated = await prisma.fileAsset.update({
    where: { id: params.id },
    data: parsed.data as any,
  });
  return NextResponse.json({ file: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "COMPANY_ADMIN", "ORG_ADMIN");
  const file = await prisma.fileAsset.findUnique({ where: { id: params.id } });
  if (!file || file.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Director can only delete files they uploaded
  if (ctx.role === "DIRECTOR" && file.ownerUserId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.fileAsset.delete({ where: { id: params.id } });
  await deleteFile(file.storagePath);
  return NextResponse.json({ ok: true });
}
