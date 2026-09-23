/**
 * GET  /api/tasks       — list (own as AE; team for leader)
 * POST /api/tasks       — manual create
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe, getManageableUsers } from "@/lib/tenancy";

const CreateBody = z.object({
  // Polymorphic — provide one of these:
  aeProfileId: z.string().optional(),
  assigneeUserId: z.string().optional(),
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  dueAt: z.string().datetime().nullable().optional(),
}).refine(
  (b) => !!b.aeProfileId || !!b.assigneeUserId,
  { message: "Provide aeProfileId or assigneeUserId" },
);

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  // Validate target access
  if (parsed.data.aeProfileId) {
    const access = await assertCanAccessAe(ctx, parsed.data.aeProfileId);
    if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (parsed.data.assigneeUserId) {
    const manageable = await getManageableUsers(ctx);
    if (!manageable.some((u) => u.id === parsed.data.assigneeUserId)) {
      return NextResponse.json({ error: "Forbidden — user is outside your scope" }, { status: 403 });
    }
  }

  const task = await prisma.task.create({
    data: {
      aeProfileId: parsed.data.aeProfileId ?? null,
      assigneeUserId: parsed.data.assigneeUserId ?? null,
      createdByUserId: ctx.userId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      status: "OPEN",
    },
  });
  return NextResponse.json({ task });
}
