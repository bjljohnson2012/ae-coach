import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe, getManageableUsers } from "@/lib/tenancy";

const Patch = z.object({
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

/**
 * Resolve whether the caller can access the task.
 * Tasks are polymorphic — either aeProfileId or assigneeUserId is set.
 */
async function canAccessTask(ctx: Awaited<ReturnType<typeof requireSession>>, task: { aeProfileId: string | null; assigneeUserId: string | null }): Promise<boolean> {
  if (task.aeProfileId) {
    const access = await assertCanAccessAe(ctx, task.aeProfileId);
    return !!access;
  }
  if (task.assigneeUserId) {
    // Self-access shortcut
    if (task.assigneeUserId === ctx.userId) return true;
    const manageable = await getManageableUsers(ctx);
    return manageable.some((u) => u.id === task.assigneeUserId);
  }
  return false;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ok = await canAccessTask(ctx, task);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: any = { ...parsed.data };
  if (parsed.data.dueAt) data.dueAt = new Date(parsed.data.dueAt);
  if (parsed.data.status === "DONE") data.completedAt = new Date();

  const updated = await prisma.task.update({ where: { id: params.id }, data });
  return NextResponse.json({ task: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await canAccessTask(ctx, task);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
