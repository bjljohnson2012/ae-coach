/**
 * POST /api/synthesis-request
 *
 * v3.37.10 — non-admin path for re-synthesis.
 *
 * AE / Director / VP can call this. It creates a Task assigned to a company
 * admin in the user's org (falls back to the org admin if no company admin
 * exists). The admin sees it in their tasks list with a clear instruction
 * to re-run from the requester's profile.
 *
 * Idempotent within a 6-hour window: if there's already an OPEN re-synthesis
 * request task for this user, no new task is created.
 *
 * Body: { reason?: string }   // optional one-liner from the requester
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

export const runtime = "nodejs";

const Body = z.object({
  reason: z.string().max(500).optional(),
});

const TASK_TITLE_PREFIX = "Re-synthesis request";

export async function POST(req: Request) {
  const ctx = await requireSession();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Find the right person to assign the task to. Preference order:
  //   1. COMPANY_ADMIN of the user's org
  //   2. ORG_ADMIN (super admin) — fallback
  const companyAdmin = await prisma.user.findFirst({
    where: { orgId: ctx.effectiveOrgId, role: "COMPANY_ADMIN", status: "ACTIVE" },
    select: { id: true, name: true },
  });
  const orgAdmin = !companyAdmin
    ? await prisma.user.findFirst({
        where: { role: "ORG_ADMIN", status: "ACTIVE" },
        select: { id: true, name: true },
      })
    : null;

  const assignee = companyAdmin ?? orgAdmin;
  if (!assignee) {
    return NextResponse.json(
      { error: "No admin available to receive your request. Contact support." },
      { status: 503 },
    );
  }

  // Idempotent: dedupe against any OPEN re-synth request for this requester
  // in the last 6 hours.
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const existing = await prisma.task.findFirst({
    where: {
      createdByUserId: ctx.userId,
      assigneeUserId: assignee.id,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      title: { startsWith: TASK_TITLE_PREFIX },
      createdAt: { gte: sixHoursAgo },
    },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      taskId: existing.id,
      assigneeName: assignee.name,
      duplicate: true,
    });
  }

  const reasonLine = parsed.data.reason?.trim()
    ? `\n\nReason from ${ctx.name}: ${parsed.data.reason.trim()}`
    : "";

  const description = [
    `${ctx.name} (${ctx.role.toLowerCase()}) is asking you to re-run their personality + skill synthesis.`,
    "",
    "How to act on this:",
    `1. Open the requester's profile (admin → Users → ${ctx.name}).`,
    "2. Click \"Re-run synthesis\" on their profile.",
    "3. Their answers stay attached — synthesis runs in the background and takes 5-10 minutes.",
    "4. Mark this task done after the re-run completes.",
    reasonLine,
  ].join("\n");

  const task = await prisma.task.create({
    data: {
      assigneeUserId: assignee.id,
      createdByUserId: ctx.userId,
      title: `${TASK_TITLE_PREFIX} from ${ctx.name}`,
      description,
      status: "OPEN",
      // Due in 3 days — admin nudge without being aggressive.
      dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    ok: true,
    taskId: task.id,
    assigneeName: assignee.name,
    duplicate: false,
  });
}
