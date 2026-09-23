/**
 * GET   /api/coaching-plans/[planId]      → status + content (used for polling)
 * PATCH /api/coaching-plans/[planId]      → mark as read by current user
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, assertCanAccessAe, assertCanAccessDirector } from "@/lib/tenancy";

export const runtime = "nodejs";

async function loadAndAuthorize(ctx: any, planId: string) {
  const plan = await prisma.coachingPlan.findUnique({
    where: { id: planId },
    include: { builtBy: { select: { name: true } } },
  });
  if (!plan) return { error: "Plan not found", status: 404 as const };

  if (plan.aeProfileId) {
    const ok = await assertCanAccessAe(ctx, plan.aeProfileId);
    if (!ok) return { error: "Forbidden", status: 403 as const };
  } else if (plan.directorProfileId) {
    const ok = await assertCanAccessDirector(ctx, plan.directorProfileId);
    if (!ok) return { error: "Forbidden", status: 403 as const };
  }
  return { plan };
}

export async function GET(_req: Request, { params }: { params: { planId: string } }) {
  const ctx = await requireSession();
  const r = await loadAndAuthorize(ctx, params.planId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ plan: r.plan });
}

export async function PATCH(_req: Request, { params }: { params: { planId: string } }) {
  const ctx = await requireSession();
  const r = await loadAndAuthorize(ctx, params.planId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const plan = r.plan;

  // Only meaningful action right now: mark this plan as read by the current user.
  // Append ctx.userId to readByJson if not already there.
  const existing = Array.isArray(plan.readByJson) ? (plan.readByJson as string[]) : [];
  if (!existing.includes(ctx.userId)) {
    const next = [...existing, ctx.userId];
    await prisma.coachingPlan.update({
      where: { id: plan.id },
      data: { readByJson: next as any },
    });
  }
  return NextResponse.json({ ok: true });
}
