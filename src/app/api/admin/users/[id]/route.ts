import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Patch = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR", "AE"]).optional(),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE"]).optional(),
  vpId: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tenant boundary
  if (ctx.role !== "ORG_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // VP can only edit their own directors + AEs in their tree
  if (ctx.role === "VP_SALES") {
    const inTree =
      (target.role === "DIRECTOR" && target.vpId === ctx.userId) ||
      target.role === "AE";
    if (!inTree) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only ORG_ADMIN can promote to ORG_ADMIN
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (parsed.data.role === "ORG_ADMIN" && ctx.role !== "ORG_ADMIN") {
    return NextResponse.json({ error: "Only ORG_ADMIN can promote to ORG_ADMIN" }, { status: 403 });
  }

  await prisma.user.update({ where: { id: params.id }, data: parsed.data as any });

  await prisma.auditLog.create({
    data: {
      orgId: target.orgId,
      actorUserId: ctx.userId,
      action: parsed.data.role && parsed.data.role !== target.role ? "USER_ROLE_CHANGED" : "USER_CREATED",
      targetType: "User",
      targetId: target.id,
      metadata: parsed.data as any,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ctx.role !== "ORG_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (target.role === "ORG_ADMIN") {
    return NextResponse.json({ error: "Cannot delete a Super Admin." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: params.id }, data: { status: "INACTIVE" } });
  return NextResponse.json({ ok: true });
}
