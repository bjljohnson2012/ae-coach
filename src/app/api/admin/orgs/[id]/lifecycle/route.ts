/**
 * POST /api/admin/orgs/[id]/lifecycle
 * Body: { action: "deactivate" | "reactivate" | "offboard", reason?: string }
 *
 * Lifecycle transitions:
 *   ACTIVE      → INACTIVE   (deactivate, reversible)
 *   INACTIVE    → ACTIVE     (reactivate)
 *   any        → OFFBOARDED  (offboard, terminal — data retained for export, logins blocked)
 *
 * ORG_ADMIN only. The platform org (Ben Johnson AI / any org with an ORG_ADMIN
 * user inside it) cannot be transitioned — that would lock the super admin out.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  action: z.enum(["deactivate", "reactivate", "offboard"]),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN");

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const org = await prisma.org.findUnique({
    where: { id: params.id },
    include: { users: { select: { role: true }, where: { role: "ORG_ADMIN" } } },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  // Refuse to transition the platform org — would lock out the super admin.
  if (org.users.length > 0) {
    return NextResponse.json(
      { error: "Cannot change status of the platform org." },
      { status: 400 }
    );
  }

  const { action, reason } = parsed.data;
  let newStatus: "ACTIVE" | "INACTIVE" | "OFFBOARDED";
  let updateData: any = {};

  if (action === "deactivate") {
    newStatus = "INACTIVE";
    updateData = { status: "INACTIVE" };
  } else if (action === "reactivate") {
    newStatus = "ACTIVE";
    updateData = { status: "ACTIVE", offboardedAt: null, offboardedById: null, offboardReason: null };
  } else {
    // offboard — terminal. Record who and when.
    newStatus = "OFFBOARDED";
    updateData = {
      status: "OFFBOARDED",
      offboardedAt: new Date(),
      offboardedById: ctx.userId,
      offboardReason: reason ?? null,
    };
  }

  const updated = await prisma.org.update({ where: { id: org.id }, data: updateData });

  // If offboarding, also flip every user in the org to INACTIVE so their tokens
  // are rejected at sign-in. Reversible only via reactivate or per-user edit.
  if (action === "offboard") {
    await prisma.user.updateMany({
      where: { orgId: org.id, status: { not: "INACTIVE" } },
      data: { status: "INACTIVE" },
    });
  }

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorUserId: ctx.userId,
      action: action === "offboard" ? "ORG_OFFBOARDED" : action === "deactivate" ? "ORG_DEACTIVATED" : "ORG_REACTIVATED",
      targetType: "Org",
      targetId: org.id,
      metadata: { newStatus, reason: reason ?? null },
    },
  });

  return NextResponse.json({ ok: true, status: updated.status });
}
